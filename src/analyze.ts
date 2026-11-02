import { Chess } from 'chessops/chess'
import type { Color } from 'chessops/types'
import { makeFen } from 'chessops/fen'
import { makeSan, parseSan } from 'chessops/san'
import { parseUci } from 'chessops/util'
import { Engine, whiteCentipawns } from './engine.ts'
import { gamesOnLine } from './stats.ts'
import type { Finding, LightGame } from './types.ts'

const DEPTH = 6
const SAMPLE = 8
const MAX_PLY = 16
const FAILLE_CP = 150
const SACRIFICE = 2

const VALUES: Record<string, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 }

function material(pos: Chess, color: Color): number {
  const board = pos.board
  let total = 0
  for (const role of ['pawn', 'knight', 'bishop', 'rook', 'queen'] as const) {
    total += VALUES[role] * board[role].intersect(board[color]).size()
  }
  return total
}

export async function analyzeLine(
  games: LightGame[],
  path: string[],
  engine: Engine,
  hooks: { onProgress: (text: string) => void; stopped: () => boolean },
): Promise<{ failles: Finding[]; decisifs: Finding[] }> {
  const sample = gamesOnLine(games, path).slice(0, SAMPLE)
  const failles: Finding[] = []
  const decisifs: Finding[] = []
  if (sample.length === 0) return { failles, decisifs }

  for (let index = 0; index < sample.length; index += 1) {
    if (hooks.stopped()) break
    const game = sample[index]
    hooks.onProgress(`Partie ${index + 1} / ${sample.length}`)
    const pos = Chess.default()
    const side: Color = game.color === 'w' ? 'white' : 'black'
    const other: Color = side === 'white' ? 'black' : 'white'
    let ply = 0
    for (const san of game.line.split(' ')) {
      if (hooks.stopped()) break
      const move = parseSan(pos, san)
      if (!move) break
      ply += 1
      if (pos.turn === side && ply <= MAX_PLY) {
        const before = pos.clone()
        const answer = await engine.best(makeFen(before.toSetup()), DEPTH)
        if (hooks.stopped()) break
        const bestMove = parseUci(answer.uci)
        if (bestMove) {
          const bestSan = makeSan(before, bestMove)
          const after = before.clone()
          after.play(move)
          if (bestSan === san) {
            const net =
              material(before, side) -
              material(after, side) -
              (material(before, other) - material(after, other))
            if (net >= SACRIFICE) {
              decisifs.push({ url: game.url, opp: game.opp, ply, san, best: bestSan, cpl: 0, line: game.line })
            }
          } else {
            const follow = await engine.best(makeFen(after.toSetup()), DEPTH)
            if (hooks.stopped()) break
            const loss =
              side === 'white'
                ? whiteCentipawns(answer) - whiteCentipawns(follow)
                : whiteCentipawns(follow) - whiteCentipawns(answer)
            if (loss >= FAILLE_CP) {
              failles.push({ url: game.url, opp: game.opp, ply, san, best: bestSan, cpl: Math.round(loss), line: game.line })
            }
          }
        }
      }
      pos.play(move)
    }
  }

  failles.sort((a, b) => b.cpl - a.cpl)
  return { failles: failles.slice(0, 8), decisifs: decisifs.slice(0, 8) }
}
