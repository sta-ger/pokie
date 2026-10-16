[← Back to docs index](README.md)

# Game Packages

POKIE itself only defines game *logic* (sessions, win calculation, simulation). A **game package** is the
convention for shipping a concrete game — symbols, paytable, config, session wiring — as a standalone npm package
that a CLI, simulator, validator, or server adapter can load without knowing anything about that game in advance.

A game package is a regular npm package that depends on `@fromstan/pokie` and exports one object implementing the
`PokieGame` contract from a `pokie.entry` file declared in its `package.json`.

## The contract

```ts
type PokieGameManifest = {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
};

type PokieGameContext = {
    seed?: string | number;
    options?: Record<string, unknown>;
};

interface PokieGame {
    getManifest(): PokieGameManifest;
    createSession(context?: PokieGameContext): GameSessionHandling;
    getSessionSerializer?(): GameSessionSerializing;
}
```

- `getManifest()` — static metadata about the game (id, display name, version, ...), independent of any session.
- `createSession(context?)` — returns a **fresh** `GameSessionHandling` (e.g. a `VideoSlotSession`) ready to play.
  Called once per simulation run, per player session, or per replay. `context.seed`, if provided, is meant to be
  passed to a `SeededRandomNumberGenerator` (see [Reels & Symbol Sequences](reels-and-sequences.md#rngs)) so the
  caller can reproduce a specific run; `context.options` is a free-form bag for anything else the game needs
  (RTP variant, bonus buy mode, etc.) — the game package defines and interprets its own option keys.
- `getSessionSerializer?()` — **optional and additive**. When implemented, returns the [`net/` session
  serializer](serialization.md) that knows how to turn this game's own session type into a rich, game-specific
  JSON payload (e.g. `new VideoSlotSessionSerializer()`, or a custom `CascadeSessionSerializer`/
  `MultiStageRoundSessionSerializer` subclass for a multi-stage mechanic). `pokie serve` uses it, when present,
  instead of its own narrow default response shape — see [`pokie serve`'s session responses](cli.md#post-sessions)
  and [Session storage & wallet](cli.md#session-storage--wallet). A game that doesn't implement this keeps getting
  exactly the response shape it always has; this is not required for `loadPokieGame`/`pokie validate`/`pokie sim`/
  any other command to work.

## Declaring the entrypoint

The game package's `package.json` must point at the module exporting the `PokieGame` object via a `pokie.entry`
field:

```json
{
    "name": "sample-slot",
    "version": "1.0.0",
    "dependencies": {
        "@fromstan/pokie": "^1.3.0"
    },
    "pokie": {
        "entry": "./dist/index.js"
    }
}
```

`entry` is resolved relative to the package root (the directory containing this `package.json`), the same way
`main`/`exports` are. A package produced by `pokie build`/`pokie init` keeps all three in agreement — `main`,
`exports`, and `pokie.entry` always point at the same compiled output (`./dist/index.js` by default), and
`scripts.build` (`tsc`, driven by the package's own `tsconfig.json`) is what produces it.

## Preparing a package end-to-end

Writing the TypeScript source is only the first step — a package isn't loadable until its dependencies are
installed and it's been compiled. The CLI-internal `GamePackagePreparer` (`cli/prepare/GamePackagePreparer.ts`)
carries a target directory through that whole lifecycle in one call: **create** the scaffold (package.json,
tsconfig.json, README.md, src/index.ts), **install** its dependencies (`npm install`, producing
package-lock.json), **build** it (`npm run build`, producing dist/index.js), then **verify** the result actually
loads as a valid `PokieGame` (via `PokieGamePackageValidating`). Each phase's failure is reported as a
`GamePackagePreparationError` naming which phase failed and a concrete recovery step — never a bare non-zero
exit code or a raw underlying error with nothing else to go on.

If a package's `dist` output is missing or stale (built from since-removed dependencies, or never built at all),
`loadPokieGame`/`resolvePokieGameEntryModule` themselves already report that as an actionable error — pointing at
`npm install && npm run build` — rather than surfacing Node's raw `Cannot find module` as the primary message.
Resolving the entry module stays a pure read: neither function ever runs an install or a build on the caller's
behalf.

### Retrying a failed preparation

A failed `dependencies`/`build`/`verify` phase leaves the scaffold on disk instead of cleaning it up. Calling
`prepare()` again with the same `parentDir`/`name` is the supported way to retry: `GamePackagePreparer` writes a
`.pokie-prepare-state.json` marker into the project root after `create` and after every later phase it completes,
and reads it back at the start of the next `prepare()` call. When that marker is present, `create` is skipped
entirely (the scaffold it already wrote is reused as-is) and only the phases that hadn't completed yet run —
`install` is never repeated once `dependencies` is recorded done, and `build` is never repeated once `build` is.
The marker is deleted once `verify` succeeds, so a finished package carries no trace of it.

A directory that already exists but carries no marker — a stray, pre-existing, or hand-created directory this
tool never touched — still fails `create` with its original "already exists" error, exactly as before. Retry only
ever resumes a directory `GamePackagePreparer` itself created, so it can never silently overwrite anyone else's
files.

## The entry module

The entry module's **default export** must be a `PokieGame`:

```ts
// src/index.ts, compiled to ./dist/index.js (see "pokie.entry" above)
import {PokieGame, VideoSlotConfig, VideoSlotSession} from "@fromstan/pokie";

const game: PokieGame = {
    getManifest() {
        return {id: "sample-slot", name: "Sample Slot", version: "1.0.0"};
    },
    createSession(context) {
        const config = new VideoSlotConfig();
        config.setAvailableSymbols(["Cherry", "Lemon", "Bell", "Seven"]);
        return new VideoSlotSession(config);
    },
};

export default game;
```

A plain `module.exports = game` (CommonJS) works the same way — the loader reads whichever module system the
entry file was built for.

## Loading a game package

`loadPokieGame(packageRoot)` reads `package.json`, resolves `pokie.entry`, imports it, and returns a validated
`PokieGame`:

```ts
import {loadPokieGame} from "@fromstan/pokie";

const game = await loadPokieGame("/path/to/sample-slot");
const session = game.createSession({seed: "regression-run-42"});

session.play();
session.getWinAmount();
```

Each load uses an isolated runtime snapshot so rebuilding the same package path cannot reuse stale
relative dependencies. If a long-lived host keeps the returned game/session, call `await game.release?.()`
after its final session is destroyed (or use `loadPokieGameRuntime()` for an explicit `{game, release}` lease).

It rejects if `package.json` has no `pokie.entry` field, or if the entry module's default export fails
`PokieGameContractValidationRule` — missing `getManifest()`/`createSession()`, `getManifest()` throwing, or a
manifest with a missing/empty `id`, `name`, or `version`. The rejection error lists every failing check by code
(e.g. `pokie-game-manifest-invalid-version`), not just the first one.

## Validating a loaded export

`isPokieGame(value)` is a plain type guard — useful for a quick runtime check without importing the validation
machinery. It's a shallower check than what `loadPokieGame` runs internally (shape only, not manifest content):

```ts
import {isPokieGame} from "@fromstan/pokie";

if (!isPokieGame(candidate)) {
    throw new Error("not a POKIE game");
}
```

For a fuller check — including that `getManifest()` doesn't throw and returns a well-formed manifest (non-empty
`id`/`name`/`version`) — use `PokieGameContractValidationRule`, which implements the same `ValidationRule`/
`ValidationResult` pattern used by the win evaluation pipeline's [validation rules](paytable-and-wins.md#aggregation-policy):

```ts
import {PokieGameContractValidationRule, ValidationResult} from "@fromstan/pokie";

const issues = new PokieGameContractValidationRule().validate(candidate);
const result = new ValidationResult(issues);

if (result.hasErrors()) {
    // reject the package
}
```

`loadPokieGame`, `isPokieGame`, and `PokieGameContractValidationRule` are the building blocks the `pokie init`/
`pokie sim`/`pokie validate`/`pokie report`/`pokie diff`/`pokie replay`/`pokie serve`/`pokie client`/
`pokie dev` [CLI](cli.md) commands are built on — `pokie validate` in particular wraps this same contract check in
`PokieGamePackageValidator`, returning a structured report instead of throwing.

## Headless runtime contract

`PokieGame` also defines the headless runtime compatibility ports `getSessionCompatibility()` and `validateSessionState()`. Generated and code-first packages use the same `SessionRuntime` / repository command semantics; see [game-session.md](game-session.md#headless-commands-and-repository-ownership) and [serialization.md](serialization.md#executable-repository-records). Existing packages exposing only `getManifest()` and `createSession(context)` need no rewrite for live
Play: direct repository commands, serve and Studio capture command/schema authority from the trusted
constructed object when it is primed. Save the initial record with the selected game and pass its committed
revision to `primeSession()`; serve and Studio do this automatically. Those captures remain `live-only`
even if the session itself has a complete codec. Persisted capability lists cannot supply authority.
After live-state loss, new commands and undeclared-package retries return `restoration-unsupported`
without constructing a replacement. Durable opt-in requires both `getSessionStateSchema()` and
`getSessionCommandCapabilities(context)`, plus a complete session codec (and a validator for a custom schema).
Declared command authority also permits validated completed live-only retries without constructing a session.

Trusted live validation follows built-in free-game and bet-mode composition node by node. An unchanged
custom decorator may omit a snapshot or emit an opaque legacy snapshot inside those wrappers. Such
snapshots stay live-only: they preserve the constructed collaborator and never authorize rebuilding it.
Complete built-in children still require their nested state, and selected modes must belong to the
trusted model before reads, retries or reconciliation publish a result. Declared codecs retain their
own strict validation requirements, including the game validator for custom payloads.

## Generated, visible and evaluated coordinates

Blueprint screenGeometry, generated packages and conversion support: see [the coordinate contract and adapter support matrix](v2-completion/V2C-03.md).

### Exact audit capability

A generated game declares its model hash, compatible executable schema and
command capabilities. Its sessions use the existing seeded RNG codec even when
the caller omits a seed: that session randomly initializes its own RNG state,
which is retained for restoration and exact audit. An omitted seed remains
absent from request provenance; exact replay restores the captured state rather
than recreating it from an invented caller seed. Explicit seeds keep their
existing deterministic draw sequence. A hand-authored game must supply the same authorities for
exact audit replay, including a `getConfigHash` covering effective math configuration
and all custom collaborators. Manifest id/version alone cannot prove model equality.
`createSession` must return a detached executable instance, never a live serving
session. Custom state requires complete capture, restore, session validation and
selected-package validation; dynamic variants and RNG algorithms/state must be
covered by that model/codec compatibility promise. Missing authority leaves ordinary
play and legacy seed-forward replay available, with exact audit explicitly unavailable.

## Whole-sequence variants

Generated and recompiled typed packages preserve `reelSequences`, complete variant
arrays, IDs and relative weights. Public ESM and CommonJS consumers use the same
context contract; weighted-definition recognition survives that module boundary.
The model hash includes authored variants and versioned context/sampling semantics.
Existing exact-only models keep their stop draws and seeded mathematics.

`loadGameBlueprint()` checks canonical sequence definitions before runtime use.
Authoring adapters may request `{preserveInvalidAuthoredContent: true}` to retain a
broken draft for correction; this does not authorize build or runtime publication.
Studio and CLI editing use that authoring option and validate before saving the new
source. PAR and canonical WASM currently reject the `reelSequences` representation;
build a TypeScript package to preserve it. See [the reel contract](reels-and-sequences.md#weighted-whole-sequence-reels).

## Public package model extraction

`PackageBlueprintExtraction.extract(packageRoot | game, {signal})` is the shared executable
model reader for library callers, `pokie build` and Studio. `GamePackageInspector` remains a
metadata-only reader: inspecting package.json does not execute a game. Explicit model extraction
uses the normal trusted package loader; validation of returned metadata is not a sandbox for
module execution. Path inputs own an isolated loader snapshot and release it on every terminal
path. A supplied game remains caller-owned; extraction never creates, advances or destroys a
session, and never calls a supplied game's release hook.

A package may implement the optional `PokieGame.getModelDescriptor()` capability:

```ts
getModelDescriptor(): PackageModelDescriptor {
    return {
        descriptorVersion: 1,
        blueprintSchemaVersion: 1,
        sourceKind: "custom",
        model: effectiveModel,
        // Declare custom behavior outside the Blueprint contract:
        // unsupported: [{path: "mechanics", code: "custom-feature", message: "..."}],
    };
}
```

`model` contains the effective, representable `GameBlueprint` data; it can be partial for
inspection. `getManifest()` is authoritative for game identity and must agree with a descriptor's
manifest. npm package name/version do not become game identity. Contract versions are independent
of the game's manifest version. Generated CommonJS and recompilable TypeScript entrypoints expose
the same descriptor without a Blueprint JSON file or historical build-info sidecar.

Supported data includes manifest fields, geometry, symbol order, wild/scatter declarations,
paylines, authored multiplier tables, declared numeric bets, lines/ways/clusters, scatter free-game
awards and all Blueprint bet-mode declarations/semantics. Exact reel order and weighted
whole-sequence variant IDs, order, weights (including zero), symbols and mixed exact/weighted
reels survive extraction. Reels must already be materialized. Extraction never regenerates a
model from symbolWeights, a new seed or hash, nor substitutes the currently selected variant.
Absent payout/grant entries, empty symbol tables and explicit zeros remain distinct. There is
no integer parsing of stakes and no runtime payout sampling to infer a linear model.

Legacy packages without a descriptor return manifest and supported command declarations with
`partial` diagnostics. A public getter returning zero cannot distinguish an authored omission
from an explicit zero. Custom calculators, non-linear per-bet payouts, restricted wilds, custom
patterns, unsupported symbol types and opaque features require explicit unsupported boundaries;
the reader does not infer equivalence from getter availability. Missing data is never padded into
a successful Blueprint. Unknown model/mechanic fields also prevent automatic generation.

Results distinguish `complete`, `partial`, `unsupported`, `malformed` and `cancelled`. Each result
contains source identity, descriptor/schema versions when known, path-addressed diagnostics and
`exact`/`inferred`/`defaulted`/`unsupported` field evidence with authority. This implementation uses
exact declarations and labelled runtime defaults rather than inferring payouts. Nested entries,
variant definitions, known absent awards and omitted optional runtime defaults are recorded.
The detached validator rejects cycles, non-finite numbers, bigint/functions/symbols, sparse
collections, accessors, hidden properties, unsafe names, toJSON hooks and custom prototypes;
it does not invoke metadata getters or serialization hooks. Resource limits fail with a bounded
diagnostic. Package files and caller-owned descriptor objects remain unchanged.

Descriptor fidelity means preserving the declaration. Representable model fidelity means the
Blueprint can carry that declaration. Finite seeded traces are behavioral checks of those traces.
None proves losslessness of arbitrary TypeScript or that edited/custom code obeys a declaration.

A published Blueprint has a version-1 `<output>.conversion-evidence.json` companion with
`kind: "package-extraction"`, `sourceBindingHash`, `extractedBlueprintHash` and the full `extraction`
result. It is bound to source package bytes and the resulting exact-content Blueprint identity;
it is not a PAR import and carries no fabricated workbook origin. Downstream model conversions
retain the extracted Blueprint and evidence under `.pokie/package-extraction` (an adjacent
`<file>.pokie/package-extraction` companion for file outputs). Studio preserves the evidence path
when registering/reopening these new artifacts. Descriptor and source drift invalidate prepared
plans. Existing destinations, occupied companions and source aliases are rejected; staging,
publication, cancellation and registration failures roll back operation-owned outputs.


## Package extraction to an editable Blueprint

Opening or registering a package preserves its `tsPackage` identity and source bytes. Model preview
uses `PackageBlueprintExtraction.extract(packageRoot | game, {signal})`, the same authority used by
artifact planning, CLI and Studio. Path inputs release their owned runtime snapshots. Caller-supplied
games and sessions remain caller-owned; extraction does not create or advance sessions.

A version-1 public effective-model descriptor can declare representable model data. This is distinct
from inspecting manifest metadata. Legacy getters alone yield partial diagnostics. Unsupported custom
mechanic paths/codes/messages and field authorities remain visible; capability advertisement permits
an extraction attempt, not a promise of successful conversion. Exact, inferred (when supplied),
defaulted and unsupported fields and comparison limits travel with the result.

Preview `pokie build PACKAGE --target blueprint --dry-run`; explicitly save using the same command
without `--dry-run`, optionally with `--out FILE`. Studio exposes this through Build/Export's **Save
Blueprint** and **Open as Project**, with the reviewed preview bound to its save job. Source/destination
changes require a fresh preview. Outputs must be new files; publication stages Blueprint and evidence
and rolls back operation-owned artifacts on failure, cancellation or failed Studio registration.

The companion `FILE.conversion-evidence.json` has `schemaVersion: 1`, `kind: "package-extraction"`,
`sourceBindingHash`, `extractedBlueprintHash` and the full `extraction` result. Studio registration
retains this evidence path across reopen without inventing PAR-workbook provenance. Save normal
Blueprint edits in the separate authoring project: its historical evidence remains the original
extraction record, not a description of subsequent edits.

Descriptors establish declared structural fidelity. Finite seeded comparisons cover exercised traces
only; they cannot prove arbitrary custom executable-code equivalence. Missing/zero authored payouts
and grants are preserved, never padded into equivalent-looking defaults.

## Authored Hold&Win, jackpot and bet modes

Blueprint `mechanics` accepts `freeGames`, `holdAndWin`, `jackpot`, `modifiers`, `cascade`, `respins` and `collection`. The bounded contracts and their composition restrictions are documented in [bounded mechanics](bounded-mechanics.md). Unknown fields and unsupported policies fail validation, including direct generator/render calls. Free games use `retriggerPolicy: "additive"` (also the legacy omitted default). Award counts start at one and awards may be zero. Hold&Win requires the explicit `reset-on-new-lock` policy:

```json
{
  "holdAndWin": {
    "minimumCount": 3,
    "initialRespins": 3,
    "retriggerPolicy": "reset-on-new-lock",
    "symbolEffects": {"C": {"kind": "value", "amount": 2}, "M": {"kind": "multiplier", "factor": 3}},
    "payout": {"type": "sum-with-multiplier", "amountsAreBetMultiples": true}
  },
  "jackpot": {
    "pool": {"id": "mini", "type": "accumulating", "seedValue": 10},
    "contribution": {"type": "percentage", "percentage": 0.01},
    "trigger": {"type": "symbol-count", "symbolId": "J", "minimumCount": 3},
    "award": "single-tier"
  }
}
```

All symbol references must be declared. A fixed pool uses `{"id":"mini","type":"fixed","amount":10}`. The percentage is a fraction in [0,1] of the actual charged stake, including ante/purchase multiplication. Zero-stake continuations contribute nothing. Fixed pools record contributions in statistics but their balance never grows. Accumulating pools are constructed fresh per session; each award pays the pre-reset value and resets to the configured seed.

Assembly order is base (optionally free games), Hold&Win if present, executable bet modes if present, then jackpot. Jackpot remains outside suppression and mode multiplication. Free games and Hold&Win cannot coexist: their competing continuation/banking rules are rejected. Existing geometry restrictions remain. The [authored catalogue](v2-completion/V2C-12.md) records each supported variant/composition separately from the random-strategy compatibility catalogue.

Executable modes require every mode's `runtimeType`, exactly one safe default, and compatible free games for purchases. `costMultiplier`/labels/`isDefault` without runtime semantics remain metadata; `forcedFreeGames` without runtime opt-in is invalid. Base/ante selections persist. Buy-feature selection is consumed once at entry and resets to the default; another purchase requires a fresh action after feature completion. Original charged mode attribution remains available separately from current selection.

Generated CJS and TypeScript, exact descriptor extraction and real XLSX interchange retain these fields. The Mechanics workbook sheet uses `Mechanic` and `Configuration JSON` rows for extended configurations, preserving explicit retrigger policies; legacy free-game award sheets remain readable. Structural hashes include all mechanic and executable mode fields. Build conversions retain `build SOURCE --target TARGET`, explicit Save/Apply and new/empty destinations. WASM and paid-grid outcome-library/Stake projections reject Hold&Win/jackpot histories rather than erase them; generated games with these mechanics expose no paid-grid exact-enumeration constructor.

Custom collectors/triggers/aggregators, stake-dependent/random jackpot triggers, custom contributions or entry handlers, multi-tier selection, and shared/distributed progressives remain custom code. A descriptor states representable data; it cannot certify opaque collaborator behavior. Built-in restoration certification requires resolved built-in collaborators and a restorable nested seeded session. Sharing a mutable accumulating pool invalidates built-in certification.

### Authored modifiers

Generated CommonJS and TypeScript modules retain `mechanics.modifiers` verbatim
and assemble the shared `VideoSlotSession` modifier runtime. The effective-model
descriptor, extraction and XLSX Mechanics JSON rows preserve rule order, zero
factors and empty substitution lists. Changing rule order changes configuration
identity. Build the `examples/blueprints/wild-*.blueprint.json` examples with
`pokie build SOURCE --target tsPackage --out NEW_DIRECTORY`, then open that
package with `pokie PACKAGE`. Stateless modifiers retain exact enumeration;
sticky games explicitly lack independent-spin enumeration. See the
[math contract](math-modeling.md#authored-wilds-and-screen-modifiers).

## Bounded authored mechanics (V2C-14)

See [cascades, respins and collections](bounded-mechanics.md) for the declarative
contracts, supported compositions, authoring/build/extraction/PAR workflow,
logical-round accounting, continuation and durability boundaries.

## Weighted bonus authoring

See [finite weighted bonus outcomes](weighted-bonus.md) for selection identity,
payout/duration units, authoring/interchange, restoration/replay, statistics and
custom-rule/target boundaries. The [launch support register](v2-completion/launch-mechanics-support.md)
maps every mandatory family separately from arbitrary custom callbacks.

### Definition comparison declarations

`pokie diff package-a package-b --comparison definition` and the public
`compareMathDefinitions` API use `getModelDescriptor()` through
`PackageBlueprintExtraction`, including asynchronous descriptors and owned
snapshot cleanup. A capability authorizes attempting extraction; it does not
certify complete or executable model equivalence. Known partial fields remain
inspectable and opaque/custom boundaries never become identical by omission.

Version 1 descriptors may additionally declare `maxWinPolicy` at the descriptor
root. An undeclared custom cap policy is unknown; generated models establish no
runtime cap. This is evidence about the declared model, not a mechanism to install
or change payout caps. The exact declaration forms, schema, provenance/default
rules and limitations are documented in
[math-modeling.md](math-modeling.md#max-win-declaration-and-custom-boundary).


Extraction `status: "complete"` describes the declared model, separately from
Blueprint conversion eligibility. A declared max-win cap remains available for
comparison; a `declared` or explicitly `unknown` policy prevents extraction from
emitting a `blueprint`/`blueprintHash` and supplies `conversionDiagnostics` with
`max-win-policy-not-representable`. Both direct Blueprint publication and registry
plans for Blueprint, regenerated package, PAR and WASM refuse to discard it.
CLI build and Studio conversion preview/build share this registry boundary.
A declared absence (`type: "none"`) remains representable. This comparison
contract does not implement a payout cap. Explicit unsupported field authority
also overrides generated defaults and applies to descendants, including fields
inside arrays.
