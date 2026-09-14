import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  appendFile,
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import {
  installRelease,
  rollbackRelease,
  verifyArtifact,
} from './origin-release.mjs'

const execFileAsync = promisify(execFile)
const scriptPath = fileURLToPath(import.meta.url)
const scriptDirectory = path.dirname(scriptPath)
const docsRoot = path.resolve(scriptDirectory, '..')
const defaultNginxImage = 'nginx:1.28.3-alpine'
const releaseAMarker = '<!-- yir-origin-acceptance-release-a -->'
const releaseBMarker = '<!-- yir-origin-acceptance-release-b -->'

export function buildNginxHarnessConfig() {
  return `server {
  listen 8080;
  server_name yir.ai;

  include /etc/nginx/yir-docs-origin.conf;

  location / {
    default_type text/plain;
    return 200 "YIR_WEB_FALLBACK\\n";
  }
}
`
}

export function parsePublishedPort(output) {
  const line = output
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .find(Boolean)
  const match = line?.match(/127\.0\.0\.1:(\d+)$/u)
  if (!match) {
    throw new Error(`Unexpected Docker port output: ${output.trim()}`)
  }
  return Number.parseInt(match[1], 10)
}

export async function runOriginNginxSmoke({
  artifactPath = path.join(docsRoot, 'dist'),
  nginxImage = process.env.YIR_DOCS_NGINX_IMAGE || defaultNginxImage,
} = {}) {
  if (process.platform !== 'linux') {
    throw new Error('Origin Nginx smoke test requires Linux and Docker')
  }

  const sourceArtifact = path.resolve(artifactPath)
  const sourceBefore = await verifyArtifact(sourceArtifact)

  const workspace = await mkdtemp(path.join(tmpdir(), 'yir-docs-origin-smoke-'))
  const releaseRoot = path.join(workspace, 'origin')
  const artifactA = path.join(workspace, 'artifact-a')
  const artifactB = path.join(workspace, 'artifact-b')
  const harnessConfig = path.join(workspace, 'default.conf')
  const originConfig = path.join(
    docsRoot,
    'deploy',
    'nginx',
    'yir-docs-origin.conf',
  )
  const containerName = `yir-docs-origin-smoke-${process.pid}-${Date.now()}`
  let containerStarted = false

  try {
    await cp(sourceArtifact, artifactA, { recursive: true })
    await appendFile(
      path.join(artifactA, 'docs', 'index.html'),
      releaseAMarker,
      'utf8',
    )
    await installRelease({
      artifactPath: artifactA,
      releaseRoot,
      releaseId: 'acceptance-a',
    })

    await cp(sourceArtifact, artifactB, { recursive: true })
    await appendFile(
      path.join(artifactB, 'docs', 'index.html'),
      releaseBMarker,
      'utf8',
    )
    const installed = await installRelease({
      artifactPath: artifactB,
      releaseRoot,
      releaseId: 'acceptance-b',
    })
    assert.equal(installed.current, 'acceptance-b')
    assert.equal(installed.previous, 'acceptance-a')

    await writeFile(harnessConfig, buildNginxHarnessConfig(), 'utf8')
    const mounts = dockerMountArguments({
      releaseRoot,
      originConfig,
      harnessConfig,
    })

    await runDocker([
      'run',
      '--rm',
      '--entrypoint',
      'nginx',
      ...mounts,
      nginxImage,
      '-t',
    ])

    await runDocker([
      'run',
      '--rm',
      '-d',
      '--name',
      containerName,
      '-p',
      '127.0.0.1::8080',
      '--entrypoint',
      'nginx',
      ...mounts,
      nginxImage,
      '-g',
      'daemon off;',
    ])
    containerStarted = true

    const port = parsePublishedPort(
      await runDocker(['port', containerName, '8080/tcp']),
    )
    const baseUrl = `http://127.0.0.1:${port}`
    await waitForNginx(baseUrl, containerName)

    await assertRedirect(baseUrl, '/docs', '/docs/')
    await assertRedirect(baseUrl, '/zh/docs', '/zh/docs/')
    await assertStaticResponse(
      baseUrl,
      '/docs/',
      path.join(artifactB, 'docs', 'index.html'),
    )
    await assertStaticResponse(
      baseUrl,
      '/zh/docs/',
      path.join(artifactB, 'zh', 'docs', 'index.html'),
    )
    await assertImmutableAsset(baseUrl, artifactB)

    const missing = await fetch(`${baseUrl}/docs/not-a-real-page`)
    assert.equal(missing.status, 404)

    const webFallback = await fetch(`${baseUrl}/pricing`)
    assert.equal(webFallback.status, 200)
    assert.equal(await webFallback.text(), 'YIR_WEB_FALLBACK\n')

    const rolledBack = await rollbackRelease({ releaseRoot })
    assert.equal(rolledBack.current, 'acceptance-a')
    assert.equal(rolledBack.previous, 'acceptance-b')
    const rolledBackHtml = await fetch(`${baseUrl}/docs/`).then((response) =>
      response.text(),
    )
    assert.match(rolledBackHtml, new RegExp(releaseAMarker, 'u'))
    assert.doesNotMatch(rolledBackHtml, new RegExp(releaseBMarker, 'u'))

    const sourceAfter = await verifyArtifact(sourceArtifact)
    assert.equal(
      sourceAfter.digest,
      sourceBefore.digest,
      'Origin smoke test must not modify the uploadable dist artifact',
    )

    return {
      nginx_image: nginxImage,
      artifact_sha256: sourceAfter.digest,
      installed_release: installed.current,
      rolled_back_release: rolledBack.current,
      routes_verified: [
        '/docs',
        '/docs/',
        '/zh/docs',
        '/zh/docs/',
        '/docs/_astro/*',
        '/docs/not-a-real-page',
        '/pricing',
      ],
    }
  } finally {
    if (containerStarted) {
      await runDocker(['rm', '-f', containerName]).catch(() => undefined)
    }
    await rm(workspace, { recursive: true, force: true })
  }
}

function dockerMountArguments({ releaseRoot, originConfig, harnessConfig }) {
  return [
    '--mount',
    `type=bind,src=${releaseRoot},dst=/srv/yir/docs,readonly`,
    '--mount',
    `type=bind,src=${originConfig},dst=/etc/nginx/yir-docs-origin.conf,readonly`,
    '--mount',
    `type=bind,src=${harnessConfig},dst=/etc/nginx/conf.d/default.conf,readonly`,
  ]
}

async function runDocker(arguments_) {
  try {
    const result = await execFileAsync('docker', arguments_, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    })
    return result.stdout.trim()
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : ''
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : ''
    throw new Error(
      [`docker ${arguments_.join(' ')} failed`, stdout, stderr]
        .filter(Boolean)
        .join('\n'),
      { cause: error },
    )
  }
}

async function waitForNginx(baseUrl, containerName) {
  let lastError
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/pricing`)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  const logs = await runDocker(['logs', containerName]).catch(
    (error) => error.message,
  )
  throw new Error(`Nginx did not become ready\n${logs}`, { cause: lastError })
}

async function assertRedirect(baseUrl, requestPath, expectedPath) {
  const response = await fetch(`${baseUrl}${requestPath}`, {
    redirect: 'manual',
  })
  assert.equal(response.status, 308)
  const location = response.headers.get('location')
  assert.ok(location, `${requestPath} redirect is missing Location`)
  assert.equal(new URL(location, baseUrl).pathname, expectedPath)
}

async function assertStaticResponse(baseUrl, requestPath, filePath) {
  const [response, expected] = await Promise.all([
    fetch(`${baseUrl}${requestPath}`),
    readFile(filePath),
  ])
  assert.equal(response.status, 200)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected)
  assert.equal(
    response.headers.get('cache-control'),
    'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
  )
}

async function assertImmutableAsset(baseUrl, artifactRoot) {
  const assetRoot = path.join(artifactRoot, 'docs', '_astro')
  const relativeAsset = await findFirstFile(assetRoot)
  const [response, expected] = await Promise.all([
    fetch(`${baseUrl}/docs/_astro/${relativeAsset.replaceAll(path.sep, '/')}`),
    readFile(path.join(assetRoot, relativeAsset)),
  ])
  assert.equal(response.status, 200)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected)
  assert.equal(
    response.headers.get('cache-control'),
    'public, max-age=31536000, immutable',
  )
}

async function findFirstFile(directory, relativeDirectory = '') {
  const entries = await readdir(path.join(directory, relativeDirectory), {
    withFileTypes: true,
  })
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name)
    if (entry.isDirectory()) {
      const nested = await findFirstFile(directory, relativePath).catch(
        () => null,
      )
      if (nested) return nested
    } else if (entry.isFile()) {
      return relativePath
    }
  }
  throw new Error(`No immutable asset found under ${directory}`)
}

async function runCli() {
  const result = await runOriginNginxSmoke()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
