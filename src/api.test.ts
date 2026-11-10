import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundError, pause, readJson } from './api.ts'

function reply(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function settle<T>(promise: Promise<T>): Promise<T> {
  const guarded = promise.then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, e }),
  )
  await vi.runAllTimersAsync()
  const result = await guarded
  if (!result.ok) throw result.e
  return result.v
}

describe('lecture de l’API Chess.com', () => {
  const signal = () => new AbortController().signal

  it('réessaie après une erreur serveur passagère (5xx)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(503)).mockResolvedValueOnce(reply(502)).mockResolvedValueOnce(reply(200, { ok: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(settle(readJson('https://x/y', signal()))).resolves.toEqual({ ok: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('réessaie après une coupure réseau (TypeError de fetch)', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(reply(200, { ok: 2 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(settle(readJson('https://x/y', signal()))).resolves.toEqual({ ok: 2 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('respecte Retry-After sur un 429', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(429, {}, { 'retry-after': '7' })).mockResolvedValueOnce(reply(200, { ok: 3 }))
    vi.stubGlobal('fetch', fetchMock)
    const promise = readJson('https://x/y', signal())
    await vi.advanceTimersByTimeAsync(6000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1500)
    await expect(promise).resolves.toEqual({ ok: 3 })
  })

  it('abandonne avec un message clair quand la panne dure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(503)))
    await expect(settle(readJson('https://x/y', signal()))).rejects.toThrow('souci passager (503)')
  })

  it('distingue « n’existe pas » (404) d’une panne', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(404))
    vi.stubGlobal('fetch', fetchMock)
    await expect(settle(readJson('https://x/y', signal()))).rejects.toBeInstanceOf(NotFoundError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ne réessaie pas une erreur client (400)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(400))
    vi.stubGlobal('fetch', fetchMock)
    await expect(settle(readJson('https://x/y', signal()))).rejects.toThrow('400')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('un arrêt demandé par l’utilisateur n’est jamais réessayé', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockImplementation(() => {
      controller.abort()
      return Promise.reject(new DOMException('Arrêté', 'AbortError'))
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(settle(readJson('https://x/y', controller.signal))).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('une pause se laisse interrompre', async () => {
    const controller = new AbortController()
    const waiting = pause(60000, controller.signal)
    const guarded = waiting.then(
      () => 'fini',
      (e: DOMException) => e.name,
    )
    controller.abort()
    await expect(guarded).resolves.toBe('AbortError')
  })
})
