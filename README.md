# datasworn-community shared GitHub config

This repository hosts organization-level GitHub metadata, the shared Bun build
action, and reusable publishing workflows for Datasworn content repositories.

## Shared components

Content repositories should call these reusable workflows from thin local
wrappers:

- `content-build.yml` builds and validates content packages.
- `content-release.yml` publishes stable content packages.
- `content-experimental-release.yml` publishes PR canaries.

The `bun-build` composite action supplies the common Bun setup, install, build,
and optional validation steps used by those workflows. The
`publish-content-packages` action implements content-package version calculation
and publishing.

Pin shared components to an immutable release tag such as `@v1.3.0` rather than
`@main` so changes can be adopted deliberately. For example:

```yaml
jobs:
  build:
    uses: datasworn-community/.github/.github/workflows/content-build.yml@v1.3.0
```

## Content publishing

Publishing uses npm Trusted Publishing with provenance. Each npm package must
register its repository's local calling workflow, normally `release.yml`, as its
trusted publisher. Stable and experimental jobs must live in that same local
caller because npm identifies the trusted publisher by repository and workflow
filename; the reusable workflow filenames in this repository are not registered
with npm.

Stable and canary publishes use npm OIDC exclusively, without an npm access
token. Each canary is published under a per-PR `pr-<number>` dist-tag. These tags
remain after the PR closes as convenience aliases and can move when a new canary
is published. Use the exact canary version for reproducible installs.

The content release workflow reads generated package directories from
`dist/packages` by default. It compares each generated artifact with the latest
published package on the same Datasworn schema line, publishes only changed
packages, and calculates the next patch version independently per package.
Dependency ranges between generated content packages stay on schema-line ranges
such as `^0.2.0`, so patch releases of a dependency do not force dependent
package releases.

For experimental releases, dependencies between generated content packages are
rewritten to that PR's exact canary versions before publishing. This keeps all
packages in a canary set on the same PR build.

A local caller that handles both stable and experimental publishing should
include the PR events needed for canary instructions and publishes:

```yaml
on:
  pull_request:
    types: [opened, reopened, ready_for_review, labeled, synchronize]
  push:
    branches: [main]

jobs:
  experimental-release:
    if: github.event_name == 'pull_request'
    permissions:
      contents: read
      id-token: write
      pull-requests: write
    uses: datasworn-community/.github/.github/workflows/content-experimental-release.yml@v1.3.0

  release:
    if: github.event_name != 'pull_request'
    permissions:
      contents: read
      id-token: write
    uses: datasworn-community/.github/.github/workflows/content-release.yml@v1.3.0
```
