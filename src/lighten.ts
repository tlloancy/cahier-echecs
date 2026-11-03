import { parsePgn, startingPosition } from 'chessops/pgn'
import { makeSanAndPlay, parseSan } from 'chessops/san'
import { epd, MAX_PLIES } from './book.ts'
import type { Book, Ending, GameResult, LightGame, Side, TimeClass } from './types.ts'

export interface ApiPlayer {
  username?: string
  rating?: number
  result?: string
}

export interface ApiGame {
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

export function readLine(pgn: string, book: Book): { line: string; moves: string; opening: string } | null {
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

export function toLight(raw: ApiGame, user: string, book: Book, index: number): LightGame | null {
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
