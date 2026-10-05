import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { catalogPath, collectTexts, localize, outputPath, serialize, sourcePath } from './localize-openapi.mjs'

const readJson = async file => JSON.parse(await readFile(file, 'utf8'))

test('translates prose but not property names, examples or enum data', () => {
  const spec = {
    info: { title: 'API', description: 'About' },
    components: {
      schemas: {
        Item: {
          description: 'An item',
          properties: { title: { type: 'string', description: 'Item title' }, summary: { type: 'string' } },
          example: { description: 'payload text' },
          enum: ['summary'],
        },
      },
    },
  }
  assert.deepEqual(collectTexts(spec).sort(), ['API', 'About', 'An item', 'Item title'])
  const { result, missing, unused } = localize(spec, { API: '接口', About: '简介', 'An item': '条目', 'Item title': '标题', Stale: '旧' })
  assert.deepEqual(missing, [])
  assert.deepEqual(unused, ['Stale'])
  const item = result.components.schemas.Item
  assert.equal(item.properties.title.description, '标题')
  assert.deepEqual(Object.keys(item.properties), ['title', 'summary'])
  assert.deepEqual(item.example, { description: 'payload text' })
  assert.deepEqual(item.enum, ['summary'])
})

test('reports untranslated text', () => {
  assert.deepEqual(localize({ info: { title: 'New' } }, {}).missing, ['New'])
})

test('keeps the Chinese reference complete and in sync with the English spec', async () => {
  const [spec, catalog, output] = await Promise.all([readJson(sourcePath), readJson(catalogPath), readFile(outputPath, 'utf8')])
  const { result, missing, unused } = localize(spec, catalog)
  assert.deepEqual(missing, [], 'add the missing English text to openapi/i18n/zh.json')
  assert.deepEqual(unused, [], 'remove translations the English spec no longer uses')
  assert.equal(output.replace(/\r\n/g, '\n'), serialize(result), 'run pnpm localize:openapi')
})
