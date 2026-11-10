import type { LightGame } from './types.ts'

/** Partie de test : par défaut les Blancs perdent après une partie espagnole. */
export function game(over: Partial<LightGame> = {}): LightGame {
  const moves = 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O'
  return {
    id: `g${Math.random()}`,
    user: 'me',
    display: 'Me',
    color: 'w',
    result: 'l',
    how: 'resign',
    tc: 'blitz',
    opp: 'rival',
    end: 1,
    line: moves,
    moves,
    opening: 'Ruy Lopez',
    url: 'https://www.chess.com/game/live/1',
    ...over,
  }
}
