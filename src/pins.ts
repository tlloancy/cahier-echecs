/** Export / import des lignes épinglées : la seule donnée de l'app qu'on ne peut pas retélécharger. */

export const PINS_FILE_APP = 'cahier-echecs'
const MAX_LINES_PER_USER = 500
const MAX_LINE_LENGTH = 400
const SAN_LINE = /^[A-Za-z0-9+#=\-O ]+$/

export interface PinsFile {
  app: string
  version: 1
  exportedAt: string
  users: Record<string, string[]>
}

export function buildPinsFile(users: Record<string, string[]>, now = new Date()): PinsFile {
  return { app: PINS_FILE_APP, version: 1, exportedAt: now.toISOString(), users }
}

function cleanLines(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const lines: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const line = item.trim().replace(/\s+/g, ' ')
    if (!line || line.length > MAX_LINE_LENGTH || !SAN_LINE.test(line)) continue
    if (!lines.includes(line)) lines.push(line)
    if (lines.length >= MAX_LINES_PER_USER) break
  }
  return lines
}

/** Lit un fichier d'export. Renvoie null s'il ne ressemble pas à un export de l'app. */
export function parsePinsFile(text: string): Record<string, string[]> | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const file = data as Partial<PinsFile>
  if (file.app !== PINS_FILE_APP || !file.users || typeof file.users !== 'object') return null
  const users: Record<string, string[]> = {}
  for (const [user, lines] of Object.entries(file.users)) {
    const name = user.trim().toLowerCase()
    if (!/^[a-z0-9_-]{1,50}$/.test(name)) continue
    const cleaned = cleanLines(lines)
    if (cleaned.length) users[name] = cleaned
  }
  return users
}

/** Fusionne des lignes importées dans celles déjà épinglées (sans doublon, les anciennes d'abord). */
export function mergePins(current: string[], imported: string[]): string[] {
  const merged = [...current]
  for (const line of imported) if (!merged.includes(line)) merged.push(line)
  return merged.slice(0, MAX_LINES_PER_USER)
}
