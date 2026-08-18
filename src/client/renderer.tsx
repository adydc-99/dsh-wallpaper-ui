import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { PresentationSettings, WallpaperFit, WallpaperMediaType, WallpaperRecord, WallpaperState } from '../contracts.ts'
import type { WallpaperClientController } from './controller.ts'

export function wallpaperSource(record: WallpaperRecord): string {
  return record.source === 'url' ? record.url : `/dsh-wallpaper/media/${encodeURIComponent(record.id)}`
}

export function fitBackgroundStyle(fit: WallpaperFit): CSSProperties {
  const common: CSSProperties = { backgroundPosition: 'center' }
  switch (fit) {
    case 'cover': return { ...common, backgroundSize: 'cover', backgroundRepeat: 'no-repeat' }
    case 'contain': return { ...common, backgroundSize: 'contain', backgroundRepeat: 'no-repeat' }
    case 'stretch': return { ...common, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }
    case 'center': return { ...common, backgroundSize: 'auto', backgroundRepeat: 'no-repeat' }
    case 'tile': return { ...common, backgroundSize: 'auto', backgroundRepeat: 'repeat' }
  }
}

function videoFit(fit: WallpaperFit): CSSProperties['objectFit'] {
  if (fit === 'stretch') return 'fill'
  if (fit === 'center' || fit === 'tile') return 'none'
  return fit
}

export function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(query).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(query)
    const changed = (event: MediaQueryListEvent): void => { setReduced(event.matches) }
    media.addEventListener('change', changed)
    setReduced(media.matches)
    return () => { media.removeEventListener('change', changed) }
  }, [])
  return reduced
}

function ImageWallpaper(props: {
  source: string
  mediaType: WallpaperMediaType
  fit: WallpaperFit
  onMediaError: (mediaType: WallpaperMediaType) => void
}) {
  useEffect(() => {
    if (props.fit !== 'tile') return
    const probe = new Image()
    probe.onerror = () => { props.onMediaError(props.mediaType) }
    probe.src = props.source
    return () => { probe.onerror = null; probe.src = '' }
  }, [props.fit, props.mediaType, props.onMediaError, props.source])
  if (props.fit === 'tile') {
    return <div style={{ width: '100%', height: '100%', backgroundImage: `url(${JSON.stringify(props.source)})`, ...fitBackgroundStyle('tile') }} />
  }
  return (
    <img
      src={props.source}
      alt=""
      onError={() => { props.onMediaError(props.mediaType) }}
      style={{ width: '100%', height: '100%', objectFit: videoFit(props.fit), objectPosition: 'center' }}
    />
  )
}

function VideoWallpaper(props: {
  source: string
  mediaType: WallpaperMediaType
  presentation: PresentationSettings
  reduceMotion: boolean
  onMediaError: (mediaType: WallpaperMediaType) => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const previousReducedMotion = useRef(props.reduceMotion)
  useEffect(() => {
    if (ref.current !== null) ref.current.playbackRate = props.presentation.playbackRate
  }, [props.presentation.playbackRate])
  useEffect(() => {
    if (ref.current === null || previousReducedMotion.current === props.reduceMotion) return
    previousReducedMotion.current = props.reduceMotion
    if (props.reduceMotion) ref.current.pause()
    else {
      const playback = ref.current.play()
      if (playback !== undefined) void playback.catch(() => undefined)
    }
  }, [props.reduceMotion])
  return (
    <video
      ref={ref}
      src={props.source}
      autoPlay={!props.reduceMotion}
      loop
      playsInline
      muted={props.presentation.muted}
      data-playback-rate={props.presentation.playbackRate}
      onError={() => { props.onMediaError(props.mediaType) }}
      style={{ width: '100%', height: '100%', objectFit: videoFit(props.presentation.fit), objectPosition: 'center' }}
    />
  )
}

/** Pure visual surface rendered into the document-owned bottom layer. */
export function WallpaperSurface(props: { state: WallpaperState; onMediaError: (mediaType: WallpaperMediaType) => void }) {
  const reduceMotion = useReducedMotion()
  const { presentation } = props.state
  if (!presentation.enabled || presentation.selectedId === null) return null
  const record = props.state.wallpapers.find(item => item.id === presentation.selectedId)
  if (record === undefined) return null
  const source = wallpaperSource(record)
  const mediaStyle: CSSProperties = {
    position: 'absolute',
    inset: presentation.blurPx > 0 ? `-${String(presentation.blurPx * 2)}px` : 0,
    filter: `brightness(${String(presentation.brightness)}) blur(${String(presentation.blurPx)}px)`,
    opacity: presentation.opacity,
  }
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div style={mediaStyle}>
        {record.mediaType.startsWith('video/')
          ? <VideoWallpaper source={source} mediaType={record.mediaType} presentation={presentation} reduceMotion={reduceMotion} onMediaError={props.onMediaError} />
          : reduceMotion && record.mediaType === 'image/gif'
            ? <div data-reduced-motion-fallback="true" style={{ width: '100%', height: '100%' }} />
            : <ImageWallpaper source={source} mediaType={record.mediaType} fit={presentation.fit} onMediaError={props.onMediaError} />}
      </div>
      <div style={{ position: 'absolute', inset: 0, background: presentation.overlayColor, opacity: presentation.overlayOpacity }} />
    </div>
  )
}

export interface InstalledWallpaperLayer {
  element: HTMLElement
  dispose(): void
}

/** Create one document-bottom portal target and restore all touched DOM state on unload. */
export function installWallpaperDocumentLayer(doc: Document): InstalledWallpaperLayer {
  const element = doc.createElement('div')
  element.dataset.dshWallpaperLayer = 'true'
  element.setAttribute('aria-hidden', 'true')
  Object.assign(element.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '0',
    pointerEvents: 'none',
    overflow: 'hidden',
  })
  doc.body.insertBefore(element, doc.body.firstChild)
  const root = doc.querySelector<HTMLElement>('#root')
  const previous = root === null ? null : {
    position: root.style.position,
    zIndex: root.style.zIndex,
    backgroundColor: root.style.backgroundColor,
  }
  if (root !== null) {
    root.style.position = 'relative'
    root.style.zIndex = '1'
    root.style.backgroundColor = 'transparent'
  }
  return {
    element,
    dispose() {
      element.remove()
      if (root !== null && previous !== null) {
        root.style.position = previous.position
        root.style.zIndex = previous.zIndex
        root.style.backgroundColor = previous.backgroundColor
      }
    },
  }
}

export function panelThemeTokens(opacity: number): ThemeTokenOverrides {
  const alpha = Math.max(0, Math.min(1, opacity))
  return {
    '--dsw-alias-bg-base': { light: `rgba(248, 249, 251, ${String(alpha)})`, dark: `rgba(16, 16, 18, ${String(alpha)})` },
    '--dsw-alias-bg-layer-1': { light: `rgba(255, 255, 255, ${String(alpha)})`, dark: `rgba(22, 22, 24, ${String(alpha)})` },
    '--dsw-alias-bg-layer-2': { light: `rgba(248, 249, 251, ${String(alpha)})`, dark: `rgba(28, 28, 31, ${String(alpha)})` },
    '--dsw-specific-sidebar-fill': { light: `rgba(248, 249, 251, ${String(alpha)})`, dark: `rgba(16, 16, 18, ${String(alpha)})` },
  }
}

/** Shell-overlay occupant whose visible content is portalled below the app root. */
export function WallpaperPortal(props: { controller: WallpaperClientController; target: HTMLElement }) {
  const snapshot = useSyncExternalStore(props.controller.subscribe, props.controller.getSnapshot, props.controller.getSnapshot)
  if (snapshot.state === null) return null
  return createPortal(
    <WallpaperSurface state={snapshot.state} onMediaError={mediaType => { void props.controller.handleMediaError(mediaType).catch(() => undefined) }} />,
    props.target,
  )
}
