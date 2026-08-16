import { createServer, type Server } from 'node:http'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { DEFAULT_PRESENTATION } from '../src/contracts.ts'
import { registerWallpaperRoutes } from '../src/http.ts'
import { WallpaperService } from '../src/service.ts'

const roots: string[] = []
const servers: Server[] = []

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-wallpaper-http-'))
  roots.push(root)
  const service = new WallpaperService({ root, id: () => 'wall-one' })
  await service.init()
  let route: WebRoute | undefined
  const dispose = registerWallpaperRoutes({
    webServer: { register(value) { route = value; return () => { route = undefined } } },
    service,
    uploadLimitBytes: 1024,
  })
  const server = createServer((req, res) => { void route!.handler(req, res) })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('test server did not bind')
  const origin = `http://127.0.0.1:${String(address.port)}`
  return { root, service, origin, dispose }
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('wallpaper HTTP surface', () => {
  it('returns the current JSON-safe state', async () => {
    const { origin } = await fixture()
    const response = await fetch(`${origin}/dsh-wallpaper/api/state`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ version: 1, wallpapers: [] })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('rejects a mutation with a foreign Origin', async () => {
    const { origin } = await fixture()
    const response = await fetch(`${origin}/dsh-wallpaper/api/urls`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.test' },
      body: JSON.stringify({ name: '远程', url: 'https://example.test/a.webp', mediaType: 'image/webp' }),
    })
    expect(response.status).toBe(403)
  })

  it('adds an HTTP URL without fetching it on the Host', async () => {
    const { origin, service } = await fixture()
    const response = await fetch(`${origin}/dsh-wallpaper/api/urls`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ name: '远程', url: 'https://example.test/a.webp', mediaType: 'image/webp' }),
    })
    expect(response.status).toBe(201)
    expect(service.snapshot().wallpapers).toHaveLength(1)
  })

  it('rejects script bytes disguised as PNG and leaves no stored media', async () => {
    const { origin, root, service } = await fixture()
    const form = new FormData()
    form.append('name', '伪装文件')
    form.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'fake.png')
    const response = await fetch(`${origin}/dsh-wallpaper/api/uploads`, { method: 'POST', headers: { origin }, body: form })
    expect(response.status).toBe(415)
    expect(service.snapshot().wallpapers).toEqual([])
    expect(await readdir(join(root, 'media'))).toEqual([])
  })

  it('streams a valid upload into private media storage', async () => {
    const { origin, root, service } = await fixture()
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')
    const form = new FormData()
    form.append('file', new Blob([png], { type: 'image/png' }), 'pixel.png')
    const response = await fetch(`${origin}/dsh-wallpaper/api/uploads`, { method: 'POST', headers: { origin }, body: form })
    expect(response.status).toBe(201)
    expect(service.snapshot().wallpapers).toMatchObject([{ source: 'upload', mediaType: 'image/png' }])
    expect(await readdir(join(root, 'media'))).toEqual(['wall-one.png'])
  })

  it('returns 413 and removes temporary data after the upload ceiling is crossed', async () => {
    const { origin, root, service } = await fixture()
    const oversized = Buffer.concat([
      Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'),
      Buffer.alloc(2048),
    ])
    const form = new FormData()
    form.append('file', new Blob([oversized], { type: 'image/png' }), 'large.png')
    const response = await fetch(`${origin}/dsh-wallpaper/api/uploads`, { method: 'POST', headers: { origin }, body: form })
    expect(response.status).toBe(413)
    expect(service.snapshot().wallpapers).toEqual([])
    expect(await readdir(join(root, '.tmp'))).toEqual([])
    expect(await readdir(join(root, 'media'))).toEqual([])
  })

  it('activates, updates, resets, and manually deletes an existing wallpaper', async () => {
    const { origin, service } = await fixture()
    await service.addRemote({ name: '远程', url: 'https://example.test/a.webp', mediaType: 'image/webp' })
    const headers = { origin }
    expect((await fetch(`${origin}/dsh-wallpaper/api/wallpapers/wall-one/activate`, { method: 'POST', headers })).status).toBe(200)
    expect((await fetch(`${origin}/dsh-wallpaper/api/presentation`, {
      method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ opacity: 0.35 }),
    })).status).toBe(200)
    expect(service.snapshot().presentation).toMatchObject({ enabled: true, selectedId: 'wall-one', opacity: 0.35 })
    expect((await fetch(`${origin}/dsh-wallpaper/api/reset`, { method: 'POST', headers })).status).toBe(200)
    expect(service.snapshot().presentation).toEqual(DEFAULT_PRESENTATION)
    expect((await fetch(`${origin}/dsh-wallpaper/api/wallpapers/wall-one`, { method: 'DELETE', headers })).status).toBe(204)
    expect(service.snapshot().wallpapers).toEqual([])
  })

  it('pushes committed state changes over SSE', async () => {
    const { origin, service } = await fixture()
    const response = await fetch(`${origin}/dsh-wallpaper/events`)
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    await reader.read()
    await service.updatePresentation({ opacity: 0.55 })
    const event = decoder.decode((await reader.read()).value)
    expect(event).toContain('"opacity":0.55')
    await reader.cancel()
  })
})
