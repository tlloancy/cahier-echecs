import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Engine } from './engine.ts'

type Listener = (event: { data: unknown }) => void

/** Faux Stockfish : répond au protocole UCI, avec un comportement de recherche pilotable par le test. */
class FakeWorker {
  static last: FakeWorker
  onmessage: Listener | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  goMode: 'answer' | 'hang' = 'answer'
  goCount = 0
  private waitingGo = false
  terminated = false

  constructor() {
    FakeWorker.last = this
  }

  emit(line: string): void {
    this.onmessage?.({ data: line })
  }

  postMessage(message: string): void {
    this.sent.push(message)
    if (message === 'uci') queueMicrotask(() => this.emit('uciok'))
    else if (message === 'isready') queueMicrotask(() => this.emit('readyok'))
    else if (message.startsWith('go')) {
      this.goCount += 1
      const n = this.goCount
      if (this.goMode === 'answer') {
        queueMicrotask(() => {
          this.emit(`info depth 12 score cp ${n * 10} pv e2e4 e7e5`)
          this.emit('bestmove e2e4')
        })
      } else {
        this.waitingGo = true
      }
    } else if (message === 'stop' && this.waitingGo) {
      this.waitingGo = false
      queueMicrotask(() => this.emit('bestmove e2e4'))
    }
  }

  terminate(): void {
    this.terminated = true
  }
}

beforeEach(() => {
  ;(globalThis as unknown as { Worker: unknown }).Worker = FakeWorker
  ;(globalThis as unknown as { window: unknown }).window = globalThis
})

afterEach(() => {
  delete (globalThis as unknown as { Worker?: unknown }).Worker
})

describe('protocole du moteur', () => {
  it('renvoie le score et la variante de la recherche', async () => {
    const engine = new Engine('x.js')
    const score = await engine.best('startpos-fen', 12)
    expect(score.cp).toBe(10)
    expect(score.pv).toEqual(['e2e4', 'e7e5'])
  })

  it('traite les positions les unes après les autres', async () => {
    const engine = new Engine('x.js')
    const [a, b] = await Promise.all([engine.best('a', 12), engine.best('b', 12)])
    expect([a.cp, b.cp]).toEqual([10, 20])
  })

  it('après un délai dépassé, la réponse tardive n’est jamais lue comme celle de la position suivante', async () => {
    const engine = new Engine('x.js', { searchMs: 20, stopMs: 500 })
    await engine.best('boot', 12) // démarre le moteur
    const worker = FakeWorker.last
    worker.goMode = 'hang'
    const slow = engine.best('lente', 12)
    const slowResult = slow.then(
      () => 'ok',
      (e: Error) => e.message,
    )
    await new Promise((r) => setTimeout(r, 5)) // la recherche lente est partie : elle ne reçoit pas de réponse
    worker.goMode = 'answer'
    const next = engine.best('suivante', 12)
    expect(await slowResult).toContain('trop de temps')
    const score = await next
    // La recherche suivante reçoit SA réponse (3e « go »), pas le bestmove de l'arrêt.
    expect(score.cp).toBe(worker.goCount * 10)
    expect(worker.sent).toContain('stop')
  })

  it('un moteur qui ne répond plus après « stop » est déclaré en panne, et les recherches suivantes échouent vite', async () => {
    const engine = new Engine('x.js', { searchMs: 10, stopMs: 20 })
    await engine.best('boot', 12)
    const worker = FakeWorker.last
    worker.goMode = 'hang'
    worker.postMessage = function (this: FakeWorker, message: string) {
      this.sent.push(message) // ne répond plus à rien
    }
    await expect(engine.best('x', 12)).rejects.toThrow('ne répond plus')
    expect(engine.failed).toBe(true)
    await expect(engine.best('y', 12)).rejects.toThrow('ne répond plus')
  })

  it('une panne du worker après le démarrage fait échouer la recherche en cours', async () => {
    const engine = new Engine('x.js')
    await engine.best('boot', 12)
    const worker = FakeWorker.last
    worker.goMode = 'hang'
    const pending = engine.best('x', 12)
    await new Promise((r) => setTimeout(r, 5))
    worker.onerror?.()
    await expect(pending).rejects.toThrow('s’est arrêté')
    expect(engine.failed).toBe(true)
  })

  it('un moteur qui ne démarre pas est signalé', async () => {
    class SilentWorker extends FakeWorker {
      override postMessage(): void {}
    }
    ;(globalThis as unknown as { Worker: unknown }).Worker = SilentWorker
    const engine = new Engine('x.js', { bootMs: 20 })
    await expect(engine.best('x', 12)).rejects.toThrow('n’a pas démarré')
    expect(engine.failed).toBe(true)
  })
})
