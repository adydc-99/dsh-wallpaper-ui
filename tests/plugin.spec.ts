import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { Config, inject, name, startWallpaperHost } from '../src/index.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Cordis plugin bootstrap', () => {
  it('declares a stable plugin contract and bounded 100 MB default', () => {
    expect(name).toBe('dsh-wallpaper')
    expect(inject).toEqual(['webServer', 'tools'])
    expect(Config).toBeDefined()
  })

  it('starts persistent routes and narrow tools, then removes every registration', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'dsh-wallpaper-plugin-'))
    roots.push(dshHome)
    const routes = new Set<WebRoute>()
    const tools = new Map<string, ToolDefinition>()
    const dispose = await startWallpaperHost({
      webServer: {
        register(route) {
          routes.add(route)
          return () => { routes.delete(route) }
        },
      },
      tools: {
        register(definition) {
          tools.set(definition.name, definition)
          return () => { tools.delete(definition.name) }
        },
      },
      logger: { warn() {} },
    }, { dshHome, uploadLimitBytes: 2048 })

    expect([...routes].map(route => route.path)).toEqual(['/dsh-wallpaper'])
    expect([...tools.keys()]).toEqual(['wallpaper_list', 'wallpaper_apply'])
    expect(await readdir(join(dshHome, 'plugins', 'dsh-wallpaper', 'v1'))).toEqual(['.tmp', 'media'])

    await dispose()
    expect(routes.size).toBe(0)
    expect(tools.size).toBe(0)
  })
})
