// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
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

  it('builds light and dark translucent panel tokens from the saved opacity', () => {
    expect(panelThemeTokens(0.42)['--dsw-alias-bg-layer-1']).toEqual({
      light: 'rgba(255, 255, 255, 0.42)',
      dark: 'rgba(22, 22, 24, 0.42)',
    })
  })
})
