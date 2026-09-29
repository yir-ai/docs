import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const docsRoot = path.resolve(scriptDirectory, '..')
const publicOpenApiPath = path.join(docsRoot, 'openapi', 'gateway-openapi.json')
const publicModelContractsPath = path.join(
  docsRoot,
  'openapi',
  'model-contracts.json',
)
const referenceOpenApiPath = path.join(
  docsRoot,
  'openapi',
  'gateway-openapi.reference.json',
)
const pnpmCommand =
  process.platform === 'win32'
    ? {
        executable: 'powershell',
        prefix: [
          '-NoProfile',
          '-File',
          path.join(process.env.PNPM_HOME ?? '', 'pnpm.ps1'),
        ],
      }
    : { executable: 'pnpm', prefix: [] }

const requiredPages = [
  'index',
  'getting-started/authentication',
  'getting-started/quickstart',
  'console/playground',
  'console/routing',
  'console/api-keys',
  'console/logs',
  'console/alerts',
  'guides/production-integration',
  'guides/image-generation',
  'guides/video-generation',
  'guides/input-files',
  'guides/models',
  'guides/webhooks',
  'guides/clients',
  'guides/vercel-ai-sdk',
  'concepts/task-lifecycle',
  'concepts/providers',
  'concepts/routing',
  'concepts/billing',
  'support/error-codes',
  'support/troubleshooting',
]

const reviewedOperations = [
  'POST /v1/images/quotes',
  'POST /v1/images/generations',
  'POST /v1/videos/quotes',
  'POST /v1/videos/generations',
  'POST /v1/files',
  'POST /v1/files/{id}/complete',
  'GET /v1/files/{id}',
  'GET /v1/files/{id}/content',
  'GET /v1/models',
  'GET /v1/models/{creator}/{model}',
  'POST /v1/quotes',
  'GET /v1/jobs/{id}',
  'GET /v1/jobs/{id}/status',
  'POST /v1/jobs/{id}/cancel',
]

test('defines repo-owned English and Simplified Chinese Blume pages', async () => {
  for (const page of requiredPages) {
    await assertPageHasFrontmatter(path.join(docsRoot, 'docs', `${page}.mdx`))
    await assertPageHasFrontmatter(
      path.join(docsRoot, 'docs', 'zh', `${page}.mdx`),
    )
  }
})

test(
  'builds production Blume docs with localized guides and no AI chat entry points',
  {
    timeout: 120_000,
  },
  async (t) => {
    // A full release test needs sitemap/search artifacts that --isolated skips.
    // Build a disposable project copy instead of touching the live dev runtime.
    const scratchRoot = path.join(docsRoot, '.tmp')
    await mkdir(scratchRoot, { recursive: true })
    const blumeRoot = await mkdtemp(path.join(scratchRoot, 'docs-contract-'))
    t.after(async () => {
      assert.equal(path.dirname(blumeRoot), scratchRoot)
      await rm(blumeRoot, { recursive: true, force: true })
    })
    const excluded = new Set(['node_modules', '.blume', '.blume-verify', 'dist', '.git', 'patches', '.tmp'])
    for (const entry of await readdir(docsRoot)) {
      if (excluded.has(entry) || entry.startsWith('.env') || entry.endsWith('.log')) continue
      await cp(path.join(docsRoot, entry), path.join(blumeRoot, entry), { recursive: true })
    }
    await symlink(path.join(docsRoot, 'node_modules'), path.join(blumeRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    const result = spawnSync(
      pnpmCommand.executable,
      [...pnpmCommand.prefix, 'run', 'build'],
      {
        cwd: blumeRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          CI: '1',
        },
        windowsHide: true,
      },
    )

    assert.ifError(result.error)
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)

    const englishGuide = await readFile(
      path.join(
        blumeRoot,
        'dist',
        'docs',
        'guides',
        'production-integration',
        'index.html',
      ),
      'utf8',
    )
    const chineseGuide = await readFile(
      path.join(
        blumeRoot,
        'dist',
        'zh',
        'docs',
        'guides',
        'production-integration',
        'index.html',
      ),
      'utf8',
    )
    const englishProviders = await readFile(
      path.join(blumeRoot, 'dist', 'docs', 'concepts', 'providers', 'index.html'),
      'utf8',
    )
    const chineseProviders = await readFile(
      path.join(blumeRoot, 'dist', 'zh', 'docs', 'concepts', 'providers', 'index.html'),
      'utf8',
    )
    const reference = await readFile(
      path.join(blumeRoot, 'dist', 'docs', 'reference', 'index.html'),
      'utf8',
    )
    const chineseReference = await readFile(
      path.join(blumeRoot, 'dist', 'zh', 'docs', 'reference', 'index.html'),
      'utf8',
    )
    const chineseReferenceOperation = await readFile(
      path.join(blumeRoot, 'dist', 'zh', 'docs', 'reference', 'jobs', 'get-job', 'index.html'),
      'utf8',
    )
    const sitemap = await readFile(
      path.join(blumeRoot, 'dist', 'docs', 'sitemap.xml'),
      'utf8',
    )
    const searchIndex = JSON.parse(
      await readFile(
        path.join(blumeRoot, 'dist', 'docs', 'blume-search.json'),
        'utf8',
      ),
    )
    const agentReadability = JSON.parse(
      await readFile(
        path.join(blumeRoot, 'dist', 'docs', 'agent-readability.json'),
        'utf8',
      ),
    )
    const apiCatalog = JSON.parse(
      await readFile(
        path.join(blumeRoot, 'dist', 'docs', 'api-catalog.json'),
        'utf8',
      ),
    )
    const llms = await readFile(
      path.join(blumeRoot, 'dist', 'docs', 'llms.txt'),
      'utf8',
    )
    const llmsFull = await readFile(
      path.join(blumeRoot, 'dist', 'docs', 'llms-full.txt'),
      'utf8',
    )
    const rootEntries = (
      await (await import('node:fs/promises')).readdir(
        path.join(blumeRoot, 'dist'),
      )
    ).sort()
    const astroEntries = await (await import('node:fs/promises')).readdir(
      path.join(blumeRoot, 'dist', 'docs', '_astro'),
    )
    const searchClientFile = astroEntries.find((entry) =>
      /^search-client\..+\.js$/u.test(entry),
    )
    assert.ok(searchClientFile, 'built search client asset is missing')
    const searchClient = await readFile(
      path.join(
        blumeRoot,
        'dist',
        'docs',
        '_astro',
        searchClientFile,
      ),
      'utf8',
    )

    for (const [html, language, pagePath] of [
      [englishGuide, 'en', '/docs/guides/production-integration'],
      [chineseGuide, 'zh', '/zh/docs/guides/production-integration'],
      [reference, 'en', '/docs/reference'],
      [chineseReference, 'zh', '/zh/docs/reference'],
    ]) {
      const match = html.match(/href="(https:\/\/github\.com\/yir-ai\/docs\/issues\/new\?[^"]+)"/)
      assert.ok(match, 'every guide and API reference needs a correction link')
      const issue = new URL(match[1].replaceAll('&amp;', '&'))
      assert.equal(issue.searchParams.get('template'), 'documentation.yml')
      assert.equal(issue.searchParams.get('language'), language)
      assert.equal(issue.searchParams.get('page'), `https://yir.ai${pagePath}`)
      assert.ok(issue.searchParams.get('title').startsWith('[Docs] '))
    }
    assert.match(englishGuide, /Production checklist/)
    assert.match(chineseGuide, /上线检查清单/)
    assert.match(englishProviders, /Providers and managed supply/)
    assert.match(chineseProviders, /服务商与托管供应/)
    assert.match(reference, /Yir Standard Async AIGC API/)
    assert.match(
      englishGuide,
      /<link rel="canonical" href="https:\/\/yir\.ai\/docs\/guides\/production-integration"/,
    )
    assert.match(
      sitemap,
      /<loc>https:\/\/yir\.ai\/docs\/guides\/production-integration<\/loc>/,
    )
    assert.match(
      sitemap,
      /<loc>https:\/\/yir\.ai\/zh\/docs\/guides\/production-integration<\/loc>/,
    )
    assert.match(
      englishProviders,
      /<link rel="canonical" href="https:\/\/yir\.ai\/docs\/concepts\/providers"/,
    )
    assert.match(
      sitemap,
      /<loc>https:\/\/yir\.ai\/docs\/concepts\/providers<\/loc>/,
    )
    assert.match(
      sitemap,
      /<loc>https:\/\/yir\.ai\/zh\/docs\/concepts\/providers<\/loc>/,
    )
    assert.match(
      chineseReference,
      /<link rel="canonical" href="https:\/\/yir\.ai\/zh\/docs\/reference"/,
    )
    assert.match(
      chineseReferenceOperation,
      /<link rel="canonical" href="https:\/\/yir\.ai\/zh\/docs\/reference\/jobs\/get-job"/,
    )
    assert.match(
      chineseReferenceOperation,
      /<meta property="og:url" content="https:\/\/yir\.ai\/zh\/docs\/reference\/jobs\/get-job"/,
    )
    assert.ok(
      searchIndex.some(
        (page) => page.route === '/docs/guides/production-integration',
      ),
    )
    assert.ok(
      searchIndex.some(
        (page) => page.route === '/zh/docs/guides/production-integration',
      ),
    )
    assert.ok(searchIndex.some((page) => page.route === '/docs/concepts/providers'))
    assert.ok(searchIndex.some((page) => page.route === '/zh/docs/concepts/providers'))

    assert.deepEqual(rootEntries, [
      'docs',
      'zh',
    ])
    assert.match(englishGuide, /\/docs\/_astro\//)
    assert.doesNotMatch(englishGuide, /(?<![A-Za-z0-9_-])\/_astro\//)
    assert.doesNotMatch(englishGuide, /docs\.yir\.ai/)
    assert.doesNotMatch(chineseGuide, /href="(?:https:\/\/yir\.ai)?\/docs\/zh\//)
    assert.match(englishGuide, /href="https:\/\/github\.com\/yir-ai\/docs\/edit\/main\/docs\/guides\/production-integration\.mdx"/)
    assert.match(chineseGuide, /href="https:\/\/github\.com\/yir-ai\/docs\/edit\/main\/docs\/zh\/guides\/production-integration\.mdx"/)
    assert.match(searchClient, /`\/docs\/`,`blume-search\.json`/)
    assert.equal(agentReadability.artifacts.api, undefined)
    assert.equal(agentReadability.artifacts.aiCatalog, undefined)
    assert.equal(
      agentReadability.artifacts.apiCatalog,
      'https://yir.ai/docs/api-catalog.json',
    )
    assert.ok(
      apiCatalog.linkset.some((entry) =>
        entry.anchor === 'https://yir.ai/docs/reference' &&
        entry['service-doc']?.[0]?.href === entry.anchor,
      ),
    )
    assert.match(llms, /https:\/\/yir\.ai\/docs\/api-catalog\.json/u)
    for (const text of [llms, llmsFull]) {
      assert.doesNotMatch(text, /\/\.well-known\/api-catalog/u)
    }

    const builtHtmlFiles = await findFilesWithExtension(
      path.join(blumeRoot, 'dist'),
      '.html',
    )
    for (const file of builtHtmlFiles) {
      const html = await readFile(file, 'utf8')
      assert.doesNotMatch(
        html,
        /href="\/(?:getting-started|guides|concepts|reference|support)(?:\/|")/u,
        `${path.relative(blumeRoot, file)} links outside the Docs mounts`,
      )
      assert.doesNotMatch(html, /rel="(?:ai-catalog|ard|service-desc)"/u)
    }

    for (const html of [
      englishGuide,
      chineseGuide,
      englishProviders,
      chineseProviders,
      reference,
      chineseReference,
    ]) {
      assert.equal(/\/api\/ask|<blume-ask|data-ask-enabled/i.test(html), false)
      assert.equal(/data-open-in=/i.test(html), false)
    }
  },
)

test('publishes only the reviewed Standard API operations', async () => {
  const openapi = await readJson(referenceOpenApiPath)
  const operations = Object.entries(openapi.paths ?? {}).flatMap(
    ([route, pathItem]) =>
      Object.keys(pathItem)
        .filter((method) =>
          ['get', 'post', 'put', 'patch', 'delete'].includes(method),
        )
        .map((method) => `${method.toUpperCase()} ${route}`),
  )

  assert.deepEqual([...operations].sort(), [...reviewedOperations].sort())
})

test(
  'keeps reference operations consistent with the committed public OpenAPI',
  async () => {
    const [source, reference] = await Promise.all([
      readJson(publicOpenApiPath),
      readJson(referenceOpenApiPath),
    ])
    for (const [route, item] of Object.entries(reference.paths)) {
      for (const [method, operation] of Object.entries(item)) {
        assert.deepEqual(operation, source.paths[route]?.[method])
      }
    }
    assert.deepEqual(reference.components, source.components)
  },
)

test('keeps the public static model contracts localized', async () => {
  const catalog = await readJson(publicModelContractsPath)
  assert.equal(catalog.schema_version, 'v1')
  assert.match(catalog.schema_ref, /standard-openapi\.json/)
  assert.ok(catalog.models.length > 0)

  for (const model of catalog.models) {
    assert.ok(model.locales.en?.label)
    assert.ok(model.locales['zh-CN']?.label)
    assert.ok(model.operations.length > 0)
  }
})

test('does not publish internal routes or browser API proxying', async () => {
  const files = [
    'README.md',
    'openapi/gateway-openapi.json',
    'openapi/gateway-openapi.reference.json',
    'openapi/model-contracts.json',
    ...(await findMdxFiles(path.join(docsRoot, 'docs'))).map((file) =>
      path.join('docs', file),
    ),
  ]
  const forbidden = ['api', 'admin', 'gateway'].map(name => '/' + 'x-' + name)

  for (const file of files) {
    const content = await readFile(path.join(docsRoot, file), 'utf8')
    for (const prefix of forbidden) {
      assert.equal(
        content.includes(prefix),
        false,
        `${file} exposes internal prefix ${prefix}`,
      )
    }
  }
})

test('does not publish private keys or GitHub access tokens', async () => {
  const files = [
    'README.md',
    'openapi/gateway-openapi.json',
    'openapi/gateway-openapi.reference.json',
    'openapi/model-contracts.json',
    ...(await findMdxFiles(path.join(docsRoot, 'docs'))).map((file) =>
      path.join('docs', file),
    ),
  ]
  const forbidden = [
    {
      label: 'private key',
      pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    },
    {
      label: 'GitHub access token',
      pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/,
    },
  ]

  for (const file of files) {
    const content = await readFile(path.join(docsRoot, file), 'utf8')
    for (const item of forbidden) {
      assert.equal(
        item.pattern.test(content),
        false,
        `${file} exposes ${item.label}`,
      )
    }
  }
})

test('builds a standalone static site without deployment hooks', async () => {
  const manifest = await readJson(path.join(docsRoot, 'package.json'))
  assert.equal(manifest.scripts?.build.includes('prepare-site.mjs'), true)
  assert.equal('deploy:preview' in manifest.scripts, false)
  assert.equal('deploy:check' in manifest.scripts, false)
  assert.equal('wrangler' in manifest.devDependencies, false)
  await assert.rejects(readFile(path.join(docsRoot, 'wrangler.jsonc'), 'utf8'))
})

test('teaches safe Bearer authentication and required generation keys', async () => {
  const [authentication, quickstart] = await Promise.all([
    readFile(
      path.join(docsRoot, 'docs', 'getting-started', 'authentication.mdx'),
      'utf8',
    ),
    readFile(
      path.join(docsRoot, 'docs', 'getting-started', 'quickstart.mdx'),
      'utf8',
    ),
  ])

  assert.match(authentication, /Authorization: Bearer <YIR_API_KEY>/)
  assert.match(authentication, /Every account has a \*\*default API key\*\*/i)
  assert.match(authentication, /reveal and copy it/i)
  assert.match(authentication, /old secret stops working as soon as rotation succeeds/i)
  assert.match(authentication, /never accepts upstream credentials/i)
  assert.equal(quickstart.match(/--header "Idempotency-Key: \$YIR_IDEMPOTENCY_KEY"/g)?.length, 1)
  assert.match(quickstart, /same key and body return the original Job/)
  assert.match(quickstart, /Requests without a key are rejected with `400 YIR_INVALID_REQUEST`/)
  assert.match(quickstart, /"model": "openai\/gpt-image-2"/)
  assert.match(quickstart, /gateway\.yir\.ai\/v1\/jobs\/\$YIR_JOB_ID/)
  assert.equal(/\/kie\/|\/apimart\//i.test(quickstart), false)
})

test('exposes reviewed lightweight job status operation in both OpenAPI documents without detail leakage', async () => {
  const [publicOpenApi, referenceOpenApi] = await Promise.all([
    readJson(publicOpenApiPath),
    readJson(referenceOpenApiPath),
  ])

  for (const [name, openapi] of [
    ['gateway-openapi.json', publicOpenApi],
    ['gateway-openapi.reference.json', referenceOpenApi],
  ]) {
    const statusItem = openapi.paths?.['/v1/jobs/{id}/status']
    assert.ok(statusItem, `${name} must include /v1/jobs/{id}/status path`)
    assert.ok(statusItem.get, `${name} must define GET on /v1/jobs/{id}/status`)

    const getOp = statusItem.get
    assert.deepEqual(getOp.security, [{ BearerAuth: [] }], `${name} status operation must require BearerAuth`)

    const response200 = getOp.responses?.['200']
    assert.ok(response200, `${name} must define 200 response for status GET`)
    const schemaRef = response200.content?.['application/json']?.schema?.$ref
    assert.equal(
      schemaRef,
      '#/components/schemas/JobStatusResponse',
      `${name} 200 response schema must reference JobStatusResponse`,
    )

    const statusSchema = openapi.components?.schemas?.JobStatusResponse
    assert.ok(statusSchema, `${name} must define components.schemas.JobStatusResponse`)
    assert.equal(statusSchema.type, 'object')
    assert.equal(statusSchema.additionalProperties, false)

    const requiredFields = [...(statusSchema.required ?? [])].sort()
    assert.deepEqual(
      requiredFields,
      ['error', 'id', 'status'],
      `${name} JobStatusResponse required fields must be id, status, error`,
    )

    const propertyKeys = Object.keys(statusSchema.properties ?? {}).sort()
    assert.deepEqual(
      propertyKeys,
      ['cancellation', 'error', 'id', 'status'],
      `${name} JobStatusResponse properties must strictly be id, status, error, cancellation`,
    )
  }
})

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

async function assertPageHasFrontmatter(file) {
  const content = await readFile(file, 'utf8')
  assert.match(content, /^---\r?\n/)
  assert.match(content, /\r?\ntitle:\s*(?:"[^"]+"|'[^']+'|[^\r\n]+)\r?\n/)
  assert.match(
    content,
    /\r?\ndescription:\s*(?:"[^"]+"|'[^']+'|[^\r\n]+)\r?\n/,
  )
}

async function findMdxFiles(directory, relativeDirectory = '') {
  const { readdir } = await import('node:fs/promises')
  const entries = await readdir(path.join(directory, relativeDirectory), {
    withFileTypes: true,
  })
  const files = []

  for (const entry of entries) {
    if (entry.name === 'node_modules') continue
    const relativePath = path.join(relativeDirectory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await findMdxFiles(directory, relativePath)))
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      files.push(relativePath)
    }
  }

  return files
}

async function findFilesWithExtension(directory, extension) {
  const { readdir } = await import('node:fs/promises')
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await findFilesWithExtension(entryPath, extension)))
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(entryPath)
    }
  }

  return files
}
