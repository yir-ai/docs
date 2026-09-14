import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const distRoot = path.resolve(scriptDirectory, '..', 'dist')
const englishRoot = path.join(distRoot, 'docs')
const chineseRoot = path.join(distRoot, 'zh', 'docs')

const sharedDirectories = ['_astro', 'og']
const sharedFiles = [
  '404.html',
  'agent-readability.json',
  'blume-search.json',
  'llms-full.txt',
  'llms.txt',
  'robots.txt',
  'sitemap.xml',
]

await assertDirectory(englishRoot)
await assertDirectory(chineseRoot)

for (const directory of sharedDirectories) {
  await moveIntoEnglishMount(directory)
}

for (const file of sharedFiles) {
  await moveIntoEnglishMount(file)
}

await moveRootMarkdownMirror('docs.md', path.join('docs', 'index.md'))
await moveRootMarkdownMirror('docs.mdx', path.join('docs', 'index.mdx'))
await moveRootMarkdownMirror(
  path.join('zh', 'docs.md'),
  path.join('zh', 'docs', 'index.md'),
)
await moveRootMarkdownMirror(
  path.join('zh', 'docs.mdx'),
  path.join('zh', 'docs', 'index.mdx'),
)

await rm(path.join(distRoot, 'index.md'), { force: true })
await rm(path.join(distRoot, 'index.mdx'), { force: true })
await rm(path.join(distRoot, '_headers'), { force: true })
await rm(path.join(distRoot, '.well-known'), { force: true, recursive: true })

await rewriteTextFiles(distRoot)

const releaseManifest = {
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

await writeFile(
  path.join(distRoot, '.yir-docs-release.json'),
  `${JSON.stringify(releaseManifest, null, 2)}\n`,
  'utf8',
)

const allowedRootEntries = new Set([
  '.yir-docs-release.json',
  'docs',
  'zh',
])
const unexpectedRootEntries = (await readdir(distRoot)).filter(
  (entry) => !allowedRootEntries.has(entry),
)

if (unexpectedRootEntries.length > 0) {
  throw new Error(
    `Origin release contains unexpected root entries: ${unexpectedRootEntries.join(', ')}`,
  )
}

async function moveIntoEnglishMount(relativePath) {
  const source = path.join(distRoot, relativePath)
  const destination = path.join(englishRoot, relativePath)
  await mkdir(path.dirname(destination), { recursive: true })
  await rename(source, destination)
}

async function moveRootMarkdownMirror(sourcePath, destinationPath) {
  const source = path.join(distRoot, sourcePath)
  const destination = path.join(distRoot, destinationPath)
  await mkdir(path.dirname(destination), { recursive: true })
  await rename(source, destination)
}

async function assertDirectory(directory) {
  const info = await stat(directory).catch(() => null)
  if (!info?.isDirectory()) {
    throw new Error(`Expected Blume output directory is missing: ${directory}`)
  }
}

async function rewriteTextFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await rewriteTextFiles(entryPath)
      continue
    }
    if (!entry.isFile() || !isTextFile(entry.name)) continue

    const original = await readFile(entryPath, 'utf8')
    const rewritten = rewriteMountedPaths(
      original,
      isWithinDirectory(entryPath, chineseRoot),
    )
    if (rewritten !== original) {
      await writeFile(entryPath, rewritten, 'utf8')
    }
  }
}

function isTextFile(fileName) {
  return /\.(?:css|html|js|json|map|md|mdx|txt|xml)$/u.test(fileName)
}

function rewriteMountedPaths(content, chinese) {
  const rootPath = (pathValue) =>
    new RegExp(`(?<!/docs)/${escapeRegExp(pathValue)}`, 'gu')
  const docsPrefix = chinese ? '/zh/docs' : '/docs'

  return content
    .replace(rootPath('_astro/'), '/docs/_astro/')
    .replace(rootPath('og/'), '/docs/og/')
    .replace(rootPath('blume-search.json'), '/docs/blume-search.json')
    .replace(rootPath('agent-readability.json'), '/docs/agent-readability.json')
    .replace(rootPath('llms-full.txt'), '/docs/llms-full.txt')
    .replace(rootPath('llms.txt'), '/docs/llms.txt')
    .replace(rootPath('sitemap.xml'), '/docs/sitemap.xml')
    .replace(rootPath('docs.md'), '/docs/index.md')
    .replace(rootPath('docs.mdx'), '/docs/index.mdx')
    .replace(rootPath('zh/docs.md'), '/zh/docs/index.md')
    .replace(rootPath('zh/docs.mdx'), '/zh/docs/index.mdx')
    .replace(
      /(^|["'(\s`>]|https:\/\/yir\.ai)\/(getting-started|guides|concepts|reference|support)(?=\/|["'#?`\s<])/gu,
      `$1${docsPrefix}/$2`,
    )
    .replace(
      '(`/`,`blume-search.json`)',
      '(`/docs/`,`blume-search.json`)',
    )
}

function isWithinDirectory(filePath, directory) {
  const relativePath = path.relative(directory, filePath)
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}
