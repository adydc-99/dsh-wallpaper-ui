/** Media types supported by the first wallpaper release. */
export const WALLPAPER_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
] as const

export type WallpaperMediaType = typeof WALLPAPER_MEDIA_TYPES[number]
export type WallpaperFit = 'cover' | 'contain' | 'stretch' | 'center' | 'tile'

interface WallpaperRecordBase {
  id: string
  name: string
  mediaType: WallpaperMediaType
  createdAt: string
}

export interface UploadedWallpaperRecord extends WallpaperRecordBase {
  source: 'upload'
  relativePath: string
}

export interface RemoteWallpaperRecord extends WallpaperRecordBase {
  source: 'url'
  url: string
}

export type WallpaperRecord = UploadedWallpaperRecord | RemoteWallpaperRecord

export interface PresentationSettings {
  enabled: boolean
  selectedId: string | null
  fit: WallpaperFit
  opacity: number
  brightness: number
  blurPx: number
  overlayColor: string
  overlayOpacity: number
  panelOpacity: number
  muted: boolean
  playbackRate: number
}

export type DisplayPatch = Partial<Omit<PresentationSettings, 'selectedId'>>

export interface WallpaperState {
  version: 1
  revision: number
  wallpapers: WallpaperRecord[]
  presentation: PresentationSettings
}

/** Safe presentation used on first run and after corrupt configuration. */
export const DEFAULT_PRESENTATION: Readonly<PresentationSettings> = Object.freeze({
  enabled: false,
  selectedId: null,
  fit: 'cover',
  opacity: 0.72,
  brightness: 1,
  blurPx: 0,
  overlayColor: '#000000',
  overlayOpacity: 0.18,
  panelOpacity: 0.4,
  muted: true,
  playbackRate: 1,
})

/** Create an independently mutable default state. */
export function createDefaultState(): WallpaperState {
  return {
    version: 1,
    revision: 0,
    wallpapers: [],
    presentation: { ...DEFAULT_PRESENTATION },
  }
}
