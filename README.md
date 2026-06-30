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
repository and workflow must be registered as a trusted publisher in npm before
release or canary publication will work.

If Trusted Publishing is not available for a package, add an organization-level
`NPM_TOKEN` secret and inherit it from the caller workflow.

Release workflows publish non-private packages declared in the root
`workspaces` field, in internal dependency order. Repositories with one package
can omit `workspaces`; the root package will be used. Repositories with multiple
packages must declare every publishable package as a workspace and must not
include helper manifests such as `dist/esm/package.json` in those workspace
patterns. Mark packages that should never publish with `"private": true`.

For experimental releases, internal workspace dependency ranges are rewritten to
that PR's exact canary versions before publish. For example, if
`@datasworn-community/build-tools` depends on `@datasworn-community/core`, the
canary build-tools package will depend on that same PR's core canary.

Experimental release callers should include PR open/update events so the shared
workflow can post instructions before a canary is requested:

```yaml
on:
  pull_request:
    types: [opened, reopened, ready_for_review, labeled, synchronize, closed]

jobs:
  experimental-release:
    uses: datasworn-community/.github/.github/workflows/experimental-release.yml@v1
    secrets: inherit
```
