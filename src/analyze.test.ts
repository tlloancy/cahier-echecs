import { describe, expect, it } from 'vitest'
import { analyzeLine } from './analyze.ts'
import type { Engine, EngineScore } from './engine.ts'
import { game } from './fixtures.ts'

const hooks = () => ({ signal: new AbortController().signal, stopped: () => false, onProgress() {}, onFinding() {} })

/** Moteur factice : le camp qui joue perd ~350 cp à chaque coup. */
function blunderingEngine(side: 'w' | 'b'): Engine {
  return {
    failed: false,
    best: async (fen: string): Promise<EngineScore> => {
      const toMove = fen.split(' ')[1]
      return { uci: 'a1a1', cp: toMove === side ? 50 : 400, mate: null, pv: ['a1a1'] }
    },
    stop() {},
  } as unknown as Engine
}

describe('analyse Stockfish', () => {
  it('repère les gaffes des Blancs', async () => {
    const result = await analyzeLine([game({ color: 'w' })], ['e4'], {}, blunderingEngine('w'), hooks())
    expect(result.failles.length).toBeGreaterThan(0)
  })

  it('repère aussi les gaffes des Noirs (avant : toujours zéro)', async () => {
    const result = await analyzeLine([game({ color: 'b' })], ['e4'], {}, blunderingEngine('b'), hooks())
    expect(result.failles.length).toBeGreaterThan(0)
    expect(result.failles.every((f) => f.cpl >= 150)).toBe(true)
  })

  it('plafonne les pertes (mat) pour un affichage lisible', async () => {
    const engine = {
      failed: false,
      best: async (fen: string): Promise<EngineScore> => ({ uci: 'a1a1', cp: fen.split(' ')[1] === 'b' ? 50 : null, mate: fen.split(' ')[1] === 'b' ? null : 2, pv: ['a1a1'] }),
      stop() {},
    } as unknown as Engine
    const result = await analyzeLine([game({ color: 'b' })], ['e4'], {}, engine, hooks())
    expect(Math.max(...result.failles.map((f) => f.cpl))).toBeLessThanOrEqual(1000)
  })

  it('un moteur en panne lève une erreur au lieu de répondre « aucune faille »', async () => {
    let calls = 0
    const dead = {
      failed: false,
      best: async () => {
        calls += 1
        throw new Error('Le moteur n’a pas démarré.')
      },
      stop() {},
    } as unknown as Engine
    await expect(analyzeLine([game()], ['e4'], {}, dead, hooks())).rejects.toThrow('Le moteur n’a pas démarré.')
    expect(calls).toBeLessThanOrEqual(3)
  })

  it('un moteur marqué hors service interrompt tout de suite', async () => {
    const dead = {
      failed: true,
      best: async () => {
        throw new Error('Le moteur ne répond plus.')
      },
      stop() {},
    } as unknown as Engine
    await expect(analyzeLine([game()], ['e4'], {}, dead, hooks())).rejects.toThrow('ne répond plus')
  })

  it('compte les parties et les positions examinées', async () => {
    const result = await analyzeLine([game()], ['e4'], {}, blunderingEngine('w'), hooks())
    expect(result.games).toBe(1)
    expect(result.positions).toBeGreaterThan(0)
  })

  it('un arrêt demandé par l’utilisateur n’est pas une panne', async () => {
    let stop = false
    const engine = {
      failed: false,
      best: async () => {
        stop = true
        throw new Error('arrêté')
      },
      stop() {},
    } as unknown as Engine
    const result = await analyzeLine([game()], ['e4'], {}, engine, { ...hooks(), stopped: () => stop })
    expect(result.failles).toEqual([])
  })
})
