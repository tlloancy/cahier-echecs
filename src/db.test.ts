import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mergeUser,
  readAllPins,
  readCountries,
  readUser,
  requestDurableStorage,
  resetForTests,
  unsaved,
  writeCountry,
  writePins,
  writeUser,
} from './db.ts'
import { game } from './fixtures.ts'

beforeEach(() => {
  vi.unstubAllGlobals()
  ;(globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  resetForTests()
})

describe('stockage local (IndexedDB)', () => {
  it('enregistre et relit un joueur, avec la date de mise à jour', async () => {
    await writeUser('me', [game({ id: 'a' }), game({ id: 'b' })], 'Me', ['e4 e5'])
    const saved = await readUser('me')
    expect(saved?.games.map((g) => g.id).sort()).toEqual(['a', 'b'])
    expect(saved?.pins).toEqual(['e4 e5'])
    expect(saved?.display).toBe('Me')
    expect(saved?.at).toBeGreaterThan(0)
    expect(unsaved()).toBe(false)
  })

  it('fusionne mois par mois sans doublon (reprise après interruption)', async () => {
    await mergeUser('me', [game({ id: 'a' })], 'Me', 1)
    await mergeUser('me', [game({ id: 'a' }), game({ id: 'b' })], 'Me', 2)
    const saved = await readUser('me')
    expect(saved?.games).toHaveLength(2)
  })

  it('ne mélange pas les joueurs', async () => {
    await mergeUser('me', [game({ id: 'a', user: 'me' })], 'Me', 1)
    await mergeUser('you', [game({ id: 'c', user: 'you' })], 'You', 1)
    expect((await readUser('me'))?.games.map((g) => g.id)).toEqual(['a'])
    expect(await readUser('nobody')).toBeNull()
  })

  it('remplace entièrement les parties d’un joueur en gardant les autres', async () => {
    await writeUser('me', [game({ id: 'a' })], 'Me', [])
    await writeUser('you', [game({ id: 'z', user: 'you' })], 'You', [])
    await writeUser('me', [game({ id: 'b' })], 'Me', [])
    expect((await readUser('me'))?.games.map((g) => g.id)).toEqual(['b'])
    expect((await readUser('you'))?.games).toHaveLength(1)
  })

  it('exporte les épingles de tous les joueurs', async () => {
    await writePins('me', ['e4 e5'])
    await writePins('you', ['d4 d5', 'c4 e5'])
    await writePins('empty', [])
    expect(await readAllPins()).toEqual({ me: ['e4 e5'], you: ['d4 d5', 'c4 e5'] })
  })

  it('retient les pays, y compris « inconnu »', async () => {
    await writeCountry('Alice', 'FR')
    await writeCountry('Bob', '-')
    expect(await readCountries(['alice', 'bob', 'carol'])).toEqual({ alice: 'FR', bob: '-' })
  })
})

describe('sans IndexedDB (navigation privée, stockage bloqué)', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { indexedDB: unknown }).indexedDB = undefined
    resetForTests()
  })

  it('bascule en mémoire sans perdre la session et le signale', async () => {
    await mergeUser('me', [game({ id: 'a' })], 'Me', 1)
    await writePins('me', ['e4 e5'])
    expect(unsaved()).toBe(true)
    const saved = await readUser('me')
    expect(saved?.games).toHaveLength(1)
    expect(saved?.pins).toEqual(['e4 e5'])
    expect(await readAllPins()).toEqual({ me: ['e4 e5'] })
  })
})

describe('stockage durable', () => {
  it('demande au navigateur de ne pas effacer les données', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('navigator', { storage: { persist, persisted: vi.fn().mockResolvedValue(false) } })
    await expect(requestDurableStorage()).resolves.toBe(true)
    expect(persist).toHaveBeenCalled()
  })

  it('ne redemande pas quand c’est déjà accordé', async () => {
    const persist = vi.fn()
    vi.stubGlobal('navigator', { storage: { persist, persisted: vi.fn().mockResolvedValue(true) } })
    await expect(requestDurableStorage()).resolves.toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('répond « non » quand le navigateur ne sait pas faire', async () => {
    vi.stubGlobal('navigator', {})
    await expect(requestDurableStorage()).resolves.toBe(false)
  })
})
