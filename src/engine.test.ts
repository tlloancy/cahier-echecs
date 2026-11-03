import { describe, expect, it } from 'vitest'
import { centipawnLoss, type EngineScore } from './engine.ts'

const FAILLE_CP = 150

function score(cp: number): EngineScore {
  return { uci: 'e2e4', cp, mate: null, pv: ['e2e4'] }
}

describe('centipawnLoss', () => {
  it('reste proche de 0 quand le coup joué est le meilleur, blancs au trait', () => {
    const loss = centipawnLoss(score(220), score(-220), 'white')
    expect(loss).toBe(0)
    expect(loss).toBeLessThan(FAILLE_CP)
  })

  it('reste proche de 0 quand le coup joué est le meilleur, noirs au trait', () => {
    const loss = centipawnLoss(score(80), score(-80), 'black')
    expect(loss).toBe(0)
    expect(loss).toBeLessThan(FAILLE_CP)
  })
})
