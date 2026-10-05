import { execFileSync } from 'node:child_process'
import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rootFiles = new Set(['.gitignore', 'AGENTS.md', 'CONTRIBUTING.md', 'LICENSE', 'README.md',
  'blume.config.ts', 'components.ts', 'icon.svg', 'icon-dark.svg', 'logo.svg', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'])
const scripts = new Set(['prepare-site.mjs', 'check-public-boundary.mjs', 'public-boundary.test.mjs', 'docs-contract.test.mjs', 'localize-openapi.mjs', 'localize-openapi.test.mjs'])

export function assertPublicPath(file) {
  if (file.split('/').some(part => part === '..' || part.startsWith('.env'))) throw new Error(`Non-public path: ${file}`)
  const allowed = rootFiles.has(file) ||
    /^docs\/(?:[a-z0-9-]+\/)*(?:[a-z0-9-]+\.mdx|meta\.ts)$/.test(file) ||
    /^components\/[A-Za-z0-9-]+\.astro$/.test(file) ||
    /^openapi\/(?:gateway-openapi(?:\.reference(?:\.zh)?)?|model-contracts|i18n\/zh)\.json$/.test(file) ||
    /^patches\/blume@[0-9.]+\.patch$/.test(file) ||
    ['.github/ISSUE_TEMPLATE/documentation.yml', '.github/pull_request_template.md', '.github/workflows/ci.yml'].includes(file) ||
    (file.startsWith('scripts/') && scripts.has(file.slice(8)))
  if (!allowed) throw new Error(`Path needs public-boundary review: ${file}`)
}

export function assertPublicContent(content, label) {
  const rules = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}\b/,
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
    /\b(?:sk_live_|sk-proj-|xox[baprs]-)[A-Za-z0-9_-]{20,}\b/,
    /(?:postgres(?:ql)?|mysql|redis):\/\/[^\s/:]+:[^\s/@]+@/i,
    /\/x-(?:api|admin|gateway)(?:\/|\b)/,
    /\/srv\/[y]ir\b|\b(?:admin\.)?local\.[y]ir\.ai\b|\bPi[l]io\b/i,
    /\b(?:wire[_]model|credential[_]secret|upstream[_]api[_]key)\b/i,
  ]
  if (rules.some(rule => rule.test(content))) throw new Error(`Non-public content in ${label}`)
}

export async function checkRepository(directory = root) {
  const files = execFileSync('git', ['-C', directory, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  for (const file of new Set(files)) {
    const fullPath = path.join(directory, file)
    const info = await lstat(fullPath).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (!info) continue // Tracked deletions are absent from the next commit.
    assertPublicPath(file)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Unsupported public entry: ${file}`)
    assertPublicContent(await readFile(fullPath, 'utf8'), file)
  }
}

export async function checkArtifact(directory) {
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Artifact must be a plain directory')
  if (JSON.stringify((await readdir(directory)).sort()) !== JSON.stringify(['docs', 'zh'])) throw new Error('Unexpected static site roots')
  if (JSON.stringify(await readdir(path.join(directory, 'zh'))) !== JSON.stringify(['docs'])) throw new Error('Unexpected locale output')
  async function visit(folder) {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const full = path.join(folder, item.name)
      if (item.name.startsWith('.') || item.isSymbolicLink()) throw new Error('Non-public artifact entry')
      if (item.isDirectory()) await visit(full)
      else if (item.isFile() && /\.(?:html|css|js|json|xml|txt|md|mdx|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|avif|pdf)$/i.test(item.name)) {
        assertPublicContent(await readFile(full, 'utf8'), path.relative(directory, full))
      } else throw new Error('Unexpected static artifact file')
    }
  }
  await visit(directory)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--artifact' && process.argv[3]) await checkArtifact(path.resolve(process.argv[3]))
  else if (process.argv.length === 2) await checkRepository()
  else throw new Error('Usage: check-public-boundary.mjs [--artifact directory]')
  console.log('Public boundary checks passed')
}
