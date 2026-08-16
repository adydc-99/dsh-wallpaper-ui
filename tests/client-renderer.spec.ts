// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'
import { act, createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultState, type WallpaperState } from '../src/contracts.ts'
import {
  WallpaperSurface,
  fitBackgroundStyle,
  installWallpaperDocumentLayer,
  panelThemeTokens,
  wallpaperSource,
} from '../src/client/renderer.tsx'

describe('wallpaper rendering helpers', () => {
  it('resolves remote sources directly and uploaded media through the private route', () => {
    expect(wallpaperSource({ source: 'url', url: 'https://example.test/a.webp' } as never)).toBe('https://example.test/a.webp')
    expect(wallpaperSource({ source: 'upload', id: 'wall / 1' } as never)).toBe('/dsh-wallpaper/media/wall%20%2F%201')
  })

  it('maps all five fit modes without changing the media record', () => {
    expect(fitBackgroundStyle('cover')).toMatchObject({ backgroundSize: 'cover', backgroundRepeat: 'no-repeat' })
    expect(fitBackgroundStyle('contain')).toMatchObject({ backgroundSize: 'contain', backgroundRepeat: 'no-repeat' })
    expect(fitBackgroundStyle('stretch')).toMatchObject({ backgroundSize: '100% 100%' })
    expect(fitBackgroundStyle('center')).toMatchObject({ backgroundSize: 'auto', backgroundPosition: 'center' })
    expect(fitBackgroundStyle('tile')).toMatchObject({ backgroundSize: 'auto', backgroundRepeat: 'repeat' })
  })

  it('mounts below #root, never receives pointer events, and restores document styles', () => {
    document.body.innerHTML = '<main id="root" style="position:absolute;z-index:7"></main>'
    const root = document.querySelector<HTMLElement>('#root')!
    const mounted = installWallpaperDocumentLayer(document)
    expect(document.body.firstElementChild).toBe(mounted.element)
    expect(mounted.element.style.pointerEvents).toBe('none')
    expect(root.style.position).toBe('relative')
    expect(root.style.zIndex).toBe('1')
    mounted.dispose()
    expect(document.querySelector('[data-dsh-wallpaper-layer]')).toBeNull()
    expect(root.style.position).toBe('absolute')
    expect(root.style.zIndex).toBe('7')
  })

  it('renders video settings and calls the safe fallback handler on failure', () => {
    const state: WallpaperState = {
      ...createDefaultState(),
      wallpapers: [{ id: 'vid', name: '视频', source: 'url', url: 'https://example.test/a.mp4', mediaType: 'video/mp4', createdAt: '2026-08-16T00:00:00.000Z' }],
      presentation: { ...createDefaultState().presentation, enabled: true, selectedId: 'vid', muted: false, playbackRate: 1.5 },
    }
    const markup = renderToStaticMarkup(createElement(WallpaperSurface, { state, onMediaError: vi.fn() }))
    expect(markup).toContain('<video')
    expect(markup).toContain('autoplay=""')
    expect(markup).toContain('loop=""')
    expect(markup).toContain('data-playback-rate="1.5"')
  })

  it('switches from GIF image rendering to video and wires video errors to fallback', async () => {
    const base = createDefaultState()
    const gif: WallpaperState = {
      ...base,
      wallpapers: [{ id: 'gif', name: '动画', source: 'url', url: 'https://example.test/a.gif', mediaType: 'image/gif', createdAt: '2026-08-16T00:00:00.000Z' }],
      presentation: { ...base.presentation, enabled: true, selectedId: 'gif' },
    }
    const gifMarkup = renderToStaticMarkup(createElement(WallpaperSurface, { state: gif, onMediaError: vi.fn() }))
    expect(gifMarkup).toContain('<img')
    expect(gifMarkup).toContain('a.gif')

    const video: WallpaperState = {
      ...gif,
      wallpapers: [{ id: 'video', name: '视频', source: 'url', url: 'https://example.test/a.webm', mediaType: 'video/webm', createdAt: '2026-08-16T00:00:00.000Z' }],
      presentation: { ...gif.presentation, selectedId: 'video' },
    }
    const target = document.createElement('div')
    document.body.append(target)
    const onMediaError = vi.fn()
    const root = createRoot(target)
    await act(async () => { root.render(createElement(WallpaperSurface, { state: video, onMediaError })) })
    target.querySelector('video')!.dispatchEvent(new Event('error', { bubbles: true }))
    expect(onMediaError).toHaveBeenCalledWith('video/webm')
    await act(async () => { root.unmount() })
    target.remove()
  })

  it('suppresses animated GIF media when reduced motion is requested', () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    const base = createDefaultState()
    const state: WallpaperState = {
      ...base,
      wallpapers: [{ id: 'gif', name: '动画', source: 'url', url: 'https://example.test/a.gif', mediaType: 'image/gif', createdAt: '2026-08-16T00:00:00.000Z' }],
      presentation: { ...base.presentation, enabled: true, selectedId: 'gif' },
    }
    const markup = renderToStaticMarkup(createElement(WallpaperSurface, { state, onMediaError: vi.fn() }))
    expect(markup).toContain('data-reduced-motion-fallback="true"')
    expect(markup).not.toContain('<img')
    window.matchMedia = original
  })

  it('reacts when reduced-motion preference changes while a GIF is mounted', async () => {
    const original = window.matchMedia
    let changed: ((event: { matches: boolean }) => void) | undefined
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: (_name: string, listener: (event: { matches: boolean }) => void) => { changed = listener },
      removeEventListener: vi.fn(),
    })
    const base = createDefaultState()
    const state: WallpaperState = {
      ...base,
      wallpapers: [{ id: 'gif', name: '动画', source: 'url', url: 'https://example.test/a.gif', mediaType: 'image/gif', createdAt: '2026-08-16T00:00:00.000Z' }],
      presentation: { ...base.presentation, enabled: true, selectedId: 'gif' },
    }
    const target = document.createElement('div')
    const root = createRoot(target)
    await act(async () => { root.render(createElement(WallpaperSurface, { state, onMediaError: vi.fn() })) })
    expect(target.querySelector('img')).not.toBeNull()
    await act(async () => { changed?.({ matches: true }) })
    expect(target.querySelector('[data-reduced-motion-fallback]')).not.toBeNull()
    await act(async () => { root.unmount() })
    window.matchMedia = original
  })

  it('builds light and dark translucent panel tokens from the saved opacity', () => {
    expect(panelThemeTokens(0.42)['--dsw-alias-bg-layer-1']).toEqual({
      light: 'rgba(255, 255, 255, 0.42)',
      dark: 'rgba(22, 22, 24, 0.42)',
    })
  })
})
