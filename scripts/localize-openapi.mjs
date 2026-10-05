import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Builds the Chinese API reference spec from the English reference spec and a
// catalog keyed by the English source text, so any changed sentence shows up as
// a missing translation instead of keeping a stale one.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const sourcePath = path.join(root, 'openapi', 'gateway-openapi.reference.json')
export const catalogPath = path.join(root, 'openapi', 'i18n', 'zh.json')
export const outputPath = path.join(root, 'openapi', 'gateway-openapi.reference.zh.json')

const textKeys = new Set(['summary', 'description', 'title'])
// Maps keyed by user-chosen names: their keys are names, not keywords.
const nameMaps = new Set(['properties', 'patternProperties', 'paths', 'responses', 'schemas', 'parameters', 'headers', 'securitySchemes', 'content', 'variables', 'mapping', '$defs', 'definitions', 'callbacks', 'links', 'requestBodies'])
// Literal payload data, never prose.
const dataKeys = new Set(['example', 'examples', 'default', 'const', 'enum'])

function visit(value, onText, nameMap = false) {
  if (Array.isArray(value)) return value.map(item => visit(item, onText))
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [key, child] of Object.entries(value)) {
    if (!nameMap && dataKeys.has(key)) out[key] = child
    else if (!nameMap && textKeys.has(key) && typeof child === 'string') out[key] = onText(child)
    else out[key] = visit(child, onText, !nameMap && nameMaps.has(key))
  }
  return out
}

export function collectTexts(spec) {
  const texts = new Set()
  visit(spec, text => (texts.add(text), text))
  return [...texts]
}

export function localize(spec, catalog) {
  const missing = new Set()
  const result = visit(spec, text => {
    const translated = catalog[text]
    if (typeof translated !== 'string' || translated.trim() === '') missing.add(text)
    return translated ?? text
  })
  const used = new Set(collectTexts(spec))
  const unused = Object.keys(catalog).filter(text => !used.has(text))
  return { result, missing: [...missing], unused }
}

export function serialize(spec) {
  return JSON.stringify(spec, null, 2) + '\n'
}

async function main(check) {
  const [spec, catalog] = await Promise.all([sourcePath, catalogPath].map(async file => JSON.parse(await readFile(file, 'utf8'))))
  const { result, missing, unused } = localize(spec, catalog)
  const problems = [
    ...missing.map(text => `missing translation: ${JSON.stringify(text)}`),
    ...unused.map(text => `unused translation: ${JSON.stringify(text)}`),
  ]
  if (problems.length > 0) throw new Error(`openapi/i18n/zh.json is out of sync:\n${problems.join('\n')}`)
  const output = serialize(result)
  if (check) {
    const current = await readFile(outputPath, 'utf8').catch(() => '')
    if (current.replace(/\r\n/g, '\n') !== output) throw new Error('openapi/gateway-openapi.reference.zh.json is stale; run pnpm localize:openapi')
    console.log('Chinese OpenAPI reference is up to date')
    return
  }
  await writeFile(outputPath, output, 'utf8')
  console.log('Wrote openapi/gateway-openapi.reference.zh.json')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.includes('--check'))
}
