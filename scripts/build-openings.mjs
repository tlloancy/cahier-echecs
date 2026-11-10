import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { parsePgn, startingPosition } from 'chessops/pgn'
import { parseSan } from 'chessops/san'
import { makeFen } from 'chessops/fen'

const files = ['a', 'b', 'c', 'd', 'e']
// OPENINGS_DIR : dossier local contenant a.tsv … e.tsv (facultatif, pour travailler hors ligne).
// OPENINGS_REF : révision (commit ou tag) du dépôt lichess-org/chess-openings ; « master » par défaut.
//   Pour un résultat reproductible, fixe un commit : OPENINGS_REF=<sha> npm run openings
const localDir = process.env.OPENINGS_DIR || ''
const ref = process.env.OPENINGS_REF || 'master'

async function source(letter) {
  try {
    if (!localDir) throw new Error('pas de dossier local')
    return await readFile(`${localDir}/${letter}.tsv`, 'utf8')
  } catch {
    const url = `https://raw.githubusercontent.com/lichess-org/chess-openings/${ref}/${letter}.tsv`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Livre d'ouvertures introuvable : ${url}`)
    return await response.text()
  }
}

const book = new Map()

for (const letter of files) {
  const text = await source(letter)
  for (const line of text.split('\n').slice(1)) {
    if (!line.trim()) continue
    const tab1 = line.indexOf('\t')
    const tab2 = line.indexOf('\t', tab1 + 1)
    if (tab1 < 0 || tab2 < 0) continue
    const eco = line.slice(0, tab1)
    const name = line.slice(tab1 + 1, tab2)
    const pgn = line.slice(tab2 + 1).trim()
    const game = parsePgn(pgn)[0]
    if (!game) continue
    const setup = startingPosition(game.headers)
    if (setup.isErr) continue
    const pos = setup.unwrap()
    let plies = 0
    let legal = true
    for (const node of game.moves.mainline()) {
      const move = parseSan(pos, node.san)
      if (!move) {
        legal = false
        break
      }
      pos.play(move)
      plies += 1
    }
    if (!legal || plies === 0) continue
    const epd = makeFen(pos.toSetup(), { epd: true })
    const previous = book.get(epd)
    if (
      !previous ||
      plies > previous.plies ||
      (plies === previous.plies && name.length > previous.name.length)
    ) {
      book.set(epd, { eco, name, plies })
    }
  }
}

const out = {}
for (const [epd, entry] of book) out[epd] = { eco: entry.eco, name: entry.name }
await mkdir('public', { recursive: true })
await writeFile('public/openings.json', JSON.stringify(out))
console.log(`${book.size} positions`)
