import { Chess, type Position } from 'chessops/chess'
import { makeFen } from 'chessops/fen'
import { parseSan } from 'chessops/san'
import type { Book } from './types.ts'

export const MAX_PLIES = 24

export async function loadBook(): Promise<Book> {
  const response = await fetch(`${import.meta.env.BASE_URL}openings.json`)
  if (!response.ok) throw new Error("Le livre d'ouvertures n'a pas pu être chargé.")
  return (await response.json()) as Book
}

export function epd(pos: Position): string {
  return makeFen(pos.toSetup(), { epd: true })
}

export function nameAlong(sans: string[], book: Book): string {
  const pos = Chess.default()
  let name = ''
  for (const san of sans) {
    const move = parseSan(pos, san)
    if (!move) break
    pos.play(move)
    const hit = book[epd(pos)]
    if (hit) name = hit.name
  }
  return name
}
