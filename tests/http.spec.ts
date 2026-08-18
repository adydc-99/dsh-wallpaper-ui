import { createServer, request, type Server } from 'node:http'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
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

async function attackerGet(origin: string, path: string): Promise<{ status: number | undefined; body: string }> {
  return await new Promise((resolve, reject) => {
    const outgoing = request(`${origin}${path}`, { headers: { host: 'attacker.test' } }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => { chunks.push(Buffer.from(chunk)) })
      response.once('end', () => { resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }) })
    })
    outgoing.once('error', reject)
    outgoing.end()
  })
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
    expect(response.headers.get('x-dsh-wallpaper-upload-limit')).toBe('1024')
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

  it('rejects DNS-rebinding-style matching attacker Host and Origin headers', async () => {
    const { origin, service } = await fixture()
    const body = JSON.stringify({ name: '攻击者', url: 'https://example.test/a.webp', mediaType: 'image/webp' })
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const outgoing = request(`${origin}/dsh-wallpaper/api/urls`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          host: 'attacker.test',
          origin: 'http://attacker.test',
        },
      }, response => { response.resume(); response.once('end', () => { resolve(response.statusCode) }) })
      outgoing.once('error', reject)
      outgoing.end(body)
    })
    expect(status).toBe(403)
    expect(service.snapshot().wallpapers).toEqual([])
  })

  it('rejects attacker Host reads of state, SSE, and private uploaded media', async () => {
    const { origin, service } = await fixture()
    const tempPath = join(service.tempRoot, 'private.png')
    await writeFile(tempPath, Buffer.from('89504e470d0a1a0a', 'hex'))
    await service.commitUpload({ tempPath, name: '私密文件', mediaType: 'image/png', extension: '.png' })
    await service.addRemote({ name: '私密链接', url: 'https://example.test/image.png?token=secret', mediaType: 'image/png' })

    for (const path of ['/dsh-wallpaper/api/state', '/dsh-wallpaper/events', '/dsh-wallpaper/media/wall-one']) {
      const response = await attackerGet(origin, path)
      expect(response.status, path).toBe(403)
      expect(response.body, path).not.toContain('token=secret')
      expect(response.body, path).not.toContain('89504e47')
    }
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
    expect(await response.json()).toEqual({ error: '文件内容与声明的媒体格式不一致' })
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
    expect(await response.json()).toEqual({ error: '文件超过允许的大小上限' })
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
