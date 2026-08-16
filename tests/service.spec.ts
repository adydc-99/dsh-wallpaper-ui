import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRESENTATION } from '../src/contracts.ts'
import { WallpaperService } from '../src/service.ts'

const roots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-wallpaper-service-'))
  roots.push(root)
  return root
}

async function makeService(root: string, overrides: ConstructorParameters<typeof WallpaperService>[0] = { root }): Promise<WallpaperService> {
  const service = new WallpaperService({ root, ...overrides })
  await service.init()
  return service
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('WallpaperService persistence', () => {
  it('persists an added URL across a new service instance', async () => {
    const root = await tempRoot()
    const first = await makeService(root, { root, id: () => 'remote-one', now: () => new Date('2026-08-16T00:00:00.000Z') })
    const added = await first.addRemote({ name: '远程背景', url: 'https://example.test/a.webp', mediaType: 'image/webp' })
    await first.dispose()

    const second = await makeService(root)
    expect(second.snapshot().wallpapers).toContainEqual(added)
    expect(second.snapshot().revision).toBe(1)
  })

  it('falls back to defaults and warns when configuration is corrupt', async () => {
    const root = await tempRoot()
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'config.json'), '{not-json', 'utf8')
    const warn = vi.fn()

    const service = await makeService(root, { root, logger: { warn } })

    expect(service.snapshot()).toEqual({ version: 1, revision: 0, wallpapers: [], presentation: DEFAULT_PRESENTATION })
    expect(warn).toHaveBeenCalledOnce()
  })

  it('keeps the previous state active when an atomic write fails', async () => {
    const root = await tempRoot()
    const writeState = vi.fn().mockRejectedValue(new Error('disk full'))
    const service = await makeService(root, { root, writeState })
    const before = service.snapshot()

    await expect(service.updatePresentation({ opacity: 0.4 })).rejects.toThrow('disk full')

    expect(service.snapshot()).toEqual(before)
  })
})

describe('WallpaperService mutations', () => {
  it('disables before deleting the active uploaded wallpaper and removes its file', async () => {
    const root = await tempRoot()
    const service = await makeService(root, { root, id: () => 'upload-one' })
    const tempPath = join(root, '.tmp', 'incoming')
    await mkdir(join(root, '.tmp'), { recursive: true })
    await writeFile(tempPath, 'image')
    const item = await service.commitUpload({ tempPath, name: '本地背景', mediaType: 'image/png', extension: '.png' })
    await service.applyExisting(item.id, { enabled: true })

    await service.delete(item.id)

    expect(service.snapshot().presentation).toMatchObject({ enabled: false, selectedId: null })
    expect(service.snapshot().wallpapers).toEqual([])
    await expect(readFile(join(root, item.relativePath))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects an upload temporary path outside the private root', async () => {
    const root = await tempRoot()
    const outside = join(await tempRoot(), 'outside')
    await writeFile(outside, 'image')
    const service = await makeService(root)

    await expect(service.commitUpload({ tempPath: outside, name: '越界', mediaType: 'image/png', extension: '.png' })).rejects.toThrow(/private root/i)
    expect(service.snapshot().wallpapers).toEqual([])
  })

  it('rejects an unknown id without applying the accompanying patch', async () => {
    const root = await tempRoot()
    const service = await makeService(root)
    const before = service.snapshot()

    await expect(service.applyExisting('missing', { opacity: 0.4 })).rejects.toThrow(/unknown/i)

    expect(service.snapshot()).toEqual(before)
  })

  it('publishes the committed state once and stops after unsubscribe', async () => {
    const root = await tempRoot()
    const service = await makeService(root)
    const listener = vi.fn()
    const unsubscribe = service.subscribe(listener)
    await service.updatePresentation({ opacity: 0.5 })
    unsubscribe()
    await service.updatePresentation({ opacity: 0.6 })

    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0]![0].presentation.opacity).toBe(0.5)
  })
})
