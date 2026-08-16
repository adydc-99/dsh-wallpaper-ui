import type { Context } from '@deepseek-ai/cordis'

/** Stable Cordis plugin name. */
export const name = 'dsh-wallpaper'

/** Host plugin configuration. */
export interface Config {
  /** Optional Harness-home override. */
  dshHome?: string
  /** Maximum accepted upload size in bytes. */
  uploadLimitBytes?: number
}

/** Activate the Host half. */
export function apply(_ctx: Context, _config: Config = {}): void {}
