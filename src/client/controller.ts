import type { DisplayPatch, WallpaperMediaType, WallpaperState } from '../contracts.ts'

export interface WallpaperClientSnapshot {
  status: 'idle' | 'loading' | 'ready' | 'error'
  state: WallpaperState | null
  error: string | null
  uploadLimitBytes: number
}

export interface WallpaperClientOptions {
  fetcher?: typeof fetch
  eventSource?: (url: string) => EventSource
}

export interface RemoteWallpaperInput {
  name: string
  url: string
  mediaType: WallpaperMediaType
}

const API_ROOT = '/dsh-wallpaper'
const DEFAULT_UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024

/** Browser-side state bridge over the plugin's same-origin HTTP and SSE surface. */
export class WallpaperClientController {
  private readonly fetcher: typeof fetch
  private readonly eventSource: (url: string) => EventSource
  private readonly listeners = new Set<() => void>()
  private stream: EventSource | null = null
  private snapshot: WallpaperClientSnapshot = { status: 'idle', state: null, error: null, uploadLimitBytes: DEFAULT_UPLOAD_LIMIT_BYTES }

  constructor(options: WallpaperClientOptions = {}) {
    this.fetcher = options.fetcher ?? fetch
    this.eventSource = options.eventSource ?? (url => new EventSource(url))
  }

  getSnapshot = (): WallpaperClientSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async start(): Promise<void> {
    if (this.stream !== null) return
    this.publish({ ...this.snapshot, status: 'loading', error: null })
    try {
      const response = await this.fetcher(`${API_ROOT}/api/state`)
      const state = await this.readState(response)
      const configuredLimit = Number(response.headers.get('x-dsh-wallpaper-upload-limit'))
      const uploadLimitBytes = Number.isSafeInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : DEFAULT_UPLOAD_LIMIT_BYTES
      this.publish({ status: 'ready', state, error: null, uploadLimitBytes })
      const stream = this.eventSource(`${API_ROOT}/events`)
      stream.onmessage = event => {
        try {
          this.publish({ status: 'ready', state: JSON.parse(event.data) as WallpaperState, error: null, uploadLimitBytes: this.snapshot.uploadLimitBytes })
        } catch {
          this.publish({ ...this.snapshot, status: 'error', error: '壁纸状态更新格式无效' })
        }
      }
      stream.onerror = () => {
        this.publish({ ...this.snapshot, status: 'error', error: '壁纸状态连接已中断，正在等待浏览器重连' })
      }
      this.stream = stream
    } catch (error) {
      this.fail(error)
      throw error
    }
  }

  dispose(): void {
    this.stream?.close()
    this.stream = null
    this.listeners.clear()
  }

  async addUrl(input: RemoteWallpaperInput): Promise<void> {
    await this.mutate('/api/urls', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  }

  async upload(file: File, name = file.name): Promise<void> {
    const body = new FormData()
    body.append('name', name)
    body.append('file', file, file.name)
    await this.mutate('/api/uploads', { method: 'POST', body })
  }

  async activate(id: string): Promise<void> {
    await this.mutate(`/api/wallpapers/${encodeURIComponent(id)}/activate`, { method: 'POST' })
  }

  async remove(id: string): Promise<void> {
    await this.mutate(`/api/wallpapers/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async update(patch: DisplayPatch): Promise<void> {
    await this.mutate('/api/presentation', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) })
  }

  async reset(): Promise<void> {
    await this.mutate('/api/reset', { method: 'POST' })
  }

  async handleMediaError(_mediaType: WallpaperMediaType): Promise<void> {
    await this.reset()
    this.publish({ ...this.snapshot, status: 'error', error: '壁纸媒体加载失败，已恢复默认背景' })
  }

  private async mutate(path: string, init: RequestInit): Promise<void> {
    try {
      const response = await this.fetcher(`${API_ROOT}${path}`, init)
      if (!response.ok) throw new Error(await this.errorMessage(response))
      if (response.status !== 204 && response.headers.get('content-type')?.includes('application/json') === true) {
        const value = await response.json() as unknown
        if (this.isState(value)) this.publish({ status: 'ready', state: value, error: null, uploadLimitBytes: this.snapshot.uploadLimitBytes })
      }
    } catch (error) {
      this.fail(error)
      throw error
    }
  }

  private async readState(response: Response): Promise<WallpaperState> {
    if (!response.ok) throw new Error(await this.errorMessage(response))
    return await response.json() as WallpaperState
  }

  private async errorMessage(response: Response): Promise<string> {
    try {
      const body = await response.json() as { error?: unknown }
      if (typeof body.error === 'string') {
        if (/size limit|too large/iu.test(body.error)) return '文件超过允许的大小上限'
        if (/signature/iu.test(body.error)) return '文件内容与声明的媒体格式不一致'
        if (/extension/iu.test(body.error)) return '不支持该文件扩展名，或扩展名与格式不一致'
        if (/MIME/iu.test(body.error)) return '文件 MIME 类型与扩展名不一致'
        return body.error
      }
    } catch {}
    return `壁纸请求失败（HTTP ${String(response.status)}）`
  }

  private isState(value: unknown): value is WallpaperState {
    return typeof value === 'object' && value !== null && (value as { version?: unknown }).version === 1
  }

  private fail(error: unknown): void {
    this.publish({ ...this.snapshot, status: 'error', error: error instanceof Error ? error.message : String(error) })
  }

  private publish(snapshot: WallpaperClientSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }
}
