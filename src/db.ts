import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { LightGame } from './types.ts'

interface CahierDB extends DBSchema {
  games: {
    key: string
    value: LightGame
    indexes: { byUser: string }
  }
  meta: {
    key: string
    value: { at: number; count: number; display: string }
  }
  pins: {
    key: string
    value: string[]
  }
  countries: {
    key: string
    value: string
  }
}

let database: Promise<IDBPDatabase<CahierDB>> | null = null
let blockedHandler: (() => void) | null = null
let memoryOnly = false

const memory = {
  games: new Map<string, LightGame>(),
  meta: new Map<string, { at: number; count: number; display: string }>(),
  pins: new Map<string, string[]>(),
  countries: new Map<string, string>(),
}

export function unsaved(): boolean {
  return memoryOnly
}

function keepInMemory(): void {
  memoryOnly = true
  database = null
}

export function onDatabaseBlocked(handler: () => void): void {
  blockedHandler = handler
}

function db(): Promise<IDBPDatabase<CahierDB>> {
  if (memoryOnly) return Promise.reject(new Error('Mode sans sauvegarde'))
  if (!database) {
    database = openDB<CahierDB>('cahier-echecs', 2, {
      upgrade(store, oldVersion) {
        if (oldVersion < 1) {
          const games = store.createObjectStore('games', { keyPath: 'id' })
          games.createIndex('byUser', 'user')
          store.createObjectStore('meta')
          store.createObjectStore('pins')
        }
        if (oldVersion < 2) store.createObjectStore('countries')
      },
      blocked() {
        blockedHandler?.()
      },
      blocking(_oldVersion, _newVersion, event) {
        const connection = event.target
        if (connection instanceof IDBDatabase) connection.close()
        database = null
      },
    }).catch((error: unknown) => {
      keepInMemory()
      throw error
    })
  }
  return database
}

export interface StoredUser {
  games: LightGame[]
  pins: string[]
  display: string
  /** Dernière mise à jour (ms), 0 si inconnue. */
  at: number
}

function readMemory(user: string): StoredUser | null {
  const games = [...memory.games.values()].filter((game) => game.user === user)
  if (games.length === 0) return null
  return {
    games,
    pins: memory.pins.get(user) || [],
    display: memory.meta.get(user)?.display || games[0].display || user,
    at: memory.meta.get(user)?.at || 0,
  }
}

export async function readUser(user: string, onProgress?: (ratio: number) => void): Promise<StoredUser | null> {
  if (memoryOnly) {
    const saved = readMemory(user)
    if (saved) onProgress?.(1)
    return saved
  }
  try {
    const database = await db()
    if (!onProgress) {
      const games = await database.getAllFromIndex('games', 'byUser', user)
      if (games.length === 0) return null
      const meta = await database.get('meta', user)
      const pins = (await database.get('pins', user)) || []
      return { games, pins, display: meta?.display || games[0].display || user, at: meta?.at || 0 }
    }
    const meta = await database.get('meta', user)
    const pins = (await database.get('pins', user)) || []
    const ids: string[] = []
    let keyCursor = await database.transaction('games').store.index('byUser').openKeyCursor(user)
    while (keyCursor) {
      ids.push(String(keyCursor.primaryKey))
      keyCursor = await keyCursor.continue()
    }
    if (ids.length === 0) return null
    const games: LightGame[] = []
    const batch = 400
    for (let start = 0; start < ids.length; start += batch) {
      const slice = ids.slice(start, start + batch)
      const store = database.transaction('games').store
      const rows = await Promise.all(slice.map((id) => store.get(id)))
      for (const row of rows) if (row) games.push(row)
      onProgress(games.length / ids.length)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    return { games, pins, display: meta?.display || games[0].display || user, at: meta?.at || 0 }
  } catch {
    keepInMemory()
    return readMemory(user)
  }
}

export async function writeUser(user: string, games: LightGame[], display: string, pins: string[]): Promise<void> {
  if (memoryOnly) {
    for (const game of [...memory.games.values()]) if (game.user === user) memory.games.delete(game.id)
    for (const game of games) memory.games.set(game.id, game)
    memory.meta.set(user, { at: Date.now(), count: games.length, display })
    memory.pins.set(user, pins)
    return
  }
  try {
    const database = await db()
    const tx = database.transaction('games', 'readwrite')
    let cursor = await tx.store.index('byUser').openCursor(user)
    while (cursor) {
      cursor.delete()
      cursor = await cursor.continue()
    }
    for (const game of games) tx.store.put(game)
    await tx.done
    await database.put('meta', { at: Date.now(), count: games.length, display }, user)
    await database.put('pins', pins, user)
  } catch {
    keepInMemory()
    await writeUser(user, games, display, pins)
  }
}

export async function mergeUser(user: string, games: LightGame[], display: string, count: number): Promise<void> {
  if (memoryOnly) {
    for (const game of games) memory.games.set(game.id, game)
    memory.meta.set(user, { at: Date.now(), count, display })
    return
  }
  try {
    const database = await db()
    if (games.length) {
      const tx = database.transaction('games', 'readwrite')
      for (const game of games) tx.store.put(game)
      await tx.done
    }
    await database.put('meta', { at: Date.now(), count, display }, user)
  } catch {
    keepInMemory()
    await mergeUser(user, games, display, count)
  }
}

export async function writeGame(game: LightGame): Promise<void> {
  if (memoryOnly) {
    memory.games.set(game.id, game)
    return
  }
  try {
    const database = await db()
    await database.put('games', game)
  } catch {
    keepInMemory()
    memory.games.set(game.id, game)
  }
}

export async function writeGames(games: LightGame[]): Promise<void> {
  if (!games.length) return
  if (memoryOnly) {
    for (const game of games) memory.games.set(game.id, game)
    return
  }
  try {
    const database = await db()
    const tx = database.transaction('games', 'readwrite')
    for (const game of games) tx.store.put(game)
    await tx.done
  } catch {
    keepInMemory()
    for (const game of games) memory.games.set(game.id, game)
  }
}

export async function writePins(user: string, pins: string[]): Promise<void> {
  if (memoryOnly) {
    memory.pins.set(user, pins)
    return
  }
  try {
    const database = await db()
    await database.put('pins', pins, user)
  } catch {
    keepInMemory()
    memory.pins.set(user, pins)
  }
}

export async function readCountries(names: string[], onProgress?: (ratio: number) => void): Promise<Record<string, string>> {
  if (memoryOnly) {
    const found: Record<string, string> = {}
    for (const name of names) {
      const key = name.toLowerCase()
      const code = memory.countries.get(key)
      if (code) found[key] = code
    }
    return found
  }
  try {
    const database = await db()
    const found: Record<string, string> = {}
    const tx = database.transaction('countries')
    let shown = -1
    for (let index = 0; index < names.length; index += 1) {
      const key = names[index].toLowerCase()
      const code = await tx.store.get(key)
      if (code) found[key] = code
      if (onProgress && names.length) {
        const pct = Math.round(((index + 1) / names.length) * 100)
        if (pct !== shown) {
          shown = pct
          onProgress((index + 1) / names.length)
        }
      }
    }
    await tx.done
    return found
  } catch {
    keepInMemory()
    return readCountries(names)
  }
}

export async function writeCountry(name: string, code: string): Promise<void> {
  const key = name.toLowerCase()
  if (memoryOnly) {
    memory.countries.set(key, code)
    return
  }
  try {
    const database = await db()
    await database.put('countries', code, key)
  } catch {
    keepInMemory()
    memory.countries.set(key, code)
  }
}

/** Toutes les lignes épinglées, tous joueurs confondus (pour l'export). */
export async function readAllPins(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {}
  if (memoryOnly) {
    for (const [user, pins] of memory.pins) if (pins.length) out[user] = pins
    return out
  }
  try {
    const database = await db()
    const keys = await database.getAllKeys('pins')
    for (const key of keys) {
      const pins = await database.get('pins', key)
      if (pins && pins.length) out[String(key)] = pins
    }
    return out
  } catch {
    keepInMemory()
    return readAllPins()
  }
}

/**
 * Demande au navigateur de ne pas effacer les données du site quand il manque de place
 * (Safari les supprime après 7 jours sans visite si on ne le demande pas).
 * Renvoie true si le stockage est durable.
 */
export async function requestDurableStorage(): Promise<boolean> {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
    if (!storage?.persist) return false
    if (storage.persisted && (await storage.persisted())) return true
    return await storage.persist()
  } catch {
    return false
  }
}

/** Remet le module à zéro (tests uniquement). */
export function resetForTests(): void {
  memoryOnly = false
  database = null
  memory.games.clear()
  memory.meta.clear()
  memory.pins.clear()
  memory.countries.clear()
}
