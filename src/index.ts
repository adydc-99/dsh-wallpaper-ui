import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-tools'
import { registerWallpaperRoutes, type WallpaperRouteOptions } from './http.ts'
import { WallpaperService, type WallpaperServiceLogger } from './service.ts'
import { registerWallpaperTools, type ToolRegistry } from './tools.ts'

/** Stable Cordis plugin name. */
export const name = 'dsh-wallpaper'

/** Host services required by the standalone bundle. */
export const inject = ['webServer', 'tools']

/** Default upload ceiling: 100 MiB per file. */
export const DEFAULT_UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024

/** Host plugin configuration. */
export interface Config {
  /** Optional Harness-home override. */
  dshHome?: string
  /** Maximum accepted upload size in bytes. */
  uploadLimitBytes?: number
}

export const Config: z<Config> = z.object({
  dshHome: z.string(),
  uploadLimitBytes: z.natural().min(1).default(DEFAULT_UPLOAD_LIMIT_BYTES),
})

interface WallpaperHostServices {
  webServer: WallpaperRouteOptions['webServer']
  tools: ToolRegistry
  logger: WallpaperServiceLogger
}

/** Start the Host runtime transactionally and return its complete disposer. */
export async function startWallpaperHost(services: WallpaperHostServices, config: Config = {}): Promise<() => Promise<void>> {
  const root = join(resolveDshHome(config.dshHome), 'plugins', 'dsh-wallpaper', 'v1')
  const service = new WallpaperService({ root, logger: services.logger })
  await service.init()
  const disposeRoute = registerWallpaperRoutes({
    webServer: services.webServer,
    service,
    uploadLimitBytes: config.uploadLimitBytes ?? DEFAULT_UPLOAD_LIMIT_BYTES,
  })
  try {
    const disposeTools = registerWallpaperTools(services.tools, service)
    return async () => {
      disposeTools()
      disposeRoute()
      await service.dispose()
    }
  } catch (error) {
    disposeRoute()
    await service.dispose()
    throw error
  }
}

/** Activate the Host half. */
export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  await ctx.effect(
    () => startWallpaperHost({ webServer: ctx.webServer, tools: ctx.tools, logger: ctx.logger(name) }, config),
    'dsh-wallpaper: host runtime',
  )
}
