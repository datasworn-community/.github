# Proposal: One Roll-Range Completeness Rule for Datasworn Content Repos

**Status:** Draft, revised 08.09.2026 — scope cut by about 90% after measuring the premises.
**Author:** @tbsvttr
**Scope:** `official-content`, `community-content`, `datasworn-elegy`, and any future org content repos.

> **What changed and why.** The first draft proposed a shared reusable workflow plus a new
> `datasworn-build check` sub-command, to close five regression classes it described as
> unprotected. Four of those five are already caught by `validateOracleRollable`, which runs on
> every build and which the draft did not know about — verified by mutating real content and
> running the build. One genuine gap remains, and it needs neither the workflow nor the
> sub-command. The motivating incident turns out to be a class this proposal explicitly does not
> address; that is corrected below rather than dropped.

## Problem

**Corrected 08.09.2026.** The table below originally listed five unprotected regression classes. Four of them are already caught, and the incident that motivated this proposal is caught by none of the rules it proposes. Everything here was measured by mutating real content in `community-content` and running the same `bun run build` that `content-build.yml` runs, then reverting.

| Regression class | originally claimed | measured |
|---|---|---|
| A move references `oracle_rollable:starforged/does_not_exist` | ❌ silent | **build fails** — `starsmith: 2 unresolved ID reference(s)`, resolving into an npm-installed dependency |
| A `1d100` table has a gap between two rows | ❌ silent | **build fails** — `@ index N: Roll range (…) is not sequential with previous numbered row` |
| Two rows have overlapping roll ranges | ❌ silent | **build fails** — same adjacency check |
| A dice expression is `1d100+` | ❌ silent | **build fails** — `diceRange()` uses its own *anchored* pattern, so `1d100+`, `1d6+1d8`, `xx1d6xx` and `d100` all throw |
| Refactor drops a `replaces:` pointer | ❌ silent | still unverified; `replaces` targets are IDs, so the ID-ref check probably covers it |

The mechanism doing the work is `validateOracleRollable` in [`packages/build-tools/src/semantic-validators.ts:38`](https://github.com/datasworn-community/datasworn/blob/main/packages/build-tools/src/semantic-validators.ts), reached from `validateSemantics` in `in-memory-rules-package-builder.ts:134`. It runs on every build. The original draft was written without knowing it existed.

### The one class that really is unprotected

A table whose rows are individually valid and perfectly adjacent, but which **does not cover the whole dice range**. Measured: changing a `1d100` table's last row from `96-100` to `96-99` leaves 100 unreachable, and the build stays **green**.

Nothing checks that the first numbered row starts at the dice minimum or that the last one ends at the maximum. Adjacency is checked *between* rows; the two ends are not checked at all.

### About the motivating incident

The original draft said:

> We hit exactly one of these in real life this month: the Starforged Derelict Settlement zones off-by-5.

That is wrong, and it is worth correcting rather than quietly dropping, because it was the argument for doing any of this. Reconstructed from `official-content` commit `124b01a`:

```
before:  1-20  21-30  31-50  51-60  61-70  71-90  91-100
after:   1-20  21-30  31-55  56-65  66-75  76-90  91-100
```

Both versions start at 1, end at 100, and are perfectly adjacent. **No range-integrity rule — existing or proposed — would have caught it.** The boundaries were simply in the wrong places relative to the printed book, which is semantic fidelity, and this proposal lists that under Non-goals.

So the honest position is: the completeness rule below is a real gap worth closing, and it would not have prevented the bug that prompted the proposal. Those are two separate statements and the draft conflated them.

## Proposal

One rule, added to the validator that already exists.

**Roll-range completeness.** For every `oracle_rollable` with numbered rows, assert that the first row's `roll.min` equals the dice expression's minimum and the last row's `roll.max` equals its maximum. `diceRange()` (`semantic-validators.ts:23`) already computes both bounds; `validateOracleRollable` already walks the rows in order and already compares each row against those bounds. The two end-checks are a handful of lines in a function that is doing everything else already.

No new sub-command: `datasworn-build` is a 57-line flag parser with no sub-command layer, and adding one buys nothing here because the check belongs where the other semantic checks are.

No new reusable workflow: `content-build.yml` already runs the build, and the build already runs `validateSemantics`. A stricter validator ships to the content repos the way every other build change does — by releasing build-tools and bumping the pin. The `@v1.3.0` pinning in each repo's caller gives a per-repo rollout for free.

### Expected fallout

Turning this on will fail content that is currently green. The count needs measuring against all three content repos before release — `datasworn-elegy` was not checked at all in this round. Some hits will be legitimate patterns the rule has to learn (tables that deliberately do not cover their full range, if any exist). That triage is the real cost, not the rule.

## Non-goals

- **Not** a semantic-fidelity check ("is the row text faithful to the print source?"). That still needs human review with the book, and `release:*` labels already signal that intent.
- **Not** a schema-shape validator — `datasworn-build` already handles that. This layers on top.
- **Not** enforcing a particular style (roll-range representation, source metadata format, etc.).
- **Not** a guard against content removal. An earlier draft proposed checked-in baseline counts (fail CI when the number of moves/oracles changes); review feedback rightly compared that to snapshot UI testing — people learn to run `--update` without looking, and legitimately removing content shouldn't need a CI escape hatch. Content additions/removals are visible in the committed `generated-datasworn/` diff and stay a code-review concern.

## Where the check lives

In `validateOracleRollable`, next to the bounds and adjacency checks it already performs:

```ts
// packages/build-tools/src/semantic-validators.ts
const possible = diceRange(oracle.dice)          // already there
// ... per-row bounds and adjacency ...          // already there
// new: the two ends
if (numberedRows.length > 0) {
  if (first.roll.min !== possible.min) throw …
  if (last.roll.max  !== possible.max) throw …
}
```

Content repos need no change at all. The build already calls `validateSemantics`, and each repo pins the shared workflow at `@v1.3.0`, so a stricter build-tools release rolls out one repo at a time by bumping that pin.

## Rollout plan

1. Add the completeness check to `validateOracleRollable`, with unit tests.
2. Measure the fallout across `official-content`, `community-content` and `datasworn-elegy` before releasing. Fix or exempt what it flags.
3. Release build-tools; bump the pin per content repo, canary first.

## Cost estimate

- The rule plus tests: **hours**, not a day. The arithmetic and the row walk both exist.
- Fallout triage: unknown until step 2 is done, and the only part that can grow.
- Shared workflow, per-repo adoption, sub-command: **removed** — see above.

## Resolved questions

1. **Bun script vs. TypeScript-as-CLI vs. build-tools sub-command** → moot. The check goes into the existing semantic validator, which is neither. The original framing assumed nothing was validating content beyond the schema; that assumption was wrong.

2. **Baseline counts, granularity, explicit ID lists** → dropped, unchanged from the original draft. Content addition/removal is reviewable in the committed `generated-datasworn/` diff.

3. **Should the unanchored `DiceExpression` pattern in the schema be fixed?** → Not as part of this. `schema-source/schema/common/Rolls.ts:7` really is unanchored and AJV really does accept `1d100+` and `xx1d6xx` against it — but `diceRange()` re-parses with its own anchored pattern and throws, so no bad expression reaches a build artifact. Worth a separate one-line PR for hygiene; it closes no reachable gap.

## Alternatives considered

- **Per-repo bespoke tests.** Each content repo writes its own vitest/bun suite. Rejected: 3× the maintenance, 3× the drift.
- **Checked-in baseline counts.** Fail CI when the move/oracle/asset count changes, with a `--update` flag to acknowledge. Rejected on review feedback: same failure mode as snapshot UI testing (people run `--update` reflexively), and content removal is a legitimate, review-visible operation that shouldn't need a CI escape hatch.
- **Rely on Iron Vault users to catch bugs.** That's the status quo, and it's how the Derelict Settlement bug was found. Worth being precise now that the bug turns out to be a semantic-fidelity error: for *that class* this remains the only mechanism, and this proposal does not change it. What the completeness rule buys is one structural class, not the incident that prompted the draft.

- **A shared reusable `content-regression.yml` plus a `datasworn-build check` sub-command.** This was the original proposal. Rejected against its own evidence: the checks it would have hosted already run inside the build, and the one genuinely missing rule belongs in the validator that performs the neighbouring checks rather than in a second place that has to be kept in agreement with it.

## Discussion

Comments on this PR, or in the `#datasworn` Discord channel. Aiming to land the shared workflow within a week if there are no objections; content-repo adoption follows.
