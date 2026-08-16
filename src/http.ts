import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { rm, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import Busboy from 'busboy'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { DisplayPatch, WallpaperMediaType } from './contracts.ts'
import type { WallpaperService } from './service.ts'
import { validateUploadHeader } from './validation.ts'

interface WebServerLike { register(route: WebRoute): () => void }
export interface WallpaperRouteOptions { webServer: WebServerLike; service: WallpaperService; uploadLimitBytes: number }

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function publicError(message: string, status: number): string {
  if (status === 413) return '文件超过允许的大小上限'
  if (/signature/iu.test(message)) return '文件内容与声明的媒体格式不一致'
  if (/extension/iu.test(message)) return '不支持该文件扩展名，或扩展名与格式不一致'
  if (/MIME/iu.test(message)) return '文件 MIME 类型与扩展名不一致'
  if (/remote URL/iu.test(message)) return '网络壁纸 URL 必须是有效且不含凭据的 HTTP(S) 地址'
  if (/unknown wallpaper/iu.test(message)) return '指定的壁纸不存在'
  if (/selection/iu.test(message)) return '请先选择一张壁纸'
  if (/display|unsupported|between|boolean/iu.test(message)) return '壁纸显示参数无效'
  return '壁纸请求无效'
}

async function readJson(req: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const part = Buffer.from(chunk)
    size += part.length
    if (size > limit) throw new Error('request body too large')
    chunks.push(part)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function mutationAllowed(req: IncomingMessage): boolean {
  const remote = req.socket.remoteAddress
  if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') return false
  const origin = req.headers.origin
  const host = req.headers.host
  if (origin === undefined || host === undefined) return false
  try {
    const parsedOrigin = new URL(origin)
    const parsedHost = new URL(`http://${host}`)
    const hostname = parsedOrigin.hostname.toLowerCase()
    const loopbackAuthority = hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '[::1]'
      || hostname === '[::ffff:127.0.0.1]'
    return loopbackAuthority
      && (parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:')
      && parsedOrigin.host.toLowerCase() === parsedHost.host.toLowerCase()
  } catch {
    return false
  }
}

async function upload(req: IncomingMessage, service: WallpaperService, limit: number): Promise<unknown> {
  const tempPath = join(service.tempRoot, `${randomUUID()}.uploading`)
  let displayName = ''
  let originalName = ''
  let declaredMime = ''
  let header = Buffer.alloc(0)
  let fileTask: Promise<void> | undefined
  let truncated = false
  const parser = Busboy({ headers: req.headers, limits: { files: 1, fileSize: limit, fields: 4 } })
  parser.on('field', (name, value) => { if (name === 'name') displayName = value })
  parser.on('file', (_field, stream, info) => {
    originalName = info.filename
    declaredMime = info.mimeType
    stream.on('limit', () => { truncated = true })
    stream.on('data', (chunk: Buffer) => {
      if (header.length < 8192) header = Buffer.concat([header, chunk.subarray(0, 8192 - header.length)])
    })
    fileTask = pipeline(stream, createWriteStream(tempPath, { flags: 'wx', mode: 0o600 }))
  })
  try {
    await new Promise<void>((resolve, reject) => {
      parser.once('finish', resolve)
      parser.once('error', reject)
      req.once('aborted', () => reject(new Error('upload aborted')))
      req.pipe(parser)
    })
    await fileTask
    if (fileTask === undefined) throw new Error('one file is required')
    if (truncated || (await stat(tempPath)).size > limit) throw new Error('upload exceeds size limit')
    const validated = await validateUploadHeader({ name: originalName, declaredMime, bytes: header })
    return await service.commitUpload({
      tempPath,
      name: displayName.trim() || originalName,
      mediaType: validated.mime,
      extension: validated.extension,
    })
  } catch (error) {
    await rm(tempPath, { force: true })
    throw error
  }
}

/** Register the same-origin wallpaper API, private media, and event stream. */
export function registerWallpaperRoutes(options: WallpaperRouteOptions): () => void {
  const { service } = options
  const sse = new Set<ServerResponse>()
  const unsubscribe = service.subscribe(state => {
    const frame = `data: ${JSON.stringify(state)}\n\n`
    for (const response of sse) response.write(frame)
  })
  const route: WebRoute = {
    kind: 'prefix',
    path: '/dsh-wallpaper',
    async handler(req, res) {
      const url = new URL(req.url ?? '/', 'http://dsh.local')
      const path = url.pathname.slice('/dsh-wallpaper'.length)
      try {
        if (req.method === 'GET' && path === '/api/state') { json(res, 200, service.snapshot()); return }
        if (req.method === 'GET' && path === '/events') {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
          sse.add(res)
          res.write(`data: ${JSON.stringify(service.snapshot())}\n\n`)
          req.once('close', () => { sse.delete(res) })
          return
        }
        if (req.method === 'GET' && path.startsWith('/media/')) {
          const media = service.resolveMedia(decodeURIComponent(path.slice('/media/'.length)))
          if (media === undefined) { json(res, 404, { error: 'wallpaper not found' }); return }
          res.writeHead(200, { 'content-type': media.mediaType, 'cache-control': 'private, max-age=3600' })
          await pipeline(createReadStream(media.path), res)
          return
        }
        if (!mutationAllowed(req)) { json(res, 403, { error: 'forbidden' }); return }
        if (req.method === 'POST' && path === '/api/urls') {
          const body = await readJson(req) as { name?: unknown; url?: unknown; mediaType?: unknown }
          const item = await service.addRemote({ name: String(body.name ?? ''), url: String(body.url ?? ''), mediaType: body.mediaType as WallpaperMediaType })
          json(res, 201, item); return
        }
        if (req.method === 'POST' && path === '/api/uploads') {
          const item = await upload(req, service, options.uploadLimitBytes)
          json(res, 201, item); return
        }
        const wallpaperMatch = /^\/api\/wallpapers\/([^/]+?)(\/activate)?$/u.exec(path)
        if (req.method === 'POST' && wallpaperMatch?.[2] === '/activate') {
          await service.applyExisting(decodeURIComponent(wallpaperMatch[1]!), { enabled: true })
          json(res, 200, service.snapshot()); return
        }
        if (req.method === 'DELETE' && wallpaperMatch !== null && wallpaperMatch[2] === undefined) {
          await service.delete(decodeURIComponent(wallpaperMatch[1]!))
          res.writeHead(204, { 'cache-control': 'no-store' })
          res.end(); return
        }
        if (req.method === 'PATCH' && path === '/api/presentation') {
          await service.updatePresentation(await readJson(req) as DisplayPatch)
          json(res, 200, service.snapshot()); return
        }
        if (req.method === 'POST' && path === '/api/reset') {
          await service.resetPresentation()
          json(res, 200, service.snapshot()); return
        }
        json(res, 404, { error: 'not found' })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const status = /signature|extension|MIME/iu.test(message) ? 415 : /size limit|too large/iu.test(message) ? 413 : 400
        json(res, status, { error: publicError(message, status) })
      }
    },
  }
  const disposeRoute = options.webServer.register(route)
  return () => {
    unsubscribe()
    disposeRoute()
    for (const response of sse) response.end()
    sse.clear()
  }
}
