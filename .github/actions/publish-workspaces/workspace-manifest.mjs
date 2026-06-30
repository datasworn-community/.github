// Pure manifest transforms shared by publish-workspaces.mjs. Kept free of fs/IO
// so they can be unit tested (see workspace-manifest.test.mjs).

// Fields whose specs a consumer of the published package will actually resolve.
// devDependencies are intentionally excluded: an installer never resolves a
// dependency's devDependencies, so a leftover `workspace:` spec there is inert.
export const PUBLISHED_DEPENDENCY_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies'
]

// All dependency fields we rewrite. devDependencies are included so the
// published tarball carries no `workspace:` specs at all, even in inert fields.
export const ALL_DEPENDENCY_FIELDS = [
  ...PUBLISHED_DEPENDENCY_FIELDS,
  'devDependencies'
]

const WORKSPACE_PROTOCOL = 'workspace:'

export function isWorkspaceSpec(spec) {
  return typeof spec === 'string' && spec.startsWith(WORKSPACE_PROTOCOL)
}

// Resolve a `workspace:` protocol spec to a concrete range against the target's
// published `version`, honouring the range modifier the way pnpm/yarn/bun do:
//   workspace:*  / workspace:  -> <version>
//   workspace:^                -> ^<version>
//   workspace:~                -> ~<version>
//   workspace:<explicit range> -> <explicit range>
export function resolveWorkspaceSpec(spec, version) {
  const rest = spec.slice(WORKSPACE_PROTOCOL.length)

  if (rest === '' || rest === '*') {
    return version
  }

  if (rest === '^' || rest === '~') {
    return `${rest}${version}`
  }

  return rest
}

// Return a new manifest with internal `workspace:` dependencies resolved to the
// concrete versions in `versionsByName`. Specs targeting packages not in the map
// (e.g. a private, non-published workspace) are left untouched so the publish
// guard can flag them.
export function resolveWorkspaceDependencies(manifest, versionsByName) {
  const next = structuredClone(manifest)

  for (const field of ALL_DEPENDENCY_FIELDS) {
    const deps = next[field]
    if (!deps) continue

    for (const name of Object.keys(deps)) {
      if (isWorkspaceSpec(deps[name]) && versionsByName.has(name)) {
        deps[name] = resolveWorkspaceSpec(deps[name], versionsByName.get(name))
      }
    }
  }

  return next
}

// List `field.name = "spec"` entries that would publish an unresolved
// `workspace:` spec in a consumer-facing field.
export function findUnresolvedWorkspaceDependencies(manifest) {
  const offenders = []

  for (const field of PUBLISHED_DEPENDENCY_FIELDS) {
    const deps = manifest[field]
    if (!deps) continue

    for (const [name, spec] of Object.entries(deps)) {
      if (isWorkspaceSpec(spec)) {
        offenders.push(`${field}.${name} = ${JSON.stringify(spec)}`)
      }
    }
  }

  return offenders
}

// Throw before publishing if a consumer-facing field still carries a
// `workspace:` spec — npm publishes such specs verbatim and they are
// unresolvable from the registry, so fail loud instead of shipping a broken
// package.
export function assertNoUnresolvedWorkspaceDependencies(manifest) {
  const offenders = findUnresolvedWorkspaceDependencies(manifest)

  if (offenders.length > 0) {
    throw new Error(
      `${manifest.name} would publish unresolved workspace protocol dependencies: ${offenders.join(', ')}. ` +
        'Publish targets must be published (non-private) workspace packages, or declare a concrete version range.'
    )
  }
}
