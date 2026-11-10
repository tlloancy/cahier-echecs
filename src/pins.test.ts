import { describe, expect, it } from 'vitest'
import { buildPinsFile, mergePins, parsePinsFile } from './pins.ts'

describe('export / import des lignes épinglées', () => {
  it('relit ce qu’il a exporté', () => {
    const file = buildPinsFile({ moi: ['e4 e5 Nf3', 'd4 d5 c4'] }, new Date('2026-01-01T00:00:00Z'))
    expect(parsePinsFile(JSON.stringify(file))).toEqual({ moi: ['e4 e5 Nf3', 'd4 d5 c4'] })
    expect(file.exportedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('refuse ce qui n’est pas un export du cahier', () => {
    expect(parsePinsFile('pas du json')).toBeNull()
    expect(parsePinsFile('{"hello":1}')).toBeNull()
    expect(parsePinsFile('{"app":"autre","users":{}}')).toBeNull()
    expect(parsePinsFile('null')).toBeNull()
  })

  it('écarte les lignes et les pseudos suspects', () => {
    const text = JSON.stringify({
      app: 'cahier-echecs',
      version: 1,
      users: {
        Moi: ['e4 e5', '<script>alert(1)</script>', 'x'.repeat(500), 42, 'e4   e5', ''],
        'pas/valide': ['e4'],
        '': ['e4'],
      },
    })
    expect(parsePinsFile(text)).toEqual({ moi: ['e4 e5'] })
  })

  it('fusionne sans doublon et garde l’ordre existant', () => {
    expect(mergePins(['e4', 'd4'], ['d4', 'c4'])).toEqual(['e4', 'd4', 'c4'])
  })

  it('limite le nombre de lignes', () => {
    const many = Array.from({ length: 700 }, (_, i) => `e4 ${'a'.repeat(1)} ${i}`.replace(/ /g, ' '))
    expect(mergePins([], many).length).toBe(500)
  })
})
