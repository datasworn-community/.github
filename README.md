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
