import { describe, expect, it } from 'vitest'
import { toLight, type ApiGame } from './lighten.ts'

const pgn = (moves: string) => `[Event "Live"]\n[Result "1-0"]\n\n${moves} 1-0`
const base = (over: Partial<ApiGame> = {}): ApiGame => ({
  url: 'https://www.chess.com/game/live/1',
  pgn: pgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'),
  time_class: 'blitz',
  rules: 'chess',
  end_time: 1000,
  white: { username: 'Me', result: 'win' },
  black: { username: 'Rival', result: 'resigned' },
  ...over,
})

describe('conversion des parties Chess.com', () => {
  it('lit une victoire des Blancs', () => {
    const g = toLight(base(), 'me', {}, 0)
    expect(g).toMatchObject({ color: 'w', result: 'w', how: 'resign', opp: 'Rival', tc: 'blitz' })
    expect(g?.moves).toBe('e4 e5 Nf3 Nc6 Bb5 a6')
  })

  it('lit une défaite des Noirs par mat', () => {
    const g = toLight(base({ white: { username: 'Rival', result: 'win' }, black: { username: 'Me', result: 'checkmated' } }), 'me', {}, 0)
    expect(g).toMatchObject({ color: 'b', result: 'l', how: 'mate', opp: 'Rival' })
  })

  it('lit les nulles et les fins au temps', () => {
    const draw = toLight(base({ white: { username: 'Me', result: 'agreed' }, black: { username: 'Rival', result: 'agreed' } }), 'me', {}, 0)
    expect(draw?.result).toBe('d')
    const time = toLight(base({ black: { username: 'Rival', result: 'timeout' } }), 'me', {}, 0)
    expect(time?.how).toBe('time')
  })

  it('compte « lose » comme une défaite et ignore un code inconnu', () => {
    expect(toLight(base({ white: { username: 'Me', result: 'lose' }, black: { username: 'Rival', result: 'win' } }), 'me', {}, 0)?.result).toBe('l')
    expect(toLight(base({ white: { username: 'Me', result: 'nouveau-code' } }), 'me', {}, 0)).toBeNull()
  })

  it('ignore les variantes', () => {
    expect(toLight(base({ rules: 'chess960' }), 'me', {}, 0)).toBeNull()
    expect(toLight(base({ rules: 'bughouse' }), 'me', {}, 0)).toBeNull()
  })

  it('ignore une partie sans moi, sans résultat ou sans PGN', () => {
    expect(toLight(base({ white: { username: 'A', result: 'win' }, black: { username: 'B', result: 'resigned' } }), 'me', {}, 0)).toBeNull()
    expect(toLight(base({ white: { username: 'Me', result: 'mystery' } }), 'me', {}, 0)).toBeNull()
    expect(toLight(base({ pgn: undefined }), 'me', {}, 0)).toBeNull()
  })

  it('donne un identifiant stable à une même partie', () => {
    expect(toLight(base(), 'me', {}, 0)?.id).toBe(toLight(base(), 'me', {}, 99)?.id)
  })
})
