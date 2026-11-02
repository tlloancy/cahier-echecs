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
}

let database: Promise<IDBPDatabase<CahierDB>> | null = null

function db(): Promise<IDBPDatabase<CahierDB>> {
  if (!database) {
    database = openDB<CahierDB>('cahier-echecs', 1, {
      upgrade(store) {
        const games = store.createObjectStore('games', { keyPath: 'id' })
        games.createIndex('byUser', 'user')
        store.createObjectStore('meta')
        store.createObjectStore('pins')
      },
    })
  }
  return database
}

export async function readUser(user: string): Promise<{ games: LightGame[]; pins: string[]; display: string } | null> {
  const database = await db()
  const games = await database.getAllFromIndex('games', 'byUser', user)
  if (games.length === 0) return null
  const meta = await database.get('meta', user)
  const pins = (await database.get('pins', user)) || []
  return { games, pins, display: meta?.display || games[0].display || user }
}

export async function writeUser(user: string, games: LightGame[], display: string, pins: string[]): Promise<void> {
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
}

export async function writePins(user: string, pins: string[]): Promise<void> {
  const database = await db()
  await database.put('pins', pins, user)
}
