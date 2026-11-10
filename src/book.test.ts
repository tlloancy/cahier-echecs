import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadBook } from './book.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadBook', () => {
  it('avance selon les octets reçus', async () => {
    const body = JSON.stringify({ abc: { eco: 'C20', name: 'King' } })
    const bytes = new TextEncoder().encode(body)
    const half = Math.ceil(bytes.length / 2)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, half))
        controller.enqueue(bytes.slice(half))
        controller.close()
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(stream, { headers: { 'content-length': String(bytes.length) } })),
    )
    const seen: number[] = []
    const book = await loadBook((ratio) => seen.push(ratio))
    expect(book.abc?.name).toBe('King')
    expect(seen[0]).toBeGreaterThan(0)
    expect(seen[0]).toBeLessThan(1)
    expect(seen.at(-1)).toBe(1)
  })
})
