import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readlink,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  installRelease,
  rollbackRelease,
  verifyArtifact,
} from './origin-release.mjs'

const manifest = {
  schema_version: 1,
  site: 'https://yir.ai',
  mounts: [
    { url_prefix: '/docs', artifact_path: 'docs' },
    { url_prefix: '/zh/docs', artifact_path: 'zh/docs' },
  ],
  shared_assets: {
    url_prefix: '/docs/_astro',
    artifact_path: 'docs/_astro',
    cache_control: 'public, max-age=31536000, immutable',
  },
  sitemap: '/docs/sitemap.xml',
}

test('verifies the exact primary-origin artifact contract', async (t) => {
  const root = await createFixture(t, 'first')
  const result = await verifyArtifact(root)

  assert.match(result.digest, /^[a-f0-9]{64}$/u)
  assert.deepEqual(result.manifest, manifest)
})

test('rejects unexpected artifact root entries', async (t) => {
  const root = await createFixture(t, 'unexpected')
  await writeFile(path.join(root, 'index.html'), 'must not shadow yir-web', 'utf8')

  await assert.rejects(
    verifyArtifact(root),
    /root entries do not match the release contract/u,
  )
})

test(
  'installs immutable releases and swaps current and previous during rollback',
  { skip: process.platform === 'win32' ? 'POSIX symlink replacement is verified in CI' : false },
  async (t) => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'yir-docs-release-'))
    t.after(() => rm(workspace, { recursive: true, force: true }))
    const releaseRoot = path.join(workspace, 'origin')
    const first = await createFixture(t, 'first')
    const second = await createFixture(t, 'second')

    await installRelease({
      artifactPath: first,
      releaseRoot,
      releaseId: 'release-1',
    })
    const installed = await installRelease({
      artifactPath: second,
      releaseRoot,
      releaseId: 'release-2',
    })

    assert.equal(installed.current, 'release-2')
    assert.equal(installed.previous, 'release-1')
    assert.equal(await readlink(path.join(releaseRoot, 'current')), path.join('releases', 'release-2'))

    const rolledBack = await rollbackRelease({ releaseRoot })
    assert.equal(rolledBack.current, 'release-1')
    assert.equal(rolledBack.previous, 'release-2')
  },
)

test(
  'does not overwrite an existing release id with different content',
  { skip: process.platform === 'win32' ? 'POSIX symlink replacement is verified in CI' : false },
  async (t) => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'yir-docs-release-'))
    t.after(() => rm(workspace, { recursive: true, force: true }))
    const releaseRoot = path.join(workspace, 'origin')
    const first = await createFixture(t, 'first')
    const second = await createFixture(t, 'second')

    await installRelease({
      artifactPath: first,
      releaseRoot,
      releaseId: 'stable-id',
    })
    await assert.rejects(
      installRelease({
        artifactPath: second,
        releaseRoot,
        releaseId: 'stable-id',
      }),
      /already exists with different artifact content/u,
    )
  },
)

async function createFixture(t, marker) {
  const root = await mkdtemp(path.join(tmpdir(), 'yir-docs-artifact-'))
  t.after(() => rm(root, { recursive: true, force: true }))

  await mkdir(path.join(root, 'docs', '_astro'), { recursive: true })
  await mkdir(path.join(root, 'zh', 'docs'), { recursive: true })
  await Promise.all([
    writeFile(
      path.join(root, '.yir-docs-release.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    ),
    writeFile(path.join(root, 'docs', 'index.html'), `English ${marker}`, 'utf8'),
    writeFile(path.join(root, 'docs', 'sitemap.xml'), '<urlset />', 'utf8'),
    writeFile(path.join(root, 'docs', 'blume-search.json'), '[]', 'utf8'),
    writeFile(path.join(root, 'docs', '_astro', 'app.hash.js'), marker, 'utf8'),
    writeFile(path.join(root, 'zh', 'docs', 'index.html'), `Chinese ${marker}`, 'utf8'),
  ])

  return root
}
