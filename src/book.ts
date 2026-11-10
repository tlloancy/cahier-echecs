import { Chess, type Position } from 'chessops/chess'
import { makeFen } from 'chessops/fen'
import { parseSan } from 'chessops/san'
import type { Book } from './types.ts'

export const MAX_PLIES = 24

export async function loadBook(onProgress?: (ratio: number) => void): Promise<Book> {
  const response = await fetch(`${import.meta.env.BASE_URL}openings.json`)
  if (!response.ok || !response.body) throw new Error("Le livre d'ouvertures n'a pas pu être chargé.")
  const total = Number(response.headers.get('content-length')) || 0
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    if (total > 0) onProgress?.(Math.min(0.99, received / total))
  }
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const book = JSON.parse(new TextDecoder().decode(bytes)) as Book
  onProgress?.(1)
  return book
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
