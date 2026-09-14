import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const docsRoot = path.resolve(scriptDirectory, '..')

test('keeps production Docs routes isolated from the Next.js fallback', async () => {
  const config = await readFile(
    path.join(docsRoot, 'deploy', 'nginx', 'yir-docs-origin.conf'),
    'utf8',
  )

  assert.match(config, /location = \/docs \{/u)
  assert.match(config, /location \^~ \/docs\/ \{/u)
  assert.match(config, /location = \/zh\/docs \{/u)
  assert.match(config, /location \^~ \/zh\/docs\/ \{/u)
  assert.match(config, /root \/srv\/yir\/docs\/current;/u)
  assert.match(config, /try_files \$uri \$uri\/index\.html =404;/u)
  assert.match(config, /\/docs\/_astro\//u)
  assert.match(config, /max-age=31536000, immutable/u)
  assert.doesNotMatch(config, /proxy_pass/u)
})

test('proxies only the two Docs mounts to the local Blume port', async () => {
  const config = await readFile(
    path.join(docsRoot, 'deploy', 'nginx', 'yir-docs-local.conf'),
    'utf8',
  )

  assert.match(config, /location \^~ \/docs\/ \{/u)
  assert.match(config, /location \^~ \/zh\/docs\/ \{/u)
  assert.equal((config.match(/proxy_pass http:\/\/localhost:40084;/gu) ?? []).length, 2)
  assert.equal((config.match(/proxy_set_header Host localhost:40084;/gu) ?? []).length, 2)
  assert.equal((config.match(/proxy_set_header X-Forwarded-Host \$host;/gu) ?? []).length, 2)
  assert.doesNotMatch(config, /location \/ \{/u)
  assert.doesNotMatch(config, /^\s*rewrite\b/mu)
})

test('maps the legacy Docs host to language-first primary-domain paths', async () => {
  const config = await readFile(
    path.join(docsRoot, 'deploy', 'nginx', 'yir-docs-legacy-redirect.conf'),
    'utf8',
  )

  assert.match(config, /return 308 https:\/\/yir\.ai\/docs\/\$is_args\$args;/u)
  assert.match(config, /return 308 https:\/\/yir\.ai\/zh\/docs\$is_args\$args;/u)
  assert.match(config, /return 308 https:\/\/yir\.ai\/zh\/docs\/\$1\$is_args\$args;/u)
  assert.match(config, /return 308 https:\/\/yir\.ai\/docs\$uri\$is_args\$args;/u)
  assert.doesNotMatch(config, /proxy_pass/u)
})

test('publishes a verified Origin artifact without production deployment credentials', async () => {
  const workflow = await readFile(
    path.join(docsRoot, '.github', 'workflows', 'ci.yml'),
    'utf8',
  )

  assert.match(workflow, /pnpm run release:verify/u)
  assert.match(workflow, /pnpm run origin:smoke/u)
  assert.match(workflow, /YIR_DOCS_NGINX_IMAGE: nginx:1\.28\.3-alpine/u)
  assert.match(workflow, /uses: actions\/upload-artifact@v4/u)
  assert.match(workflow, /name: yir-docs-origin-\$\{\{ github\.sha \}\}/u)
  assert.match(workflow, /path: dist/u)
  assert.match(workflow, /include-hidden-files: true/u)
  assert.doesNotMatch(workflow, /ssh|scp|rsync|production|CLOUDFLARE_API_TOKEN/iu)
})
