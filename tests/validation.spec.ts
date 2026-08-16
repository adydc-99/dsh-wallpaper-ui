import { describe, expect, it } from 'vitest'
import { DEFAULT_PRESENTATION, createDefaultState } from '../src/contracts.ts'
import {
  parseState,
  validateDisplayPatch,
  validateRemoteUrl,
  validateUploadHeader,
} from '../src/validation.ts'

const signatures = {
  jpeg: Buffer.from('ffd8ffe000104a46494600010100000100010000ffdb', 'hex'),
  png: Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'),
  webp: Buffer.from('524946461a00000057454250565038200e0000002f00000010071011118888fe0700', 'hex'),
  gif: Buffer.from('47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b', 'hex'),
  mp4: Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex'),
  webm: Buffer.from('1a45dfa39f4286810142f7810142f2810442f381084282847765626d', 'hex'),
}

describe('upload validation', () => {
  it.each([
    ['photo.jpg', 'image/jpeg', signatures.jpeg, 'image/jpeg', '.jpg'],
    ['photo.jpeg', 'image/jpeg', signatures.jpeg, 'image/jpeg', '.jpg'],
    ['picture.png', 'image/png', signatures.png, 'image/png', '.png'],
    ['still.webp', 'image/webp', signatures.webp, 'image/webp', '.webp'],
    ['motion.gif', 'image/gif', signatures.gif, 'image/gif', '.gif'],
    ['movie.mp4', 'video/mp4', signatures.mp4, 'video/mp4', '.mp4'],
    ['movie.webm', 'video/webm', signatures.webm, 'video/webm', '.webm'],
  ])('admits matching %s extension, MIME, and signature', async (name, declaredMime, bytes, mime, extension) => {
    await expect(validateUploadHeader({ name, declaredMime, bytes })).resolves.toEqual({ mime, extension })
  })

  it('rejects a PNG renamed to JavaScript', async () => {
    await expect(validateUploadHeader({
      name: 'payload.js',
      declaredMime: 'image/png',
      bytes: signatures.png,
    })).rejects.toThrow(/extension/i)
  })

  it('rejects a declared JPEG containing a PNG signature', async () => {
    await expect(validateUploadHeader({
      name: 'payload.jpg',
      declaredMime: 'image/jpeg',
      bytes: signatures.png,
    })).rejects.toThrow(/signature/i)
  })
})

describe('remote URL validation', () => {
  it.each(['https://example.test/a.webp', 'http://127.0.0.1:9000/video'])('accepts %s', (value) => {
    expect(validateRemoteUrl(value)).toBe(value)
  })

  it.each(['file:///tmp/a.png', 'javascript:alert(1)', 'data:image/png;base64,x', 'ftp://example.test/a.png'])('rejects %s', (value) => {
    expect(() => validateRemoteUrl(value)).toThrow(/http/i)
  })
})

describe('presentation validation', () => {
  it('accepts a bounded partial display patch', () => {
    expect(validateDisplayPatch({
      enabled: true,
      fit: 'contain',
      opacity: 0.4,
      brightness: 0.8,
      blurPx: 12,
      overlayColor: '#112233',
      overlayOpacity: 0.2,
      panelOpacity: 0.75,
      muted: false,
      playbackRate: 1.25,
    })).toEqual(expect.objectContaining({ fit: 'contain', playbackRate: 1.25 }))
  })

  it.each([
    [{ opacity: 1.1 }, /opacity/i],
    [{ brightness: -0.1 }, /brightness/i],
    [{ blurPx: 41 }, /blur/i],
    [{ playbackRate: 2.1 }, /playback/i],
    [{ fit: 'zoom' }, /fit/i],
    [{ overlayColor: 'red' }, /overlayColor/i],
    [{ delete: true }, /unknown/i],
  ])('rejects invalid patch %j', (patch, message) => {
    expect(() => validateDisplayPatch(patch)).toThrow(message)
  })
})

describe('durable state parsing', () => {
  it('creates safe defaults', () => {
    expect(createDefaultState()).toEqual({
      version: 1,
      revision: 0,
      wallpapers: [],
      presentation: DEFAULT_PRESENTATION,
    })
  })

  it('migrates a version-zero presentation by filling current defaults', () => {
    const parsed = parseState({
      version: 0,
      wallpapers: [],
      presentation: { enabled: true, opacity: 0.5 },
    })
    expect(parsed).toEqual({
      version: 1,
      revision: 0,
      wallpapers: [],
      presentation: { ...DEFAULT_PRESENTATION, enabled: true, opacity: 0.5 },
    })
  })

  it('rejects a record that contains an absolute upload path', () => {
    expect(() => parseState({
      version: 1,
      revision: 1,
      wallpapers: [{
        id: 'one',
        name: 'unsafe',
        source: 'upload',
        relativePath: 'C:\\outside.png',
        mediaType: 'image/png',
        createdAt: '2026-08-16T00:00:00.000Z',
      }],
      presentation: DEFAULT_PRESENTATION,
    })).toThrow(/relative/i)
  })
})
