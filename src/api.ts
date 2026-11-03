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

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  return serial(() => readJson<T>(url, signal))
}

async function readJson<T>(url: string, signal: AbortSignal): Promise<T> {
  let last = ''
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, { signal })
    if (response.status === 429) {
      const retry = Number(response.headers.get('retry-after'))
      const wait = Number.isFinite(retry) && retry > 0 ? retry : 2 ** attempt
      last = 'Chess.com demande une pause.'
      await new Promise((resolve) => setTimeout(resolve, wait * 1000))
      continue
    }
    if (response.status === 404) throw new Error('Ce pseudo n’existe pas sur Chess.com.')
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

export async function ensureMoves(game: LightGame, book: Book, signal: AbortSignal): Promise<string> {
  if (game.moves) return game.moves
  if (!game.end || !game.url) return game.line
  const date = new Date(game.end * 1000)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const key = `${game.user}/${year}/${month}`
  let list = monthGames.get(key)
  if (!list) {
    const data = await getJson<{ games?: ApiGame[] }>(
      `https://api.chess.com/pub/player/${encodeURIComponent(game.user)}/games/${year}/${month}`,
      signal,
    )
    list = data.games || []
    monthGames.set(key, list)
  }
  const raw = list.find((item) => item.url === game.url)
  const played = raw?.pgn ? readLine(raw.pgn, book) : null
  if (!played) return game.line
  game.moves = played.moves
  return game.moves
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
      reject(new DOMException('Arrêté', 'AbortError'))
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

export async function loadPlayerSince(
  username: string,
  book: Book,
  sinceEnd: number,
  hooks: { onProgress: (text: string, ratio?: number) => void; signal: AbortSignal },
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
    if (hooks.signal.aborted) throw new DOMException('Arrêté', 'AbortError')
    step += 1
    const mm = String(month).padStart(2, '0')
    hooks.onProgress(`Mise à jour · ${step} / ${total}`, (step - 1) / total)
    const url = `https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/${year}/${mm}`
    let list: ApiGame[] = []
    try {
      const data = await getJson<{ games?: ApiGame[] }>(url, hooks.signal)
      list = data.games || []
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Ce pseudo n’existe pas sur Chess.com.') throw error
    }
    games.push(...(await parseMonth(user, book, list, seen, hooks.signal)))
    seen += list.length
    hooks.onProgress(`Mise à jour · ${step} / ${total}`, step / total)
    month += 1
    if (month === 13) {
      month = 1
      year += 1
    }
  }
  return games
}

export async function loadPlayer(
  username: string,
  book: Book,
  hooks: { onProgress: (text: string, ratio?: number) => void; signal: AbortSignal },
): Promise<LightGame[]> {
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
    if (hooks.signal.aborted) throw new DOMException('Arrêté', 'AbortError')
    hooks.onProgress(`${i + 1} / ${months.length} mois · ${games.length.toLocaleString('fr-FR')} parties`, i / months.length)
    const month = await getJson<{ games?: ApiGame[] }>(months[i], hooks.signal)
    const list = month.games || []
    games.push(...(await parseMonth(user.toLowerCase(), book, list, seen, hooks.signal)))
    seen += list.length
    hooks.onProgress(`${i + 1} / ${months.length} mois · ${games.length.toLocaleString('fr-FR')} parties`, (i + 1) / months.length)
  }
  if (games.length === 0) throw new Error('Aucune partie classique avec des coups dans ces archives.')
  return games
}
