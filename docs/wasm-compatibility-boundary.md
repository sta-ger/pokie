[← Back to docs index](README.md)

# WASM Compatibility Boundary

POKIE WASM is a first-class, portable artifact target. `pokie build <Blueprint> --target wasm` emits a valid
`game.wasm` and an integrity-bound `game.wasm.pokie-wasm.json` manifest. The portable `@fromstan/pokie/wasm` runtime
instantiates only standard WebAssembly and receives randomness from its host; Node file loading, Studio state,
and process concerns stay outside that runtime. POKIE intentionally does **not** promise that an arbitrary
handwritten Node package can be compiled to WASM: Blueprint is the canonical source, and PAR reaches WASM via
the existing model-preserving Blueprint import.

The production-readable source for this boundary is `WASM_PRODUCT_CONTRACT` in
`src/project/WasmProductContract.ts`. Resolver capabilities, CLI inspection and
unsupported-operation diagnostics, conversion planning, and Studio's refreshed
WASM availability all derive from that contract; this page explains it but does
not define a second product route.

**Scope:** canonical Blueprint/PAR artifact production, integrity-checked resolution, portable runtime API,
and explicit package portability advisory. A legacy compatible sidecar remains readable for migration but is
not runnable until rebuilt as a canonical artifact.

## Current execution and mechanics

Generated Node games and canonical portable artifacts consume **one production math kernel**, `pokie.math.v2`.
The maintained source is `src/wasm/math/shared-math.wat`; its checked-in executable is regenerated with
`node src/wasm/math/generate-kernel.mjs` (development requires WABT's `wat2wasm`; consumers need no compiler).
`SharedSlotMath` lowers a validated model into the same bounded memory image for both targets.
Generated `dist/index.js` and recompilable `src/index.ts` select this calculation path for ordinary supported
models. Direct built-in calculators and custom evaluator injection retain their existing extension pipeline.
Unsupported generated features retain their Node pipeline and cannot be published as a reduced WASM model.

Both generated factories resolve shared math from the current declared Blueprint rather than an embedded
second model. Existing sessions keep their own mutable config: supported paytable, bet, strip, payline and
wild/scatter edits are lowered from that config for evaluation. The Node adapter sends exact stake-scaled
public paytable amounts to the same kernel at unit stake, preserving bet-specific edits without division
or a second payout evaluator. A directly supplied shared model must initially match the public config.
Custom/nondefault line patterns, restricted wild substitutions, modifiers and other unsupported strategies
are rejected on the shared path, including after mutation; they cannot claim supported restoration.
Cluster/ways validation and `validateOnEvaluate` remain part of the public evaluation pipeline.

ABI **2.0.0** imports `pokie.next_random: () -> f64`, a raw finite draw in `[0,1)`.
`play(stake: f64) -> f64` validates an available stake before drawing, consumes exactly one draw per reel,
selects `floor(draw * strip.length)`, builds circular reel-major windows, evaluates the selected win model and
returns the payout. `evaluate(stake: f64) -> f64` evaluates an already supplied screen without RNG. Both export
`memory`, whose minimum and maximum are equal and derived from the model. There is no rejection sampling.
Seeded host initialization consumes one unpaid screen's draws once, matching Node construction. The host owns
seed/reset/continuation, credit settlement, serialization, trace collection, transport and IO. Module scratch
contains only the current evaluation, has no session history and is cleared on runtime disposal.

The model (`pokie.game.v2`, math identifier `pokie.math.v2`) includes effective bets, symbol inventory,
strips, paylines, wilds, scatters, authored payout entries, win selection and cluster minimum. Default bets
are `[1,2,3,4,5,10,20,30,40,50,100]`. Default three-row paylines retain the built-in middle/top/bottom order.
Lines select the first matching left-to-right pattern, then look up its exact count; missing/zero entries
never fall back to shorter awards. All-wild lines and all-wild clusters do not pay. Ways multiply matching
row counts on consecutive reels and preserve the built-in all-wild substitution rule. Clusters use orthogonal
adjacency, production DFS/wild ownership and the authored minimum. Lines include scatter payouts; ways and
clusters select their own evaluator group, without adding a scatter evaluator. Each component multiplies its
payout entry by stake before ways multiplication and ordered addition. Node preserves component attribution;
portable CLI/Studio rounds remain amount-only for their existing analytics/feature boundaries.

Stops are **one unsigned i32 per reel**, rather than a packed integer. The little-endian header contains
reel count at byte 0, rows at 4, stop-array address at 44, screen-array address at 48, component-array address
at 52, record stride at 56, component count at 72, total payout (f64) at 80 and bounded memory use at 96.
The exported `lowerSharedSlotMath` describes the exact image. Each component record carries kind, symbol id,
component id, position count, ways (f64), amount (f64), then reel-major cell indexes. The reader validates memory,
cardinality, stops, symbols, positions, amounts and total, without modulo repair. There is **no total stop-bit cap**.
Limits are 64 reels, 64 rows, 1024 cells, 128 unique symbols, 1024 paylines, 65536 stops per reel,
262144 total stops and 8 MiB of model/output/scratch memory. A paid play consumes at most 64 draws (one per supported reel). Models exceeding these bounds fail before publication
with a recovery action. The existing small-artifact budget remains 64 KiB; it is not a promise that every
supported larger model produces a 64 KiB artifact.

Blueprint is canonical. PAR and complete public package-model descriptors use existing model-preserving
extraction routes; this extracts a declared representable model, never arbitrary TypeScript/Node behavior.
Screen geometry, weighted sequences, modifiers, free games, bounded mechanics, HoldAndWin, jackpots and bet
modes remain outside this WASM slice. Canonical integrity and individually declared operations are prerequisites;
legacy metadata-only components remain inspection-only.

The embedded descriptor (`pokie.component.v2`) and sidecar must agree on component identity, operation declarations,
serialization (`pokie.session.v2`, `pokie.play.v2`, `pokie.state.v3`), RNG (`pokie.rng.v2`), host services and ABI.
Byte count, SHA-256, configuration hash, imports, function signatures and required exports are checked before
host RNG or session creation. The loader also reconstructs the supported lowering and requires **exact module
bytes**, binding executable semantics and memory layout to the model, including internally rehashed corruption.
Old executable ABIs must be regenerated; no user artifact migration is introduced.

## The contract — `PokieWasmComponentManifest`

A WASM component built against POKIE declares itself via a sidecar JSON manifest (see "Resolution" below for
where that file lives) shaped as `PokieWasmComponentManifest`:

```ts
type PokieWasmComponentManifest = {
    schemaVersion: string;                 // which version of *this* contract the manifest targets
    component: {id: string; version: string};
    minPokieVersion?: string;              // lowest POKIE release accepted by the resolver and portable runtime
    serialization: {
        session: string;                   // format id for a session's own config
        play: string;                      // format id for one played round's request/result
        state: string;                     // format id for a session's own persisted state
    };
    host: {
        rng: string;                       // format/protocol id for the host-provided RNG the component must draw through
        services: readonly string[];       // any other host-provided service ids the component needs
    };
    capabilities: readonly string[];       // open vocabulary of capability ids the component declares support for
};
```

- **Metadata** — `component.id`/`component.version` identify the component build itself, independent of
  `schemaVersion` (POKIE's own contract version) and `minPokieVersion` (the lowest package release the component
  claims compatibility with — enforced during canonical resolution and before portable runtime instantiation).
- **Session/play/state serialization** — three format ids naming the wire shape the component's own host
  boundary expects for a session's config, one played round, and persisted state. POKIE places no constraint on
  the ids themselves beyond the canonical runtime ABI it validates before execution.
- **Host RNG/services** — `host.rng` names the format/protocol id for the host-provided random source the
  component must draw through (a component never brings or seeds its own RNG — POKIE's fairness/provably-fair
  model requires every draw to be traceable to a host-issued source; see [Provably Fair](provably-fair.md)).
  `host.services` is the open list of any other host-provided service ids the component needs.
- **Capability discovery** — `capabilities` is an open vocabulary of ids the component declares support for,
  the same convention `ProjectCapability`/`ExternalDeploymentCapability` (see the
  [External Adapter SDK](external-adapter-sdk.md)) already use elsewhere in this package: never closed to a
  union, so a component author can declare ids a generic POKIE check simply never looks at.

`POKIE_WASM_CONTRACT_VERSION` (currently `"1.0.0"`) is the version of this contract the running POKIE package
understands. `PokieWasmComponentManifestValidator` checks a manifest's own shape (every field present and
correctly typed); `assessWasmComponentCompatibility` runs that validator first, then checks the manifest's own
`schemaVersion` against `POKIE_WASM_CONTRACT_VERSION` — **major-only**: a manifest with an equal-or-lower
minor/patch on the same major is compatible, a differing major is not. Shape and compatibility are deliberately
two separate, separately testable steps, the same split
[`ExternalDeploymentTargetDescriptorValidator`/`ExternalDeploymentCompatibilityValidator`](external-adapter-sdk.md)
draw for `ExternalDeploymentTarget`.

## Resolution — `WasmProjectTargetAdapter`

`ProjectTargetResolver` (see [CLI](cli.md) and the `ProjectResolving` contract) recognizes a `.wasm` file as a
`"wasm"` `PokieProject` only when it's paired with a sidecar manifest named by appending `.pokie-wasm.json` to
the `.wasm` file's own full name — e.g. `game.wasm` needs `game.wasm.pokie-wasm.json` next to it. Four possible
outcomes:

| Sidecar state | Result |
|---|---|
| No sidecar at all | `resolve()` throws `ProjectTargetUnsupportedError` naming exactly where a sidecar was looked for — an ordinary `.wasm` file is never silently treated as unrecognized *or* as a valid POKIE target. |
| Sidecar present, but unreadable JSON or fails `PokieWasmComponentManifestValidator`'s shape check | `resolve()` throws `ProjectTargetMalformedError` — the manifest signaled intent to be this type and failed a deeper read, the same convention `TsPackageProjectTargetAdapter`/`OutcomeLibraryProjectTargetAdapter` use for their own manifests. |
| Sidecar present, well-shaped, but `assessWasmComponentCompatibility` rejects its `schemaVersion` | `resolve()` throws `ProjectTargetUnsupportedError` naming exactly which contract version was declared vs. required — a clear incompatibility diagnostic. |
| Sidecar present, well-shaped, and compatible | Resolves as a `"wasm"` `PokieProject`. |

Every compatible WASM project carries `WASM_MANIFEST_READ_CAPABILITY` (`"wasm.manifest.read"`). Integrity-bound
canonical artifacts additionally carry `WASM_CANONICAL_ARTIFACT_CAPABILITY` (`"wasm.canonical"`): that proves the
module bytes and manifest have one canonical identity, but authorizes no runtime operation by itself. The manifest's
declared `runtime.play`, `runtime.serialize`, `runtime.replay`, and `artifact.inspect` operations grant their
matching capabilities independently after that integrity check. The complete portable play/serialize/replay
declaration set additionally grants `WASM_RUNTIME_EXECUTE_CAPABILITY` (`"wasm.runtime.execute"`). Consumers must
use the relevant declared per-operation capability, not treat canonical identity or the aggregate bundle as a
substitute for it.

A legacy sidecar-only component deliberately retains only manifest inspection so Studio and the CLI can explain the
migration boundary without falsely advertising execution. A resolved WASM artifact never grants
`WASM_EXPORT_CAPABILITY`, because it is an output rather than a conversion source; the authored `blueprint` and
`parWorkbook` project types grant `wasm.export` for the explicit Blueprint/PAR matrix edges.

`readWasmComponentManifest(project)` reads component id/version, serialization format ids, host bindings, and
declared capabilities. Canonical resolution also verifies the module/manifest integrity binding before runtime
operations; a swapped, stale, malformed, or incompatible sidecar is rejected before instantiation.

## Package-to-WASM preflight — `assessWasmPackagingPreflight`

For an existing POKIE `tsPackage`, `assessWasmPackagingPreflight`
runs an advisory-only scan over that package's own source: it statically finds every `import`/`require` of a
Node.js built-in module (`fs`, `path`, `child_process`, `net`, ...) — none of which exist inside a
WASM/component-model sandbox — and lists the package's own declared `package.json` runtime dependencies
verbatim, for a human to review (POKIE has no way to know whether any third-party dependency is itself portable
without actually trying to bundle it). The scan is advisory only; it is not a route into the canonical builder.

The scan is a plain regex over import/require specifiers, not a real parser — good enough to *name* a blocker,
never a guarantee that an empty result means a package is actually portable. `report.notes` explicitly says that
the canonical Blueprint/PAR builder is intentionally different from package compilation, so the report can never
be read as "no blockers found, therefore compilation works": **no POKIE command compiles an arbitrary package to
WASM, regardless of what this scan finds.**

## What's explicitly deferred

- A package-to-WASM compiler: turning an arbitrary `tsPackage` into a `.wasm` build.

No package compilation is implied by a `"wasm"` project resolving successfully, or by
`assessWasmPackagingPreflight` reporting zero blocking API usages.

## Portable continuation and explicit evidence (runtime API 2.0)

Snapshots use `pokie.state.v3`: artifact SHA-256 identity, seed, sequence, credits, total draw count (including
unpaid initialization) and optional JSON-safe RNG continuation. There is no draw, screen, result or command
history. Restoration rejects a different artifact identity before changing the host. A JSON round trip and a
fresh host preserve continuation, including numeric RNG state zero. An initialized sequence-zero snapshot
restores its authoritative RNG; an empty initial seed descriptor initializes exactly once. Later unbound
compact v2 snapshots are rejected; regenerate campaign fixtures. The explicit legacy v1 history importer
remains for existing audit fixtures: it validates history/count, preserves authoritative continuation and
emits a bound v3 snapshot without retaining the historical input. This compatibility importer cannot establish
an identity absent from the input, so callers must associate old evidence with its original artifact.

Custom nextRandom-only hosts retain live execution. Deterministic restoration requires appropriate host
reset/restore support. Custom host snapshots must themselves remain bounded. Invalid stakes and insufficient
credits fail before any draw or ledger mutation. Sibling sessions restore their owned continuation before play;
replay cannot advance an unrelated settled session.

`BoundedPokieWasmTraceCollector(capacity)` is exported from the root,
`@fromstan/pokie/browser`, and `@fromstan/pokie/wasm`. Pass `{trace}` to create/restore/replay or
call `session.setTraceCollector(trace)` later. It captures ordered RNG evidence:
`initialization` (unpaid), `round` (settled paid play), or `replay`, plus sequence
and per-event draws. It retains the first `capacity` events, drops subsequent
events, and exposes `dropped`, detached `entries`, and lifecycle `status`.
Attachment never backfills prior evidence; restoring an existing snapshot
emits no synthetic initialization. An empty seed descriptor does initialize
and can emit its actual initialization draws. Only the concrete collector is
accepted; replaced callbacks/sinks are not invoked, and there is no asynchronous
queue. Each collector belongs to one operation/session at a time. Replay
completion closes it and transfers bounded evidence to the caller. Failed
owned initialization/replay, replacement, session/runtime disposal, and traps
clear owned buffers. Read/copy evidence before disposal if external retention
is wanted; that storage belongs to the caller.

Worker instantiate accepts either `seed` with no `draws` (ordinary bounded
seeded continuation), or an explicit finite input tape. Tape input is owned
once and remains proportional to the supplied input length; it is not a
bounded-history claim. Compact tape continuation carries a SHA-256 fingerprint,
length, cursor, seed and RNG word, never the full tape. Compatible receiving
Workers need the same tape. Old numeric and tape/cursor/seed/rng continuations
are validated on import; ordinary Worker v2 RNG continuation does not rescan prefixes.
An exhausted or mismatched tape reports an error and retains the settled
session snapshot. Worker `traceCapacity` opts into finite collection; `trace`
reads clone-safe evidence, and replay may return a finite `trace` field.
Restore replaces the session and ends its collector. Cancel/dispose also
invalidate pending initialization before it can publish a replacement.

CLI and Studio simulation use collector-free sessions and aggregate results,
with the existing in-process `workers=1` boundary. Replay `rounds` are explicit
request-sized output; CLI retains its requested command/result batch, while
Studio uses chunk-sized batches. Neither is cumulative continuation history.
See [P9-02 measurements](audit-corrections/compact-wasm-state.md) for bounds,
accounting and focused regression commands.

## Generated, visible and evaluated coordinates

screenGeometry is explicitly unsupported by canonical WASM and PAR conversion: see [the coordinate contract and adapter support matrix](v2-completion/V2C-03.md).

V2C-07 package audit envelopes are not a new WASM feature. The browser entry exposes
portable recording types for future reuse, while execution stays on the shared
package SessionRuntime path in Node/Studio. Canonical WASM retains dedicated `runtime.replay`,
compact snapshots and bounded traces; ABI 2 uses artifact-bound v3 snapshots without adding command history. Native outcome libraries likewise retain their existing
selection provenance, hashes and fairness verification profile.

## Weighted whole-sequence boundary

Canonical WASM encodes literal strips and rejects `GameBlueprint.reelSequences`
at conversion preflight and direct execution. The same restriction applies to
PAR workbook export and automatic intermediate conversions. Neither target
selects, concatenates or silently flattens a weighted reel; refusal occurs before
publishing an output. Use a TypeScript package for whole-sequence variants.

Authored `mechanics.holdAndWin` and `mechanics.jackpot` are rejected before WASM publication, alongside free games and nonempty bet modes. Their continuation/pool histories are also outside paid-grid outcome-library/Stake projection. Use the generated TypeScript package runtime for these workflows; stackable engine classes do not imply support in a different artifact target.

Blueprint `mechanics.modifiers` is outside the canonical WASM boundary. Preflight
rejects it before publishing a reduced model or artifact; use a TypeScript package.
No modifier calculation engine is added to WASM. Sticky combinations likewise
cannot be flattened into independent-spin outcome libraries or Stake routes.

## Bounded authored mechanics (V2C-14)

See [cascades, respins and collections](bounded-mechanics.md) for the declarative
contracts, supported compositions, authoring/build/extraction/PAR workflow,
logical-round accounting, continuation and durability boundaries.

## Weighted bonus authoring

See [finite weighted bonus outcomes](weighted-bonus.md) for selection identity,
payout/duration units, authoring/interchange, restoration/replay, statistics and
custom-rule/target boundaries. The [launch support register](v2-completion/launch-mechanics-support.md)
maps every mandatory family separately from arbitrary custom callbacks.
