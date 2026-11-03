import './style.css'
import { analyzeLine } from './analyze.ts'
import { boardHtml } from './board.ts'
import { icons } from './icons.ts'
import { loadBook, nameAlong } from './book.ts'
import { completeMonth, loadPlayer, loadPlayerSince } from './api.ts'
import { countryName, fetchCountry, flagSrc } from './countries.ts'
import { mergeUser, onDatabaseBlocked, readCountries, readUser, writeCountry, writeGames, writePins, writeUser } from './db.ts'
import { Engine } from './engine.ts'
import {
  gamesOnLine,
  nextRows,
  opponentRows,
  scorePercent,
  selectGames,
  tallyOf,
  winPercent,
  type ContRow,
} from './stats.ts'
import type { Book, Filters, Finding, LightGame, Tally } from './types.ts'

const LAST_KEY = 'cahier-echecs-user'

interface AnalysisView {
  line: string
  running: boolean
  status: string
  failles: Finding[]
  decisifs: Finding[]
}

const state: {
  draft: string
  user: string
  display: string
  games: LightGame[]
  countries: Record<string, string>
  book: Book
  filters: Filters
  path: string[]
  pins: string[]
  flip: boolean
  oppQuery: string
  phase: 'idle' | 'loading' | 'ready' | 'error'
  message: string
  analysis: AnalysisView | null
  generation: number
  renaming: boolean
} = {
  draft: '',
  user: '',
  display: '',
  games: [],
  countries: {},
  book: {},
  filters: { color: 'all', tc: 'all', result: 'all', ending: 'all', country: null, opp: null },
  path: [],
  pins: [],
  flip: false,
  oppQuery: '',
  phase: 'idle',
  message: '',
  analysis: null,
  generation: 0,
  renaming: false,
}

let filterCache: { key: string; games: LightGame[] } | null = null
let stepCache: { key: string; here: Tally; name: string; rows: ContRow[] } | null = null
let loadAbort: AbortController | null = null
let countryAbort: AbortController | null = null
let analysisJob = 0
let analysisAbort: AbortController | null = null
let engine: Engine | null = null
const app = document.querySelector('#app') as HTMLElement

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

function num(value: number): string {
  return value.toLocaleString('fr-FR')
}

function flagHtml(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return ''
  const name = countryName(code)
  return `<img class="flag" src="${esc(flagSrc(code, import.meta.env.BASE_URL))}" width="18" height="14" alt="${esc(name)}" title="${esc(name)}">`
}

function pathKey(path: string[]): string {
  return path.join(' ')
}

function keyToPath(key: string): string[] {
  return key ? key.split('|') : []
}

function engineUrl(): string {
  return new URL(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`, window.location.origin).href
}

function filterKey(): string {
  return `${state.generation}|${state.filters.color}|${state.filters.tc}|${state.filters.result}|${state.filters.ending}|${state.filters.country || ''}|${state.filters.opp || ''}`
}

function currentView(): { games: LightGame[]; here: Tally; name: string; rows: ContRow[] } {
  const key = filterKey()
  if (!filterCache || filterCache.key !== key) {
    filterCache = { key, games: selectGames(state.games, state.filters, state.countries) }
  }
  const stepKey = `${key}|${state.path.join('|')}`
  if (!stepCache || stepCache.key !== stepKey) {
    const step = nextRows(filterCache.games, state.path, state.book)
    stepCache = { key: stepKey, here: step.here, name: step.name, rows: step.rows }
  }
  return { games: filterCache.games, here: stepCache.here, name: stepCache.name, rows: stepCache.rows }
}

function share(part: number, whole: number): number {
  if (!whole) return 0
  return Math.round((part / whole) * 100)
}

function rate(part: Tally, whole: number): string {
  if (state.filters.result === 'all') return `${winPercent(part)} %`
  return `${share(part.games, whole)} %`
}

function bar(node: { games: number; w: number; d: number; l: number }, whole = node.games): string {
  if (!node.games) return '<span class="bar"></span>'
  const result = state.filters.result
  if (result !== 'all') {
    const width = share(node.games, whole)
    return `<span class="bar" aria-hidden="true"><i class="${result}" style="width:${width}%"></i></span>`
  }
  const w = (node.w / node.games) * 100
  const d = (node.d / node.games) * 100
  const l = (node.l / node.games) * 100
  return `<span class="bar" aria-hidden="true"><i class="w" style="width:${w}%"></i><i class="d" style="width:${d}%"></i><i class="l" style="width:${l}%"></i></span>`
}

function moveLabel(ply: number, san: string): string {
  const move = Math.ceil(ply / 2)
  return ply % 2 === 1 ? `${move}. ${san}` : `${move}… ${san}`
}

function findingList(mark: string, label: string, hint: string, rows: Finding[], empty: string, kind: 'faille' | 'decisif'): string {
  if (!rows.length && !empty) return ''
  const items = rows.length
    ? rows
        .map((row) => {
          const link = row.url
            ? `<a class="icon-link" href="${esc(row.url)}" target="_blank" rel="noreferrer" aria-label="Partie contre ${esc(row.opp)}" title="Partie contre ${esc(row.opp)}">${icons.link}</a>`
            : ''
          const detail = kind === 'faille' ? `${moveLabel(row.ply, row.san)} → ${row.best}` : moveLabel(row.ply, row.san)
          const loss = kind === 'faille' ? `<span class="loss">−${num(row.cpl)}</span>` : ''
          return `<li><button type="button" class="finding" data-line="${esc(row.line)}" data-ply="${row.ply}"><span>${esc(detail)}</span>${loss}<span class="muted">${esc(row.opp)}</span></button>${link}</li>`
        })
        .join('')
    : `<li class="muted">${esc(empty)}</li>`
  return `<section class="findings"><h2 class="icon-title">${mark}<span>${esc(label)}</span></h2><p class="note">${esc(hint)}</p><ul class="finding-list">${items}</ul></section>`
}

function loupeSection(): string {
  const analysis = state.analysis
  if (!analysis) return ''
  const stop = analysis.running
    ? `<button type="button" class="icon stop" id="stop-analysis" aria-label="Arrêter" title="Arrêter">${icons.stop}</button>`
    : ''
  const failles = findingList(
    icons.alert,
    'Failles',
    'Un coup moins bon, à n’importe quel moment de la partie.',
    analysis.failles,
    analysis.running ? '' : 'Aucune faille dans ces parties.',
    'faille',
  )
  const decisifs = findingList(
    icons.spark,
    'Coups décisifs',
    'Tu donnes du matériel, et c’est quand même le bon coup.',
    analysis.decisifs,
    analysis.running ? '' : 'Aucun dans ces parties.',
    'decisif',
  )
  return `<section class="panel loupe" id="loupe">
      <div class="toolbar">
        <h2 class="icon-title">${icons.search}<span>Loupe</span></h2>
        ${stop}
      </div>
      <p id="loupe-status" class="status ${analysis.running ? 'running' : ''}" role="status">${esc(analysis.status)}</p>
      ${failles}${decisifs}
    </section>`
}

function dashboard(): string {
  const { games, here: spot, name, rows } = currentView()
  const tally = tallyOf(games)
  const children = rows
  const here = pathKey(state.path)
  const pinnedHere = state.pins.includes(here)
  const query = state.oppQuery.trim().toLowerCase()
  const opponents = opponentRows(games)
    .filter((row) => !query || row.name.toLowerCase().includes(query))
    .slice(0, 80)
  const crumbs = [
    `<button type="button" class="icon" data-path="" aria-label="Départ" title="Départ" ${state.path.length === 0 ? 'aria-current="true"' : ''}>${icons.home}</button>`,
    ...state.path.map((san, index) => {
      const key = state.path.slice(0, index + 1).join('|')
      const current = index === state.path.length - 1 ? 'aria-current="true"' : ''
      return `<button type="button" data-path="${esc(key)}" ${current}>${esc(san)}</button>`
    }),
  ].join('')
  const tree = children.length
    ? children
        .map((child) => {
          const next = [...state.path, child.move]
          const key = next.join('|')
          const line = pathKey(next)
          const on = state.pins.includes(line)
          return `<div class="tree-line">
            <button type="button" class="tree-go" data-path="${esc(key)}">
              <span class="san">${esc(child.move)}</span>
              <span class="name">${esc(child.name)}</span>
              <span class="n">${num(child.games)}</span>
              <span class="pct">${rate(child, spot.games)}</span>
              ${bar(child, spot.games)}
            </button>
            <button type="button" class="icon pin" data-line="${esc(line)}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${on ? 'Retirer' : 'Épingler'} ${esc(child.move)}" title="${on ? 'Retirer' : 'Épingler'}">${icons.pin}</button>
          </div>`
        })
        .join('')
    : '<p class="muted">Pas de coup suivant dans cette sélection.</p>'
  const pins = state.pins.length
    ? `<ul class="pin-list">${state.pins
        .map((line) => {
          const path = line.split(' ')
          const row = tallyOf(gamesOnLine(games, path))
          const title = nameAlong(path, state.book) || line
          const moves = title === line ? '' : `<span class="pin-moves">${esc(line)}</span>`
          return `<li class="pin-row">
            <button type="button" class="text-btn" data-path="${esc(path.join('|'))}" aria-label="${esc(title)}">
              <span class="pin-title">${esc(title)}</span>
              ${moves}
            </button>
            <span class="muted">${num(row.games)} · ${rate(row, tally.games)}</span>
            <button type="button" class="icon" data-drop="${esc(line)}" aria-label="Retirer" title="Retirer">${icons.close}</button>
          </li>`
        })
        .join('')}</ul>`
    : '<p class="muted">Aucune ligne épinglée.</p>'
  const oppActive = state.filters.opp
  const base = tallyOf(selectGames(state.games, { ...state.filters, result: 'all' }, state.countries))
  const endings = { mate: 0, resign: 0, time: 0 }
  for (const game of selectGames(state.games, { ...state.filters, ending: 'all' }, state.countries)) {
    if (game.how === 'mate' || game.how === 'resign' || game.how === 'time') endings[game.how] += 1
  }
  const resultCards: Array<[Filters['result'], number, string, string]> = [
    ['all', base.games, base.games === 1 ? 'partie' : 'parties', `${scorePercent(base)} % de score`],
    ['w', base.w, base.w === 1 ? 'victoire' : 'victoires', `${winPercent(base)} % de victoires`],
    ['d', base.d, base.d === 1 ? 'nulle' : 'nulles', 'Nulles'],
    ['l', base.l, base.l === 1 ? 'défaite' : 'défaites', 'Défaites'],
  ]
  return `<section class="summary" role="group" aria-label="Résultat">
      ${resultCards
        .map(([value, count, label, title]) => {
          const pressed = state.filters.result === value
          const loss = value === 'l' ? ' loss' : ''
          return `<button type="button" class="stat${loss}" data-result="${value}" aria-pressed="${pressed ? 'true' : 'false'}" title="${esc(title)}"><strong>${num(count)}</strong><span>${label}</span></button>`
        })
        .join('')}
    </section>
    <div class="filters">
      <div class="seg" role="group" aria-label="Couleur">
        ${(['all', 'w', 'b'] as const)
          .map((value) => {
            const label = value === 'all' ? 'Les deux couleurs' : value === 'w' ? 'Blancs' : 'Noirs'
            const mark = value === 'all' ? icons.both : value === 'w' ? '<span class="mini-piece w"></span>' : '<span class="mini-piece b"></span>'
            return `<button type="button" class="icon" data-color="${value}" aria-pressed="${state.filters.color === value ? 'true' : 'false'}" aria-label="${label}" title="${label}">${mark}</button>`
          })
          .join('')}
      </div>
      <div class="seg" role="group" aria-label="Cadence">
        ${([
          ['all', icons.rows, 'Toutes les cadences'],
          ['bullet', icons.bolt, 'Bullet'],
          ['blitz', icons.flame, 'Blitz'],
          ['rapid', icons.clock, 'Rapide'],
          ['daily', icons.calendar, 'Correspondance'],
        ] as const)
          .map(
            ([value, mark, label]) =>
              `<button type="button" class="icon" data-tc="${value}" aria-pressed="${state.filters.tc === value ? 'true' : 'false'}" aria-label="${label}" title="${label}">${mark}</button>`,
          )
          .join('')}
      </div>
      <div class="seg words" role="group" aria-label="Fin de partie">
        ${([
          ['mate', 'Mat', 'Échec et mat'],
          ['resign', 'Abandon', 'Abandon'],
          ['time', 'Temps', 'Temps'],
        ] as const)
          .map(([value, label, title]) => {
            const pressed = state.filters.ending === value
            return `<button type="button" data-ending="${value}" aria-pressed="${pressed ? 'true' : 'false'}" title="${title}">${label} <span>${num(endings[value])}</span></button>`
          })
          .join('')}
      </div>
      <button type="button" class="icon" id="flip" aria-label="${state.flip ? 'Côté blancs' : 'Retourner l’échiquier'}" title="${state.flip ? 'Côté blancs' : 'Retourner'}">${icons.flip}</button>
    </div>
    ${loupeSection()}
    <section class="panel countries">
      <div class="toolbar">
        <h2 title="Pays">Pays</h2>
        ${state.filters.country ? `<button type="button" class="icon" id="clear-country" aria-label="Tous les pays" title="Tous les pays">${icons.close}</button>` : ''}
      </div>
      <div class="country-strip" id="country-strip" role="group" aria-label="Pays">${countryButtons()}</div>
    </section>
    <div class="layout">
      <section class="panel">
        <div class="toolbar">
          <h2>${name ? esc(name) : 'Ouvertures'}</h2>
          <span class="toolbar-actions">
            ${state.path.length ? `<button type="button" class="icon pin" id="pin-here" aria-pressed="${pinnedHere ? 'true' : 'false'}" aria-label="${pinnedHere ? 'Retirer cette ligne' : 'Épingler cette ligne'}" title="${pinnedHere ? 'Retirer' : 'Épingler'}">${icons.pin}</button>` : ''}
            ${state.path.length && !state.analysis?.running ? `<button type="button" class="icon primary" id="analyze" aria-label="Parcourir toute la partie" title="Parcourir toute la partie">${icons.search}</button>` : ''}
          </span>
        </div>
        <p class="note">Le coup suivant dans tes parties. La loupe parcourt toute la partie, pendant que tu continues.</p>
        ${state.path.length ? `<p class="position-name">${esc(state.path.join(' '))}</p>` : ''}
        <nav class="crumbs">${crumbs}</nav>
        <div class="opening-grid">
          <div class="tree">${tree}</div>
          ${boardHtml(state.path, state.flip)}
        </div>
      </section>
      <div class="side">
        <section class="panel">
          <div class="toolbar">
            <h2 class="icon-title" title="Adversaires">${icons.users}<span class="sr">Adversaires</span></h2>
            ${oppActive ? `<button type="button" class="icon" id="clear-opp" aria-label="Tous les adversaires" title="Tous les adversaires">${icons.close}</button>` : ''}
          </div>
          <label class="search">
            <span class="sr">Recherche</span>
            ${icons.search}
            <input id="opp-search" value="${esc(state.oppQuery)}" placeholder="Adversaire" />
          </label>
          <ul class="opp-list">
            ${opponents
              .map((row) => {
                const active = oppActive === row.name.toLowerCase()
                const code = state.countries[row.name.toLowerCase()] || ''
                return `<li><button type="button" class="opp" data-opp="${esc(row.name)}" aria-pressed="${active ? 'true' : 'false'}"><span class="flag-slot" data-flag="${esc(row.name)}">${flagHtml(code)}</span><span>${esc(row.name)}</span><span class="muted">${num(row.games)}</span><span>${rate(row, tally.games)}</span></button></li>`
              })
              .join('') || '<li class="muted">Aucun adversaire dans cette sélection.</li>'}
          </ul>
        </section>
        <section class="panel">
          <h2 class="icon-title" title="Lignes épinglées">${icons.pin}<span class="sr">Lignes épinglées</span></h2>
          ${pins}
        </section>
      </div>
    </div>`
}

function render(): void {
  const focus = document.activeElement instanceof HTMLElement ? document.activeElement.id : ''
  const caret = document.activeElement instanceof HTMLInputElement ? document.activeElement.selectionStart : null
  const loaded = state.games.length > 0
  const field = `<label>${loaded ? '<span class="sr">Pseudo Chess.com</span>' : 'Pseudo Chess.com'}
          <input id="pseudo" name="pseudo" autocomplete="username" required value="${esc(state.draft)}" />
        </label>`
  const identity = loaded && !state.renaming
    ? `<button type="button" class="who" id="who">${esc(state.display || state.draft)}</button>`
    : field
  const form = `<form class="load" id="load-form">
        ${identity}
        <button class="icon primary" type="submit" aria-label="${loaded ? 'Mettre à jour' : 'Charger'}" title="${loaded ? 'Mettre à jour' : 'Charger'}" ${state.phase === 'loading' ? 'disabled' : ''}>${loaded ? icons.refresh : icons.download}</button>
        ${loaded ? `<button type="button" class="ghost" id="reload-all" ${state.phase === 'loading' ? 'disabled' : ''}>Tout retélécharger</button>` : ''}
        ${state.phase === 'loading' ? `<button class="icon stop" type="button" id="cancel" aria-label="Arrêter" title="Arrêter">${icons.stop}</button>` : ''}
      </form>`
  const status = `<p id="status" class="status ${state.phase === 'error' ? 'error' : ''}" role="status">${esc(state.message)}</p>`
  const head = loaded
    ? `<header class="top"><div class="identity"><p class="eyebrow">Cahier d’échecs</p>${form}</div></header>${status}`
    : `<header><h1 class="serif">Cahier d’échecs</h1><p class="lede">Tes ouvertures, tes scores, les lignes que tu épingles. Les parties restent dans ce navigateur.</p></header><section class="panel">${form}${status}</section>`
  app.innerHTML = `<main class="wrap">${head}${loaded ? dashboard() : ''}</main>`
  bind()
  if (focus) {
    const field = document.getElementById(focus)
    if (field instanceof HTMLInputElement) {
      field.focus()
      if (caret !== null) field.setSelectionRange(caret, caret)
    }
  }
}

function setMessage(text: string, error = false): void {
  state.message = text
  state.phase = error ? 'error' : state.phase
  const status = document.getElementById('status')
  if (!status) {
    render()
    return
  }
  status.textContent = text
  status.classList.toggle('error', error)
}

async function rememberPins(): Promise<void> {
  if (!state.user) return
  await writePins(state.user, state.pins)
}

function togglePin(line: string): void {
  if (!line) return
  state.pins = state.pins.includes(line) ? state.pins.filter((item) => item !== line) : [...state.pins, line]
  void rememberPins()
  render()
}

function go(path: string[]): void {
  state.path = path
  render()
  void fillLineCountries(path)
}

function opponentNames(): string[] {
  return opponentRows(state.games).map((row) => row.name)
}

async function rememberCountries(): Promise<void> {
  if (!state.games.length) return
  const known = await readCountries(opponentNames())
  state.countries = { ...state.countries, ...known }
}

function countryRows(): { code: string; games: number }[] {
  const games = selectGames(state.games, { ...state.filters, country: null }, state.countries)
  const counts = new Map<string, number>()
  for (const game of games) {
    const code = state.countries[game.opp.toLowerCase()] || ''
    if (!/^[A-Z]{2}$/.test(code)) continue
    counts.set(code, (counts.get(code) || 0) + 1)
  }
  if (state.filters.country && /^[A-Z]{2}$/.test(state.filters.country) && !counts.has(state.filters.country)) {
    counts.set(state.filters.country, 0)
  }
  return [...counts]
    .map(([code, games]) => ({ code, games }))
    .sort((a, b) => b.games - a.games || countryName(a.code).localeCompare(countryName(b.code), 'fr'))
}

function countryButtons(): string {
  return countryRows()
    .map((row) => {
      const name = countryName(row.code)
      const pressed = state.filters.country === row.code
      return `<button type="button" class="country" data-country="${esc(row.code)}" aria-pressed="${pressed ? 'true' : 'false'}" aria-label="${esc(name)}" title="${esc(name)}">${flagHtml(row.code)}<span>${num(row.games)}</span></button>`
    })
    .join('')
}

function bindCountries(root: ParentNode): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-country]')) {
    button.addEventListener('click', () => {
      const code = button.dataset.country || ''
      state.filters.country = state.filters.country === code ? null : code
      render()
    })
  }
}

function paintCountryStrip(): void {
  const strip = document.getElementById('country-strip')
  if (!strip) return
  const left = strip.scrollLeft
  strip.innerHTML = countryButtons()
  strip.scrollLeft = left
  bindCountries(strip)
}

function showFlag(name: string, code: string): void {
  const slot = document.querySelector(`[data-flag="${CSS.escape(name)}"]`)
  if (slot && !slot.querySelector('img')) slot.innerHTML = flagHtml(code)
  paintCountryStrip()
}

const countryWait = new Set<string>()

async function ensureCountry(name: string): Promise<void> {
  const key = name.toLowerCase()
  const signal = countryAbort?.signal
  if (!key || state.countries[key] || countryWait.has(key) || !signal || signal.aborted) return
  countryWait.add(key)
  try {
    const code = await fetchCountry(name, signal)
    if (signal.aborted) return
    const saved = code || '-'
    state.countries[key] = saved
    await writeCountry(name, saved)
    if (code) showFlag(name, code)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
  } finally {
    countryWait.delete(key)
  }
}

async function fillCountries(signal: AbortSignal): Promise<void> {
  const missing = opponentNames()
    .filter((name) => !state.countries[name.toLowerCase()])
    .slice(0, 50)
  for (const name of missing) {
    if (signal.aborted) return
    await ensureCountry(name)
  }
}

async function fillLineCountries(path: string[]): Promise<void> {
  if (!path.length) return
  const missing = [
    ...new Set(gamesOnLine(state.games, path).map((game) => game.opp)),
  ]
    .filter((name) => !state.countries[name.toLowerCase()])
    .slice(0, 50)
  for (const name of missing) await ensureCountry(name)
}

async function fillMoves(signal: AbortSignal): Promise<void> {
  const pending = state.games.filter((game) => !game.moves && game.end && game.url)
  if (!pending.length || !state.user) return
  const groups = new Map<string, { year: number; month: number; games: LightGame[] }>()
  for (const game of pending) {
    const date = new Date(game.end * 1000)
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth() + 1
    const key = `${year}-${month}`
    let group = groups.get(key)
    if (!group) {
      group = { year, month, games: [] }
      groups.set(key, group)
    }
    group.games.push(game)
  }
  const batches = [...groups.values()]
  let done = 0
  for (const batch of batches) {
    if (signal.aborted) return
    done += 1
    const before = currentView().rows.length
    setMessage(`Coups complets · ${done} / ${batches.length}`)
    try {
      const updated = await completeMonth(state.user, batch.year, batch.month, batch.games, state.book, signal)
      await writeGames(updated)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      continue
    }
    state.generation += 1
    filterCache = null
    stepCache = null
    if (currentView().rows.length > before) render()
  }
  setMessage(`${num(state.games.length)} parties en mémoire.`)
}

async function fillBackground(): Promise<void> {
  countryAbort?.abort()
  const controller = new AbortController()
  countryAbort = controller
  await fillMoves(controller.signal)
  if (controller.signal.aborted) return
  await fillCountries(controller.signal)
}

async function restore(user: string): Promise<void> {
  const saved = await readUser(user)
  if (!saved) return
  state.user = user
  state.display = saved.display
  state.draft = saved.display
  state.games = saved.games
  state.pins = saved.pins
  state.phase = 'ready'
  state.generation += 1
  filterCache = null
  stepCache = null
  state.message = `${num(saved.games.length)} parties en mémoire.`
}

async function load(username: string, full = false): Promise<void> {
  const trimmed = username.trim()
  if (!trimmed) return
  loadAbort?.abort()
  countryAbort?.abort()
  const controller = new AbortController()
  loadAbort = controller
  analysisJob += 1
  state.phase = 'loading'
  state.draft = trimmed
  state.message = full ? 'Lecture des archives…' : 'Mise à jour…'
  state.analysis = null
  render()
  try {
    const user = trimmed.toLowerCase()
    const known = state.user === user ? state.games : ((await readUser(user))?.games ?? [])
    const since = known.reduce((max, game) => Math.max(max, game.end), 0)
    const incremental = !full && since > 0
    const fresh = incremental
      ? await loadPlayerSince(trimmed, state.book, since, {
          signal: controller.signal,
          onProgress: (text) => setMessage(text),
        })
      : await loadPlayer(trimmed, state.book, {
          signal: controller.signal,
          onProgress: (text) => setMessage(text),
        })
    const display = fresh[0]?.display || known[0]?.display || trimmed
    const previousPins = state.user === user ? state.pins : ((await readUser(user))?.pins ?? [])
    let games: LightGame[]
    if (incremental) {
      const byId = new Map(known.map((game) => [game.id, game]))
      for (const game of fresh) byId.set(game.id, game)
      games = [...byId.values()]
      await mergeUser(user, fresh, display, games.length)
    } else {
      games = fresh
      await writeUser(user, games, display, previousPins)
    }
    localStorage.setItem(LAST_KEY, user)
    state.user = user
    state.display = display
    state.draft = display
    state.games = games
    state.pins = previousPins
    if (!incremental) {
      state.path = []
      state.filters = { color: 'all', tc: 'all', result: 'all', ending: 'all', country: null, opp: null }
    }
    state.generation += 1
    filterCache = null
    stepCache = null
    state.phase = 'ready'
    state.message = `${num(games.length)} parties ${incremental ? 'en mémoire' : 'chargées'}.`
    await rememberCountries()
    render()
    void fillBackground()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      state.phase = state.games.length ? 'ready' : 'idle'
      state.message = 'Chargement arrêté.'
      render()
      return
    }
    state.phase = 'error'
    state.message = error instanceof Error ? error.message : 'Le chargement a échoué.'
    render()
  }
}

function rememberFinding(kind: 'faille' | 'decisif', row: Finding): void {
  if (!state.analysis) return
  const list = kind === 'faille' ? state.analysis.failles : state.analysis.decisifs
  list.push(row)
  if (kind === 'faille') list.sort((a, b) => b.cpl - a.cpl)
  list.splice(8)
  refreshLoupe()
}

function refreshLoupe(): void {
  const host = document.getElementById('loupe')
  const html = loupeSection()
  if (!host) {
    if (html) render()
    return
  }
  host.outerHTML = html
  bindLoupe()
}

function openFinding(button: HTMLButtonElement): void {
  const line = button.dataset.line || ''
  const ply = Number(button.dataset.ply || 0)
  state.path = line.split(' ').slice(0, ply)
  render()
}

function stopAnalysis(): void {
  analysisJob += 1
  analysisAbort?.abort()
  engine?.stop()
  if (state.analysis) {
    state.analysis.running = false
    state.analysis.status = 'Analyse arrêtée.'
  }
  refreshLoupe()
}

function bindLoupe(): void {
  document.getElementById('stop-analysis')?.addEventListener('click', stopAnalysis)
  for (const button of document.querySelectorAll<HTMLButtonElement>('#loupe .finding')) {
    button.addEventListener('click', () => openFinding(button))
  }
}

async function startAnalysis(): Promise<void> {
  if (!state.path.length || !state.user) return
  const line = pathKey(state.path)
  const job = ++analysisJob
  analysisAbort?.abort()
  const controller = new AbortController()
  analysisAbort = controller
  state.analysis = { line, running: true, status: 'Démarrage du moteur…', failles: [], decisifs: [] }
  render()
  document.getElementById('loupe')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  try {
    if (!engine) engine = new Engine(engineUrl())
    const { games } = currentView()
    const result = await analyzeLine(games, state.path, state.book, engine, {
      signal: controller.signal,
      stopped: () => job !== analysisJob,
      onProgress: (text) => {
        if (job !== analysisJob || !state.analysis) return
        state.analysis.status = text
        const slot = document.getElementById('loupe-status')
        if (slot) slot.textContent = text
        else refreshLoupe()
      },
      onFinding: (kind, row) => {
        if (job !== analysisJob || !state.analysis) return
        rememberFinding(kind, row)
      },
    })
    if (job !== analysisJob || !state.analysis) return
    state.analysis.running = false
    state.analysis.failles = result.failles
    state.analysis.decisifs = result.decisifs
    state.analysis.status = 'Terminé.'
    refreshLoupe()
  } catch (error) {
    if (job !== analysisJob || !state.analysis) return
    state.analysis.running = false
    state.analysis.status = error instanceof Error ? error.message : 'L’analyse s’est arrêtée.'
    refreshLoupe()
  }
}

function bind(): void {
  document.getElementById('who')?.addEventListener('click', () => {
    state.renaming = true
    render()
    document.getElementById('pseudo')?.focus()
  })
  document.getElementById('load-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const field = document.getElementById('pseudo') as HTMLInputElement | null
    state.draft = field?.value || state.draft
    state.renaming = false
    void load(state.draft)
  })
  document.getElementById('reload-all')?.addEventListener('click', () => {
    state.renaming = false
    void load(state.display || state.draft, true)
  })
  document.getElementById('cancel')?.addEventListener('click', () => loadAbort?.abort())
  document.getElementById('pseudo')?.addEventListener('input', (event) => {
    state.draft = (event.target as HTMLInputElement).value
  })
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-ending]')) {
    button.addEventListener('click', () => {
      const value = button.dataset.ending as Filters['ending']
      state.filters.ending = state.filters.ending === value ? 'all' : value
      render()
    })
  }
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-result]')) {
    button.addEventListener('click', () => {
      const value = button.dataset.result as Filters['result']
      state.filters.result = value === 'all' || state.filters.result === value ? 'all' : value
      render()
    })
  }
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-color]')) {
    button.addEventListener('click', () => {
      state.filters.color = button.dataset.color as Filters['color']
      render()
    })
  }
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-tc]')) {
    button.addEventListener('click', () => {
      state.filters.tc = button.dataset.tc as Filters['tc']
      render()
    })
  }
  document.getElementById('flip')?.addEventListener('click', () => {
    state.flip = !state.flip
    render()
  })
  document.getElementById('pin-here')?.addEventListener('click', () => togglePin(pathKey(state.path)))
  document.getElementById('analyze')?.addEventListener('click', () => {
    document.getElementById('analysis-status')?.replaceChildren()
    void startAnalysis()
  })
  bindLoupe()
  document.getElementById('clear-country')?.addEventListener('click', () => {
    state.filters.country = null
    render()
  })
  bindCountries(app)
  document.getElementById('clear-opp')?.addEventListener('click', () => {
    state.filters.opp = null
    render()
  })
  document.getElementById('opp-search')?.addEventListener('input', (event) => {
    state.oppQuery = (event.target as HTMLInputElement).value
    render()
  })
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-path]')) {
    button.addEventListener('click', () => go(keyToPath(button.dataset.path || '')))
  }
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-line]')) {
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      togglePin(button.dataset.line || '')
    })
  }
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-drop]')) {
    button.addEventListener('click', () => togglePin(button.dataset.drop || ''))
  }
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-opp]')) {
    button.addEventListener('pointerenter', () => {
      void ensureCountry(button.dataset.opp || '')
    })
    button.addEventListener('click', () => {
      const name = button.dataset.opp || ''
      const key = name.toLowerCase()
      state.filters.opp = state.filters.opp === key ? null : key
      render()
    })
  }
}

async function boot(): Promise<void> {
  onDatabaseBlocked(() => setMessage('Ferme l’autre onglet du cahier pour continuer.'))
  state.message = 'Chargement du livre d’ouvertures…'
  render()
  try {
    state.book = await loadBook()
  } catch (error) {
    state.phase = 'error'
    state.message = error instanceof Error ? error.message : 'Livre indisponible.'
    render()
    return
  }
  const last = localStorage.getItem(LAST_KEY)
  if (last) await restore(last)
  else state.message = ''
  await rememberCountries()
  state.phase = state.games.length ? 'ready' : 'idle'
  render()
  if (state.games.length) void fillBackground()
}

void boot()
