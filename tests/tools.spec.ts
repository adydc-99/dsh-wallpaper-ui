import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { WallpaperService } from '../src/service.ts'
import { createWallpaperToolDefinitions } from '../src/tools.ts'

const roots: string[] = []

async function fixture(): Promise<{ service: WallpaperService; tools: ToolDefinition[] }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-wallpaper-tools-'))
  roots.push(root)
  let next = 0
  const service = new WallpaperService({ root, id: () => `wall-${String(++next)}` })
  await service.init()
  await service.addRemote({ name: '海边', url: 'https://example.test/sea.webp', mediaType: 'image/webp' })
  return { service, tools: createWallpaperToolDefinitions(service) }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('model tool permission surface', () => {
  it('defines exactly list and apply', async () => {
    const { tools } = await fixture()
    expect(tools.map(tool => tool.name).sort()).toEqual(['wallpaper_apply', 'wallpaper_list'])
  })

  it('list returns no local path or remote URL', async () => {
    const { tools } = await fixture()
    const list = tools.find(tool => tool.name === 'wallpaper_list')!
    const value = await list.execute({}, {} as never)
    expect(value).toEqual([{ id: 'wall-1', name: '海边', mediaType: 'image/webp', source: 'url', active: false }])
    expect(JSON.stringify(value)).not.toContain('example.test')
    expect(JSON.stringify(value)).not.toContain('relativePath')
  })

  it('apply accepts an existing id and bounded presentation settings', async () => {
    const { service, tools } = await fixture()
    const apply = tools.find(tool => tool.name === 'wallpaper_apply')!
    const value = await apply.execute({ wallpaper_id: 'wall-1', enabled: true, opacity: 0.4 }, {} as never)
    expect(value).toMatchObject({ selectedId: 'wall-1', enabled: true, opacity: 0.4 })
    expect(service.snapshot().presentation).toMatchObject(value as object)
  })

  it('rejects an unknown id without applying its settings', async () => {
    const { service, tools } = await fixture()
    const apply = tools.find(tool => tool.name === 'wallpaper_apply')!
    const before = service.snapshot()
    await expect(apply.execute({ wallpaper_id: 'missing', opacity: 0.4 }, {} as never)).rejects.toThrow(/unknown/i)
    expect(service.snapshot()).toEqual(before)
  })

  it('does not declare destructive or source-creation parameters', async () => {
    const { tools } = await fixture()
    const apply = tools.find(tool => tool.name === 'wallpaper_apply')!
    const schema = JSON.stringify(apply.parameters)
    expect(schema).not.toMatch(/delete|upload|url|path/i)
  })
})
