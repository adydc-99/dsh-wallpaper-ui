// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultState, type WallpaperState } from '../src/contracts.ts'
import { WallpaperClientController } from '../src/client/controller.ts'
import { WallpaperSettings } from '../src/client/WallpaperSettings.tsx'
import { installWallpaperStyles } from '../src/client/styles.ts'

class QuietEventSource {
  onmessage = null
  onerror = null
  close = vi.fn()
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function readyController(selectedId: 'image' | 'video' = 'image'): Promise<WallpaperClientController> {
  const state: WallpaperState = {
    ...createDefaultState(),
    wallpapers: [
      { id: 'image', name: '山景', source: 'url', url: 'https://example.test/a.webp', mediaType: 'image/webp', createdAt: '2026-08-16T00:00:00.000Z' },
      { id: 'video', name: '海浪', source: 'url', url: 'https://example.test/a.mp4', mediaType: 'video/mp4', createdAt: '2026-08-16T00:00:00.000Z' },
    ],
    presentation: { ...createDefaultState().presentation, selectedId, enabled: true },
  }
  const controller = new WallpaperClientController({
    fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify(state), { status: 200 })),
    eventSource: () => new QuietEventSource() as unknown as EventSource,
  })
  await controller.start()
  return controller
}

describe('WallpaperSettings', () => {
  it('renders the manual-only library actions, six formats, five fit modes, and all v1 controls', async () => {
    const controller = await readyController('video')
    const markup = renderToStaticMarkup(createElement(WallpaperSettings, { controller, close: vi.fn() }))
    for (const text of ['上传本地文件', '添加网络 URL', '山景', '海浪', '删除', '覆盖', '包含', '拉伸', '居中', '平铺', '背景透明度', '亮度', '模糊度', '遮罩颜色', '面板透明度', '视频静音', '播放速度']) {
      expect(markup).toContain(text)
    }
    expect(markup).toContain('远程站点可能看到你的 IP 地址与浏览器信息')
    expect(markup).toContain('aria-label="删除 山景"')
    expect(markup).toContain('aria-label="正在使用 海浪"')
    for (const extension of ['.jpg', '.png', '.webp', '.gif', '.mp4', '.webm']) expect(markup).toContain(extension)
    controller.dispose()
  })

  it('hides video-only controls when the selected wallpaper is an image', async () => {
    const controller = await readyController('image')
    const markup = renderToStaticMarkup(createElement(WallpaperSettings, { controller, close: vi.fn() }))
    expect(markup).not.toContain('视频静音')
    expect(markup).not.toContain('播放速度')
    controller.dispose()
  })

  it('does not animate GIF previews when reduced motion is requested', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const controller = await readyController('image')
    const state = controller.getSnapshot().state!
    state.wallpapers[0] = { ...state.wallpapers[0]!, mediaType: 'image/gif', url: 'https://example.test/animated.gif' }
    const markup = renderToStaticMarkup(createElement(WallpaperSettings, { controller, close: vi.fn() }))
    expect(markup).toContain('data-reduced-motion-fallback="true"')
    expect(markup).not.toContain('<img class="dsh-wallpaper-preview" src="https://example.test/animated.gif"')
    controller.dispose()
  })

  it('owns and removes one stylesheet without leaking on uninstall', () => {
    const dispose = installWallpaperStyles(document)
    expect(document.querySelectorAll('style[data-dsh-wallpaper-styles]')).toHaveLength(1)
    dispose()
    expect(document.querySelector('style[data-dsh-wallpaper-styles]')).toBeNull()
  })

  it('supports keyboard upload, URL submit, activation, deletion, and range changes', async () => {
    const state: WallpaperState = {
      ...createDefaultState(),
      wallpapers: [
        { id: 'image', name: '山景', source: 'url', url: 'https://example.test/a.webp', mediaType: 'image/webp', createdAt: '2026-08-16T00:00:00.000Z' },
        { id: 'video', name: '海浪', source: 'url', url: 'https://example.test/a.mp4', mediaType: 'video/mp4', createdAt: '2026-08-16T00:00:00.000Z' },
      ],
      presentation: { ...createDefaultState().presentation, selectedId: 'image', enabled: true },
    }
    const calls: Array<{ url: string; method: string }> = []
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET' })
      return new Response(JSON.stringify(state), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const controller = new WallpaperClientController({ fetcher, eventSource: () => new QuietEventSource() as unknown as EventSource })
    await controller.start()
    const user = userEvent.setup()
    const view = render(createElement(WallpaperSettings, { controller, close: vi.fn() }))

    const choose = screen.getByRole('button', { name: '选择文件' })
    choose.focus()
    expect(document.activeElement).toBe(choose)
    const fileInput = view.container.querySelector<HTMLInputElement>('input[type="file"]')!
    await user.upload(fileInput, new File(['png'], 'wall.png', { type: 'image/png' }))
    await waitFor(() => { expect(calls).toContainEqual({ url: '/dsh-wallpaper/api/uploads', method: 'POST' }) })

    await user.type(screen.getByRole('textbox', { name: '名称（可选）' }), '远程图')
    await user.type(screen.getByRole('textbox', { name: 'HTTP(S) 地址' }), 'https://example.test/new.webp')
    await user.selectOptions(screen.getByRole('combobox', { name: '格式' }), 'image/webp')
    await user.click(screen.getByRole('button', { name: '添加' }))
    await waitFor(() => { expect(calls).toContainEqual({ url: '/dsh-wallpaper/api/urls', method: 'POST' }) })

    await user.click(screen.getByRole('button', { name: '启用 海浪' }))
    await waitFor(() => { expect(calls).toContainEqual({ url: '/dsh-wallpaper/api/wallpapers/video/activate', method: 'POST' }) })
    vi.stubGlobal('confirm', vi.fn(() => true))
    await user.click(screen.getByRole('button', { name: '删除 山景' }))
    await waitFor(() => { expect(calls).toContainEqual({ url: '/dsh-wallpaper/api/wallpapers/image', method: 'DELETE' }) })

    fireEvent.change(screen.getByRole('slider', { name: /背景透明度/ }), { target: { value: '0.5' } })
    await waitFor(() => { expect(calls).toContainEqual({ url: '/dsh-wallpaper/api/presentation', method: 'PATCH' }) })
    controller.dispose()
  })
})
