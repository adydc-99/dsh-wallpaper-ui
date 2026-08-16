import { useRef, useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from 'react'
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { DisplayPatch, WallpaperFit, WallpaperMediaType, WallpaperRecord } from '../contracts.ts'
import type { WallpaperClientController } from './controller.ts'
import { wallpaperSource } from './renderer.tsx'

const ACCEPTED_FILES = '.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm'
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

export interface WallpaperSettingsInjected {
  controller: WallpaperClientController
}

export type WallpaperSettingsProps = Partial<WallpaperSettingsInjected & SettingsSectionOwnerProps>

function mediaLabel(type: WallpaperMediaType): string {
  return type.split('/')[1]?.toUpperCase() ?? type
}

function WallpaperCard(props: { record: WallpaperRecord; active: boolean; busy: boolean; controller: WallpaperClientController }) {
  const source = wallpaperSource(props.record)
  const remove = async (): Promise<void> => {
    if (globalThis.confirm?.(`删除壁纸“${props.record.name}”？`) === false) return
    await props.controller.remove(props.record.id)
  }
  return (
    <article className="dsh-wallpaper-card" data-active={props.active}>
      {props.record.mediaType.startsWith('video/')
        ? <video className="dsh-wallpaper-preview" src={source} muted playsInline preload="metadata" />
        : <img className="dsh-wallpaper-preview" src={source} alt="" loading="lazy" />}
      <div className="dsh-wallpaper-card-body">
        <div className="dsh-wallpaper-card-title"><strong title={props.record.name}>{props.record.name}</strong><span className="dsh-wallpaper-badge">{mediaLabel(props.record.mediaType)}</span></div>
        <div className="dsh-wallpaper-card-actions">
          <button className="dsh-wallpaper-button" type="button" aria-label={`${props.active ? '正在使用' : '启用'} ${props.record.name}`} data-primary={!props.active} disabled={props.busy || props.active} onClick={() => { void props.controller.activate(props.record.id).catch(() => undefined) }}>{props.active ? '使用中' : '启用'}</button>
          <button className="dsh-wallpaper-button" type="button" aria-label={`删除 ${props.record.name}`} data-danger="true" disabled={props.busy} onClick={() => { void remove().catch(() => undefined) }}>删除</button>
        </div>
      </div>
    </article>
  )
}

function RangeControl(props: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <label className="dsh-wallpaper-range">
      <span>{props.label}</span>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={event => { props.onChange(Number(event.target.value)) }} />
      <output>{props.value}{props.suffix ?? ''}</output>
    </label>
  )
}

/** DSH-native settings page for manual library management and presentation controls. */
export function WallpaperSettings(props: WallpaperSettingsProps) {
  const controller = props.controller
  if (controller === undefined) return <div className="dsh-wallpaper-status" data-error="true">壁纸服务未连接</div>
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [urlName, setUrlName] = useState('')
  const [urlType, setUrlType] = useState<WallpaperMediaType>('image/jpeg')
  const uploadInput = useRef<HTMLInputElement>(null)

  const perform = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true); setLocalError(null)
    try { await action() } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  const patch = (value: DisplayPatch): void => { void perform(() => controller.update(value)) }
  const upload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined) return
    if (file.size > MAX_UPLOAD_BYTES) { setLocalError('单个文件不能超过 100 MB'); return }
    void perform(() => controller.upload(file))
  }
  const addUrl = (event: FormEvent): void => {
    event.preventDefault()
    void perform(async () => {
      await controller.addUrl({ name: urlName.trim() || '网络壁纸', url: url.trim(), mediaType: urlType })
      setUrl(''); setUrlName('')
    })
  }

  const state = snapshot.state
  const p = state?.presentation
  const selected = state?.wallpapers.find(record => record.id === p?.selectedId)
  const selectedIsVideo = selected?.mediaType.startsWith('video/') === true
  const error = localError ?? snapshot.error
  return (
    <section className="dsh-wallpaper-page" aria-labelledby="dsh-wallpaper-title">
      <header className="dsh-wallpaper-heading"><div><h2 id="dsh-wallpaper-title">壁纸</h2><p className="dsh-wallpaper-muted">图片、GIF 与视频只改变 Web UI 外观，不会阻挡聊天操作。</p></div></header>
      {snapshot.status === 'loading' && <div className="dsh-wallpaper-status">正在载入壁纸配置…</div>}
      {error !== null && <div className="dsh-wallpaper-status" data-error="true" role="alert">{error}</div>}

      <div className="dsh-wallpaper-source-grid">
        <div className="dsh-wallpaper-source"><h3>上传本地文件</h3><p className="dsh-wallpaper-muted">JPG、PNG、WebP、GIF、MP4 或 WebM，单文件最大 100 MB。</p><button className="dsh-wallpaper-button" type="button" data-primary="true" disabled={busy} onClick={() => { uploadInput.current?.click() }}>选择文件</button><input ref={uploadInput} hidden type="file" accept={ACCEPTED_FILES} disabled={busy} onChange={upload} /></div>
        <form className="dsh-wallpaper-source" onSubmit={addUrl}><h3>添加网络 URL</h3><p className="dsh-wallpaper-muted">保存后浏览器会直接访问该地址，远程站点可能看到你的 IP 地址与浏览器信息。</p><div className="dsh-wallpaper-source-row"><label className="dsh-wallpaper-field">名称（可选）<input className="dsh-wallpaper-input" value={urlName} onChange={event => { setUrlName(event.target.value) }} /></label><label className="dsh-wallpaper-field">格式<select className="dsh-wallpaper-select" value={urlType} onChange={event => { setUrlType(event.target.value as WallpaperMediaType) }}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option><option value="image/gif">GIF</option><option value="video/mp4">MP4</option><option value="video/webm">WebM</option></select></label></div><div className="dsh-wallpaper-source-row"><label className="dsh-wallpaper-field">HTTP(S) 地址<input className="dsh-wallpaper-input" type="url" required placeholder="https://…" value={url} onChange={event => { setUrl(event.target.value) }} /></label><button className="dsh-wallpaper-button" data-primary="true" disabled={busy || url.trim() === ''}>添加</button></div></form>
      </div>

      <div className="dsh-wallpaper-group"><h3>壁纸库</h3>{state === null || state.wallpapers.length === 0 ? <div className="dsh-wallpaper-empty">尚未添加壁纸</div> : <div className="dsh-wallpaper-library">{state.wallpapers.map(record => <WallpaperCard key={record.id} record={record} active={p?.enabled === true && p.selectedId === record.id} busy={busy} controller={controller} />)}</div>}</div>

      {p !== undefined && <div className="dsh-wallpaper-group"><h3>显示调节</h3><div className="dsh-wallpaper-controls">
        <label className="dsh-wallpaper-switch"><input type="checkbox" checked={p.enabled} disabled={p.selectedId === null || busy} onChange={event => { patch({ enabled: event.target.checked }) }} />显示壁纸</label>
        <label className="dsh-wallpaper-field">显示方式<select className="dsh-wallpaper-select" value={p.fit} onChange={event => { patch({ fit: event.target.value as WallpaperFit }) }}><option value="cover">覆盖</option><option value="contain">包含</option><option value="stretch">拉伸</option><option value="center">居中</option><option value="tile">平铺</option></select></label>
        <RangeControl label="背景透明度" value={p.opacity} min={0} max={1} step={0.05} onChange={value => { patch({ opacity: value }) }} />
        <RangeControl label="亮度" value={p.brightness} min={0} max={1} step={0.05} onChange={value => { patch({ brightness: value }) }} />
        <RangeControl label="模糊度" value={p.blurPx} min={0} max={40} step={1} suffix="px" onChange={value => { patch({ blurPx: value }) }} />
        <RangeControl label="遮罩透明度" value={p.overlayOpacity} min={0} max={1} step={0.05} onChange={value => { patch({ overlayOpacity: value }) }} />
        <label className="dsh-wallpaper-field">遮罩颜色<input className="dsh-wallpaper-color" type="color" value={p.overlayColor} onChange={event => { patch({ overlayColor: event.target.value }) }} /></label>
        <RangeControl label="面板透明度" value={p.panelOpacity} min={0} max={1} step={0.05} onChange={value => { patch({ panelOpacity: value }) }} />
        {selectedIsVideo && <>
          <label className="dsh-wallpaper-switch"><input type="checkbox" checked={p.muted} onChange={event => { patch({ muted: event.target.checked }) }} />视频静音</label>
          <RangeControl label="播放速度" value={p.playbackRate} min={0.25} max={2} step={0.25} suffix="×" onChange={value => { patch({ playbackRate: value }) }} />
        </>}
        <button className="dsh-wallpaper-button" disabled={busy} onClick={() => { void perform(() => controller.reset()) }}>恢复默认显示</button>
      </div></div>}
    </section>
  )
}
