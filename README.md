# datasworn-community shared GitHub config

This repository hosts organization-level GitHub metadata and reusable workflows
for Datasworn Community repositories.

## Reusable workflows

Package repositories should call these workflows from thin local wrappers and pin
them to a stable tag, for example:

```yaml
jobs:
  build:
    uses: datasworn-community/.github/.github/workflows/build.yml@v1
```

Use `@v1` rather than `@main` so changes to the shared workflows can be released
deliberately.

## Publishing

Publishing is configured for npm Trusted Publishing with provenance. Each package
must register its package repository's local calling workflow (for example,
`release.yml`) as its trusted publisher in npm. Stable and canary jobs must share
that caller filename because npm allows one trusted publisher per package. The
separate reusable workflow filenames in this repository are not registered with
npm.

Canary cleanup uses `npm dist-tag rm`, which npm OIDC does not authenticate. Keep
a scoped `NPM_TOKEN` secret inherited by experimental callers for cleanup only;
stable and canary `npm publish` steps do not receive it.

Release workflows publish non-private packages declared in the root
`workspaces` field, in internal dependency order. Repositories with one package
can omit `workspaces`; the root package will be used. Repositories with multiple
packages must declare every publishable package as a workspace and must not
include helper manifests such as `dist/esm/package.json` in those workspace
patterns. Mark packages that should never publish with `"private": true`.

Internal workspace dependencies are rewritten to concrete versions before
publish, because npm publishes the `workspace:` protocol verbatim and such specs
are unresolvable from the registry:

- **Release:** each internal `workspace:` dependency is resolved to the
  depended-on package's locked version, honouring the range modifier
  (`workspace:*`/`workspace:` → `<version>`, `workspace:^` → `^<version>`,
  `workspace:~` → `~<version>`, explicit ranges kept as-is). For example, if
  `@datasworn-community/build-tools` declares `@datasworn-community/core` as a
  `workspace:*` dependency, the published build-tools depends on core's exact
  released version.
- **Experimental (canary):** internal dependency ranges are rewritten to that
  PR's exact canary versions, so the canary build-tools depends on that same
  PR's core canary.

Before publishing anything, the release/canary run validates every manifest and
**fails loud** if a consumer-facing field (`dependencies`, `peerDependencies`,
`optionalDependencies`) still carries a `workspace:` spec — for instance, a
dependency on a `private` workspace package that is never published. Resolve it
to a published package or a concrete range. (`devDependencies` are exempt: an
installer never resolves a dependency's devDependencies.)

Content repositories that generate publishable Datasworn package directories
should use the content workflows instead of the workspace release workflow:

```yaml
jobs:
  release:
    uses: datasworn-community/.github/.github/workflows/content-release.yml@v1
```

The content release workflow reads generated package directories from
`dist/packages` by default. It compares each generated artifact with the latest
published package on the same schema line, publishes only changed packages, and
calculates the next patch version independently per package. Dependency ranges
between generated content packages stay on schema-line ranges such as `^0.2.0`,
so patch releases of a dependency do not force dependent package releases.

For experimental releases, internal workspace dependency ranges are rewritten to
that PR's exact canary versions before publish. For example, if
`@datasworn-community/build-tools` depends on `@datasworn-community/core`, the
canary build-tools package will depend on that same PR's core canary.

Experimental release callers should include PR open/update events so the shared
workflow can post instructions before a canary is requested. This job belongs in
the same local caller file as the stable release job:

```yaml
on:
  pull_request:
    types: [opened, reopened, ready_for_review, labeled, synchronize, closed]

jobs:
  experimental-release:
    uses: datasworn-community/.github/.github/workflows/experimental-release.yml@v1
    # Inherited only for token-backed dist-tag cleanup when the PR closes.
    secrets: inherit
```
