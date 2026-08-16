import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

test('declares one bundle layer and one web client entry', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

  assert.deepEqual(pkg.dsh.bundle, { patch: './cordis.patch.yml' })
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.exports['./client'].default, './lib/client.js')
})

test('build emits host, client, and declaration artifacts', async () => {
  await Promise.all([
    access(new URL('../lib/index.js', import.meta.url)),
    access(new URL('../lib/client.js', import.meta.url)),
    access(new URL('../lib/types/index.d.ts', import.meta.url)),
    access(new URL('../lib/types/client/index.d.ts', import.meta.url)),
  ])
})
