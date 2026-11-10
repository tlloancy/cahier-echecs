export interface EngineScore {
  uci: string
  cp: number | null
  mate: number | null
  pv: string[]
}

export interface EngineOptions {
  /** Temps maximal pour une position avant d'envoyer « stop ». */
  searchMs?: number
  /** Temps laissé au moteur pour répondre après « stop » avant de le déclarer mort. */
  stopMs?: number
  /** Temps maximal de démarrage. */
  bootMs?: number
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

function readPv(lines: string[]): string[] {
  let pv: string[] = []
  for (const line of lines) {
    const at = line.indexOf(' pv ')
    if (at === -1) continue
    pv = line.slice(at + 4).trim().split(/\s+/).filter(Boolean)
  }
  return pv
}

interface SearchWaiter {
  lines: string[]
  timer: number
  hard: number
  timedOut: boolean
  resolve: (score: EngineScore) => void
  reject: (error: Error) => void
}

export class Engine {
  private worker: Worker
  private pending: SearchWaiter | null = null
  private boot: Promise<void>
  private chain: Promise<void> = Promise.resolve()
  private sawUci = false
  private broken: Error | null = null
  private readonly searchMs: number
  private readonly stopMs: number

  constructor(scriptUrl: string, options: EngineOptions = {}) {
    this.searchMs = options.searchMs ?? 20000
    this.stopMs = options.stopMs ?? 5000
    const bootMs = options.bootMs ?? 20000
    this.worker = new Worker(scriptUrl)
    this.boot = new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        const error = new Error('Le moteur n’a pas démarré.')
        this.broken = error
        reject(error)
      }, bootMs)
      this.worker.onerror = () => {
        window.clearTimeout(timer)
        const error = new Error('Le moteur n’a pas démarré.')
        this.broken = error
        reject(error)
      }
      this.worker.onmessage = (event: MessageEvent) => {
        if (typeof event.data !== 'string') return
        const line = event.data
        if (this.pending) {
          this.onSearchLine(line)
          return
        }
        if (line.startsWith('uciok') && !this.sawUci) {
          this.sawUci = true
          this.worker.postMessage('isready')
        } else if (line === 'readyok') {
          window.clearTimeout(timer)
          // Une fois prêt, une panne du worker doit faire échouer la recherche en cours et les suivantes.
          this.worker.onerror = () => this.fail(new Error('Le moteur s’est arrêté.'))
          resolve()
        }
      }
      this.worker.postMessage('uci')
    })
    // Évite un « unhandled rejection » si personne n'attend encore le démarrage.
    this.boot.catch(() => undefined)
  }

  private onSearchLine(line: string): void {
    const waiter = this.pending
    if (!waiter) return
    if (!line.startsWith('bestmove')) {
      waiter.lines.push(line)
      return
    }
    this.pending = null
    window.clearTimeout(waiter.timer)
    window.clearTimeout(waiter.hard)
    if (waiter.timedOut) {
      waiter.reject(new Error('Le moteur a mis trop de temps sur une position.'))
      return
    }
    const uci = line.split(/\s+/)[1] || ''
    const score = readScore(waiter.lines)
    const pv = readPv(waiter.lines)
    waiter.resolve({ uci, ...score, pv: pv.length ? pv : uci && uci !== '(none)' ? [uci] : [] })
  }

  private fail(error: Error): void {
    this.broken = error
    const waiter = this.pending
    this.pending = null
    if (!waiter) return
    window.clearTimeout(waiter.timer)
    window.clearTimeout(waiter.hard)
    waiter.reject(error)
  }

  /** Vrai quand le moteur ne démarre pas ou ne répond plus : inutile d'insister. */
  get failed(): boolean {
    return this.broken !== null
  }

  best(fen: string, depth: number): Promise<EngineScore> {
    if (this.broken) return Promise.reject(this.broken)
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

  dispose(): void {
    this.worker.terminate()
    this.broken = this.broken || new Error('Le moteur est arrêté.')
  }

  private search(fen: string, depth: number): Promise<EngineScore> {
    return this.boot.then(
      () =>
        new Promise<EngineScore>((resolve, reject) => {
          if (this.broken) {
            reject(this.broken)
            return
          }
          const waiter: SearchWaiter = { lines: [], timer: 0, hard: 0, timedOut: false, resolve, reject }
          // Après le délai, on demande l'arrêt mais on attend le « bestmove » qui suit :
          // la réponse d'une recherche interrompue ne peut donc jamais être lue comme celle de la suivante.
          waiter.timer = window.setTimeout(() => {
            waiter.timedOut = true
            this.worker.postMessage('stop')
            waiter.hard = window.setTimeout(() => this.fail(new Error('Le moteur ne répond plus.')), this.stopMs)
          }, this.searchMs)
          this.pending = waiter
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

/**
 * Points perdus par `side` quand l'évaluation passe de `before` à `after` (toutes deux du point de vue des Blancs).
 * Positif = le joueur a perdu du terrain, quelle que soit sa couleur.
 */
export function lossFor(side: SideToMove, before: number, after: number): number {
  return side === 'white' ? before - after : after - before
}

export function centipawnLoss(answer: EngineScore, follow: EngineScore, sideToMove: SideToMove): number {
  const other: SideToMove = sideToMove === 'white' ? 'black' : 'white'
  return lossFor(sideToMove, whiteCentipawns(answer, sideToMove), whiteCentipawns(follow, other))
}
