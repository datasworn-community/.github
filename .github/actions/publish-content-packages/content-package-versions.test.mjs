import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isStableVersion,
  latestStableVersionOnLine,
  nextPatchVersion,
  parseSemver,
  schemaLineFor
} from './content-package-versions.mjs'

test('parseSemver identifies prerelease versions', () => {
  assert.deepEqual(parseSemver('0.2.0-experimental.1.abcdef'), {
    major: 0,
    minor: 2,
    patch: 0,
    prerelease: 'experimental.1.abcdef'
  })
  assert.equal(isStableVersion('0.2.0'), true)
  assert.equal(isStableVersion('0.2.0-experimental.1.abcdef'), false)
})

test('latestStableVersionOnLine ignores canaries and other prereleases', () => {
  const versions = [
    '0.2.0-experimental.1.abcdef',
    '0.2.1-beta.1',
    '0.1.9',
    '0.2.0',
    '0.2.1'
  ]

  assert.equal(latestStableVersionOnLine(versions, '0.2'), '0.2.1')
})

test('latestStableVersionOnLine returns undefined when only canaries exist', () => {
  assert.equal(
    latestStableVersionOnLine(['0.2.0-experimental.1.abcdef'], '0.2'),
    undefined
  )
})

test('nextPatchVersion starts at schema-line zero after canary-only history', () => {
  const latest = latestStableVersionOnLine(
    ['0.2.0-experimental.1.abcdef'],
    '0.2'
  )

  assert.equal(nextPatchVersion('0.2', latest), '0.2.0')
})

test('schemaLineFor ignores prerelease suffixes', () => {
  assert.equal(schemaLineFor('0.2.0-experimental.1.abcdef'), '0.2')
})
