# Proposal: Content-Regression Tests for Datasworn Content Repos

**Status:** Draft — soliciting feedback before implementation.
**Author:** @tbsvttr
**Scope:** `official-content`, `community-content`, `datasworn-elegy`, and any future org content repos.

## Problem

Today's build gate catches structural breakage — schema validation runs on every PR, and a source YAML that produces malformed JSON fails immediately. That's a strong lower bound.

It's also the only lower bound. Everything above "does the JSON parse?" is unprotected:

| Regression class | Would we catch it today? |
|---|---|
| Refactor renames a table and drops the `replaces:` pointer | ❌ Silent — nothing asserts on IDs |
| A `1d100` table has ranges 1–50 then 51–95 with a 5-row gap | ❌ Silent — schema doesn't check roll-range integrity |
| A move references `oracle_rollable:classic/does_not_exist` | ❌ Silent — cross-ID reference isn't checked at build time |
| A dice expression is `1d100+` (typo) | ❌ Silent — depends on the schema's regex, and even then only at read time |
| Two rows in the same table have overlapping roll ranges | ❌ Silent |

These share a trait: they're **invariants a human reviewer can't reliably eyeball**. A 100-row table diff where two ranges overlap looks exactly like a correct one; an ID reference into another package can't be checked without the other package's built tree in front of you. (Bulk content *removal*, by contrast, is loud in review — the generated JSON is committed, so deleting 30 oracle rows shows up as a large red diff. That class stays a reviewer's call; see Non-goals.)

We hit exactly one of these in real life this month: the Starforged Derelict Settlement zones off-by-5. The bug survived the build gate because the JSON was well-formed — just wrong. A user in the Iron Vault Discord found it, and even after the fix we haven't added anything that would catch the next one.

## Proposal

Add a **shared reusable content-regression test** at [`datasworn-community/.github/.github/workflows/content-regression.yml`](https://github.com/datasworn-community/.github) that content repos plug into their CI. The test runs after the existing build and asserts:

1. **Roll-range integrity.** Every `oracle_rollable` with a `rows` array has non-overlapping, no-gap roll ranges that sum to exactly the declared dice's range (1d100 → 1..100; 1d20 → 1..20; multi-dice → the correct combined range). Same shape as the ad-hoc Python checker I ran while reviewing PR #12 on `tbsvttr/datasworn`.

2. **Cross-package ID reference resolution.** Every `oracle_rollable`, `move`, `asset`, etc. reference embedded in text (`datasworn:oracle_rollable:classic/…`), macros (`{{table>oracle_rollable:classic/…}}`), or dedicated fields (`replaces`, `enhances`, `suggestions`, `oracles`, `moves.roll_options`, `assets`, etc.) resolves to an ID that exists somewhere in the built tree — either this package or one of its declared dependencies. Reuses `extractIdRefs` and `validateIdRefs` from `@datasworn-community/build-tools` (already tested in [`datasworn/tests/build-tools.test.ts`](https://github.com/datasworn-community/datasworn/blob/main/tests/build-tools.test.ts)).

## Non-goals

- **Not** a semantic-fidelity check ("is the row text faithful to the print source?"). That still needs human review with the book, and `release:*` labels already signal that intent.
- **Not** a schema-shape validator — `datasworn-build` already handles that. This layers on top.
- **Not** enforcing a particular style (roll-range representation, source metadata format, etc.).
- **Not** a guard against content removal. An earlier draft proposed checked-in baseline counts (fail CI when the number of moves/oracles changes); review feedback rightly compared that to snapshot UI testing — people learn to run `--update` without looking, and legitimately removing content shouldn't need a CI escape hatch. Content additions/removals are visible in the committed `generated-datasworn/` diff and stay a code-review concern.

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
```

The reusable workflow:

1. Runs the shared `bun-build` action to install and build.
2. Runs `datasworn-build check` (a new sub-command in `@datasworn-community/build-tools` — see resolved question below) that:
   - Loads every built `dist/packages/*/json/<pkg>.json`
   - Runs the two assertions above
   - Prints a diff-shaped report if any fail
3. Fails the job if anything mismatches. Otherwise no-op.

Both checks are pure invariants — no checked-in state, no update flag, nothing to regenerate. A failing check means the content is wrong (or the check has a false positive to fix), never "you forgot to acknowledge a change."

## Rollout plan

1. **Land the `check` sub-command in build-tools** (`datasworn` repo) with unit tests; the ID-ref extraction/validation half already exists there.
2. **Land the shared workflow here.** This PR (after the sub-command ships).
3. **Adopt on `official-content` first as the canary.** Cheapest to test — smallest content surface, all packages already published. Verify green on a no-op PR.
4. **Roll out to `community-content` and `datasworn-elegy`** the same way.
5. Iterate on false positives — expect a couple of rounds where the roll-range integrity check flags legitimate patterns we hadn't accounted for (multi-dice tables, non-contiguous ranges by design, etc.).

## Cost estimate

- `check` sub-command in build-tools + tests: ~1 day (roll-range logic is new; ID-ref validation already exists).
- Shared workflow + docs: ~half a day.
- Per-repo adoption: ~15 min each (add the workflow caller, verify).
- Ongoing false-positive triage: probably 2-3 minor fixes in the first month.

## Resolved questions

1. **Bun script vs. TypeScript-as-CLI** → build-tools sub-command (`datasworn-build check`). Review feedback was indifferent between the two; the deciding factor is that `extractIdRefs`/`validateIdRefs` already live in build-tools, so the sub-command reuses them directly instead of importing across package boundaries, and content repos get it for free through the dependency they already have.

2. **Baseline counts, granularity, and explicit ID lists** → dropped entirely with the baseline mechanism (see Non-goals). Content addition/removal is reviewable in the committed `generated-datasworn/` diff; CI only asserts invariants that can't be eyeballed.

## Alternatives considered

- **Per-repo bespoke tests.** Each content repo writes its own vitest/bun suite. Rejected: 3× the maintenance, 3× the drift.
- **Checked-in baseline counts.** Fail CI when the move/oracle/asset count changes, with a `--update` flag to acknowledge. Rejected on review feedback: same failure mode as snapshot UI testing (people run `--update` reflexively), and content removal is a legitimate, review-visible operation that shouldn't need a CI escape hatch.
- **Rely on Iron Vault users to catch bugs.** That's the status quo, and it's how we found the Derelict Settlement bug. Not sustainable as more content lands.

## Discussion

Comments on this PR, or in the `#datasworn` Discord channel. Aiming to land the shared workflow within a week if there are no objections; content-repo adoption follows.
