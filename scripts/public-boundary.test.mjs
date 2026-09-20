import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { assertPublicPath, assertPublicContent, checkRepository, checkArtifact } from './check-public-boundary.mjs'

test('rejects operations, arbitrary scripts and secret files', () => {
  for (const file of ['deploy/site.conf', 'scripts/install.mjs', '.env', 'docs/.env', '.github/workflows/deploy.yml']) {
    assert.throws(() => assertPublicPath(file))
  }
  for (const file of ['README.md', 'docs/index.mdx', 'scripts/prepare-site.mjs', 'openapi/model-contracts.json']) assertPublicPath(file)
})

test('scans content independent of file type without exposing the matched value', () => {
  const secret = ['ghp', '_', 'a'.repeat(30)].join('')
  for (const file of ['README.md', 'scripts/prepare-site.mjs', '.github/workflows/ci.yml']) {
    assert.throws(() => assertPublicContent(secret, file), error => !error.message.includes(secret))
  }
  assert.throws(() => assertPublicContent('/' + ['x', 'api'].join('-') + '/users', 'contract.json'))
  assertPublicContent('Vercel AI SDK; Authorization: Bearer $YIR_API_KEY', 'example.mdx')
})

async function fixture(t) {
  const scratch = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.tmp', 'scratch')
  await mkdir(scratch, { recursive: true })
  const directory = await mkdtemp(path.join(scratch, 'public-boundary-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

test('checks tracked and newly added files, including workflow content', async t => {
  const directory = await fixture(t)
  execFileSync('git', ['init', '-q', directory])
  await writeFile(path.join(directory, 'README.md'), 'Public documentation')
  execFileSync('git', ['-C', directory, 'add', 'README.md'])
  await checkRepository(directory)
  await mkdir(path.join(directory, '.github', 'workflows'), { recursive: true })
  await writeFile(path.join(directory, '.github', 'workflows', 'ci.yml'), ['ghp', '_', 'b'.repeat(30)].join(''))
  await assert.rejects(checkRepository(directory), /Non-public content/)
})

test('rejects hidden or operational files in a static artifact', async t => {
  const directory = await fixture(t)
  await mkdir(path.join(directory, 'docs'), { recursive: true })
  await mkdir(path.join(directory, 'zh', 'docs'), { recursive: true })
  await writeFile(path.join(directory, 'docs', 'index.html'), '<p>Public</p>')
  await checkArtifact(directory)
  await writeFile(path.join(directory, 'docs', '.env'), 'private')
  await assert.rejects(checkArtifact(directory), /Non-public artifact/)
})
