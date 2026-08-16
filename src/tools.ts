import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { DisplayPatch } from './contracts.ts'
import type { WallpaperService } from './service.ts'

const PUBLIC_WALLPAPER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    name: { type: 'string', required: true },
    mediaType: { type: 'string', required: true, enum: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'] },
    source: { type: 'string', required: true, enum: ['upload', 'url'] },
    active: { type: 'boolean', required: true },
  },
} as const

const PRESENTATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    selectedId: { type: 'string', required: true },
    enabled: { type: 'boolean', required: true },
    fit: { type: 'string', required: true, enum: ['cover', 'contain', 'stretch', 'center', 'tile'] },
    opacity: { type: 'number', required: true },
    brightness: { type: 'number', required: true },
    blurPx: { type: 'number', required: true },
    overlayColor: { type: 'string', required: true },
    overlayOpacity: { type: 'number', required: true },
    panelOpacity: { type: 'number', required: true },
    muted: { type: 'boolean', required: true },
    playbackRate: { type: 'number', required: true },
  },
} as const

/** Create the complete and intentionally narrow model-facing tool surface. */
export function createWallpaperToolDefinitions(service: WallpaperService): ToolDefinition[] {
  const list = defineTool({
    name: 'wallpaper_list',
    description: 'List wallpapers already present in the wallpaper library. Local paths and remote URLs are omitted.',
    parameters: {},
    output: {
      schema: { type: 'array', items: PUBLIC_WALLPAPER_SCHEMA },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute() {
      return service.listPublic()
    },
  })

  const apply = defineTool({
    name: 'wallpaper_apply',
    description: 'Select an existing wallpaper or adjust its safe display settings. This tool cannot add, upload, download, or delete wallpapers.',
    parameters: {
      wallpaper_id: { type: 'string', description: 'Existing wallpaper id. Omit to keep the current selection.' },
      enabled: { type: 'boolean', description: 'Enable or disable wallpaper rendering.' },
      fit: { type: 'string', enum: ['cover', 'contain', 'stretch', 'center', 'tile'], description: 'Wallpaper fit mode.' },
      opacity: { type: 'number', description: 'Wallpaper opacity from 0 to 1.' },
      brightness: { type: 'number', description: 'Wallpaper brightness from 0 to 1.' },
      blurPx: { type: 'number', description: 'Blur radius from 0 to 40 pixels.' },
      overlayColor: { type: 'string', description: 'Overlay color as #RRGGBB.' },
      overlayOpacity: { type: 'number', description: 'Overlay opacity from 0 to 1.' },
      panelOpacity: { type: 'number', description: 'Harness panel opacity from 0 to 1.' },
      muted: { type: 'boolean', description: 'Mute video wallpaper audio.' },
      playbackRate: { type: 'number', description: 'Video playback speed from 0.25 to 2.' },
    },
    output: {
      schema: PRESENTATION_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: `Wallpaper settings applied: ${JSON.stringify(value)}` }],
    },
    async execute(args) {
      const patch: DisplayPatch = {}
      if (args.enabled !== undefined) patch.enabled = args.enabled
      if (args.fit !== undefined) patch.fit = args.fit
      if (args.opacity !== undefined) patch.opacity = args.opacity
      if (args.brightness !== undefined) patch.brightness = args.brightness
      if (args.blurPx !== undefined) patch.blurPx = args.blurPx
      if (args.overlayColor !== undefined) patch.overlayColor = args.overlayColor
      if (args.overlayOpacity !== undefined) patch.overlayOpacity = args.overlayOpacity
      if (args.panelOpacity !== undefined) patch.panelOpacity = args.panelOpacity
      if (args.muted !== undefined) patch.muted = args.muted
      if (args.playbackRate !== undefined) patch.playbackRate = args.playbackRate
      const state = await service.applyExisting(args.wallpaper_id, patch)
      const selectedId = state.presentation.selectedId
      if (selectedId === null) throw new Error('wallpaper selection disappeared while applying settings')
      return { ...state.presentation, selectedId }
    },
  })

  return [list, apply]
}

export interface ToolRegistry {
  register(definition: ToolDefinition): () => void
}

/** Register both tools and return one disposer. */
export function registerWallpaperTools(registry: ToolRegistry, service: WallpaperService): () => void {
  const disposers: Array<() => void> = []
  try {
    for (const definition of createWallpaperToolDefinitions(service)) disposers.push(registry.register(definition))
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }
  return () => { for (const dispose of disposers.reverse()) dispose() }
}
