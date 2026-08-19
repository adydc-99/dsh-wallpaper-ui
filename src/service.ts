import { randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, rename, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import {
  DEFAULT_PRESENTATION,
  WALLPAPER_MEDIA_TYPES,
  createDefaultState,
  type DisplayPatch,
  type PresentationSettings,
  type RemoteWallpaperRecord,
  type UploadedWallpaperRecord,
  type WallpaperMediaType,
  type WallpaperRecord,
  type WallpaperState,
} from './contracts.ts'
import { parseState, validateDisplayPatch, validateRemoteUrl } from './validation.ts'

export interface WallpaperServiceLogger {
  warn(error: unknown): void
}

export interface WallpaperServiceOptions {
  root: string
  logger?: WallpaperServiceLogger
  now?: () => Date
  id?: () => string
  readState?: (path: string) => Promise<string>
  writeState?: (path: string, contents: string) => Promise<void>
}

export interface CommitUploadInput {
  tempPath: string
  name: string
  mediaType: WallpaperMediaType
  extension: string
}

export interface AddRemoteInput {
  name: string
  url: string
  mediaType: WallpaperMediaType
}

export interface ResolvedMedia {
  path: string
  mediaType: WallpaperMediaType
}

export interface PublicWallpaper {
  id: string
  name: string
  mediaType: WallpaperMediaType
  source: 'upload' | 'url'
  active: boolean
}

const MEDIA_EXTENSIONS: Record<WallpaperMediaType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
}

function inside(root: string, target: string): boolean {
  const path = relative(root, target)
  return path.length > 0 && !path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path)
}

function stateCopy(state: WallpaperState): WallpaperState {
  return structuredClone(state)
}

/** Owns wallpaper metadata, private files, serialized mutations, and publication. */
export class WallpaperService {
  readonly root: string
  readonly mediaRoot: string
  readonly tempRoot: string
  private readonly configPath: string
  private readonly logger: WallpaperServiceLogger
  private readonly now: () => Date
  private readonly id: () => string
  private readonly readState: (path: string) => Promise<string>
  private readonly writeState: (path: string, contents: string) => Promise<void>
  private state = createDefaultState()
  private listeners = new Set<(state: WallpaperState) => void>()
  private queue: Promise<void> = Promise.resolve()

  constructor(options: WallpaperServiceOptions) {
    this.root = resolve(options.root)
    this.mediaRoot = join(this.root, 'media')
    this.tempRoot = join(this.root, '.tmp')
    this.configPath = join(this.root, 'config.json')
    this.logger = options.logger ?? { warn() {} }
    this.now = options.now ?? (() => new Date())
    this.id = options.id ?? randomUUID
    this.readState = options.readState ?? (path => readFile(path, 'utf8'))
    this.writeState = options.writeState ?? (async (path, contents) => {
      await writeFileAtomic(path, contents, { encoding: 'utf8', mode: 0o600 })
    })
  }

  /** Create private directories and adopt a valid durable state. */
  async init(): Promise<void> {
    await Promise.all([
      mkdir(this.mediaRoot, { recursive: true, mode: 0o700 }),
      mkdir(this.tempRoot, { recursive: true, mode: 0o700 }),
    ])
    let raw: string
    try {
      raw = await this.readState(this.configPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    let decoded: unknown
    try {
      decoded = JSON.parse(raw)
    } catch (error) {
      await this.quarantineCorruptConfig(error)
      return
    }
    if (typeof decoded === 'object' && decoded !== null
      && typeof (decoded as { version?: unknown }).version === 'number'
      && (decoded as { version: number }).version > 1) {
      throw new TypeError('unsupported wallpaper state version')
    }
    try {
      this.state = parseState(decoded)
    } catch (error) {
      await this.quarantineCorruptConfig(error)
    }
  }

  /** Return an owned JSON-safe state copy. */
  snapshot(): WallpaperState {
    return stateCopy(this.state)
  }

  /** Subscribe to committed states. */
  subscribe(listener: (state: WallpaperState) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Model-safe library view with no local paths or remote URLs. */
  listPublic(): PublicWallpaper[] {
    return this.state.wallpapers.map(item => ({
      id: item.id,
      name: item.name,
      mediaType: item.mediaType,
      source: item.source,
      active: this.state.presentation.enabled && this.state.presentation.selectedId === item.id,
    }))
  }

  /** Move a validated temporary upload into private media storage and persist it. */
  async commitUpload(input: CommitUploadInput): Promise<UploadedWallpaperRecord> {
    return this.serial(async () => {
      if (!WALLPAPER_MEDIA_TYPES.includes(input.mediaType) || MEDIA_EXTENSIONS[input.mediaType] !== input.extension) {
        throw new TypeError('upload media type and extension do not agree')
      }
      const [canonicalTempRoot, canonicalTempPath] = await Promise.all([
        realpath(this.tempRoot),
        realpath(input.tempPath),
      ])
      if (!inside(canonicalTempRoot, canonicalTempPath)) {
        throw new Error('upload temporary path must stay inside the plugin private root')
      }
      const id = this.id()
      const relativePath = `media/${id}${input.extension}`
      const destination = join(this.root, ...relativePath.split('/'))
      if (!inside(this.root, destination)) throw new Error('generated media path escaped the plugin private root')
      const record: UploadedWallpaperRecord = {
        id,
        name: input.name,
        source: 'upload',
        relativePath,
        mediaType: input.mediaType,
        createdAt: this.now().toISOString(),
      }
      const next = this.nextState([...this.state.wallpapers, record], this.state.presentation)
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
      await rename(canonicalTempPath, destination)
      try {
        await this.publishState(next)
      } catch (error) {
        await rm(destination, { force: true })
        throw error
      }
      return structuredClone(record)
    })
  }

  /** Register a browser-loaded HTTP(S) source without downloading it. */
  async addRemote(input: AddRemoteInput): Promise<RemoteWallpaperRecord> {
    return this.serial(async () => {
      const record: RemoteWallpaperRecord = {
        id: this.id(),
        name: input.name,
        source: 'url',
        url: validateRemoteUrl(input.url),
        mediaType: input.mediaType,
        createdAt: this.now().toISOString(),
      }
      const next = this.nextState([...this.state.wallpapers, record], this.state.presentation)
      await this.publishState(next)
      return structuredClone(record)
    })
  }

  /** Delete a record, disabling it first when active. */
  async delete(id: string): Promise<void> {
    await this.serial(async () => {
      const record = this.find(id)
      const wallpapers = this.state.wallpapers.filter(item => item.id !== id)
      const presentation = this.state.presentation.selectedId === id
        ? { ...this.state.presentation, enabled: false, selectedId: null }
        : this.state.presentation
      await this.publishState(this.nextState(wallpapers, presentation))
      if (record.source === 'upload') {
        try {
          await rm(this.uploadPath(record), { force: true })
        } catch (error) {
          this.logger.warn(error)
        }
      }
    })
  }

  /** Select an existing wallpaper and atomically apply a bounded display patch. */
  async applyExisting(id: string | undefined, patchValue: unknown): Promise<WallpaperState> {
    return this.serial(async () => {
      const patch = validateDisplayPatch(patchValue)
      const selectedId = id ?? this.state.presentation.selectedId
      if (selectedId === null) throw new Error('no wallpaper is selected')
      this.find(selectedId)
      const presentation = { ...this.state.presentation, ...patch, selectedId }
      await this.publishState(this.nextState(this.state.wallpapers, presentation))
      return this.snapshot()
    })
  }

  /** Apply presentation settings without changing the current selection. */
  async updatePresentation(patchValue: unknown): Promise<WallpaperState> {
    return this.serial(async () => {
      const patch = validateDisplayPatch(patchValue)
      const presentation = { ...this.state.presentation, ...patch }
      if (presentation.enabled && presentation.selectedId === null) throw new Error('cannot enable wallpaper without a selection')
      await this.publishState(this.nextState(this.state.wallpapers, presentation))
      return this.snapshot()
    })
  }

  /** Restore default display settings without deleting the library or changing the selection. */
  async resetPresentation(): Promise<WallpaperState> {
    return this.serial(async () => {
      const { enabled, selectedId, ...defaults } = DEFAULT_PRESENTATION
      const presentation = {
        ...defaults,
        enabled: this.state.presentation.enabled,
        selectedId: this.state.presentation.selectedId,
      }
      await this.publishState(this.nextState(this.state.wallpapers, presentation))
      return this.snapshot()
    })
  }

  /** Resolve an uploaded record to an owned absolute media path. */
  resolveMedia(id: string): ResolvedMedia | undefined {
    const record = this.state.wallpapers.find(item => item.id === id)
    if (record?.source !== 'upload') return undefined
    return { path: this.uploadPath(record), mediaType: record.mediaType }
  }

  /** Wait for pending operations and release subscribers. */
  async dispose(): Promise<void> {
    await this.queue
    this.listeners.clear()
  }

  private find(id: string): WallpaperRecord {
    const record = this.state.wallpapers.find(item => item.id === id)
    if (record === undefined) throw new Error(`unknown wallpaper id: ${id}`)
    return record
  }

  private async quarantineCorruptConfig(error: unknown): Promise<void> {
    const stamp = this.now().toISOString().replace(/[^0-9A-Z]/giu, '')
    const backup = join(this.root, `config.corrupt-${stamp}-${randomUUID()}.json`)
    await rename(this.configPath, backup)
    this.logger.warn(error)
    this.state = createDefaultState()
  }

  private uploadPath(record: UploadedWallpaperRecord): string {
    const path = join(this.root, ...record.relativePath.split('/'))
    if (!inside(this.root, path)) throw new Error('stored media path escaped the plugin private root')
    return path
  }

  private nextState(wallpapers: WallpaperRecord[], presentation: PresentationSettings): WallpaperState {
    return parseState({
      version: 1,
      revision: this.state.revision + 1,
      wallpapers,
      presentation,
    })
  }

  private async publishState(next: WallpaperState): Promise<void> {
    await this.writeState(this.configPath, `${JSON.stringify(next, null, 2)}\n`)
    this.state = next
    const snapshot = this.snapshot()
    for (const listener of this.listeners) listener(snapshot)
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }
}
