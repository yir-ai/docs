import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Prose rules that past reviews fixed by hand. Code blocks, inline code and
// link targets are ignored, so identifiers and URLs are unaffected.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const rules = [
  // The product term is "API Key" in both languages.
  { name: 'write "API Key", not "API key"', pattern: /\bAPI key\b/g },
  // The site typesets "--" as a dash, so CLI flags such as `--stylize` need code formatting.
  { name: 'wrap CLI flags such as --flag in code', pattern: /(^|[\s(])--[a-z][a-z-]*/g },
]

async function pages(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await pages(file))
    else if (/\.mdx?$/.test(entry.name)) out.push(file)
  }
  return out
}

export function proseLines(text) {
  let fenced = false
  return text.replace(/^---\n[\s\S]*?\n---\n/, match => '\n'.repeat(match.split('\n').length - 1)).split('\n').map(line => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      return ''
    }
    if (fenced) return ''
    return line.replace(/`[^`]*`/g, '').replace(/\]\([^)]*\)/g, ']').replace(/\{\/\*.*?\*\/\}/g, '')
  })
}

test('proseLines skips code, link targets and front matter', () => {
  const lines = proseLines('---\ntitle: API key\n---\nUse `--raw` and [x](/api key).\n```\n--flag\n```\nAn API key here.')
  assert.deepEqual(lines.filter(Boolean), ['Use  and [x].', 'An API key here.'])
})

test('docs prose follows the style rules', async () => {
  const problems = []
  for (const file of await pages(path.join(root, 'docs'))) {
    const lines = proseLines(await readFile(file, 'utf8'))
    lines.forEach((line, i) => {
      for (const rule of rules) {
        for (const match of line.matchAll(rule.pattern)) {
          problems.push(`${path.relative(root, file)}:${i + 1}: ${rule.name}: "${match[0].trim()}"`)
        }
      }
    })
  }
  assert.deepEqual(problems, [])
})
