export interface EngineScore {
  uci: string
  cp: number | null
  mate: number | null
}

function readScore(lines: string[]): { cp: number | null; mate: number | null } {
  let cp: number | null = null
  let mate: number | null = null
  for (const line of lines) {
    const match = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/)
    if (!match) continue
    const value = Number(match[2])
    if (match[1] === 'cp') {
      cp = value
      mate = null
    } else {
      mate = value
      cp = null
    }
  }
  return { cp, mate }
}

interface SearchWaiter {
  lines: string[]
  timer: number
  resolve: (score: EngineScore) => void
  reject: (error: Error) => void
}

export class Engine {
  private worker: Worker
  private pending: SearchWaiter | null = null
  private boot: Promise<void>
  private chain: Promise<void> = Promise.resolve()
  private sawUci = false

  constructor(scriptUrl: string) {
    this.worker = new Worker(scriptUrl)
    this.boot = new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Le moteur n’a pas démarré.')), 20000)
      this.worker.onerror = () => {
        window.clearTimeout(timer)
        reject(new Error('Le moteur n’a pas démarré.'))
      }
      this.worker.onmessage = (event: MessageEvent) => {
        if (typeof event.data !== 'string') return
        const line = event.data
        if (this.pending) {
          if (line.startsWith('bestmove')) {
            const waiter = this.pending
            this.pending = null
            window.clearTimeout(waiter.timer)
            const uci = line.split(/\s+/)[1] || ''
            const score = readScore(waiter.lines)
            waiter.resolve({ uci, ...score })
          } else {
            this.pending.lines.push(line)
          }
          return
        }
        if (line.startsWith('uciok') && !this.sawUci) {
          this.sawUci = true
          this.worker.postMessage('isready')
        } else if (line === 'readyok') {
          window.clearTimeout(timer)
          resolve()
        }
      }
      this.worker.postMessage('uci')
    })
  }

  best(fen: string, depth: number): Promise<EngineScore> {
    const run = this.chain.then(() => this.search(fen, depth))
    this.chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  stop(): void {
    this.worker.postMessage('stop')
  }

  private search(fen: string, depth: number): Promise<EngineScore> {
    return this.boot.then(
      () =>
        new Promise((resolve, reject) => {
          const timer = window.setTimeout(() => {
            this.worker.postMessage('stop')
            if (this.pending) {
              const waiter = this.pending
              this.pending = null
              waiter.reject(new Error('Le moteur a mis trop de temps sur une position.'))
            }
          }, 20000)
          this.pending = { lines: [], timer, resolve, reject }
          this.worker.postMessage(`position fen ${fen}`)
          this.worker.postMessage(`go depth ${depth}`)
        }),
    )
  }
}

export type SideToMove = 'white' | 'black'

export function whiteCentipawns(score: EngineScore, sideToMove: SideToMove): number {
  const raw = score.mate != null ? (score.mate > 0 ? 100000 - score.mate : -100000 - score.mate) : (score.cp ?? 0)
  return sideToMove === 'black' ? -raw : raw
}

export function centipawnLoss(answer: EngineScore, follow: EngineScore, sideToMove: SideToMove): number {
  const other: SideToMove = sideToMove === 'white' ? 'black' : 'white'
  return whiteCentipawns(answer, sideToMove) - whiteCentipawns(follow, other)
}
