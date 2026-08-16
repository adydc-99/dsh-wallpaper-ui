// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultState, type WallpaperState } from '../src/contracts.ts'
import { WallpaperClientController } from '../src/client/controller.ts'
import { WallpaperSettings } from '../src/client/WallpaperSettings.tsx'
import { installWallpaperStyles } from '../src/client/styles.ts'

class QuietEventSource {
  onmessage = null
  onerror = null
  close = vi.fn()
}

async function readyController(): Promise<WallpaperClientController> {
  const state: WallpaperState = {
    ...createDefaultState(),
    wallpapers: [
      { id: 'image', name: '山景', source: 'url', url: 'https://example.test/a.webp', mediaType: 'image/webp', createdAt: '2026-08-16T00:00:00.000Z' },
      { id: 'video', name: '海浪', source: 'url', url: 'https://example.test/a.mp4', mediaType: 'video/mp4', createdAt: '2026-08-16T00:00:00.000Z' },
    ],
    presentation: { ...createDefaultState().presentation, selectedId: 'image', enabled: true },
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
    const controller = await readyController()
    const markup = renderToStaticMarkup(createElement(WallpaperSettings, { controller, close: vi.fn() }))
    for (const text of ['上传本地文件', '添加网络 URL', '山景', '海浪', '删除', '覆盖', '包含', '拉伸', '居中', '平铺', '背景透明度', '亮度', '模糊度', '遮罩颜色', '面板透明度', '视频静音', '播放速度']) {
      expect(markup).toContain(text)
    }
    for (const extension of ['.jpg', '.png', '.webp', '.gif', '.mp4', '.webm']) expect(markup).toContain(extension)
    controller.dispose()
  })

  it('owns and removes one stylesheet without leaking on uninstall', () => {
    const dispose = installWallpaperStyles(document)
    expect(document.querySelectorAll('style[data-dsh-wallpaper-styles]')).toHaveLength(1)
    dispose()
    expect(document.querySelector('style[data-dsh-wallpaper-styles]')).toBeNull()
  })
})
