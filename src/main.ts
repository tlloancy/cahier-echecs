import './style.css'
import { analyzeLine } from './analyze.ts'
import { boardHtml } from './board.ts'
import { loadBook } from './book.ts'
import { loadPlayer } from './api.ts'
import { readUser, writePins, writeUser } from './db.ts'
import { Engine } from './engine.ts'
import {
  buildTree,
  clampPath,
  gamesOnLine,
  nodeAt,
  opponentRows,
  scorePercent,
  selectGames,
  sortedChildren,
  tallyOf,
  timeLabel,
  winPercent,
} from './stats.ts'
import type { Book, Filters, Finding, LightGame, TimeClass, TreeNode } from './types.ts'

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
} = {
  draft: '',
  user: '',
  display: '',
  games: [],
  book: {},
  filters: { color: 'all', tc: 'all', opp: null },
  path: [],
  pins: [],
  flip: false,
  oppQuery: '',
  phase: 'idle',
  message: '',
  analysis: null,
  generation: 0,
}

let treeCache: { key: string; games: LightGame[]; root: TreeNode } | null = null
let loadAbort: AbortController | null = null
let analysisJob = 0
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

function countLabel(value: number, singular: string, plural: string): string {
  return `${num(value)} ${value === 1 ? singular : plural}`
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

function currentView(): { games: LightGame[]; root: TreeNode; node: TreeNode } {
  const key = `${state.generation}|${state.filters.color}|${state.filters.tc}|${state.filters.opp || ''}`
  if (!treeCache || treeCache.key !== key) {
    const games = selectGames(state.games, state.filters)
    treeCache = { key, games, root: buildTree(games, state.book) }
  }
  state.path = clampPath(treeCache.root, state.path)
  return { games: treeCache.games, root: treeCache.root, node: nodeAt(treeCache.root, state.path) }
}

function bar(node: { games: number; w: number; d: number; l: number }): string {
  if (!node.games) return '<span class="bar"></span>'
  const w = (node.w / node.games) * 100
  const d = (node.d / node.games) * 100
  const l = (node.l / node.games) * 100
  return `<span class="bar" aria-hidden="true"><i class="w" style="width:${w}%"></i><i class="d" style="width:${d}%"></i><i class="l" style="width:${l}%"></i></span>`
}

function moveLabel(ply: number, san: string): string {
  const move = Math.ceil(ply / 2)
  return ply % 2 === 1 ? `${move}. ${san}` : `${move}… ${san}`
}

function findingList(title: string, rows: Finding[], empty: string, kind: 'faille' | 'decisif'): string {
  const items = rows.length
    ? rows
        .map((row) => {
          const link = row.url ? `<a href="${esc(row.url)}" target="_blank" rel="noreferrer">partie contre ${esc(row.opp)}</a>` : esc(row.opp)
          const detail =
            kind === 'faille'
              ? `${moveLabel(row.ply, row.san)} au lieu de ${row.best} · −${num(row.cpl)} cp`
              : moveLabel(row.ply, row.san)
          return `<li><span>${esc(detail)}</span><span class="muted">${link}</span></li>`
        })
        .join('')
    : `<li class="muted">${esc(empty)}</li>`
  return `<section><h2>${esc(title)}</h2><ul class="finding-list">${items}</ul></section>`
}

function dashboard(): string {
  const { games, node } = currentView()
  const tally = tallyOf(games)
  const children = sortedChildren(node)
  const here = pathKey(state.path)
  const pinnedHere = state.pins.includes(here)
  const query = state.oppQuery.trim().toLowerCase()
  const opponents = opponentRows(games)
    .filter((row) => !query || row.name.toLowerCase().includes(query))
    .slice(0, 80)
  const crumbs = [
    `<button type="button" data-path="" ${state.path.length === 0 ? 'aria-current="true"' : ''}>Départ</button>`,
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
              <span class="pct">${winPercent(child)} %</span>
              ${bar(child)}
            </button>
            <button type="button" class="pin" data-line="${esc(line)}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${on ? 'Retirer' : 'Épingler'} ${esc(child.move)}">${on ? '★' : '☆'}</button>
          </div>`
        })
        .join('')
    : '<p class="muted">Pas de coup suivant dans cette sélection.</p>'
  const pins = state.pins.length
    ? `<ul class="pin-list">${state.pins
        .map((line) => {
          const path = line.split(' ')
          const row = tallyOf(gamesOnLine(games, path))
          return `<li class="pin-row">
            <button type="button" class="text-btn" data-path="${esc(path.join('|'))}">${esc(line)}</button>
            <span class="muted">${num(row.games)} · ${winPercent(row)} %</span>
            <button type="button" class="text-btn" data-drop="${esc(line)}">Retirer</button>
          </li>`
        })
        .join('')}</ul>`
    : '<p class="muted">Épingle une ligne dans l’arbre pour la retrouver ici.</p>'
  const analysis = state.analysis
  const analysisHtml = analysis
    ? `<section class="panel">
        <h2>Ligne ${esc(analysis.line)}</h2>
        <p id="analysis-status" class="status">${esc(analysis.status)}</p>
        ${analysis.running ? '<button type="button" class="stop" id="stop-analysis">Arrêter</button>' : ''}
        ${findingList('Failles', analysis.failles, 'Aucune faille dans cet échantillon.', 'faille')}
        ${findingList('Coups décisifs', analysis.decisifs, 'Aucun coup décisif dans cet échantillon.', 'decisif')}
      </section>`
    : ''
  const oppActive = state.filters.opp
  return `<section class="summary">
      <div><strong>${num(tally.games)}</strong> <span>parties</span></div>
      <div><strong>${winPercent(tally)} %</strong> <span>de victoires</span></div>
      <div><strong>${scorePercent(tally)} %</strong> <span>de score</span></div>
      <div><span>${countLabel(tally.w, 'victoire', 'victoires')} · ${countLabel(tally.d, 'nulle', 'nulles')} · ${countLabel(tally.l, 'défaite', 'défaites')}</span></div>
    </section>
    <div class="filters">
      <label>Couleur
        <select id="color">
          ${['all', 'w', 'b'].map((value) => `<option value="${value}" ${state.filters.color === value ? 'selected' : ''}>${value === 'all' ? 'Les deux' : value === 'w' ? 'Blancs' : 'Noirs'}</option>`).join('')}
        </select>
      </label>
      <label>Cadence
        <select id="tc">
          ${(['all', 'bullet', 'blitz', 'rapid', 'daily'] as const).map((value) => `<option value="${value}" ${state.filters.tc === value ? 'selected' : ''}>${timeLabel(value)}</option>`).join('')}
        </select>
      </label>
      <button type="button" class="ghost" id="flip">${state.flip ? 'Côté blancs' : 'Retourner'}</button>
    </div>
    <div class="layout">
      <section class="panel">
        <div class="toolbar">
          <h2>${node.name ? esc(node.name) : 'Ouvertures'}</h2>
          ${state.path.length ? `<button type="button" class="ghost" id="pin-here" aria-pressed="${pinnedHere ? 'true' : 'false'}">${pinnedHere ? 'Épinglée' : 'Épingler cette ligne'}</button>` : ''}
          ${state.path.length ? `<button type="button" class="primary" id="analyze">Analyser</button>` : ''}
        </div>
        <p class="position-name">${state.path.length ? esc(state.path.join(' ')) : 'Les douze premiers coups. Le nom vient du livre d’ouvertures.'}</p>
        <nav class="crumbs">${crumbs}</nav>
        <div class="opening-grid">
          <div class="tree">${tree}</div>
          ${boardHtml(state.path, state.flip)}
        </div>
      </section>
      <div class="side">
        <section class="panel">
          <h2>Adversaires</h2>
          ${oppActive ? `<button type="button" class="ghost" id="clear-opp">Tous les adversaires</button>` : ''}
          <label>Recherche
            <input id="opp-search" value="${esc(state.oppQuery)}" placeholder="Pseudo" />
          </label>
          <ul class="opp-list">
            ${opponents
              .map((row) => {
                const active = oppActive === row.name.toLowerCase()
                return `<li><button type="button" class="opp" data-opp="${esc(row.name)}" aria-pressed="${active ? 'true' : 'false'}"><span>${esc(row.name)}</span><span class="muted">${num(row.games)}</span><span>${winPercent(row)} %</span></button></li>`
              })
              .join('') || '<li class="muted">Aucun adversaire dans cette sélection.</li>'}
          </ul>
        </section>
        <section class="panel">
          <h2>Lignes épinglées</h2>
          ${pins}
        </section>
        ${analysisHtml}
      </div>
    </div>`
}

function render(): void {
  const focus = document.activeElement instanceof HTMLElement ? document.activeElement.id : ''
  const caret = document.activeElement instanceof HTMLInputElement ? document.activeElement.selectionStart : null
  const loaded = state.games.length > 0
  app.innerHTML = `<main class="wrap">
    <header>
      <h1 class="serif">Cahier d’échecs</h1>
      <p class="lede">Tes ouvertures, tes scores, les lignes que tu épingles. Les parties restent dans ce navigateur.</p>
    </header>
    <section class="panel">
      <form class="load" id="load-form">
        <label>Pseudo Chess.com
          <input id="pseudo" name="pseudo" autocomplete="username" required value="${esc(state.draft)}" />
        </label>
        <button class="primary" type="submit" ${state.phase === 'loading' ? 'disabled' : ''}>${loaded ? 'Mettre à jour' : 'Charger'}</button>
        ${state.phase === 'loading' ? '<button class="stop" type="button" id="cancel">Arrêter</button>' : ''}
      </form>
      <p id="status" class="status ${state.phase === 'error' ? 'error' : ''}" role="status">${esc(state.message)}</p>
    </section>
    ${loaded ? dashboard() : ''}
  </main>`
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
  treeCache = null
  state.message = `${num(saved.games.length)} parties en mémoire.`
}

async function load(username: string): Promise<void> {
  const trimmed = username.trim()
  if (!trimmed) return
  loadAbort?.abort()
  const controller = new AbortController()
  loadAbort = controller
  analysisJob += 1
  state.phase = 'loading'
  state.draft = trimmed
  state.message = 'Lecture des archives…'
  state.analysis = null
  render()
  try {
    const games = await loadPlayer(trimmed, state.book, {
      signal: controller.signal,
      onProgress: (text) => setMessage(text),
    })
    const user = trimmed.toLowerCase()
    const display = games[0]?.display || trimmed
    const previousPins = state.user === user ? state.pins : ((await readUser(user))?.pins ?? [])
    await writeUser(user, games, display, previousPins)
    localStorage.setItem(LAST_KEY, user)
    state.user = user
    state.display = display
    state.draft = display
    state.games = games
    state.pins = previousPins
    state.path = []
    state.filters = { color: 'all', tc: 'all', opp: null }
    state.generation += 1
    treeCache = null
    state.phase = 'ready'
    state.message = `${num(games.length)} parties chargées.`
    render()
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

async function startAnalysis(): Promise<void> {
  if (!state.path.length || !state.user) return
  const line = pathKey(state.path)
  const job = ++analysisJob
  state.analysis = { line, running: true, status: 'Démarrage du moteur…', failles: [], decisifs: [] }
  render()
  try {
    if (!engine) engine = new Engine(engineUrl())
    const { games } = currentView()
    const result = await analyzeLine(games, state.path, engine, {
      stopped: () => job !== analysisJob,
      onProgress: (text) => {
        if (job !== analysisJob || !state.analysis) return
        state.analysis.status = text
        const slot = document.getElementById('analysis-status')
        if (slot) slot.textContent = text
      },
    })
    if (job !== analysisJob || !state.analysis) return
    state.analysis.running = false
    state.analysis.failles = result.failles
    state.analysis.decisifs = result.decisifs
    state.analysis.status = 'Huit parties récentes au plus, profondeur 6, sur les huit premiers coups.'
    render()
  } catch (error) {
    if (job !== analysisJob || !state.analysis) return
    state.analysis.running = false
    state.analysis.status = error instanceof Error ? error.message : 'L’analyse s’est arrêtée.'
    render()
  }
}

function bind(): void {
  document.getElementById('load-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const field = document.getElementById('pseudo') as HTMLInputElement | null
    state.draft = field?.value || state.draft
    void load(state.draft)
  })
  document.getElementById('cancel')?.addEventListener('click', () => loadAbort?.abort())
  document.getElementById('pseudo')?.addEventListener('input', (event) => {
    state.draft = (event.target as HTMLInputElement).value
  })
  document.getElementById('color')?.addEventListener('change', (event) => {
    state.filters.color = (event.target as HTMLSelectElement).value as Filters['color']
    render()
  })
  document.getElementById('tc')?.addEventListener('change', (event) => {
    state.filters.tc = (event.target as HTMLSelectElement).value as Filters['tc'] | TimeClass
    render()
  })
  document.getElementById('flip')?.addEventListener('click', () => {
    state.flip = !state.flip
    render()
  })
  document.getElementById('pin-here')?.addEventListener('click', () => togglePin(pathKey(state.path)))
  document.getElementById('analyze')?.addEventListener('click', () => void startAnalysis())
  document.getElementById('stop-analysis')?.addEventListener('click', () => {
    analysisJob += 1
    engine?.stop()
    if (state.analysis) {
      state.analysis.running = false
      state.analysis.status = 'Analyse arrêtée.'
    }
    render()
  })
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
    button.addEventListener('click', () => {
      const name = button.dataset.opp || ''
      const key = name.toLowerCase()
      state.filters.opp = state.filters.opp === key ? null : key
      render()
    })
  }
}

async function boot(): Promise<void> {
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
  state.phase = state.games.length ? 'ready' : 'idle'
  render()
}

void boot()
