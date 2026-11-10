import type { Book, LightGame } from './types.ts'
import { readLine, type ApiGame } from './lighten.ts'

let tail: Promise<unknown> = Promise.resolve()

export function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(job, job)
  tail = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export class NotFoundError extends Error {
  constructor(message = 'Ce pseudo n’existe pas sur Chess.com.') {
    super(message)
    this.name = 'NotFoundError'
  }
}

function abortError(): DOMException {
  return new DOMException('Arrêté', 'AbortError')
}

/** Attente interrompue par l'annulation de l'utilisateur. */
export function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const done = () => {
      signal.removeEventListener('abort', stop)
      resolve()
    }
    const stop = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', stop, { once: true })
  })
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  return serial(() => readJson<T>(url, signal))
}

/**
 * Lit une réponse JSON de Chess.com. Réessaie (avec attente croissante) quand Chess.com demande une pause (429),
 * répond par une erreur serveur (5xx) ou que le réseau coupe un instant : une panne passagère ne doit pas
 * faire perdre un chargement de plusieurs minutes.
 */
export async function readJson<T>(url: string, signal: AbortSignal, attempts = 4): Promise<T> {
  let last = ''
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response
    try {
      response = await fetch(url, { signal })
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error
      last = 'La connexion à Chess.com a été coupée.'
      if (attempt < attempts - 1) await pause(2 ** attempt * 1000, signal)
      continue
    }
    if (response.status === 429) {
      const retry = Number(response.headers.get('retry-after'))
      const wait = Number.isFinite(retry) && retry > 0 ? Math.min(retry, 60) : 2 ** attempt
      last = 'Chess.com demande une pause.'
      if (attempt < attempts - 1) await pause(wait * 1000, signal)
      continue
    }
    if (response.status >= 500) {
      last = `Chess.com a un souci passager (${response.status}).`
      if (attempt < attempts - 1) await pause(2 ** attempt * 1000, signal)
      continue
    }
    if (response.status === 404) throw new NotFoundError()
    if (!response.ok) throw new Error(`Chess.com a répondu ${response.status}.`)
    return (await response.json()) as T
  }
  throw new Error(last || 'Chess.com limite le rythme. Réessaie dans un instant.')
}

const monthGames = new Map<string, ApiGame[]>()

export function releaseMonths(): void {
  monthGames.clear()
}

export async function completeMonth(
  user: string,
  year: number,
  month: number,
  games: LightGame[],
  book: Book,
  signal: AbortSignal,
): Promise<LightGame[]> {
  const mm = String(month).padStart(2, '0')
  const key = `${user}/${year}/${mm}`
  let list = monthGames.get(key)
  if (!list) {
    const data = await getJson<{ games?: ApiGame[] }>(
      `https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/${year}/${mm}`,
      signal,
    )
    list = data.games || []
    monthGames.set(key, list)
  }
  const byUrl = new Map<string, ApiGame>()
  for (const item of list) if (item.url) byUrl.set(item.url, item)
  const updated: LightGame[] = []
  for (const game of games) {
    if (game.moves || !game.url) continue
    const raw = byUrl.get(game.url)
    const played = raw?.pgn ? readLine(raw.pgn, book) : null
    game.moves = played?.moves || game.line
    updated.push(game)
  }
  monthGames.delete(key)
  return updated
}

interface ParseWaiter {
  games: LightGame[]
  resolve: (games: LightGame[]) => void
  reject: (error: Error) => void
}

let parser: Worker | null = null
let bookReady = false
let parseJob = 0
const parseWaiters = new Map<number, ParseWaiter>()

function parsingThread(): Worker {
  if (!parser) {
    parser = new Worker(new URL('./load.worker.ts', import.meta.url), { type: 'module' })
    parser.onmessage = (event: MessageEvent<{ id: number; games: LightGame[]; done: boolean }>) => {
      const waiter = parseWaiters.get(event.data.id)
      if (!waiter) return
      waiter.games.push(...event.data.games)
      if (event.data.done) {
        parseWaiters.delete(event.data.id)
        waiter.resolve(waiter.games)
      }
    }
    parser.onerror = () => {
      for (const waiter of parseWaiters.values()) waiter.reject(new Error('La lecture des parties s’est arrêtée.'))
      parseWaiters.clear()
      // Le prochain chargement repart sur un worker neuf, avec son livre.
      parser?.terminate()
      parser = null
      bookReady = false
    }
  }
  return parser
}

function parseMonth(user: string, book: Book, games: ApiGame[], start: number, signal: AbortSignal): Promise<LightGame[]> {
  const thread = parsingThread()
  if (!bookReady) {
    thread.postMessage({ type: 'book', book })
    bookReady = true
  }
  const id = ++parseJob
  return new Promise((resolve, reject) => {
    const abort = () => {
      parseWaiters.delete(id)
      reject(abortError())
    }
    if (signal.aborted) {
      abort()
      return
    }
    signal.addEventListener('abort', abort, { once: true })
    parseWaiters.set(id, {
      games: [],
      resolve: (rows) => {
        signal.removeEventListener('abort', abort)
        resolve(rows)
      },
      reject: (error) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    })
    thread.postMessage({ type: 'month', id, user, games, start })
  })
}

export interface LoadHooks {
  onProgress: (text: string, ratio?: number) => void
  signal: AbortSignal
  /** Appelé après chaque mois lu : le joueur le garde même si la suite échoue ou est annulée. */
  onMonth?: (games: LightGame[]) => Promise<void> | void
}

export async function loadPlayerSince(
  username: string,
  book: Book,
  sinceEnd: number,
  hooks: LoadHooks,
): Promise<LightGame[]> {
  const user = username.trim().toLowerCase()
  const start = new Date(sinceEnd * 1000)
  let year = start.getUTCFullYear()
  let month = start.getUTCMonth() + 1
  const now = new Date()
  const endYear = now.getUTCFullYear()
  const endMonth = now.getUTCMonth() + 1
  const games: LightGame[] = []
  let seen = 0
  let step = 0
  const total = (endYear - year) * 12 + (endMonth - month) + 1
  while (year < endYear || (year === endYear && month <= endMonth)) {
    if (hooks.signal.aborted) throw abortError()
    step += 1
    const mm = String(month).padStart(2, '0')
    hooks.onProgress(`Mise à jour · mois ${step} sur ${total}`, (step - 1) / total)
    const url = `https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/${year}/${mm}`
    let list: ApiGame[] = []
    try {
      const data = await getJson<{ games?: ApiGame[] }>(url, hooks.signal)
      list = data.games || []
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error
    }
    const rows = await parseMonth(user, book, list, seen, hooks.signal)
    games.push(...rows)
    if (rows.length) await hooks.onMonth?.(rows)
    seen += list.length
    hooks.onProgress(`Mise à jour · mois ${step} sur ${total}`, step / total)
    month += 1
    if (month === 13) {
      month = 1
      year += 1
    }
  }
  return games
}

export async function loadPlayer(username: string, book: Book, hooks: LoadHooks): Promise<LightGame[]> {
  const user = username.trim()
  const archives = await getJson<{ archives?: string[] }>(
    `https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`,
    hooks.signal,
  )
  const months = archives.archives || []
  if (months.length === 0) throw new Error('Aucune archive pour ce pseudo.')
  const games: LightGame[] = []
  let seen = 0
  for (let i = 0; i < months.length; i += 1) {
    if (hooks.signal.aborted) throw abortError()
    hooks.onProgress(`Mois ${i + 1} sur ${months.length} · ${games.length.toLocaleString('fr-FR')} parties lues`, i / months.length)
    const month = await getJson<{ games?: ApiGame[] }>(months[i], hooks.signal)
    const list = month.games || []
    const rows = await parseMonth(user.toLowerCase(), book, list, seen, hooks.signal)
    games.push(...rows)
    if (rows.length) await hooks.onMonth?.(rows)
    seen += list.length
    hooks.onProgress(`Mois ${i + 1} sur ${months.length} · ${games.length.toLocaleString('fr-FR')} parties lues`, (i + 1) / months.length)
  }
  if (games.length === 0) throw new Error('Aucune partie classique avec des coups dans ces archives.')
  return games
}
