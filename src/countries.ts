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

export async function fetchCountry(username: string, signal: AbortSignal): Promise<string | null> {
  let response: Response | null = null
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}`, { signal })
    if (response.status !== 429) break
    const retry = Number(response.headers.get('retry-after'))
    const wait = Number.isFinite(retry) && retry > 0 ? retry : 2 ** attempt
    await new Promise((resolve) => setTimeout(resolve, wait * 1000))
  }
  if (!response || response.status === 404 || !response.ok) return null
  const data = (await response.json()) as { country?: string }
  const code = (data.country || '').split('/').pop()?.toUpperCase() || ''
  return /^[A-Z]{2}$/.test(code) ? code : null
}
