// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createDefaultState } from '../src/contracts.ts'
import { inject, startWallpaperClient } from '../src/client/index.ts'

class FakeEventSource {
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror = null
  close = vi.fn()
}

describe('client plugin lifecycle', () => {
  it('registers the settings page and overlay additively, updates panel tokens, and uninstalls cleanly', async () => {
    document.body.innerHTML = '<div id="root" style="position:absolute;z-index:9"></div>'
    const registrations: Array<{ name: string; id?: string; label?: string }> = []
    const stream = new FakeEventSource()
    const themeDisposers: Array<ReturnType<typeof vi.fn>> = []
    const dispose = await startWallpaperClient({
      document,
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify(createDefaultState()), { status: 200 })),
      eventSource: () => stream as unknown as EventSource,
      slots: {
        inject(_key, callback) { return callback() },
        register(options) {
          const row = { name: options.name, ...(options.id === undefined ? {} : { id: options.id }), ...(typeof options.label === 'string' ? { label: options.label } : {}) }
          registrations.push(row)
          return () => { registrations.splice(registrations.indexOf(row), 1) }
        },
      },
      theme: {
        overrideTokens(_source, _tokens) {
          const fn = vi.fn()
          themeDisposers.push(fn)
          return fn
        },
      },
    })

    expect(inject).toEqual(['slots', 'theme'])
    expect(registrations).toEqual([
      { name: 'settings.section', id: 'wallpaper', label: '壁纸' },
      { name: 'shell.overlay', id: 'dsh-wallpaper-renderer' },
    ])
    expect(document.querySelector('[data-dsh-wallpaper-layer]')).not.toBeNull()
    expect(document.querySelector('[data-dsh-wallpaper-styles]')).not.toBeNull()

    stream.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ ...createDefaultState(), revision: 1, presentation: { ...createDefaultState().presentation, panelOpacity: 0.4 } }) }))
    expect(themeDisposers.length).toBeGreaterThanOrEqual(2)

    await dispose()
    expect(registrations).toEqual([])
    expect(document.querySelector('[data-dsh-wallpaper-layer]')).toBeNull()
    expect(document.querySelector('[data-dsh-wallpaper-styles]')).toBeNull()
    expect(document.querySelector<HTMLElement>('#root')!.style.position).toBe('absolute')
    expect(stream.close).toHaveBeenCalledOnce()
    expect(themeDisposers.at(-1)).toHaveBeenCalledOnce()
  })

  it('rolls back document, theme, and the first slot if the second registration fails', async () => {
    document.body.innerHTML = '<div id="root" style="position:absolute"></div>'
    const settingsDispose = vi.fn()
    const themeDispose = vi.fn()
    await expect(startWallpaperClient({
      document,
      fetcher: vi.fn(),
      eventSource: () => new FakeEventSource() as unknown as EventSource,
      slots: {
        inject(key, callback) {
          if (key === 'shell.overlay') throw new Error('overlay collision')
          callback()
          return settingsDispose
        },
        register() { return vi.fn() },
      },
      theme: { overrideTokens() { return themeDispose } },
    })).rejects.toThrow('overlay collision')
    expect(settingsDispose).toHaveBeenCalledOnce()
    expect(themeDispose).toHaveBeenCalledOnce()
    expect(document.querySelector('[data-dsh-wallpaper-layer]')).toBeNull()
    expect(document.querySelector('[data-dsh-wallpaper-styles]')).toBeNull()
    expect(document.querySelector<HTMLElement>('#root')!.style.position).toBe('absolute')
  })
})
