# Proposal: Content-Regression Tests for Datasworn Content Repos

**Status:** Draft — soliciting feedback before implementation.
**Author:** @tbsvttr
**Scope:** `official-content`, `community-content`, `datasworn-elegy`, and any future org content repos.

## Problem

Today's build gate catches structural breakage — schema validation runs on every PR, and a source YAML that produces malformed JSON fails immediately. That's a strong lower bound.

It's also the only lower bound. Everything above "does the JSON parse?" is unprotected:

| Regression class | Would we catch it today? |
|---|---|
| Source YAML edit removes 30 oracle rows | ❌ Silent — JSON still parses |
| Refactor renames a table and drops the `replaces:` pointer | ❌ Silent — nothing counts assertions on IDs |
| A `1d100` table has ranges 1–50 then 51–95 with a 5-row gap | ❌ Silent — schema doesn't check roll-range integrity |
| A move references `oracle_rollable:classic/does_not_exist` | ❌ Silent — cross-ID reference isn't checked at build time |
| A dice expression is `1d100+` (typo) | ❌ Silent — depends on the schema's regex, and even then only at read time |
| Two rows in the same table have overlapping roll ranges | ❌ Silent |

We hit exactly one of these in real life this month: the Starforged Derelict Settlement zones off-by-5. The bug survived the build gate because the JSON was well-formed — just wrong. A user in the Iron Vault Discord found it, and even after the fix we haven't added anything that would catch the next one.

## Proposal

Add a **shared reusable content-regression test** at [`datasworn-community/.github/.github/workflows/content-regression.yml`](https://github.com/datasworn-community/.github) that content repos plug into their CI. The test runs after the existing build and asserts:

1. **Roll-range integrity.** Every `oracle_rollable` with a `rows` array has non-overlapping, no-gap roll ranges that sum to exactly the declared dice's range (1d100 → 1..100; 1d20 → 1..20; multi-dice → the correct combined range). Same shape as the ad-hoc Python checker I ran while reviewing PR #12 on `tbsvttr/datasworn`.

2. **Cross-package ID reference resolution.** Every `oracle_rollable`, `move`, `asset`, etc. reference embedded in text (`datasworn:oracle_rollable:classic/…`), macros (`{{table>oracle_rollable:classic/…}}`), or dedicated fields (`replaces`, `enhances`, `suggestions`, `oracles`, `moves.roll_options`, `assets`, etc.) resolves to an ID that exists somewhere in the built tree — either this package or one of its declared dependencies. Reuses `extractIdRefs` and `validateIdRefs` from `@datasworn-community/build-tools` (already tested in [`datasworn/tests/build-tools.test.ts`](https://github.com/datasworn-community/datasworn/blob/main/tests/build-tools.test.ts)).

3. **Baseline counts.** For each publishable package, a checked-in `content-baseline.json` records the expected count of moves, oracles, assets, delve sites, etc. Any change to that count on a PR fails the check. Regeneration is a deliberate `--update` flag rewriting the baseline in the same PR — so removing content requires explicit acknowledgment, not silent drift.

## Non-goals

- **Not** a semantic-fidelity check ("is the row text faithful to the print source?"). That still needs human review with the book, and `release:*` labels already signal that intent.
- **Not** a schema-shape validator — `datasworn-build` already handles that. This layers on top.
- **Not** enforcing a particular style (roll-range representation, source metadata format, etc.).

## Interface sketch

Content repos plug in via a thin caller in `.github/workflows/regression.yml`:

```yaml
name: Content regression
on:
  pull_request:
    branches: [main]

jobs:
  check:
    uses: datasworn-community/.github/.github/workflows/content-regression.yml@v1
    with:
      baseline-file: content-baseline.json  # defaults to this
```

The reusable workflow:

1. Runs the shared `bun-build` action to install and build.
2. Runs a bun script (`check-content-regression.ts`, lives in this repo) that:
   - Loads every built `dist/packages/*/json/<pkg>.json`
   - Runs the three assertions above
   - Prints a diff-shaped report if any fail
3. Fails the job if anything mismatches. Otherwise no-op.

## Baseline update UX

When a PR legitimately adds/removes content, CI reports "counts changed — regenerate the baseline":

```
❌ classic: expected 34 moves, found 35 (added move:classic/adventure/foo)

To acknowledge intentional content changes:

    bun run baseline:update

then commit the updated content-baseline.json.
```

The `bun run baseline:update` script is provided by the reusable workflow (via a small `package.json` script snippet in `community-template` and copied into each content repo when it adopts the check).

## Rollout plan

1. **Land the shared workflow + script here.** This PR.
2. **Adopt on `official-content` first as the canary.** Cheapest to test — smallest content surface, all packages already published.
3. **Generate the initial baseline** on `official-content` (the workflow calls `baseline:update` once on land to seed it). Verify the checks pass on a no-op PR.
4. **Roll out to `community-content` and `datasworn-elegy`** the same way.
5. Iterate on false positives — expect a couple of rounds where the roll-range integrity check flags legitimate patterns we hadn't accounted for (multi-dice tables, non-contiguous ranges by design, etc.).

## Cost estimate

- Shared workflow + script + docs: ~1 day.
- Per-repo adoption: ~30 min each (adopt the workflow, seed the baseline, verify).
- Ongoing false-positive triage: probably 2-3 minor script fixes in the first month.

## Open questions

1. **Bun script vs. TypeScript-as-CLI.** The rest of the org already ships TypeScript-as-CLI (build-tools' `datasworn-build`). This could be a build-tools sub-command instead of a separate bun script, keeping everything in one entry point. Cleaner but bigger surgery — worth doing?

2. **Baseline granularity.** Just top-level counts (34 moves, 128 oracles, …) or drill-down per collection (classic/adventure: 8 moves, classic/combat: 6 moves, …)? Top-level catches the "someone deleted a whole file" case; drill-down catches the "someone removed a single move" case. Latter is more useful, both are cheap. My lean is drill-down.

3. **Do IDs of new content need to be listed explicitly?** i.e. does the baseline record `["move:classic/adventure/face_danger", "move:classic/adventure/secure_an_advantage", …]` rather than just count `2`? More noise in the baseline file, but a rename shows up as a diff instead of a wash. Lean toward yes for moves/assets/site themes, no for oracle rows (too noisy).

## Alternatives considered

- **Per-repo bespoke tests.** Each content repo writes its own vitest/bun suite. Rejected: 3× the maintenance, 3× the drift.
- **Property-based tests only.** No baselines, just invariants (roll ranges sum correctly, IDs resolve). Rejected: catches structural bugs but misses "someone deleted 30 rows" — which is the exact failure mode that motivated this.
- **Rely on Iron Vault users to catch bugs.** That's the status quo, and it's how we found the Derelict Settlement bug. Not sustainable as more content lands.

## Discussion

Comments on this PR, or in the `#datasworn` Discord channel. Aiming to land the shared workflow within a week if there are no objections; content-repo adoption follows.
