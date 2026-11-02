import { parsePgn, startingPosition } from 'chessops/pgn'
import { makeSanAndPlay, parseSan } from 'chessops/san'
import { epd, MAX_PLIES } from './book.ts'
import type { Book, GameResult, LightGame, Side, TimeClass } from './types.ts'

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

function timeClassOf(value: string | undefined): TimeClass {
  if (value === 'bullet' || value === 'blitz' || value === 'rapid' || value === 'daily') return value
  return 'other'
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
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

function readLine(pgn: string, book: Book): { line: string; opening: string } | null {
  const game = parsePgn(pgn)[0]
  if (!game) return null
  const setup = startingPosition(game.headers)
  if (setup.isErr) return null
  const pos = setup.unwrap()
  if (pos.rules !== 'chess') return null
  const sans: string[] = []
  let opening = ''
  for (const node of game.moves.mainline()) {
    if (sans.length >= MAX_PLIES) break
    const move = parseSan(pos, node.san)
    if (!move) break
    sans.push(makeSanAndPlay(pos, move))
    const hit = book[epd(pos)]
    if (hit) opening = hit.name
  }
  if (sans.length === 0) return null
  return { line: sans.join(' '), opening: opening || 'Autre' }
}

function toLight(raw: ApiGame, user: string, book: Book, index: number): LightGame | null {
  if (raw.rules && raw.rules !== 'chess') return null
  const white = raw.white?.username || ''
  const black = raw.black?.username || ''
  const whiteKey = white.toLowerCase()
  const blackKey = black.toLowerCase()
  let color: Side
  let result: GameResult | null
  let opp: string
  if (whiteKey === user) {
    color = 'w'
    result = resultOf(raw.white?.result)
    opp = black
  } else if (blackKey === user) {
    color = 'b'
    result = resultOf(raw.black?.result)
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
    tc: timeClassOf(raw.time_class),
    opp: opp || 'inconnu',
    end: raw.end_time || 0,
    line: played.line,
    opening: played.opening,
    url,
  }
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
