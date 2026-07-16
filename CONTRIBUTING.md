# Contributing to Datasworn Community

Thanks for wanting to help. This document is the org-wide reference for conventions that repeat across every Datasworn Community repo. Individual repos' READMEs cover their own specifics (build, test, layout); this file covers the workflow patterns that live at the org level.

## Where to open a PR

| You want to change… | Repo |
|---|---|
| Datasworn schema / types / `@datasworn-community/core` runtime / build-tools | [`datasworn`](https://github.com/datasworn-community/datasworn) |
| Official ruleset content (Ironsworn Classic / Delve / Lodestar / Starforged / Sundered Isles) | [`official-content`](https://github.com/datasworn-community/official-content) |
| Community expansion content (Ancient Wonders / Fe-Runners / Ironsmith / Starsmith) | [`community-content`](https://github.com/datasworn-community/community-content) |
| Starting a brand-new community content package | Fork [`community-template`](https://github.com/datasworn-community/community-template) |
| The Elegy game data | [`datasworn-elegy`](https://github.com/datasworn-community/datasworn-elegy) |
| The web viewer at <https://datasworn-community.github.io/viewer/> | [`viewer`](https://github.com/datasworn-community/viewer) |
| Python Pydantic bindings | [`python-bindings`](https://github.com/datasworn-community/python-bindings) |
| Shared CI actions / reusable workflows / this doc | [`.github`](https://github.com/datasworn-community/.github) |

## Release labels (schema-touching repos)

`datasworn`, `official-content`, and `community-content` gate PR merges on a **release policy check**. When a PR touches files that affect a shipped npm package, exactly one `release:*` label must be applied before CI passes.

| Label | When to use |
|---|---|
| `release:none` | The PR touches shipped files but doesn't semantically change them — reformatting, refactors, cosmetic tooling churn (e.g. a TypeBox patch bump that only reorders JSON schema keys). No npm release will ship. |
| `release:patch` | A bug fix, dependency bump, or other non-schema change. Non-schema changes default to this if no label is applied on the datasworn repo, but content repos need it explicit. |
| `release:minor-schema` | Additive schema change: new fields, new optional properties, new node types. Bumps the `datasworn_version` minor. |
| `release:major-schema` | Breaking schema change: removed or renamed fields, changed constraints, changed defaults. Bumps the `datasworn_version` major. |
| `release_experimental` | Not a release-intent label — this is a *canary* switch. Applying it publishes canary artifacts under a `pr-<number>` npm dist-tag on every push while the label is present. Remove to stop; the tag remains after the PR closes. |

If you're unsure which label applies, `release:none` is the safest default; a maintainer can bump it later. **Do not add more than one release label** — the check enforces exactly one.

## Dependabot and lockfiles

The JS repos use Bun with `bun.lock` committed. As of 2025 the Dependabot config in each repo uses `package-ecosystem: bun` so Dependabot updates the lockfile alongside `package.json` in the same PR.

If you find a Dependabot PR whose CI fails with `error: lockfile had changes, but lockfile is frozen`, the repo is still on the older `npm` ecosystem — check `.github/dependabot.yml`. Fix is a one-line ecosystem swap; then any future Dependabot PR needs no manual lockfile work.

For repos still on `npm` ecosystem, the manual fix is:

```sh
git checkout <dependabot-branch>
bun install
git add bun.lock
git commit -m "chore: regenerate bun.lock"
git push
```

## Bun / Node versions

Every repo pins Bun in `.tool-versions`; the shared `bun-build` composite action reads that pin so local `bun --version` and CI stay in sync. If you use `asdf` or `mise`, the pin is applied automatically.

Node 24+ is required for the small set of tools that shell out to `node` (mostly TypeScript's CLI).

## Shared build action

CI in every JS repo delegates to the shared composite action in this repo:

```yaml
- uses: datasworn-community/.github/.github/actions/bun-build@v1.4.0
  with:
    validate: "true"
    audit-level: moderate       # optional, default is moderate
    audit-ignore: ""            # optional, comma-separated GHSA IDs
```

The action:

1. Sets up Bun from the caller's `.tool-versions`
2. Runs `bun install --frozen-lockfile`
3. Runs `bun audit --audit-level=<level>` unless `audit-level: off`
4. Runs `bun run build`
5. Checks the generated output directory (default `generated-datasworn`) stayed in sync
6. Runs `bun run validate` if `validate: "true"`

Pin the action to an immutable tag (`@v1.4.0`), not `@main`, so version changes are adopted deliberately.

## Content authoring

The three content repos (`official-content`, `community-content`, `datasworn-elegy`) share a common shape:

- Source YAML lives under `source_data/`
- Generated JSON lives under `generated-datasworn/` and is committed
- `bun run build` writes both `generated-datasworn/` and `dist/packages/` (npm publish artifacts)
- **Don't edit generated files by hand.** The shared bun-build action fails CI if `generated-datasworn/` is out of sync with the source, precisely to catch that mistake.

Per-repo details (adding a new package, package tiers, publishing) live in each repo's `docs/` folder.

## Reporting bugs in shipped data

Content bugs (a roll range off by a few, a typo, a missing table) belong in the content repo that ships the affected package — see the routing table at the top. Include the ruleset ID, the oracle/move/asset ID, and either a screenshot from the source book or the specific text quoted from the print version. Datasworn's convention is **fidelity to the printed source**, so a "grammar fix" that diverges from the book is likely to be reverted.

## Discord

The Ironsworn Discord's `#datasworn` channel is where most day-to-day coordination happens.
