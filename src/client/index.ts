import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** Client services required by the final settings and renderer contributions. */
export const inject: string[] = []

/** Activate the browser half. */
export function apply(_ctx: ClientContext): void {}
