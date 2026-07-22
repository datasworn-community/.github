# Proposal: Schema Explorer in the Viewer

**Status:** Draft — soliciting feedback on scope and shape before starting on the code.
**Author:** @tbsvttr
**Scope:** [`datasworn-community/viewer`](https://github.com/datasworn-community/viewer).

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
2. **Live examples** pulled from the currently-loaded rulesets. E.g. for `oracle_rollable` with `oracle_type: "table_shared_rolls"`, click to see the actual `starforged/faction/name/…` node with its rows expanded. Two or three examples per subtype so people see the variance.
3. **Cross-links.** From a field like `oracle_rollable_row.text: MarkdownString` you can click through to the `MarkdownString` type; from `_id: MoveId` you click to the ID format spec; from an example's `datasworn:` reference you jump to the referenced entity.

Basically: everything the viewer already does *for content*, but pointed at *types*.

## Why in the viewer specifically

- The viewer already has the parser, the type awareness, the cross-reference resolver, and the rendering primitives (Markdown, IDs, dice) that a schema explorer needs. Building the same thing standalone would be recreating half the viewer.
- Schema browsability and content browsability are the same mental task from a new consumer's point of view: *"I want to understand what an asset looks like."* Splitting them across two apps means everyone has two bookmarks.
- The viewer is already the public-facing "look at Datasworn" surface — [datasworn-community.github.io/viewer](https://datasworn-community.github.io/viewer/). Adding a Schema tab is where a search-engine hit for "how does datasworn represent oracles" ideally lands.

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

Estimated ~3–4 days of implementation for a functional first cut. Doesn't touch the schema itself, doesn't need core changes.

## Resolved questions (from review)

1. **How much of the type universe is worth surfacing?** → Curated. The left rail shows the primary categories consumers think in — rules, moves, oracles, assets, truths, plus the delve family — with everything else in the ~200-definition universe reachable through cross-links rather than listed.
2. **Should the Schema tab load schemas at different versions?** → Most recent version only, consistent with the [single-schema-line viewer policy](https://github.com/datasworn-community/viewer/pull/4). If a breaking schema change ships and older-line content stays relevant, we revisit — until then, one version keeps both the UI and the loader simple.
3. **Should this eventually live in `@datasworn-community/core` docs rather than the viewer?** → It stays in the viewer. Beyond piggy-backing on the viewer's loading pipeline, there's a correctness reason: the core schema version won't always match the content packages' schema versions, and a docs site published from core would drift from what the viewer actually loads. Keeping the Schema tab next to the content it exemplifies means both always describe the same line.

## Alternatives considered

- **Auto-generate docs from the JSON schema with an existing tool** (e.g. `@apidevtools/json-schema-ref-parser` + a Markdown template). Fine as a stopgap but loses the "live examples from currently-loaded content" feature, which is the whole point of doing this in the viewer.
- **Wait for tool authors to bake a schema browser into each of their tools.** Existing status quo. Rejected because the goal is one shared canonical browser, not N independent ones.

## Discussion

Comments on this PR or in the `#datasworn` Discord thread. I'll pick this up after the current viewer PR stack merges if there's rough consensus on the shape.
