export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'daily' | 'other'
export type GameResult = 'w' | 'd' | 'l'
export type Side = 'w' | 'b'

export interface LightGame {
  id: string
  user: string
  display: string
  color: Side
  result: GameResult
  tc: TimeClass
  opp: string
  end: number
  line: string
  opening: string
  url: string
}

export interface BookEntry {
  eco: string
  name: string
}

export type Book = Record<string, BookEntry>

export interface Filters {
  color: 'all' | Side
  tc: 'all' | TimeClass
  opp: string | null
}

export interface TreeNode {
  move: string
  name: string
  games: number
  w: number
  d: number
  l: number
  children: Map<string, TreeNode>
}

export interface OppRow {
  name: string
  games: number
  w: number
  d: number
  l: number
}

export interface Tally {
  games: number
  w: number
  d: number
  l: number
}

export interface Finding {
  url: string
  opp: string
  ply: number
  san: string
  best: string
  cpl: number
}
