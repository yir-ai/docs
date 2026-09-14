import { createHash } from 'node:crypto'
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readlink,
  readdir,
  rename,
  rm,
  stat,
  symlink,
} from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)

const expectedManifest = {
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

const requiredFiles = [
  '.yir-docs-release.json',
  'docs/index.html',
  'docs/sitemap.xml',
  'docs/blume-search.json',
  'zh/docs/index.html',
]

export async function verifyArtifact(artifactPath) {
  const artifactRoot = requireAbsolutePath(artifactPath, 'artifact')
  await assertPlainDirectory(artifactRoot, 'Docs artifact')

  const rootEntries = (await readdir(artifactRoot)).sort()
  assertJsonEqual(
    rootEntries,
    ['.yir-docs-release.json', 'docs', 'zh'],
    'Docs artifact root entries do not match the release contract',
  )

  const zhEntries = (await readdir(path.join(artifactRoot, 'zh'))).sort()
  assertJsonEqual(
    zhEntries,
    ['docs'],
    'Docs artifact zh namespace contains unexpected entries',
  )

  const manifest = JSON.parse(
    await readFile(path.join(artifactRoot, '.yir-docs-release.json'), 'utf8'),
  )
  assertJsonEqual(
    manifest,
    expectedManifest,
    'Docs release manifest does not match the Origin mount contract',
  )

  for (const relativePath of requiredFiles) {
    const info = await stat(path.join(artifactRoot, relativePath)).catch(() => null)
    if (!info?.isFile()) {
      throw new Error(`Docs artifact is missing required file: ${relativePath}`)
    }
  }

  await assertPlainDirectory(
    path.join(artifactRoot, 'docs', '_astro'),
    'Docs immutable asset directory',
  )
  const digest = await hashArtifactTree(artifactRoot)

  return { artifactRoot, digest, manifest }
}

export async function installRelease({ artifactPath, releaseRoot, releaseId }) {
  const root = requireAbsolutePath(releaseRoot, 'release root')
  const id = validateReleaseId(releaseId)
  const artifact = await verifyArtifact(artifactPath)
  const releasesRoot = path.join(root, 'releases')
  const releaseDirectory = path.join(releasesRoot, id)

  await mkdir(releasesRoot, { recursive: true })
  await assertPlainDirectory(root, 'Docs release root')
  await assertPlainDirectory(releasesRoot, 'Docs releases directory')

  const existing = await lstat(releaseDirectory).catch(() => null)
  if (existing) {
    await assertPlainDirectory(releaseDirectory, `Docs release ${id}`)
    const installed = await verifyArtifact(releaseDirectory)
    if (installed.digest !== artifact.digest) {
      throw new Error(
        `Release ${id} already exists with different artifact content`,
      )
    }
  } else {
    const stagingDirectory = path.join(
      releasesRoot,
      `.${id}.staging-${process.pid}-${Date.now()}`,
    )
    try {
      await cp(artifact.artifactRoot, stagingDirectory, {
        recursive: true,
        force: false,
        errorOnExist: true,
      })
      const staged = await verifyArtifact(stagingDirectory)
      if (staged.digest !== artifact.digest) {
        throw new Error('Staged Docs artifact digest changed during copy')
      }
      await rename(stagingDirectory, releaseDirectory)
    } finally {
      await rm(stagingDirectory, { recursive: true, force: true })
    }
  }

  const current = await readPointer(root, 'current')
  if (current?.releaseId === id) {
    return statusRelease({ releaseRoot: root })
  }

  if (current) {
    await replacePointer(root, 'previous', current.releaseId)
  }
  await replacePointer(root, 'current', id)

  return statusRelease({ releaseRoot: root })
}

export async function rollbackRelease({ releaseRoot, releaseId }) {
  const root = requireAbsolutePath(releaseRoot, 'release root')
  const current = await readPointer(root, 'current')
  if (!current) {
    throw new Error('Cannot roll back because the current pointer is missing')
  }

  const requestedId = releaseId
    ? validateReleaseId(releaseId)
    : (await readPointer(root, 'previous'))?.releaseId
  if (!requestedId) {
    throw new Error('Cannot roll back because the previous pointer is missing')
  }
  if (requestedId === current.releaseId) {
    return statusRelease({ releaseRoot: root })
  }

  await verifyArtifact(path.join(root, 'releases', requestedId))
  await replacePointer(root, 'previous', current.releaseId)
  await replacePointer(root, 'current', requestedId)

  return statusRelease({ releaseRoot: root })
}

export async function statusRelease({ releaseRoot }) {
  const root = requireAbsolutePath(releaseRoot, 'release root')
  await assertPlainDirectory(root, 'Docs release root')
  return {
    release_root: root,
    current: (await readPointer(root, 'current'))?.releaseId ?? null,
    previous: (await readPointer(root, 'previous'))?.releaseId ?? null,
  }
}

async function replacePointer(root, pointerName, releaseId) {
  const releaseDirectory = path.join(root, 'releases', releaseId)
  await verifyArtifact(releaseDirectory)

  const pointerPath = path.join(root, pointerName)
  const existing = await lstat(pointerPath).catch(() => null)
  if (existing && !existing.isSymbolicLink()) {
    throw new Error(`${pointerName} exists but is not a symbolic link`)
  }

  const temporaryPointer = path.join(
    root,
    `.${pointerName}.${process.pid}-${Date.now()}.tmp`,
  )
  const relativeTarget = path.join('releases', releaseId)

  try {
    await symlink(
      process.platform === 'win32' ? releaseDirectory : relativeTarget,
      temporaryPointer,
      'dir',
    )
    await rename(temporaryPointer, pointerPath)
  } finally {
    await rm(temporaryPointer, { force: true })
  }
}

async function readPointer(root, pointerName) {
  const pointerPath = path.join(root, pointerName)
  const info = await lstat(pointerPath).catch(() => null)
  if (!info) return null
  if (!info.isSymbolicLink()) {
    throw new Error(`${pointerName} exists but is not a symbolic link`)
  }

  const rawTarget = await readlink(pointerPath)
  const absoluteTarget = path.resolve(root, rawTarget)
  const releasesRoot = path.join(root, 'releases')
  const relativeTarget = path.relative(releasesRoot, absoluteTarget)
  if (
    relativeTarget === '' ||
    relativeTarget.startsWith('..') ||
    path.isAbsolute(relativeTarget) ||
    relativeTarget.includes(path.sep)
  ) {
    throw new Error(`${pointerName} points outside the direct releases directory`)
  }

  const releaseId = validateReleaseId(relativeTarget)
  await verifyArtifact(absoluteTarget)
  return { releaseId, absoluteTarget }
}

async function hashArtifactTree(root) {
  const files = []
  await collectFiles(root, root, files)
  files.sort((left, right) => left.localeCompare(right, 'en'))

  const hash = createHash('sha256')
  for (const relativePath of files) {
    hash.update(relativePath.replaceAll(path.sep, '/'))
    hash.update('\0')
    hash.update(await readFile(path.join(root, relativePath)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

async function collectFiles(root, directory, files) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Docs artifact must not contain symbolic links: ${path.relative(root, entryPath)}`,
      )
    }
    if (entry.isDirectory()) {
      await collectFiles(root, entryPath, files)
    } else if (entry.isFile()) {
      files.push(path.relative(root, entryPath))
    } else {
      throw new Error(
        `Docs artifact contains unsupported entry: ${path.relative(root, entryPath)}`,
      )
    }
  }
}

async function assertPlainDirectory(directory, label) {
  const info = await lstat(directory).catch(() => null)
  if (!info?.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory: ${directory}`)
  }
}

function requireAbsolutePath(value, label) {
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`${label} must be an absolute path`)
  }
  return path.resolve(value)
}

function validateReleaseId(value) {
  if (
    !value ||
    value === '.' ||
    value === '..' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)
  ) {
    throw new Error(
      'release id must be 1-128 safe filename characters and start with a letter or digit',
    )
  }
  return value
}

function assertJsonEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message)
  }
}

async function runCli() {
  const action = process.argv[2]
  if (!['verify', 'install', 'rollback', 'status'].includes(action)) {
    throw new Error('usage: origin-release.mjs <verify|install|rollback|status> [options]')
  }

  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      artifact: { type: 'string' },
      'release-id': { type: 'string' },
      'release-root': { type: 'string', default: '/srv/yir/docs' },
    },
    strict: true,
  })

  let result
  if (action === 'verify') {
    result = await verifyArtifact(resolveCliPath(values.artifact, 'artifact'))
    result = {
      artifact_root: result.artifactRoot,
      artifact_sha256: result.digest,
    }
  } else if (action === 'install') {
    result = await installRelease({
      artifactPath: resolveCliPath(values.artifact, 'artifact'),
      releaseRoot: resolveCliPath(values['release-root'], 'release root'),
      releaseId: values['release-id'],
    })
  } else if (action === 'rollback') {
    result = await rollbackRelease({
      releaseRoot: resolveCliPath(values['release-root'], 'release root'),
      releaseId: values['release-id'],
    })
  } else {
    result = await statusRelease({
      releaseRoot: resolveCliPath(values['release-root'], 'release root'),
    })
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

function resolveCliPath(value, label) {
  if (!value) throw new Error(`${label} is required`)
  return path.resolve(value)
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
