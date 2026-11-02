import { Chess } from 'chessops/chess'
import { parseSan } from 'chessops/san'
import { makeSquare, parseSquare } from 'chessops/util'
import type { Role } from 'chessops/types'

const LETTER: Record<Role, string> = {
  king: 'R',
  queen: 'D',
  rook: 'T',
  bishop: 'F',
  knight: 'C',
  pawn: 'P',
}

export function positionAfter(sans: string[]): Chess {
  const pos = Chess.default()
  for (const san of sans) {
    const move = parseSan(pos, san)
    if (!move) break
    pos.play(move)
  }
  return pos
}

export function boardHtml(sans: string[], flip: boolean): string {
  const pos = positionAfter(sans)
  const files = flip ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const ranks = flip ? ['1', '2', '3', '4', '5', '6', '7', '8'] : ['8', '7', '6', '5', '4', '3', '2', '1']
  const squares: string[] = []
  for (const rank of ranks) {
    for (const file of files) {
      const square = parseSquare(file + rank)
      const piece = square === undefined ? undefined : pos.board.get(square)
      const dark = square !== undefined && (square + Math.floor(square / 8)) % 2 === 0
      const glyph = piece ? `<span class="${piece.color === 'white' ? 'w' : 'b'}">${LETTER[piece.role]}</span>` : ''
      squares.push(`<div class="sq ${dark ? 'dark' : 'light'}" data-sq="${square === undefined ? '' : makeSquare(square)}">${glyph}</div>`)
    }
  }
  const fileLabels = files.map((file) => `<span>${file}</span>`).join('')
  const rankLabels = ranks.map((rank) => `<span>${rank}</span>`).join('')
  return `<div class="board-block"><div class="board-row"><div class="ranks">${rankLabels}</div><div class="squares">${squares.join('')}</div></div><div class="files-row"><span></span><div class="files">${fileLabels}</div></div></div>`
}
