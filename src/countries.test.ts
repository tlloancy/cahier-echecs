import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCountry } from './countries.ts'

function reply(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function run<T>(promise: Promise<T>): Promise<T> {
  const guarded = promise.then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, e }),
  )
  await vi.runAllTimersAsync()
  const r = await guarded
  if (!r.ok) throw r.e
  return r.v
}

describe('pays des adversaires', () => {
  const signal = () => new AbortController().signal

  it('lit le code pays', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, { country: 'https://api.chess.com/pub/country/FR' })))
    await expect(run(fetchCountry('abc', signal()))).resolves.toBe('FR')
  })

  it('renvoie « » (définitif) quand Chess.com ne connaît pas de pays', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, {})))
    await expect(run(fetchCountry('abc', signal()))).resolves.toBe('')
  })

  it('renvoie « » (définitif) pour un compte introuvable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(404)))
    await expect(run(fetchCountry('abc', signal()))).resolves.toBe('')
  })

  it('lève une erreur — donc rien à mémoriser — quand Chess.com est en panne passagère', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(503)))
    await expect(run(fetchCountry('abc', signal()))).rejects.toThrow()
  })

  it('lève une erreur quand Chess.com demande une pause trop longue (429)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(429)))
    await expect(run(fetchCountry('abc', signal()))).rejects.toThrow()
  })
})
