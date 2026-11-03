import { parsePgn, startingPosition } from 'chessops/pgn'
import { makeSanAndPlay, parseSan } from 'chessops/san'
import { epd, MAX_PLIES } from './book.ts'
import type { Book, Ending, GameResult, LightGame, Side, TimeClass } from './types.ts'

interface ApiPlayer {
  username?: string
  rating?: number
  result?: string
}

interface ApiGame {
  url?: string
  pgn?: string
  time_class?: string
  end_time?: number
  rules?: string
  white?: ApiPlayer
  black?: ApiPlayer
}

const DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'])

function resultOf(code: string | undefined): GameResult | null {
  if (!code) return null
  if (code === 'win') return 'w'
  if (DRAWS.has(code)) return 'd'
  return 'l'
}

function endingOf(mine: string | undefined, theirs: string | undefined): Ending {
  const code = mine === 'win' ? theirs : mine
  if (code === 'checkmated') return 'mate'
  if (code === 'resigned' || code === 'abandoned') return 'resign'
  if (code === 'timeout') return 'time'
  return 'other'
}

function timeClassOf(value: string | undefined): TimeClass {
  if (value === 'bullet' || value === 'blitz' || value === 'rapid' || value === 'daily') return value
  return 'other'
}

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

function readLine(pgn: string, book: Book): { line: string; moves: string; opening: string } | null {
  const game = parsePgn(pgn)[0]
  if (!game) return null
  const setup = startingPosition(game.headers)
  if (setup.isErr) return null
  const pos = setup.unwrap()
  if (pos.rules !== 'chess') return null
  const sans: string[] = []
  let opening = ''
  for (const node of game.moves.mainline()) {
    const move = parseSan(pos, node.san)
    if (!move) break
    sans.push(makeSanAndPlay(pos, move))
    if (sans.length <= MAX_PLIES) {
      const hit = book[epd(pos)]
      if (hit) opening = hit.name
    }
  }
  if (sans.length === 0) return null
  return { line: sans.slice(0, MAX_PLIES).join(' '), moves: sans.join(' '), opening: opening || 'Autre' }
}

const monthGames = new Map<string, ApiGame[]>()

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

function toLight(raw: ApiGame, user: string, book: Book, index: number): LightGame | null {
  if (raw.rules && raw.rules !== 'chess') return null
  const white = raw.white?.username || ''
  const black = raw.black?.username || ''
  const whiteKey = white.toLowerCase()
  const blackKey = black.toLowerCase()
  let color: Side
  let result: GameResult | null
  let how: Ending
  let opp: string
  if (whiteKey === user) {
    color = 'w'
    result = resultOf(raw.white?.result)
    how = endingOf(raw.white?.result, raw.black?.result)
    opp = black
  } else if (blackKey === user) {
    color = 'b'
    result = resultOf(raw.black?.result)
    how = endingOf(raw.black?.result, raw.white?.result)
    opp = white
  } else {
    return null
  }
  if (!result || !raw.pgn) return null
  const played = readLine(raw.pgn, book)
  if (!played) return null
  const url = raw.url || ''
  return {
    id: `${user}|${url || index}|${raw.end_time || 0}`,
    user,
    display: color === 'w' ? white : black,
    color,
    result,
    how,
    tc: timeClassOf(raw.time_class),
    opp: opp || 'inconnu',
    end: raw.end_time || 0,
    line: played.line,
    moves: played.moves,
    opening: played.opening,
    url,
  }
}

export async function loadPlayerSince(
  username: string,
  book: Book,
  sinceEnd: number,
  hooks: { onProgress: (text: string) => void; signal: AbortSignal },
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
    hooks.onProgress(`Mise à jour · ${step} / ${total}`)
    const url = `https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/${year}/${mm}`
    let list: ApiGame[] = []
    try {
      const data = await getJson<{ games?: ApiGame[] }>(url, hooks.signal)
      list = data.games || []
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Ce pseudo n’existe pas sur Chess.com.') throw error
    }
    for (const raw of list) {
      seen += 1
      const light = toLight(raw, user, book, seen)
      if (light) games.push(light)
    }
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
  hooks: { onProgress: (text: string) => void; signal: AbortSignal },
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
    hooks.onProgress(`${i + 1} / ${months.length} mois · ${games.length.toLocaleString('fr-FR')} parties`)
    const month = await getJson<{ games?: ApiGame[] }>(months[i], hooks.signal)
    for (const raw of month.games || []) {
      seen += 1
      const light = toLight(raw, user.toLowerCase(), book, seen)
      if (light) games.push(light)
    }
  }
  if (games.length === 0) throw new Error('Aucune partie classique avec des coups dans ces archives.')
  return games
}
