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

test('renders numeric duration ranges with additional string values in both languages', () => {
  const extended = structuredClone(model)
  extended.operations[0].parameters[0].string_values = ['auto']
  for (const lang of ['en', 'zh']) {
    const page = renderPage(extended, lang, null)
    const row = page.split('\n').find(line => line.startsWith('| `duration` |'))
    assert.ok(row.includes('`4`'))
    assert.ok(row.includes('`15`'))
    assert.ok(row.includes('`auto`'))
    assert.ok(row.includes(' | `5` |'))
  }
})

test('renders subject grouping, voices and mixed rules from subject_references', () => {
  const subjects = structuredClone(model)
  subjects.operations[0].input_modes.push('reference')
  subjects.operations[0].input_constraints.reference = {
    min_references: 1, max_references: 15, allowed_reference_roles: ['reference_image', 'reference_audio'],
    reference_counts_by_role: { reference_audio: { minimum: 0, maximum: 0 }, reference_image: { minimum: 0, maximum: 10 } },
    subject_references: { min_images_per_subject: 2, max_images_per_subject: 4, max_subjects: 7, mixed: true, max_audios_per_subject: 1, max_audio_only_subjects: 3, max_videos_per_subject: 1, max_video_subjects: 3 },
  }
  const page = renderPage(subjects, 'en', null)
  assert.match(page, /`reference_audio` only in subjects<br \/>`reference_image` 0 to 10/)
  assert.match(page, /### Subject references \(`reference`\)/)
  assert.match(page, /- Photo subjects: up to 7, each with 2 to 4 `reference_image`/)
  assert.match(page, /- Video subjects: up to 3, each with 1 `reference_video`/)
  assert.match(page, /standalone voices/)
  assert.match(page, /combined with ungrouped references/)
  assert.doesNotMatch(page, /With subjects, these values apply/)

  subjects.operations[0].input_constraints.reference.subject_references = { min_images_per_subject: 2, max_images_per_subject: 4, max_subjects: 3, resolutions: ['720p', '4K'], min_duration_seconds: 3, max_duration_seconds: 15 }
  const zh = renderPage(subjects, 'zh', null)
  assert.match(zh, /所有参考素材都必须是带 subject 的 `reference_image`/)
  assert.match(zh, /- 分辨率：`720p`、`4K`/)
  assert.match(zh, /- 时长：3–15 秒/)
  assert.doesNotMatch(zh, /视频主体|音色/)
})
