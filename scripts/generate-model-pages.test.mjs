import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildPages, existingGeneratedFiles, orphanNotes, pagePath, renderPage } from './generate-model-pages.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const model = {
  id: 'acme/video-1.5',
  aliases: ['video-1.5'],
  locales: { en: { label: 'Video 1.5', description: 'Acme video.' }, 'zh-CN': { label: 'Video 1.5', description: 'Acme 视频。' } },
  operations: [{
    operation: 'generate_video',
    input_modes: ['text', 'image'],
    input_constraints: {
      text: { min_references: 0, max_references: 0, allowed_reference_roles: [] },
      image: { min_references: 1, max_references: 2, allowed_reference_roles: ['first_frame', 'last_frame'], reference_counts_by_role: { first_frame: { minimum: 1, maximum: 1 }, last_frame: { minimum: 0, maximum: 1 } } },
    },
    parameters: [
      { name: 'duration', type: 'integer', required: true, minimum: 4, maximum: 15, default: 5, locales: { en: { label: 'Duration', description: 'Seconds.' }, 'zh-CN': { label: '时长', description: '秒数。' } } },
      { name: 'resolution', type: 'string', required: false, values: ['720p', '1080p'], locales: { en: { label: 'Resolution', description: 'Output | size.' }, 'zh-CN': { label: '分辨率', description: '输出。' } } },
    ],
  }],
}

test('derives stable page paths from model IDs', () => {
  assert.deepEqual(pagePath('openai/gpt-image-2.5-flare'), { creator: 'openai', slug: 'gpt-image-2-5-flare' })
  assert.deepEqual(pagePath('bytedance/seedance-2.0'), { creator: 'bytedance', slug: 'seedance-2-0' })
})

test('renders modes, per-role counts, ranges and a runnable example per mode', () => {
  const page = renderPage(model, 'en', '/models/_notes/acme/video-1-5.mdx')
  assert.match(page, /\| `image` Image input \| 1 to 2 \| `first_frame` 1<br \/>`last_frame` 0 to 1 \|/)
  assert.match(page, /\| `duration` \| Duration: Seconds\. \| `4` to `15` \| `5` \| Yes \|/)
  assert.match(page, /Output \\\| size\./)
  assert.match(page, /\| `resolution` .* \| Not set \| No \|/)
  assert.match(page, /"role": "first_frame"/)
  assert.doesNotMatch(page, /"role": "last_frame"/)
  assert.match(page, /<include>\/models\/_notes\/acme\/video-1-5\.mdx<\/include>/)
  assert.match(renderPage(model, 'zh', null), /\| `duration` \| 时长：秒数。 \|/)
})

test('keeps generated model pages in sync with the model contract', async () => {
  const { files, notesUsed } = await buildPages()
  assert.deepEqual(await orphanNotes(notesUsed), [], 'notes must belong to a model page')
  for (const [rel, content] of Object.entries(files)) {
    const current = await readFile(path.join(root, rel), 'utf8').catch(() => null)
    assert.equal(current?.replace(/\r\n/g, '\n'), content, `${rel} is stale; run pnpm generate:models`)
  }
  assert.deepEqual((await existingGeneratedFiles()).filter(rel => !(rel in files)), [], 'remove pages of retired models')
})
