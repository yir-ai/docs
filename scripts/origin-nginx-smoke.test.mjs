import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildNginxHarnessConfig,
  parsePublishedPort,
} from './origin-nginx-smoke.mjs'

test('builds a complete Nginx harness with Docs before the Web fallback', () => {
  const config = buildNginxHarnessConfig()
  const docsInclude = config.indexOf('include /etc/nginx/yir-docs-origin.conf;')
  const webFallback = config.indexOf('location / {')

  assert.ok(docsInclude >= 0)
  assert.ok(webFallback > docsInclude)
  assert.match(config, /listen 8080;/u)
  assert.match(config, /return 200 "YIR_WEB_FALLBACK\\n";/u)
})

test('parses Docker host port output without accepting public bindings', () => {
  assert.equal(parsePublishedPort('127.0.0.1:49153\n'), 49153)
  assert.throws(
    () => parsePublishedPort('0.0.0.0:49153\n'),
    /Unexpected Docker port output/u,
  )
})
