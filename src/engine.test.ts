import { describe, expect, it } from 'vitest'
import { centipawnLoss, lossFor, type EngineScore } from './engine.ts'

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

describe('perte en centipions : même gaffe, même résultat pour les deux couleurs', () => {
  const score = (cp: number) => ({ uci: 'e2e4', cp, mate: null, pv: ['e2e4'] })

  it('une gaffe des Blancs est une perte positive', () => {
    expect(centipawnLoss(score(80), score(220), 'white')).toBe(300)
  })

  it('une gaffe des Noirs est aussi une perte positive (avant : −300, donc jamais signalée)', () => {
    expect(centipawnLoss(score(80), score(220), 'black')).toBe(300)
  })

  it('lossFor est symétrique', () => {
    expect(lossFor('white', 50, -250)).toBe(300)
    expect(lossFor('black', -50, 250)).toBe(300)
    expect(lossFor('black', 50, -250)).toBe(-300)
  })
})
