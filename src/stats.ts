import { Chess } from 'chessops/chess'
import { parseSan } from 'chessops/san'
import { epd } from './book.ts'
import type { Book, Filters, GameResult, LightGame, OppRow, Tally, TimeClass, TreeNode } from './types.ts'

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

function emptyNode(move: string): TreeNode {
  return { move, name: '', games: 0, w: 0, d: 0, l: 0, children: new Map() }
}

export function buildTree(games: LightGame[], book: Book): TreeNode {
  const root = emptyNode('')
  for (const game of games) {
    addResult(root, game.result)
    if (!game.line) continue
    const pos = Chess.default()
    let node = root
    let name = ''
    for (const san of game.line.split(' ')) {
      const move = parseSan(pos, san)
      if (!move) break
      pos.play(move)
      const hit = book[epd(pos)]
      if (hit) name = hit.name
      let child = node.children.get(san)
      if (!child) {
        child = emptyNode(san)
        node.children.set(san, child)
      }
      if (name) child.name = name
      addResult(child, game.result)
      node = child
    }
  }
  return root
}

export function nodeAt(root: TreeNode, path: string[]): TreeNode {
  let node = root
  for (const san of path) {
    const child = node.children.get(san)
    if (!child) return node
    node = child
  }
  return node
}

export function clampPath(root: TreeNode, path: string[]): string[] {
  const kept: string[] = []
  let node = root
  for (const san of path) {
    const child = node.children.get(san)
    if (!child) break
    kept.push(san)
    node = child
  }
  return kept
}

export function sortedChildren(node: TreeNode): TreeNode[] {
  return [...node.children.values()].sort((a, b) => b.games - a.games || a.move.localeCompare(b.move, 'fr'))
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

export function gamesOnLine(games: LightGame[], path: string[]): LightGame[] {
  return games.filter((game) => onLine(game.line, path)).sort((a, b) => b.end - a.end)
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
