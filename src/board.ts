import { Chess } from 'chessops/chess'
import { parseSan } from 'chessops/san'
import { makeSquare, parseSquare } from 'chessops/util'
import type { Role } from 'chessops/types'

const SHAPE: Record<Role, string> = {
  king: '<path d="M22.5 6v5M20 8.5h5"/><path d="M15 34c.8-7 3-13 7.5-15.5C27 21 29.2 27 30 34z"/><rect x="13" y="33.5" width="19" height="3.5" rx="1"/>',
  queen: '<path d="M10 31 14.5 15 19 24 22.5 9 26 24 30.5 15 35 31z"/><rect x="11" y="32.5" width="23" height="3.5" rx="1"/>',
  rook: '<path d="M11 13h5.5v4.5h4V13H25v4.5h4.5V13H34v18H11z"/><rect x="10" y="32.5" width="25" height="3.5" rx="1"/>',
  bishop: '<path d="M22.5 7c4.2 3.6 5.2 8 .4 11.2-4.8-3.2-3.8-7.6-.4-11.2z"/><path d="M15.5 33.5c1.6-8 3.2-12 7-14.2 3.8 2.2 5.4 6.2 7 14.2z"/><rect x="13" y="33.5" width="19" height="3.5" rx="1"/><path d="M22.5 11.5v6"/>',
  knight: '<path d="M22 9.5c7 .8 13 7.5 9 16l2.5 9H13l1.8-7.5C8.5 25 8 16 14.5 13.5 13 10 16.5 8 22 9.5z"/><circle cx="26" cy="15.5" r="1.15"/>',
  pawn: '<circle cx="22.5" cy="14" r="5.6"/><path d="M15.2 34c2-7.5 3.2-10.5 7.3-10.5s5.3 3 7.3 10.5z"/><rect x="13" y="33.2" width="19" height="3.6" rx="1"/>',
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
      const glyph = piece
        ? `<svg class="piece ${piece.color === 'white' ? 'w' : 'b'}" viewBox="0 0 45 45" aria-hidden="true">${SHAPE[piece.role]}</svg>`
        : ''
      squares.push(`<div class="sq ${dark ? 'dark' : 'light'}" data-sq="${square === undefined ? '' : makeSquare(square)}">${glyph}</div>`)
    }
  }
  const fileLabels = files.map((file) => `<span>${file}</span>`).join('')
  const rankLabels = ranks.map((rank) => `<span>${rank}</span>`).join('')
  return `<div class="board-block"><div class="board-row"><div class="ranks">${rankLabels}</div><div class="squares">${squares.join('')}</div></div><div class="files-row"><span></span><div class="files">${fileLabels}</div></div></div>`
}
