// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createDefaultState } from '../src/contracts.ts'
import { WallpaperClientController } from '../src/client/controller.ts'

class FakeEventSource {
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()
}

describe('WallpaperClientController', () => {
  it('loads once, accepts SSE updates, and closes the stream', async () => {
    const stream = new FakeEventSource()
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(createDefaultState()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const controller = new WallpaperClientController({ fetcher, eventSource: () => stream as unknown as EventSource })
    const changed = vi.fn()
    controller.subscribe(changed)

    await controller.start()
    expect(controller.getSnapshot()).toMatchObject({ status: 'ready', state: { revision: 0 } })
    const pushed = { ...createDefaultState(), revision: 1, presentation: { ...createDefaultState().presentation, opacity: 0.4 } }
    stream.onmessage?.(new MessageEvent('message', { data: JSON.stringify(pushed) }))
    expect(controller.getSnapshot()).toMatchObject({ state: { revision: 1, presentation: { opacity: 0.4 } } })

    controller.dispose()
    expect(stream.close).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenCalled()
  })

  it('uses only the manual mutation endpoints and resets after video failure', async () => {
    const calls: Array<{ url: string; method: string }> = []
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET' })
      return new Response(JSON.stringify(createDefaultState()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const controller = new WallpaperClientController({ fetcher, eventSource: () => new FakeEventSource() as unknown as EventSource })
    await controller.addUrl({ name: '远程', url: 'https://example.test/a.webp', mediaType: 'image/webp' })
    await controller.activate('wall-1')
    await controller.update({ opacity: 0.5 })
    await controller.remove('wall-1')
    await controller.handleMediaError('video/mp4')

    expect(calls).toEqual([
      { url: '/dsh-wallpaper/api/urls', method: 'POST' },
      { url: '/dsh-wallpaper/api/wallpapers/wall-1/activate', method: 'POST' },
      { url: '/dsh-wallpaper/api/presentation', method: 'PATCH' },
      { url: '/dsh-wallpaper/api/wallpapers/wall-1', method: 'DELETE' },
      { url: '/dsh-wallpaper/api/reset', method: 'POST' },
    ])
  })

  it('reports a failed request without discarding the last good state', async () => {
    const state = createDefaultState()
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(state), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'bad patch' }), { status: 400 }))
    const controller = new WallpaperClientController({ fetcher, eventSource: () => new FakeEventSource() as unknown as EventSource })
    await controller.start()
    await expect(controller.update({ opacity: 2 })).rejects.toThrow('bad patch')
    expect(controller.getSnapshot()).toMatchObject({ status: 'error', error: 'bad patch', state })
  })
})
