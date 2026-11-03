import { Chess } from 'chessops/chess'
import { parseSan } from 'chessops/san'
import { epd } from './book.ts'
import type { Book, Filters, GameResult, LightGame, OppRow, Tally, TimeClass } from './types.ts'

export function emptyTally(): Tally {
  return { games: 0, w: 0, d: 0, l: 0 }
}

export function addResult(tally: Tally, result: GameResult): void {
  tally.games += 1
  tally[result] += 1
}

export function winPercent(tally: Tally): number {
  if (!tally.games) return 0
  return Math.round((tally.w / tally.games) * 100)
}

export function scorePercent(tally: Tally): number {
  if (!tally.games) return 0
  return Math.round(((tally.w + tally.d / 2) / tally.games) * 100)
}

export function onLine(line: string, path: string[]): boolean {
  if (path.length === 0) return true
  const prefix = path.join(' ')
  return line === prefix || line.startsWith(`${prefix} `)
}

export function selectGames(games: LightGame[], filters: Filters, countries: Record<string, string> = {}): LightGame[] {
  return games.filter((game) => {
    if (filters.color !== 'all' && game.color !== filters.color) return false
    if (filters.tc !== 'all' && game.tc !== filters.tc) return false
    if (filters.result !== 'all' && game.result !== filters.result) return false
    if (filters.ending !== 'all' && game.how !== filters.ending) return false
    if (filters.country && countries[game.opp.toLowerCase()] !== filters.country) return false
    if (filters.opp && game.opp.toLowerCase() !== filters.opp) return false
    return true
  })
}

export function tallyOf(games: LightGame[]): Tally {
  const tally = emptyTally()
  for (const game of games) addResult(tally, game.result)
  return tally
}

export function opponentRows(games: LightGame[]): OppRow[] {
  const rows = new Map<string, OppRow>()
  for (const game of games) {
    const key = game.opp.toLowerCase()
    let row = rows.get(key)
    if (!row) {
      row = { name: game.opp, games: 0, w: 0, d: 0, l: 0 }
      rows.set(key, row)
    }
    addResult(row, game.result)
  }
  return [...rows.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, 'fr'))
}

export function playedLine(game: LightGame): string {
  return game.moves || game.line
}

export interface ContRow extends Tally {
  move: string
  name: string
}

export function nextRows(games: LightGame[], path: string[], book: Book): { here: Tally; name: string; rows: ContRow[] } {
  const here = emptyTally()
  const map = new Map<string, ContRow>()
  const prefix = path.join(' ')
  const mark = prefix ? `${prefix} ` : ''
  for (const game of games) {
    const line = playedLine(game)
    if (prefix && line !== prefix && !line.startsWith(mark)) continue
    addResult(here, game.result)
    let next = ''
    if (!prefix) {
      if (!line) continue
      const cut = line.indexOf(' ')
      next = cut === -1 ? line : line.slice(0, cut)
    } else if (line.startsWith(mark)) {
      const rest = line.slice(mark.length)
      const cut = rest.indexOf(' ')
      next = cut === -1 ? rest : rest.slice(0, cut)
    }
    if (!next) continue
    let row = map.get(next)
    if (!row) {
      row = { move: next, name: '', games: 0, w: 0, d: 0, l: 0 }
      map.set(next, row)
    }
    addResult(row, game.result)
  }
  const rows = [...map.values()].sort((a, b) => b.games - a.games || a.move.localeCompare(b.move, 'fr'))
  const pos = Chess.default()
  let name = ''
  for (const san of path) {
    const move = parseSan(pos, san)
    if (!move) break
    pos.play(move)
    const hit = book[epd(pos)]
    if (hit) name = hit.name
  }
  for (const row of rows) {
    const branch = pos.clone()
    const move = parseSan(branch, row.move)
    if (!move) continue
    branch.play(move)
    const hit = book[epd(branch)]
    row.name = hit?.name || name
  }
  return { here, name, rows }
}

export function gamesOnLine(games: LightGame[], path: string[]): LightGame[] {
  return games.filter((game) => onLine(playedLine(game), path)).sort((a, b) => b.end - a.end)
}

export function timeLabel(tc: TimeClass | 'all'): string {
  switch (tc) {
    case 'all':
      return 'Toutes'
    case 'bullet':
      return 'Bullet'
    case 'blitz':
      return 'Blitz'
    case 'rapid':
      return 'Rapide'
    case 'daily':
      return 'Correspondance'
    default:
      return 'Autre'
  }
}
