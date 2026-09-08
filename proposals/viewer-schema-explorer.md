# Proposal: Schema Explorer in the Viewer

**Status:** Draft, premises re-measured 08.09.2026 — the conclusion survives, two of its three stated reasons do not.
**Author:** @tbsvttr
**Scope:** [`datasworn-community/viewer`](https://github.com/datasworn-community/viewer).

> **What changed.** "Why in the viewer specifically" rested on the viewer already having a
> parser, a cross-reference resolver, and a route to extend. Measured against the repo: there
> is no parser and no router at all, and the resolver is a hand-rolled string split. The
> conclusion — build it here — still holds, but on different grounds, and the estimate has to
> carry a routing/mode concept the draft assumed was already there. The worked example is also
> wrong; corrected below.

## Problem

Wrapping your head around the Datasworn schema on day one is genuinely rough. The schema is a big TypeBox → JSON Schema output living inside `datasworn-community/datasworn`, and the practical answers to "what shape does an oracle table have?" or "what fields can a move carry?" require some combination of:

- Reading the raw JSON schema file
- Reading the generated TypeScript declarations
- Grepping actual content JSON for an example
- Asking on Discord

Nobody's day gets started well by "read this 5000-line JSON schema by hand." The viewer already loads every published content package and knows exactly what a `move`, `oracle_rollable`, `asset`, etc. actually looks like in the wild. Reusing that to render a **Schema tab** would give new contributors and tool authors a much lower on-ramp.

## Proposal

Add a **Schema** panel to the viewer, alongside the existing per-ruleset navigation. It shows, for each Datasworn node type:

1. **Type definition.** Rendered from `@datasworn-community/core`'s TypeScript declaration or the JSON schema (whichever is easier — the two are one-to-one). Fields, discriminators, ID reference shape, optional-vs-required.
2. **Live examples** pulled from the currently-loaded rulesets. E.g. for `oracle_rollable` with `oracle_type: "table_text"`, click to see the actual `starforged/core/action` node with its rows expanded. Two or three examples per subtype so people see the variance.

   *(The original draft used `table_shared_rolls` here. That is an `OracleCollection` oracle_type, not an `OracleRollable` one — `OracleRollable.oracle_type` is `[table_text, table_text2, table_text3, column_text, column_text2, column_text3]`, `OracleCollection.oracle_type` is `[tables, table_shared_rolls, table_shared_text, table_shared_text2, table_shared_text3]`. Worth correcting rather than quietly fixing, because it is the kind of confusion the panel exists to prevent.)*
3. **Cross-links.** From a field like `oracle_rollable_row.text: MarkdownString` you can click through to the `MarkdownString` type; from `_id: MoveId` you click to the ID format spec; from an example's `datasworn:` reference you jump to the referenced entity.

Basically: everything the viewer already does *for content*, but pointed at *types*.

## Why in the viewer specifically

**Re-measured.** Three of the things the original draft leaned on:

| claim | measured on `main` |
|---|---|
| "the viewer already has the parser" | **No parser exists.** Content arrives as pre-built JSON modules — `loadAllRulesets` in `src/utils/loader.ts:53` does `await load()` per package. The only `parse` in the codebase is `parseDice`, `marked.parse`, and a comment. |
| "the cross-reference resolver" | Exists, but as `StateManager.findById` / `navigateToId` (`src/state.ts:125`, `:199`) — a split on the first `:` plus a hard-coded category map that is duplicated in two places that have already diverged. |
| "the rendering primitives (Markdown, IDs, dice)" | **Holds.** `renderMarkdown`/`escapeHtml` (`src/utils/markdown.ts`) and `parseDice`/`rollDice`/`isInRange`/`isMatch`/`formatRollRange` (`src/utils/dice.ts`) are real and reusable. IDs are not a primitive — they are rendered inline. |

So the "we already have the machinery" argument is about half right. What actually supports building it here, and what the draft did not say:

- **All nine rulesets are already resident in memory.** `loadAllRulesets` fetches them eagerly with `Promise.all`, so `ExampleFinder`'s cross-ruleset scan is a walk over data that is already there — no new loading, no laziness to work around. This is the strongest reason and it was not the one given.
- **The app is small enough to extend.** 27 source files, 13 test files, ~6,200 lines. A new panel is tractable rather than a rewrite.
- The audience argument (schema browsing and content browsing are the same mental task; one bookmark, not two) is unaffected by any of the above and still stands on its own.

## Sketch

Left rail:

```
Content
  Classic
  Delve
  Lodestar
  Starforged
  Sundered Isles
  Starsmith
  …
Schema  ← new tab
  Rules
    ruleset
    expansion
    rules (stats / condition meters / special tracks / tags)
  Moves
    move_category
    move
      action_roll
      progress_roll
      special_track
      no_roll
  Oracles
    oracle_collection
    oracle_rollable
      table_text / table_text2 / table_text3
      column_text / …
  Assets
    asset_collection
    asset
    asset_ability
  Truths
    truth
    truth_option
  Delve
    delve_site
    delve_site_theme
    delve_site_domain
  Concepts
    ID format
    Enhancement / replacement
    Suggestions
    Roll ranges
```

The top-level grouping mirrors the categories consumers already think in — rules, moves, oracles, assets, truths (and the delve family) — rather than a flat alphabetical dump of schema definitions.

Right pane for a selected type (say `oracle_rollable` → `table_text`):

- **Type** (structured from the schema, including each field's `description`):

  ```
  oracle_rollable (oracle_type: "table_text")
    _id           OracleRollableId          (required)
                  The unique Datasworn ID for this node.
    _source       SourceInfo                (required)
                  Attribution for the original source of this node.
    name          Label                     (required)
                  The primary name/label for this node.
    dice          DiceExpression            (required)
                  The roll used to select a result on this oracle.
    rows          OracleRollableRowText[]   (required)
                  An array of objects, each representing a single row.
    replaces      OracleRollableId[]        (optional)
                  Indicates that this table replaces the identified tables.
    enhances      OracleRollableId[]        (optional)
    …
  ```

  The descriptions come straight from the JSON schema's per-field `description` strings — no separate doc source to maintain. Long descriptions collapse to the first sentence with an expander.

  Measured coverage, since "the descriptions are there" is doing a lot of work in this proposal: of 1,018 field slots across the definitions that have a `properties` block, **558 (55%) carry their own description**; a further ~230 can inherit one from their `$ref` target; ~230 have none at all. So the panel renders with real prose for roughly half its fields on day one, and improving that is upstream authoring in the TypeBox source, not viewer work.

- **Live examples** (2 pulled from currently-loaded content):

  ```
  starforged/core/action  ← click to jump
  classic/name/ironlander
  ```

- **See also:** links to `OracleRollableRowText`, `OracleRollableId`, `DiceExpression`, `SourceInfo`.

## Non-goals

- **Not** a schema editor. Read-only.
- **Not** a schema-validation checker. `datasworn-build` already validates. The Schema tab isn't there to say "this JSON is wrong."
- **Not** designed to replace the raw schema JSON as the source of truth. `@datasworn-community/core`'s `datasworn.schema.json` remains canonical; this is a nicer rendering of it.
- **Not** rendering the JSON schema string dump verbatim — that's the failure mode we're trying to fix.

## Where the type info comes from

Two candidates were considered:

1. **Runtime type-graph walk on `@datasworn-community/core`'s TypeScript declarations.** Bundle those into the viewer and reflect over them. Rich (JSDoc, refs, unions) but adds parser complexity to the client.
2. **Parse `datasworn.schema.json` (also shipped by core) at load time.** Simpler; the JSON schema already has the fields, unions, `$ref`s, descriptions. Missing the ergonomics of the TS declarations but sufficient for a Schema tab.

**Resolved (review): (2).** The JSON schema is a well-defined data structure, whereas walking TS types at runtime is inference-heavy — and since field descriptions render straight from the schema's `description` strings, (2) carries everything the panel needs in one artifact.

## Rough shape of work

- `SchemaLoader`: load `datasworn.schema.json` from the bundled `@datasworn-community/core`, index by `definitions.<TypeName>`.
- `SchemaRenderer`: for a given type, render fields with links to referenced types. Reuses existing renderers where possible (e.g. `MarkdownString` → uses `renderMarkdown`).
- `ExampleFinder`: given a type name and discriminator value, scan all loaded rulesets for matching content, pick 2–3 diverse examples.
- New route/tab: `/schema/<TypeName>[?discriminator=<value>]`.

~~Estimated ~3–4 days of implementation for a functional first cut.~~ **Needs revisiting.** That figure assumed a route could be added to an existing router and that a parser was available to reuse. Neither exists, so the first cut also has to carry:

- a **mode concept**. The sidebar is one hard-coded `innerHTML` block and `Tree.ts` is bound to `RulesPackage`; there is no tab or second-tree abstraction to slot into.
- a **URL scheme**. Today the entire model is `window.location.hash` == a Datasworn entity id, read at startup and on `popstate`. `/schema/<TypeName>?discriminator=…` is a different shape and needs deciding, not just adding.
- a **definition → content predicate table** for `ExampleFinder`. The mapping is not injective: `OracleTableText` and `EmbeddedOracleTableText` both present as `type: oracle_rollable, oracle_type: table_text`, and the same holds for all six oracle variants and for the move variants.

What genuinely is cheap, and cheaper than the draft implies: the loader. `datasworn.schema.json` ships in `@datasworn-community/core`, is a flat `definitions` map, and needs reading rather than parsing.

Still true: doesn't touch the schema itself, doesn't need core changes.

## Resolved questions (from review)

1. **How much of the type universe is worth surfacing?** → Curated. The left rail shows the primary categories consumers think in — rules, moves, oracles, assets, truths, plus the delve family — with everything else reachable through cross-links rather than listed. (Counted: **258** definitions at `core@0.2.11`, not the ~200 the draft assumed. About a third are `*Id`/`*IdWildcard` types that never need a rail entry, which is what makes curation viable rather than merely desirable.)
2. **Should the Schema tab load schemas at different versions?** → Most recent version only, consistent with the [single-schema-line viewer policy](https://github.com/datasworn-community/viewer/pull/4). If a breaking schema change ships and older-line content stays relevant, we revisit — until then, one version keeps both the UI and the loader simple.
3. **Should this eventually live in `@datasworn-community/core` docs rather than the viewer?** → It stays in the viewer. Beyond piggy-backing on the viewer's loading pipeline, there's a correctness reason: the core schema version won't always match the content packages' schema versions, and a docs site published from core would drift from what the viewer actually loads. Keeping the Schema tab next to the content it exemplifies means both always describe the same line.

## Alternatives considered

- **Auto-generate docs from the JSON schema with an existing tool** (e.g. `@apidevtools/json-schema-ref-parser` + a Markdown template). Fine as a stopgap but loses the "live examples from currently-loaded content" feature, which is the whole point of doing this in the viewer.
- **Wait for tool authors to bake a schema browser into each of their tools.** Existing status quo. Rejected because the goal is one shared canonical browser, not N independent ones.

## Discussion

Comments on this PR or in the `#datasworn` Discord thread. I'll pick this up after the current viewer PR stack merges if there's rough consensus on the shape.
