import type { Book, LightGame } from './types.ts'
import { toLight, type ApiGame } from './lighten.ts'

let book: Book = {}
const BATCH = 200

interface BookMessage {
  type: 'book'
  book: Book
}

interface MonthMessage {
  type: 'month'
  id: number
  user: string
  games: ApiGame[]
  start: number
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<BookMessage | MonthMessage>) => void) | null
  postMessage: (data: unknown) => void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (event) => {
  const message = event.data
  if (message.type === 'book') {
    book = message.book
    return
  }
  const games: LightGame[] = []
  let index = message.start
  for (const raw of message.games) {
    index += 1
    const light = toLight(raw, message.user, book, index)
    if (!light) continue
    games.push(light)
    if (games.length >= BATCH) {
      scope.postMessage({ id: message.id, games: games.slice(), done: false })
      games.length = 0
    }
  }
  scope.postMessage({ id: message.id, games: games.slice(), done: true })
}
