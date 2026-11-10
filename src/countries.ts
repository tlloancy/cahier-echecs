import { NotFoundError, readJson, serial } from './api.ts'

const regions = new Intl.DisplayNames(['fr'], { type: 'region' })

const extra: Record<string, string> = {
  XA: 'Îles Canaries',
  XB: 'Pays basque',
  XC: 'Catalogne',
  XE: 'Angleterre',
  XG: 'Galice',
  XO: 'Olympique',
  XP: 'Paralympique',
  XS: 'Écosse',
  XT: 'Taipei chinois',
  XW: 'Pays de Galles',
  XX: 'International',
}

export function countryName(code: string): string {
  const known = extra[code.toUpperCase()]
  if (known) return known
  try {
    return regions.of(code) || code
  } catch {
    return code
  }
}

export function flagSrc(code: string, base: string): string {
  const key = code.toLowerCase()
  if (extra[code.toUpperCase()]) return `${base}flags/${key}.png`
  return `https://flagcdn.com/24x18/${key}.png`
}

/**
 * Pays d'un joueur. Renvoie « » quand Chess.com n'en connaît pas (réponse définitive, à mémoriser)
 * et lève une erreur quand la réponse est passagère (429, 5xx, réseau) : on ne mémorise rien dans ce cas.
 */
export async function fetchCountry(username: string, signal: AbortSignal): Promise<string> {
  return serial(() => readCountry(username, signal))
}

async function readCountry(username: string, signal: AbortSignal): Promise<string> {
  const data = await readJson<{ country?: string }>(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}`,
    signal,
    2,
  ).catch((error: unknown) => {
    if (error instanceof NotFoundError) return null
    throw error
  })
  if (!data) return ''
  const code = (data.country || '').split('/').pop()?.toUpperCase() || ''
  return /^[A-Z]{2}$/.test(code) ? code : ''
}
