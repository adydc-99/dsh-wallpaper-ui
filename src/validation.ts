import { isAbsolute, posix } from 'node:path'
import { fileTypeFromBuffer } from 'file-type'
import {
  DEFAULT_PRESENTATION,
  WALLPAPER_MEDIA_TYPES,
  type DisplayPatch,
  type PresentationSettings,
  type WallpaperFit,
  type WallpaperMediaType,
  type WallpaperRecord,
  type WallpaperState,
} from './contracts.ts'

const EXTENSION_MEDIA = new Map<string, WallpaperMediaType>([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
])

const MEDIA_EXTENSION: Record<WallpaperMediaType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
}

const FITS = new Set<WallpaperFit>(['cover', 'contain', 'stretch', 'center', 'tile'])
const DISPLAY_KEYS = new Set<keyof DisplayPatch>([
  'enabled',
  'fit',
  'opacity',
  'brightness',
  'blurPx',
  'overlayColor',
  'overlayOpacity',
  'panelOpacity',
  'muted',
  'playbackRate',
])

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function boundedNumber(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} must be between ${String(min)} and ${String(max)}`)
  }
  return value
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`)
  return value
}

function stringValue(value: unknown, label: string, maxLength = 512): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new TypeError(`${label} must be a non-empty string of at most ${String(maxLength)} characters`)
  }
  return value
}

function mediaType(value: unknown): WallpaperMediaType {
  if (typeof value !== 'string' || !WALLPAPER_MEDIA_TYPES.includes(value as WallpaperMediaType)) {
    throw new TypeError('mediaType is unsupported')
  }
  return value as WallpaperMediaType
}

/** Validate a partial patch accepted by UI and model tools. */
export function validateDisplayPatch(value: unknown): DisplayPatch {
  const input = objectRecord(value, 'display patch')
  for (const key of Object.keys(input)) {
    if (!DISPLAY_KEYS.has(key as keyof DisplayPatch)) throw new TypeError(`unknown display setting: ${key}`)
  }
  const output: DisplayPatch = {}
  if (input.enabled !== undefined) output.enabled = booleanValue(input.enabled, 'enabled')
  if (input.fit !== undefined) {
    if (typeof input.fit !== 'string' || !FITS.has(input.fit as WallpaperFit)) throw new TypeError('fit is unsupported')
    output.fit = input.fit as WallpaperFit
  }
  if (input.opacity !== undefined) output.opacity = boundedNumber(input.opacity, 'opacity', 0, 1)
  if (input.brightness !== undefined) output.brightness = boundedNumber(input.brightness, 'brightness', 0, 1)
  if (input.blurPx !== undefined) output.blurPx = boundedNumber(input.blurPx, 'blurPx', 0, 40)
  if (input.overlayColor !== undefined) {
    if (typeof input.overlayColor !== 'string' || !/^#[0-9a-f]{6}$/iu.test(input.overlayColor)) {
      throw new TypeError('overlayColor must use #RRGGBB')
    }
    output.overlayColor = input.overlayColor.toUpperCase()
  }
  if (input.overlayOpacity !== undefined) output.overlayOpacity = boundedNumber(input.overlayOpacity, 'overlayOpacity', 0, 1)
  if (input.panelOpacity !== undefined) output.panelOpacity = boundedNumber(input.panelOpacity, 'panelOpacity', 0, 1)
  if (input.muted !== undefined) output.muted = booleanValue(input.muted, 'muted')
  if (input.playbackRate !== undefined) output.playbackRate = boundedNumber(input.playbackRate, 'playbackRate', 0.25, 2)
  return output
}

/** Validate and normalize a browser-loaded remote URL without fetching it. */
export function validateRemoteUrl(value: unknown): string {
  const text = stringValue(value, 'remote URL', 2048)
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    throw new TypeError('remote URL must be a valid HTTP or HTTPS URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError('remote URL must use HTTP or HTTPS')
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new TypeError('remote HTTP URL must not contain credentials')
  }
  return parsed.href
}

export interface UploadHeaderInput {
  name: string
  declaredMime: string
  bytes: Uint8Array
}

export interface ValidatedUploadHeader {
  mime: WallpaperMediaType
  extension: string
}

/** Require uploaded extension, browser-declared MIME, and magic bytes to agree. */
export async function validateUploadHeader(input: UploadHeaderInput): Promise<ValidatedUploadHeader> {
  const filename = stringValue(input.name, 'filename', 255)
  const dot = filename.lastIndexOf('.')
  const extension = dot < 0 ? '' : filename.slice(dot).toLowerCase()
  const expected = EXTENSION_MEDIA.get(extension)
  if (expected === undefined) throw new TypeError('unsupported file extension')
  const declared = input.declaredMime.split(';', 1)[0]!.trim().toLowerCase()
  if (declared !== expected) throw new TypeError('declared MIME does not match file extension')
  const detected = await fileTypeFromBuffer(input.bytes)
  if (detected === undefined || detected.mime !== expected) {
    throw new TypeError('file signature does not match declared MIME and extension')
  }
  return { mime: expected, extension: MEDIA_EXTENSION[expected] }
}

function parsePresentation(value: unknown): PresentationSettings {
  const input = objectRecord(value, 'presentation')
  const selected = input.selectedId
  if (selected !== undefined && selected !== null && typeof selected !== 'string') {
    throw new TypeError('selectedId must be a string or null')
  }
  const patchInput: Record<string, unknown> = {}
  for (const key of DISPLAY_KEYS) {
    if (input[key] !== undefined) patchInput[key] = input[key]
  }
  return {
    ...DEFAULT_PRESENTATION,
    ...validateDisplayPatch(patchInput),
    selectedId: selected === undefined ? null : selected,
  }
}

function parseWallpaper(value: unknown): WallpaperRecord {
  const input = objectRecord(value, 'wallpaper record')
  const id = stringValue(input.id, 'id', 128)
  if (!/^[a-z0-9_-]+$/iu.test(id)) throw new TypeError('id contains unsupported characters')
  const name = stringValue(input.name, 'name', 120)
  const type = mediaType(input.mediaType)
  const createdAt = stringValue(input.createdAt, 'createdAt', 64)
  if (!Number.isFinite(Date.parse(createdAt))) throw new TypeError('createdAt must be an ISO date')
  if (input.source === 'url') {
    return { id, name, mediaType: type, createdAt, source: 'url', url: validateRemoteUrl(input.url) }
  }
  if (input.source === 'upload') {
    const relativePath = stringValue(input.relativePath, 'relativePath', 512)
    if (isAbsolute(relativePath) || relativePath.includes('\\') || relativePath.split('/').includes('..')
      || posix.normalize(relativePath) !== relativePath || !relativePath.startsWith('media/')) {
      throw new TypeError('relativePath must stay inside the media directory')
    }
    return { id, name, mediaType: type, createdAt, source: 'upload', relativePath }
  }
  throw new TypeError('wallpaper source must be upload or url')
}

/** Parse current state or migrate the documented version-zero state. */
export function parseState(value: unknown): WallpaperState {
  const input = objectRecord(value, 'wallpaper state')
  if (input.version !== 0 && input.version !== 1) throw new TypeError('unsupported wallpaper state version')
  if (!Array.isArray(input.wallpapers)) throw new TypeError('wallpapers must be an array')
  const revision = input.version === 0
    ? 0
    : boundedNumber(input.revision, 'revision', 0, Number.MAX_SAFE_INTEGER)
  return {
    version: 1,
    revision,
    wallpapers: input.wallpapers.map(parseWallpaper),
    presentation: parsePresentation(input.presentation),
  }
}
