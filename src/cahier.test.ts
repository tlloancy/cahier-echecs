import { Chess } from 'chessops/chess'
import { parseSan } from 'chessops/san'
import { describe, expect, it } from 'vitest'
import { epd } from './book.ts'
import { whiteCentipawns, type EngineScore } from './engine.ts'
import { readLine } from './lighten.ts'
import { losingOpenings, nextRows, scorePercent } from './stats.ts'
import type { LightGame } from './types.ts'

function game(patch: Partial<LightGame> & Pick<LightGame, 'id' | 'line' | 'result'>): LightGame {
  return {
    user: 'a',
    display: 'A',
    color: 'w',
    how: 'mate',
    tc: 'blitz',
    opp: 'b',
    end: 1,
    opening: 'Autre',
    url: 'https://www.chess.com/game/live/1',
    ...patch,
  }
}

function score(cp: number, side: 'white' | 'black'): number {
  const row: EngineScore = { uci: 'e2e4', cp, mate: null, pv: ['e2e4'] }
  return whiteCentipawns(row, side)
}

describe('readLine', () => {
  const pgn = `[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0\n`

  it('retient tous les coups et le nom du livre', () => {
    const pos = Chess.default()
    const move = parseSan(pos, 'e4')
    expect(move).toBeTruthy()
    pos.play(move!)
    const parsed = readLine(pgn, { [epd(pos)]: { eco: 'C20', name: "King's Pawn Game" } })
    expect(parsed?.moves).toBe('e4 e5 Nf3 Nc6')
    expect(parsed?.opening).toBe("King's Pawn Game")
  })
})

describe('nextRows', () => {
  it('compte le coup suivant sans reconstruire tout l’arbre', () => {
    const games = [
      game({ id: '1', line: 'e4 e5', moves: 'e4 e5 Nf3', result: 'l' }),
      game({ id: '2', line: 'e4 c5', result: 'w' }),
      game({ id: '3', line: 'd4', result: 'd' }),
    ]
    const step = nextRows(games, ['e4'], {})
    expect(step.here.games).toBe(2)
    expect(step.rows.map((row) => row.move)).toEqual(['c5', 'e5'])
    expect(step.rows.find((row) => row.move === 'e5')?.l).toBe(1)
  })
})

describe('scorePercent', () => {
  it('compte la nulle comme un demi-point', () => {
    expect(scorePercent({ games: 10, w: 3, d: 2, l: 5 })).toBe(40)
    expect(scorePercent({ games: 0, w: 0, d: 0, l: 0 })).toBe(0)
  })
})

describe('losingOpenings', () => {
  it('garde les ouvertures d’au moins dix parties, les plus faibles d’abord', () => {
    const pos = Chess.default()
    const move = parseSan(pos, 'e4')
    pos.play(move!)
    const book = { [epd(pos)]: { eco: 'C20', name: 'King’s Pawn' } }
    const games = []
    for (let i = 0; i < 9; i += 1) games.push(game({ id: `l${i}`, line: 'e4 e5', result: 'l' }))
    expect(losingOpenings(games, book)).toHaveLength(0)
    games.push(game({ id: 'l9', line: 'e4 e5', result: 'l' }))
    const shown = losingOpenings(games, book)
    expect(shown).toHaveLength(1)
    expect(shown[0].name).toBe('King’s Pawn')
    expect(shown[0].score).toBe(0)
    expect(shown[0].path).toEqual(['e4'])
  })
})

describe('whiteCentipawns', () => {
  it('renverse le score quand les noirs ont le trait', () => {
    expect(score(40, 'white')).toBe(40)
    expect(score(40, 'black')).toBe(-40)
  })
})
