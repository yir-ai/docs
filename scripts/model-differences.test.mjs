import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// The Yir column of docs/models/official-api-differences.mdx (and its Chinese
// twin) restates facts from the model contract. Each claim below mirrors one
// statement on that page, so a contract change that makes the page wrong fails
// here: re-check the row in both languages, then update the claim.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pages = ['docs/models/official-api-differences.mdx', 'docs/zh/models/official-api-differences.mdx']
const c = JSON.parse(await readFile(path.join(root, 'openapi', 'model-contracts.json'), 'utf8'))
const retired = new Set()
const M = id => c.models.find(m => m.id === id) ?? (retired.add(id), { operations: [] })
const modes = id => [...new Set(M(id).operations.flatMap(o => o.input_modes))].sort()
const P = (id, name, mode = 'text') => M(id).operations.find(o => o.input_modes.includes(mode))?.parameters.find(p => p.name === name)
const C = (id, mode) => M(id).operations.find(o => o.input_modes.includes(mode))?.input_constraints[mode]
const vals = (id, name, mode) => P(id, name, mode)?.values
const def = (id, name, mode) => P(id, name, mode)?.default
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const sameSet = (a, b) => eq([...(a ?? [])].map(String).sort(), [...b].map(String).sort())

const results = []
const check = (claim, ok, actual) => results.push({ claim, ok: !!ok, actual })

// Gemini Omni
const go = 'google/gemini-omni-1.1-flash'
check('omni duration 4/6/8/10', sameSet(vals(go, 'duration'), [4, 6, 8, 10]), vals(go, 'duration'))
check('omni duration default 4', def(go, 'duration') === 4, def(go, 'duration'))
check('omni resolution 720p/1080p/4K', sameSet(vals(go, 'resolution'), ['720p', '1080p', '4K']), vals(go, 'resolution'))
check('omni image mode first_frame only', sameSet(C(go, 'image')?.allowed_reference_roles, ['first_frame']), C(go, 'image')?.allowed_reference_roles)
check('omni up to 3 reference_image', C(go, 'reference')?.max_references === 3 && sameSet(C(go, 'reference')?.allowed_reference_roles, ['reference_image']), C(go, 'reference'))
// Other Google
check('gemini-2.5-flash-image aspect default 1:1, no auto', def('google/gemini-2.5-flash-image', 'aspect_ratio') === '1:1' && !vals('google/gemini-2.5-flash-image', 'aspect_ratio').includes('auto'), vals('google/gemini-2.5-flash-image', 'aspect_ratio'))
const fl = 'google/gemini-3.1-flash-lite-image'
check('flash-lite 10 ratios, default 1:1, no auto', vals(fl, 'aspect_ratio').length === 10 && def(fl, 'aspect_ratio') === '1:1' && !vals(fl, 'aspect_ratio').includes('auto'), vals(fl, 'aspect_ratio'))
const nb2 = 'google/nano-banana-2'
check('nano-banana-2 has 0.5K', vals(nb2, 'resolution').includes('0.5K'), vals(nb2, 'resolution'))
check('nano-banana-2 aspect default auto, no 9:21', def(nb2, 'aspect_ratio') === 'auto' && !vals(nb2, 'aspect_ratio').includes('9:21'), vals(nb2, 'aspect_ratio'))
check('nano-banana-2 has image_search', !!P(nb2, 'image_search'), !!P(nb2, 'image_search'))
const nb21 = 'google/nano-banana-2.1'
check('nano-banana-2.1 aspect default auto, no search', def(nb21, 'aspect_ratio') === 'auto' && !P(nb21, 'web_search') && !P(nb21, 'image_search'), vals(nb21, 'aspect_ratio'))
const nbp = 'google/nano-banana-pro'
check('nano-banana-pro no web_search', !P(nbp, 'web_search'), !!P(nbp, 'web_search'))
check('nano-banana-pro 10 ratios + auto', vals(nbp, 'aspect_ratio').length === 11 && vals(nbp, 'aspect_ratio').includes('auto'), vals(nbp, 'aspect_ratio'))
for (const v of ['google/veo-3.1-generate-001', 'google/veo-3.1-fast-generate-001']) {
  check(`${v} image mode first_frame only`, sameSet(C(v, 'image')?.allowed_reference_roles, ['first_frame']), C(v, 'image')?.allowed_reference_roles)
  check(`${v} no reference mode`, !modes(v).includes('reference'), modes(v))
}
// Seedance defaults
for (const s of ['seedance-1.5-pro', 'seedance-2.0', 'seedance-2.0-fast', 'seedance-2.0-mini']) {
  const id = 'bytedance/' + s
  check(`${s} resolution default 480p`, def(id, 'resolution') === '480p', def(id, 'resolution'))
  const d = ['seedance-2.0-fast', 'seedance-2.0-mini'].includes(s) ? 5 : 4
  check(`${s} duration default ${d}`, def(id, 'duration') === d, def(id, 'duration'))
  check(`${s} aspect default 16:9`, def(id, 'aspect_ratio') === '16:9', def(id, 'aspect_ratio'))
  check(`${s} generate_audio default false`, def(id, 'generate_audio') === false, def(id, 'generate_audio'))
}
const s25 = 'bytedance/seedance-2.5'
check('seedance-2.5 resolution default 720p', def(s25, 'resolution') === '720p', def(s25, 'resolution'))
check('seedance-2.5 duration default 4', def(s25, 'duration') === 4, def(s25, 'duration'))
check('seedance-2.5 generate_audio default false', def(s25, 'generate_audio') === false, def(s25, 'generate_audio'))
check('seedance-2.5 first frame: only auto, default auto', sameSet(vals(s25, 'aspect_ratio', 'image'), ['auto']) && def(s25, 'aspect_ratio', 'image') === 'auto', [vals(s25, 'aspect_ratio', 'image'), def(s25, 'aspect_ratio', 'image')])
check('seedance-2.5 resolution 480p/720p', sameSet(vals(s25, 'resolution'), ['480p', '720p']), vals(s25, 'resolution'))
check('seedance-2.5 references need image or video', !!C(s25, 'reference')?.required_any_reference_roles, C(s25, 'reference')?.required_any_reference_roles)
check('seedance-1.5-pro no adaptive', !vals('bytedance/seedance-1.5-pro', 'aspect_ratio').includes('adaptive'), vals('bytedance/seedance-1.5-pro', 'aspect_ratio'))
const withLastFrame = c.models.filter(m => m.operations.some(o => o.parameters.some(p => p.name === 'return_last_frame'))).map(m => m.id)
check('return_last_frame only on seedance-2.0', eq(withLastFrame, ['bytedance/seedance-2.0']), withLastFrame)
check('seedance-2.0 resolution max 1080p', sameSet(vals('bytedance/seedance-2.0', 'resolution'), ['480p', '720p', '1080p']), vals('bytedance/seedance-2.0', 'resolution'))
check('seedance-2.0-fast duration 5/10/15', sameSet(vals('bytedance/seedance-2.0-fast', 'duration'), [5, 10, 15]), vals('bytedance/seedance-2.0-fast', 'duration'))
check('seedance-2.0-mini duration 5/10', sameSet(vals('bytedance/seedance-2.0-mini', 'duration'), [5, 10]), vals('bytedance/seedance-2.0-mini', 'duration'))
for (const s of ['seedance-2.0-fast', 'seedance-2.0-mini']) {
  const id = 'bytedance/' + s
  check(`${s} up to 3 references`, C(id, 'reference')?.max_references === 3, C(id, 'reference')?.max_references)
  check(`${s} no adaptive`, !vals(id, 'aspect_ratio').includes('adaptive'), vals(id, 'aspect_ratio'))
}
check('seedream-4.5 up to 10 refs', C('bytedance/seedream-4.5', 'image')?.max_references === 10, C('bytedance/seedream-4.5', 'image')?.max_references)
check('seedream-4.5 9:21 only with refs', !vals('bytedance/seedream-4.5', 'aspect_ratio').includes('9:21') && vals('bytedance/seedream-4.5', 'aspect_ratio', 'image')?.includes('9:21'), [vals('bytedance/seedream-4.5', 'aspect_ratio'), vals('bytedance/seedream-4.5', 'aspect_ratio', 'image')])
check('seedream-5.0-pro resolution 1K/2K default 1K', sameSet(vals('bytedance/seedream-5.0-pro', 'resolution'), ['1K', '2K']) && def('bytedance/seedream-5.0-pro', 'resolution') === '1K', [vals('bytedance/seedream-5.0-pro', 'resolution'), def('bytedance/seedream-5.0-pro', 'resolution')])
// Alibaba
for (const a of ['wan-2.6', 'wan-2.7', 'wan-3.0', 'happyhorse-1.1']) check(`${a} resolution default 720p`, def('alibaba/' + a, 'resolution') === '720p', def('alibaba/' + a, 'resolution'))
for (const q of ['qwen-image-2.1', 'qwen-image-3.0-pro']) check(`${q} default 1K 1:1`, def('alibaba/' + q, 'resolution') === '1K' && def('alibaba/' + q, 'aspect_ratio') === '1:1', [def('alibaba/' + q, 'resolution'), def('alibaba/' + q, 'aspect_ratio')])
const hh = 'alibaba/happyhorse-1.1'
check('happyhorse duration 5/10', sameSet(vals(hh, 'duration'), [5, 10]), vals(hh, 'duration'))
check('happyhorse res 720p/1080p, text 16:9 only', sameSet(vals(hh, 'resolution'), ['720p', '1080p']) && sameSet(vals(hh, 'aspect_ratio'), ['16:9']), [vals(hh, 'resolution'), vals(hh, 'aspect_ratio')])
check('qwen-image-2.1 1K/2K with 7 ratios', sameSet(vals('alibaba/qwen-image-2.1', 'resolution'), ['1K', '2K']) && vals('alibaba/qwen-image-2.1', 'aspect_ratio').length === 7, [vals('alibaba/qwen-image-2.1', 'resolution'), vals('alibaba/qwen-image-2.1', 'aspect_ratio')?.length])
check('qwen-image-3.0-pro text only, 5 ratios', eq(modes('alibaba/qwen-image-3.0-pro'), ['text']) && vals('alibaba/qwen-image-3.0-pro', 'aspect_ratio').length === 5, [modes('alibaba/qwen-image-3.0-pro'), vals('alibaba/qwen-image-3.0-pro', 'aspect_ratio')])
const w26 = 'alibaba/wan-2.6'
check('wan-2.6 duration 5..15 (text)', Math.min(...(vals(w26, 'duration') ?? [P(w26, 'duration').minimum])) === 5 && Math.max(...(vals(w26, 'duration') ?? [P(w26, 'duration').maximum])) === 15, [vals(w26, 'duration'), P(w26, 'duration').minimum, P(w26, 'duration').maximum])
check('wan-2.6 references: 5 or 10', sameSet(vals(w26, 'duration', 'reference'), [5, 10]), vals(w26, 'duration', 'reference'))
check('wan-2.6 res 720p/1080p; text 16:9/9:16/1:1', sameSet(vals(w26, 'resolution'), ['720p', '1080p']) && sameSet(vals(w26, 'aspect_ratio'), ['16:9', '9:16', '1:1']), [vals(w26, 'resolution'), vals(w26, 'aspect_ratio')])
check('wan-2.7 text and reference only', eq(modes('alibaba/wan-2.7'), ['reference', 'text']), modes('alibaba/wan-2.7'))
for (const w of ['wan-2.7-image', 'wan-2.7-image-pro']) check(`${w} text only`, eq(modes('alibaba/' + w), ['text']), modes('alibaba/' + w))
check('wan-2.7-image default 1K', def('alibaba/wan-2.7-image', 'resolution') === '1K', def('alibaba/wan-2.7-image', 'resolution'))
const w30 = 'alibaba/wan-3.0'
check('wan-3.0 duration 2/3/4/5/10/15', sameSet(vals(w30, 'duration'), [2, 3, 4, 5, 10, 15]), vals(w30, 'duration'))
check('wan-3.0 no 21:9, default 16:9, adaptive available', !vals(w30, 'aspect_ratio').includes('21:9') && def(w30, 'aspect_ratio') === '16:9' && vals(w30, 'aspect_ratio').includes('adaptive'), [vals(w30, 'aspect_ratio'), def(w30, 'aspect_ratio')])
check('wan-3.0 generate_audio default false', def(w30, 'generate_audio') === false, def(w30, 'generate_audio'))
check('wan-3.0 references images only', sameSet(C(w30, 'reference')?.allowed_reference_roles ?? [], ['reference_image']), C(w30, 'reference')?.allowed_reference_roles)
check('z-image-turbo default 1K 1:1, 7 ratios', def('alibaba/z-image-turbo', 'resolution') === '1K' && def('alibaba/z-image-turbo', 'aspect_ratio') === '1:1' && vals('alibaba/z-image-turbo', 'aspect_ratio').length === 7, vals('alibaba/z-image-turbo', 'aspect_ratio'))
// BFL / Prodia
check('flux-2-flex text only', eq(modes('bfl/flux-2-flex'), ['text']), modes('bfl/flux-2-flex'))
for (const f of ['flux-2-flex', 'flux-2-pro', 'flux-pro-1.1']) check(`${f} 1MP with 5 ratios`, sameSet(vals('bfl/' + f, 'resolution'), ['1MP']) && vals('bfl/' + f, 'aspect_ratio').length === 5, [vals('bfl/' + f, 'resolution'), vals('bfl/' + f, 'aspect_ratio')])
check('flux-2-max 1MP 1:1 text only', sameSet(vals('bfl/flux-2-max', 'resolution'), ['1MP']) && sameSet(vals('bfl/flux-2-max', 'aspect_ratio'), ['1:1']) && eq(modes('bfl/flux-2-max'), ['text']), [vals('bfl/flux-2-max', 'resolution'), vals('bfl/flux-2-max', 'aspect_ratio'), modes('bfl/flux-2-max')])
check('flux-kontext-pro 9 ratios default 1:1', vals('bfl/flux-kontext-pro', 'aspect_ratio').length === 9 && def('bfl/flux-kontext-pro', 'aspect_ratio') === '1:1', vals('bfl/flux-kontext-pro', 'aspect_ratio'))
check('flux-pro-1.1 text only', eq(modes('bfl/flux-pro-1.1'), ['text']), modes('bfl/flux-pro-1.1'))
check('flux-pro-1.1-ultra 5 ratios default 1:1, has 2K', vals('bfl/flux-pro-1.1-ultra', 'aspect_ratio').length === 5 && def('bfl/flux-pro-1.1-ultra', 'aspect_ratio') === '1:1' && vals('bfl/flux-pro-1.1-ultra', 'resolution').includes('2K'), [vals('bfl/flux-pro-1.1-ultra', 'aspect_ratio'), vals('bfl/flux-pro-1.1-ultra', 'resolution')])
check('prodia 1K 1:1 only', sameSet(vals('prodia/flux-fast-schnell', 'resolution'), ['1K']) && sameSet(vals('prodia/flux-fast-schnell', 'aspect_ratio'), ['1:1']), [vals('prodia/flux-fast-schnell', 'resolution'), vals('prodia/flux-fast-schnell', 'aspect_ratio')])
// Kling / MiniMax
check('kling-2.6 no image mode', !modes('klingai/kling-2.6').includes('image'), modes('klingai/kling-2.6'))
check('kling-3.0 duration 3/5/10/15', sameSet(vals('klingai/kling-3.0', 'duration'), [3, 5, 10, 15]), vals('klingai/kling-3.0', 'duration'))
check('minimax-h3 defaults 768P / 6s', def('minimax/minimax-h3', 'resolution') === '768P' && def('minimax/minimax-h3', 'duration') === 6, [def('minimax/minimax-h3', 'resolution'), def('minimax/minimax-h3', 'duration')])
check('minimax-h3-max defaults 480p / 5s', String(def('minimax/minimax-h3-max', 'resolution')).toLowerCase() === '480p' && def('minimax/minimax-h3-max', 'duration') === 5, [def('minimax/minimax-h3-max', 'resolution'), def('minimax/minimax-h3-max', 'duration')])
for (const h of ['minimax-h3', 'minimax-h3-max']) check(`${h} first frame aspect only adaptive`, sameSet(vals('minimax/' + h, 'aspect_ratio', 'image') ?? [], ['adaptive']), vals('minimax/' + h, 'aspect_ratio', 'image'))
check('minimax-h3-max no reference mode', !modes('minimax/minimax-h3-max').includes('reference'), modes('minimax/minimax-h3-max'))
// xAI
const gi = 'spacexai/grok-imagine-image'
check('grok-image ratios 1:1/16:9/9:16/3:2/2:3 default 1:1', sameSet(vals(gi, 'aspect_ratio'), ['1:1', '16:9', '9:16', '3:2', '2:3']) && def(gi, 'aspect_ratio') === '1:1', vals(gi, 'aspect_ratio'))
check('grok-image 1K only', sameSet(vals(gi, 'resolution'), ['1K']), vals(gi, 'resolution'))
check('grok-image edit 1 ref', C(gi, 'image')?.max_references === 1, C(gi, 'image')?.max_references)
const g2 = 'spacexai/grok-imagine-image-2.0'
check('grok-2.0 quality low/medium default low', sameSet(vals(g2, 'quality'), ['low', 'medium']) && def(g2, 'quality') === 'low', [vals(g2, 'quality'), def(g2, 'quality')])
check('grok-2.0 no quality when editing', !P(g2, 'quality', 'image'), !!P(g2, 'quality', 'image'))
check('grok-2.0 7 ratios default 1:1', vals(g2, 'aspect_ratio').length === 7 && def(g2, 'aspect_ratio') === '1:1', vals(g2, 'aspect_ratio'))
check('grok-2.0 edits accept auto', vals(g2, 'aspect_ratio', 'image')?.includes('auto'), vals(g2, 'aspect_ratio', 'image'))
check('grok-2.0 edit up to 3 refs', C(g2, 'image')?.max_references === 3, C(g2, 'image')?.max_references)
const gv = 'spacexai/grok-imagine-video'
check('grok-video default duration 6', def(gv, 'duration') === 6, def(gv, 'duration'))
check('grok-video silent only', sameSet(vals(gv, 'generate_audio'), [false]), vals(gv, 'generate_audio'))
check('grok-video no 4:3/3:4, default 16:9', !vals(gv, 'aspect_ratio').includes('4:3') && !vals(gv, 'aspect_ratio').includes('3:4') && def(gv, 'aspect_ratio') === '16:9', vals(gv, 'aspect_ratio'))
// Other image
for (const g of ['gpt-image-1', 'gpt-image-1.5']) check(`${g} aspect 1:1/2:3/3:2 default 1:1`, sameSet(vals('openai/' + g, 'aspect_ratio'), ['1:1', '2:3', '3:2']) && def('openai/' + g, 'aspect_ratio') === '1:1', vals('openai/' + g, 'aspect_ratio'))
check('recraft-v3 5 ratios default 1:1, text only', vals('recraft/recraft-v3', 'aspect_ratio').length === 5 && def('recraft/recraft-v3', 'aspect_ratio') === '1:1' && eq(modes('recraft/recraft-v3'), ['text']), [vals('recraft/recraft-v3', 'aspect_ratio'), modes('recraft/recraft-v3')])
check('muse 1:1 only, text only', sameSet(vals('meta/muse-image-1.0', 'aspect_ratio'), ['1:1']) && eq(modes('meta/muse-image-1.0'), ['text']), [vals('meta/muse-image-1.0', 'aspect_ratio'), modes('meta/muse-image-1.0')])
const rv = 'reve/reve-2.1'
check('reve same 7 ratios as Reve v1, default 1:1, no auto', sameSet(vals(rv, 'aspect_ratio'), ['16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16']) && def(rv, 'aspect_ratio') === '1:1', [vals(rv, 'aspect_ratio'), def(rv, 'aspect_ratio')])
check('reve edits take exactly 1 reference_image', C(rv, 'image')?.min_references === 1 && C(rv, 'image')?.max_references === 1 && sameSet(C(rv, 'image')?.allowed_reference_roles, ['reference_image']), C(rv, 'image'))
check('reve resolution native only', sameSet(vals(rv, 'resolution'), ['native']), vals(rv, 'resolution'))
// Retired models: the page says they were removed from the model list.
for (const id of ['google/veo-3.0-generate-001', 'google/gemini-omni-video']) check(`${id} removed from contract`, !c.models.some(m => m.id === id), null)


test('the Yir column of the official API differences page matches the model contract', () => {
  const wrong = [
    ...[...retired].map(id => `${id} is no longer in the contract; remove its rows`),
    ...results.filter(r => !r.ok).map(r => `${r.claim} (contract now: ${JSON.stringify(r.actual)})`),
  ]
  assert.deepEqual(wrong, [], 'Update the row in both official-api-differences pages, then this claim')
})

test('rules for every model hold across the contract', () => {
  const roles = new Set(['reference_image', 'first_frame', 'last_frame', 'reference_video', 'reference_audio'])
  for (const model of c.models) {
    for (const op of model.operations) {
      assert.deepEqual(op.parameters.find(p => p.name === 'n')?.values, [1], `${model.id}: n is always 1`)
      for (const constraint of Object.values(op.input_constraints)) {
        for (const role of constraint.allowed_reference_roles) assert.ok(roles.has(role), `${model.id}: ${role} is not a documented reference role`)
      }
    }
  }
})

// Retired models may still be named, only to point callers at their replacements.
const withdrawn = new Set(['google/veo-3.0-generate-001', 'google/gemini-omni-video'])

test('every model the differences pages name is still in the contract', async () => {
  const known = new Set([...c.models.map(m => m.id), ...withdrawn])
  for (const page of pages) {
    const text = await readFile(path.join(root, page), 'utf8')
    const named = [...new Set(text.match(/`[a-z]+\/[a-z0-9.-]+`/g) ?? [])].map(id => id.slice(1, -1))
    assert.deepEqual(named.filter(id => !known.has(id)), [], `${page} names retired models`)
  }
})
