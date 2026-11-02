const regions = new Intl.DisplayNames(['fr'], { type: 'region' })

export function countryName(code: string): string {
  try {
    return regions.of(code) || code
  } catch {
    return code
  }
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
