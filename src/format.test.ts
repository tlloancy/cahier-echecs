import { describe, expect, it } from 'vitest'
import { ago, esc, formatLine, lossLabel, num, pawns } from './format.ts'

describe('formats', () => {
  it('échappe le HTML', () => {
    expect(esc('<img src=x onerror="a">&\'')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;')
  })

  it('numérote les coups', () => {
    expect(formatLine(['e4', 'e5', 'Nf3'])).toBe('1. e4 e5 2. Nf3')
    expect(formatLine([])).toBe('')
  })

  it('exprime les pertes en pions', () => {
    expect(pawns(320)).toBe('3,2')
    expect(lossLabel(320, 1000)).toBe('−3,2 pions')
    expect(lossLabel(150, 1000)).toBe('−1,5 pion')
    expect(lossLabel(1000, 1000)).toBe('mat ou presque')
  })

  it('met les nombres à la française', () => {
    expect(num(1234).replace(/\s/g, ' ')).toBe('1 234')
  })

  it('dit depuis quand', () => {
    const now = Date.UTC(2026, 10, 9, 12)
    expect(ago(now - 20_000, now)).toBe('à l’instant')
    expect(ago(now - 5 * 60_000, now)).toBe('il y a 5 min')
    expect(ago(now - 3 * 3_600_000, now)).toBe('il y a 3 h')
    expect(ago(now - 2 * 86_400_000, now)).toBe('il y a 2 jours')
    expect(ago(0, now)).toBe('')
  })
})
