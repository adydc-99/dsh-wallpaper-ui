import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { WallpaperClientController } from './controller.ts'
import { WallpaperPortal, installWallpaperDocumentLayer, panelThemeTokens } from './renderer.tsx'
import { WallpaperSettings } from './WallpaperSettings.tsx'
import { installWallpaperStyles } from './styles.ts'

/** Client services needed for additive slots and translucent theme tokens. */
export const inject = ['slots', 'theme']

export interface WallpaperClientServices {
  document: Document
  slots: Pick<ClientContext['slots'], 'inject' | 'register'>
  theme: Pick<ClientContext['theme'], 'overrideTokens'>
  fetcher?: typeof fetch
  eventSource?: (url: string) => EventSource
}

/** Start all browser contributions and return an uninstall-safe disposer. */
export async function startWallpaperClient(services: WallpaperClientServices): Promise<() => Promise<void>> {
  const controller = new WallpaperClientController({
    ...(services.fetcher === undefined ? {} : { fetcher: services.fetcher }),
    ...(services.eventSource === undefined ? {} : { eventSource: services.eventSource }),
  })
  const layer = installWallpaperDocumentLayer(services.document)
  const disposeStyles = installWallpaperStyles(services.document)
  let disposeTheme: (() => void) | undefined
  let disposeSettings: (() => void) | undefined
  let disposeOverlay: (() => void) | undefined
  let unsubscribeTheme: (() => void) | undefined
  let disposed = false
  const cleanup = async (): Promise<void> => {
    if (disposed) return
    disposed = true
    disposeOverlay?.()
    disposeSettings?.()
    unsubscribeTheme?.()
    disposeTheme?.()
    controller.dispose()
    disposeStyles()
    layer.dispose()
  }
  let lastPanelOpacity = 0.86
  const updateTheme = (): void => {
    const opacity = controller.getSnapshot().state?.presentation.panelOpacity
    if (opacity === undefined || opacity === lastPanelOpacity) return
    lastPanelOpacity = opacity
    disposeTheme = services.theme.overrideTokens('dsh-wallpaper', panelThemeTokens(opacity))
  }
  try {
    disposeTheme = services.theme.overrideTokens('dsh-wallpaper', panelThemeTokens(0.86))
    unsubscribeTheme = controller.subscribe(updateTheme)
    disposeSettings = services.slots.inject('settings.section', () => services.slots.register({
      name: 'settings.section',
      id: 'wallpaper',
      order: 45,
      label: '壁纸',
      inject: () => ({ controller }),
    }, WallpaperSettings))
    disposeOverlay = services.slots.inject('shell.overlay', () => services.slots.register({
      name: 'shell.overlay',
      id: 'dsh-wallpaper-renderer',
      order: -100,
      inject: () => ({ controller, target: layer.element }),
    }, WallpaperPortal))
    await controller.start().catch(() => undefined)
    return cleanup
  } catch (error) {
    await cleanup()
    throw error
  }
}

/** Activate the browser half. */
export async function apply(ctx: ClientContext): Promise<void> {
  await ctx.effect(
    () => startWallpaperClient({ document, slots: ctx.slots, theme: ctx.theme }),
    'dsh-wallpaper: client runtime',
  )
}
