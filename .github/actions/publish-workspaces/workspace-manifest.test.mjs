import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertNoUnresolvedWorkspaceDependencies,
  findUnresolvedWorkspaceDependencies,
  resolveWorkspaceDependencies,
  resolveWorkspaceSpec
} from './workspace-manifest.mjs'

test('resolveWorkspaceSpec honours range modifiers', () => {
  assert.equal(resolveWorkspaceSpec('workspace:*', '0.2.0'), '0.2.0')
  assert.equal(resolveWorkspaceSpec('workspace:', '0.2.0'), '0.2.0')
  assert.equal(resolveWorkspaceSpec('workspace:^', '0.2.0'), '^0.2.0')
  assert.equal(resolveWorkspaceSpec('workspace:~', '0.2.0'), '~0.2.0')
  assert.equal(resolveWorkspaceSpec('workspace:^1.0.0', '0.2.0'), '^1.0.0')
  assert.equal(resolveWorkspaceSpec('workspace:1.2.3', '0.2.0'), '1.2.3')
})

test('resolveWorkspaceDependencies rewrites internal workspace specs across all fields', () => {
  const versions = new Map([['@scope/core', '0.2.0']])
  const manifest = {
    name: '@scope/build-tools',
    version: '0.2.0',
    dependencies: { '@scope/core': 'workspace:^', lodash: '^4.0.0' },
    peerDependencies: { '@scope/core': 'workspace:*' },
    devDependencies: { '@scope/core': 'workspace:*' }
  }

  const resolved = resolveWorkspaceDependencies(manifest, versions)

  assert.equal(resolved.dependencies['@scope/core'], '^0.2.0')
  assert.equal(resolved.dependencies.lodash, '^4.0.0', 'external dep untouched')
  assert.equal(resolved.peerDependencies['@scope/core'], '0.2.0')
  assert.equal(resolved.devDependencies['@scope/core'], '0.2.0')
})

test('resolveWorkspaceDependencies does not mutate its input', () => {
  const versions = new Map([['@scope/core', '0.2.0']])
  const manifest = {
    name: '@scope/build-tools',
    version: '0.2.0',
    dependencies: { '@scope/core': 'workspace:*' }
  }

  resolveWorkspaceDependencies(manifest, versions)

  assert.equal(manifest.dependencies['@scope/core'], 'workspace:*')
})

test('resolveWorkspaceDependencies leaves specs for unknown (private) targets', () => {
  const versions = new Map([['@scope/core', '0.2.0']])
  const manifest = {
    name: '@scope/build-tools',
    version: '0.2.0',
    dependencies: { '@scope/private-tool': 'workspace:*' }
  }

  const resolved = resolveWorkspaceDependencies(manifest, versions)

  assert.equal(resolved.dependencies['@scope/private-tool'], 'workspace:*')
})

test('guard throws on an unresolved workspace spec in a consumer-facing field', () => {
  const manifest = {
    name: '@scope/build-tools',
    dependencies: { '@scope/core': 'workspace:*' }
  }

  assert.throws(
    () => assertNoUnresolvedWorkspaceDependencies(manifest),
    /unresolved workspace protocol dependencies/
  )
})

test('guard ignores workspace specs in devDependencies (never consumer-installed)', () => {
  const manifest = {
    name: '@scope/build-tools',
    dependencies: { '@scope/core': '0.2.0' },
    devDependencies: { '@scope/core': 'workspace:*' }
  }

  assert.deepEqual(findUnresolvedWorkspaceDependencies(manifest), [])
  assert.doesNotThrow(() => assertNoUnresolvedWorkspaceDependencies(manifest))
})

test('a resolved release manifest passes the guard', () => {
  const versions = new Map([['@scope/core', '0.2.0']])
  const manifest = {
    name: '@scope/build-tools',
    version: '0.2.0',
    peerDependencies: { '@scope/core': 'workspace:*' },
    devDependencies: { '@scope/core': 'workspace:*' }
  }

  const resolved = resolveWorkspaceDependencies(manifest, versions)

  assert.doesNotThrow(() => assertNoUnresolvedWorkspaceDependencies(resolved))
})
