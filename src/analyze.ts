import { Chess } from 'chessops/chess'
import type { Color } from 'chessops/types'
import { makeFen } from 'chessops/fen'
import { makeSan, parseSan } from 'chessops/san'
import { parseUci } from 'chessops/util'
import { ensureMoves } from './api.ts'
import { writeGame } from './db.ts'
import { centipawnLoss, Engine } from './engine.ts'
import { gamesOnLine } from './stats.ts'
import type { Book, Finding, LightGame } from './types.ts'

const DEPTH = 6
const SAMPLE = 8
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

function moveLabel(ply: number, san: string): string {
  const move = Math.ceil(ply / 2)
  return ply % 2 === 1 ? `${move}. ${san}` : `${move}… ${san}`
}

export async function analyzeLine(
  games: LightGame[],
  path: string[],
  book: Book,
  engine: Engine,
  hooks: {
    signal: AbortSignal
    stopped: () => boolean
    onProgress: (text: string) => void
    onFinding: (kind: 'faille' | 'decisif', row: Finding) => void
  },
): Promise<{ failles: Finding[]; decisifs: Finding[] }> {
  const sample = gamesOnLine(games, path).slice(0, SAMPLE)
  const failles: Finding[] = []
  const decisifs: Finding[] = []
  if (sample.length === 0) return { failles, decisifs }

  for (let index = 0; index < sample.length; index += 1) {
    if (hooks.stopped()) break
    const game = sample[index]
    const where = `Partie ${index + 1} sur ${sample.length} · ${game.opp}`
    hooks.onProgress(game.moves ? where : `${where} · lecture des coups`)
    const hadMoves = Boolean(game.moves)
    let moves = game.line
    try {
      moves = await ensureMoves(game, book, hooks.signal)
      if (!hadMoves && game.moves) await writeGame(game)
    } catch (error) {
      if (hooks.stopped() || (error instanceof DOMException && error.name === 'AbortError')) break
    }
    if (hooks.stopped()) break
    const pos = Chess.default()
    const side: Color = game.color === 'w' ? 'white' : 'black'
    const other: Color = side === 'white' ? 'black' : 'white'
    let ply = 0
    for (const san of moves.split(' ')) {
      if (hooks.stopped()) break
      const move = parseSan(pos, san)
      if (!move) break
      ply += 1
      if (pos.turn === side) {
        hooks.onProgress(`${where} · ${moveLabel(ply, san)}`)
        const before = pos.clone()
        let answer: Awaited<ReturnType<Engine['best']>> | null = null
        try {
          answer = await engine.best(makeFen(before.toSetup()), DEPTH)
        } catch {
          if (hooks.stopped()) break
          pos.play(move)
          continue
        }
        if (hooks.stopped()) break
        const bestMove = answer ? parseUci(answer.uci) : null
        if (bestMove && answer) {
          const bestSan = makeSan(before, bestMove)
          const after = before.clone()
          after.play(move)
          if (bestSan === san) {
            const net =
              material(before, side) -
              material(after, side) -
              (material(before, other) - material(after, other))
            if (net >= SACRIFICE) {
              const row: Finding = { url: game.url, opp: game.opp, ply, san, best: bestSan, cpl: 0, line: moves }
              decisifs.push(row)
              hooks.onFinding('decisif', row)
            }
          } else {
            let follow: Awaited<ReturnType<Engine['best']>> | null = null
            try {
              follow = await engine.best(makeFen(after.toSetup()), DEPTH)
            } catch {
              if (hooks.stopped()) break
              pos.play(move)
              continue
            }
            if (hooks.stopped() || !follow) break
            const loss = centipawnLoss(answer, follow, side)
            if (loss >= FAILLE_CP) {
              const row: Finding = {
                url: game.url,
                opp: game.opp,
                ply,
                san,
                best: bestSan,
                cpl: Math.round(loss),
                line: moves,
              }
              failles.push(row)
              hooks.onFinding('faille', row)
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
