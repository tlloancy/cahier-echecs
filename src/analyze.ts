import { Chess } from 'chessops/chess'
import type { Color, Move } from 'chessops/types'
import { makeFen } from 'chessops/fen'
import { makeSan, parseSan } from 'chessops/san'
import { parseUci } from 'chessops/util'
import { ensureMoves, releaseMonths } from './api.ts'
import { writeGame } from './db.ts'
import { centipawnLoss, Engine, whiteCentipawns, type EngineScore } from './engine.ts'
import { gamesOnLine } from './stats.ts'
import type { Book, Finding, LightGame } from './types.ts'

const DEPTH = 12
const SAMPLE = 8
const FAILLE_CP = 150
const SACRIFICE = 2
const BOOK_PLIES = 6
const DECIDED_CP = 600

const VALUES: Record<string, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 }

function material(pos: Chess, color: Color): number {
  const board = pos.board
  let total = 0
  for (const role of ['pawn', 'knight', 'bishop', 'rook', 'queen'] as const) {
    total += VALUES[role] * board[role].intersect(board[color]).size()
  }
  return total
}

interface Forecast {
  moves: string[]
  cp: number
}

function sameSquare(move: Move, uci: string): boolean {
  const parsed = parseUci(uci)
  if (!parsed || !('from' in move) || !('from' in parsed)) return false
  return move.from === parsed.from && move.to === parsed.to && move.promotion === parsed.promotion
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
  const seen = new Map<string, EngineScore>()
  if (sample.length === 0) return { failles, decisifs }

  async function once(fen: string): Promise<EngineScore> {
    const hit = seen.get(fen)
    if (hit) return hit
    const score = await engine.best(fen, DEPTH)
    seen.set(fen, score)
    return score
  }

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
    let forecast: Forecast | null = null
    let ply = 0
    let decided = false
    for (const san of moves.split(' ')) {
      if (hooks.stopped() || decided) break
      const move = parseSan(pos, san)
      if (!move) break
      ply += 1
      if (pos.turn !== side && forecast?.moves.length && !sameSquare(move, forecast.moves[0])) forecast = null
      if (pos.turn === side && ply > BOOK_PLIES) {
        hooks.onProgress(`${where} · ${moveLabel(ply, san)}`)
        const before = pos.clone()
        let answerCp: number | undefined = forecast?.cp
        let bestUci: string = forecast?.moves[0] || ''
        let answerScore: EngineScore | null = null
        if (answerCp == null) {
          try {
            answerScore = await once(makeFen(before.toSetup()))
          } catch {
            if (hooks.stopped()) break
            pos.play(move)
            continue
          }
          if (hooks.stopped()) break
          answerCp = whiteCentipawns(answerScore, side)
          const line = answerScore.pv.length ? answerScore.pv : answerScore.uci ? [answerScore.uci] : []
          bestUci = line[0] || ''
          forecast = { moves: line, cp: answerCp }
        }
        if (Math.abs(answerCp) > DECIDED_CP) {
          decided = true
          break
        }
        const bestMove = parseUci(bestUci)
        const bestSan = bestMove ? makeSan(before, bestMove) : san
        const playedBest = sameSquare(move, bestUci)
        if (playedBest) {
          const after = before.clone()
          after.play(move)
          const net =
            material(before, side) - material(after, side) - (material(before, other) - material(after, other))
          if (net >= SACRIFICE) {
            const row: Finding = { url: game.url, opp: game.opp, ply, san, best: bestSan, cpl: 0, line: moves }
            decisifs.push(row)
            hooks.onFinding('decisif', row)
          }
        } else {
          const after = before.clone()
          after.play(move)
          let follow: EngineScore
          try {
            follow = await once(makeFen(after.toSetup()))
          } catch {
            if (hooks.stopped()) break
            pos.play(move)
            continue
          }
          if (hooks.stopped()) break
          const followCp = whiteCentipawns(follow, other)
          const loss = answerScore ? centipawnLoss(answerScore, follow, side) : answerCp - followCp
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
          forecast = {
            moves: follow.pv.length ? follow.pv : follow.uci ? [follow.uci] : [],
            cp: followCp,
          }
          pos.play(move)
          continue
        }
      }
      if (forecast?.moves.length && sameSquare(move, forecast.moves[0])) {
        forecast = { moves: forecast.moves.slice(1), cp: forecast.cp }
      }
      pos.play(move)
    }
  }

  failles.sort((a, b) => b.cpl - a.cpl)
  releaseMonths()
  return { failles: failles.slice(0, 8), decisifs: decisifs.slice(0, 8) }
}
