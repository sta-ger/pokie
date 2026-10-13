[← Back to docs index](README.md)

# Round Artifacts

`artifact/` is a third, separate view of "what happened in a round" alongside `net/` (client transport) and
`replay/` (seed/round replay descriptors): a canonical, hashable, storage/audit-grade record — `RoundArtifact` —
built directly off already-computed runtime state, with a standard JSON projection and a stable content hash.
It's for persisting, diffing, or auditing a completed round later, not for driving a game client (see
[Network Serialization](serialization.md) for that) or for re-playing one (see `pokie replay` in [CLI](cli.md)).

## Data shapes

Every field below is `readonly`, all the way down (arrays, nested arrays, positions, multiplier breakdowns,
feature events, provenance, metadata/debug) — a `RoundArtifact` is a value, not a mutable record. `JsonValue`/
`JsonObject` (see [Canonical JSON + hash](#canonical-json--hash) below) are the same canonical, deeply-readonly
JSON types used everywhere in `pokie` that need a stable, hashable shape.

```ts
type RoundArtifactWin<T = string> = {
    readonly type: string;
    readonly id: string;
    readonly symbolId: T;
    readonly winAmount: number;
    readonly winningPositions: readonly (readonly number[])[];
    readonly multiplierBreakdown: readonly RoundArtifactMultiplierBreakdown[]; // readonly mirror of WinMultiplierBreakdown
    readonly metadata: JsonObject;
};

type RoundArtifactFeatureEvent = {
    readonly type: string;
    readonly data?: JsonObject;
};

// What a caller actually supplies before a feature event is built — "data" is a plain, permissive
// Record<string, unknown> here; buildRoundArtifact/buildRoundStepArtifact validate and deep-copy it into the
// JsonObject above, failing fast (RoundArtifactBuildError) if it isn't actually JSON-safe.
type RoundArtifactFeatureEventInput = {
    readonly type: string;
    readonly data?: Record<string, unknown>;
};

type RoundArtifactProvenance = {
    readonly game: Readonly<PokieGameManifest>; // id/name/version/description?/author? — reused, not duplicated
    readonly pokieVersion: string;
    readonly configHash?: string; // e.g. computeBlueprintHash() output, for a "pokie build"-generated game
};

type RoundStepArtifact<T = string> = {
    readonly index: number;
    readonly screen: readonly (readonly T[])[];
    readonly totalWin: number;
    readonly wins: readonly RoundArtifactWin<T>[];
    readonly featureEvents?: readonly RoundArtifactFeatureEvent[];
    readonly debug?: JsonObject;
};

type RoundArtifact<T = string> = {
    readonly schemaVersion: number;
    readonly roundId: string;
    readonly provenance: RoundArtifactProvenance;
    readonly betMode: string;          // caller-supplied, e.g. "base" / "freeGames" — never inferred
    readonly stake: number;
    readonly totalWin: number;
    readonly payoutMultiplier: number; // stake > 0 ? totalWin / stake : 0
    readonly screen: readonly (readonly T[])[]; // the last step's screen
    readonly steps: readonly RoundStepArtifact<T>[];
    readonly wins: readonly RoundArtifactWin<T>[]; // flattened across all steps
    readonly featureEvents?: readonly RoundArtifactFeatureEvent[];
    readonly debug?: JsonObject;
};
```

`RoundArtifactWin<T>` is a lossless, plain-data mirror of `WinComponent<T>`'s own getters (`getType`/`getId`/
`getSymbolId`/`getWinAmount`/`getWinningPositions`/`getMultiplierBreakdown`/`getMetadata` — see
[Paytable & Win Calculation](paytable-and-wins.md)) — mapped, never recalculated.

`steps` supports multi-step logical rounds (cascades, multi-pick bonuses, ...) the same way
`MultiStageRoundNetworkData` does on the `net/` side: a plain spin has exactly one step; a multi-stage mechanic
has one per stage.

## Building — no second calculation path

```ts
function buildRoundStepArtifact<T = string>(index: number, source: RoundArtifactStepSource<T>): RoundStepArtifact<T>;

function buildRoundArtifact<T = string>(options: RoundArtifactBuildOptions<T>): RoundArtifact<T>;

function buildRoundArtifactFromSession<T = string>(
    session: VideoSlotSessionHandling<T>,
    options: RoundArtifactFromSessionOptions,
): RoundArtifact<T>;
```

Every number in a `RoundArtifact` is read straight off state the win evaluation pipeline (or the session) already
computed — `totalWin`/`wins` come from `WinEvaluationResult.getTotalWin()`/`getWinComponents()`, `stake` (when not
given explicitly) comes from the same `determineStakeAmount` this library already uses for wallet debiting (see
[Game Session & Configuration](game-session.md) and `StakeAmountDetermining`). Nothing here re-derives a win or a
charge amount independently.

Both builders fail fast with a **`RoundArtifactBuildError`** (`getCode()`/`message`) — before any `RoundArtifact`
is ever returned — on: an empty `steps` list, an invalid `roundId`/`betMode`/`stake`/`schemaVersion`, an invalid
(non-finite or negative) win amount, or `metadata`/`debug`/feature event `data` that isn't JSON-safe (see
[Canonical JSON + hash](#canonical-json--hash)). A built `RoundArtifact` is always **fully isolated from its
inputs** — every nested array/object is deep-copied, never shared with the caller's own objects or the win
evaluation pipeline's internal state — and **deeply frozen** (`Object.freeze`, recursively): mutating it
afterward throws a `TypeError`, and mutating whatever the caller originally passed in has no effect on the
artifact:

```ts
import {RoundArtifactBuildError} from "@fromstan/pokie";

try {
    buildRoundArtifact({roundId: "", provenance, stake: 1, steps: []});
} catch (error) {
    if (error instanceof RoundArtifactBuildError) {
        console.error(error.getCode(), error.message); // "round-artifact-steps-empty", "..."
    }
}
```

For the common single-step case, `buildRoundArtifactFromSession` builds straight from a played
`VideoSlotSessionHandling`:

```ts
import {buildRoundArtifactFromSession} from "@fromstan/pokie";

session.play();
const artifact = buildRoundArtifactFromSession(session, {
    roundId: "round-42",
    provenance: {game: game.getManifest(), pokieVersion: "1.3.0"},
});
```

It also derives one standard feature event — `{type: "freeGamesTriggered", data: {count}}` — when the session
feature-detects `WonFreeGamesNumberDetermining` and reports a win this round, the same optional-interface pattern
`determineStakeAmount` uses for `StakeAmountDetermining` rather than inferring anything from balance or other
incidental state.

For a multi-step round, build one `RoundArtifactStepSource` per stage yourself (e.g. one per
`CascadeResult.getCascadeSteps()` entry — each `CascadeStep` already exposes `getScreen()`/
`getWinEvaluationResult()` in exactly this shape) and pass them all to `buildRoundArtifact`:

```ts
import {buildRoundArtifact} from "@fromstan/pokie";

const artifact = buildRoundArtifact({
    roundId: "round-42",
    provenance: {game: game.getManifest(), pokieVersion: "1.3.0"},
    betMode: "base",
    stake: 5,
    steps: cascadeResult.getCascadeSteps().map((step) => ({
        screen: step.getScreen(),
        winEvaluationResult: step.getWinEvaluationResult(),
        debug: step.getDebugInfo(),
    })),
});
```

`totalWin`/`wins`/`screen` are then folded across all steps: `totalWin` sums each step's own total, `wins` is the
concatenation of each step's wins, and `screen` is the final step's screen.

## Canonical JSON + hash

```ts
type JsonPrimitive = string | number | boolean | null;
type JsonObject = {readonly [key: string]: JsonValue};
type JsonArray = readonly JsonValue[];
type JsonValue = JsonPrimitive | JsonObject | JsonArray;

function toCanonicalJson(value: unknown): JsonValue; // throws InvalidJsonValueError

interface RoundArtifactProjector<T, TOutput> {
    project(artifact: RoundArtifact<T>): TOutput;
}

class PokieJsonRoundArtifactProjector<T = string> implements RoundArtifactProjector<T, RoundArtifactJson<T>> {
    project(artifact: RoundArtifact<T>): RoundArtifactJson<T>;
}

function computeRoundArtifactHash<T = string>(artifact: RoundArtifact<T>): string; // "sha256:<hex>"
```

`toCanonicalJson` (in `json/`, not `artifact/` — it's generic, not RoundArtifact-specific) is the **one canonical
serializer** shared by both `computeRoundArtifactHash` and `PokieJsonRoundArtifactProjector`, so a hash and its
own JSON projection can never silently disagree on what counts as "valid" JSON or how it's ordered. It:

- Sorts plain-object keys recursively (so two values with the same content but different construction/insertion
  order canonicalize identically — the whole point for stable hashing), while always leaving array order exactly
  as-is (`steps`, `wins`, `screen`, winning positions, ... are all order-sensitive).
- **Fails fast** — throws `InvalidJsonValueError` (with `getPath()`/`getReason()`, e.g. `wins[2].metadata.rngSeed`)
  — on anything JSON can't represent losslessly: `NaN`/`Infinity`, `bigint`, `symbol`, a function, `undefined`
  where a value is required, or a circular reference. It never silently coerces these the way `JSON.stringify`
  does (dropping `undefined`/functions, turning `NaN`/`Infinity` into `null`, throwing an unhelpful generic error
  on cycles).

`RoundArtifact` is transport/storage-agnostic; `PokieJsonRoundArtifactProjector` is the standard, ready-made
projection to a plain JSON-safe object (`RoundArtifactJson` — the same fields, canonically ordered, plus `hash`),
itself deeply frozen. Implement `RoundArtifactProjector` directly for a different representation (a flat row for
a data warehouse, for example) without touching `RoundArtifact` itself.

A `RoundArtifact` built via `buildRoundArtifact`/`buildRoundArtifactFromSession` is already guaranteed JSON-safe
(they run every artifact through `toCanonicalJson` before returning it — see above), so `computeRoundArtifactHash`/
`PokieJsonRoundArtifactProjector.project` only actually throw for a hand-crafted artifact that bypassed that
guarantee.

```ts
import {PokieJsonRoundArtifactProjector} from "@fromstan/pokie";

const projector = new PokieJsonRoundArtifactProjector();
const json = projector.project(artifact);
// json.hash === computeRoundArtifactHash(artifact)
```

## Validation

```ts
class RoundArtifactValidator<T = string> implements ValidationRule<RoundArtifact<T>> {
    validate(artifact: RoundArtifact<T>): ValidationIssue[];
}
```

Reuses the existing generic `ValidationRule<T>` contract (same as `PokieGameContractValidationRule`/
`GameBlueprintValidator` — see [Game Packages](game-packages.md)). Unlike `buildRoundArtifact`'s own fail-fast
checks, `validate()` **never throws** — not even for a completely malformed, hand-crafted, or JSON-round-tripped
artifact that doesn't actually match `RoundArtifact`'s shape at runtime (missing fields, wrong types, `null`,
even a circular object) — it always returns an array of `ValidationIssue`s instead (a catch-all "round-artifact-
malformed" issue in the worst case). It checks:

- `roundId`, `provenance.game.{id,name,version}`, `provenance.pokieVersion` are non-empty strings.
- `schemaVersion` is a positive integer *and* matches the currently supported `ROUND_ARTIFACT_SCHEMA_VERSION`.
- `stake`/`totalWin` are finite, non-negative numbers; `payoutMultiplier` matches `totalWin / stake`.
- Every win's `winAmount` (both in `wins` and in each step's own `wins`) is a finite, non-negative number.
- `steps` is non-empty, with indices `0..n-1` in order, and each step's own `totalWin` matches the sum of that
  step's own wins.
- The round-level `totalWin` matches the sum of each step's `totalWin`.
- **`wins` is deeply equal to the flattened concatenation of every step's own `wins`** — not just the same
  *count*: two artifacts can have the same number of wins per step while actually containing different wins, and
  this catches that case specifically (`round-artifact-wins-mismatch`, distinct from the plain count check
  `round-artifact-wins-count-mismatch`).
- **`screen` matches the last step's `screen`** (`round-artifact-screen-mismatch`).
- Every feature event (round-level and per-step) has a non-empty `type`.
- The whole artifact is JSON-safe (via the same `toCanonicalJson` described above) — a JSON-safety violation
  (`round-artifact-not-json-safe`) is reported as an issue, not thrown.

```ts
const issues = new RoundArtifactValidator().validate(artifact);
if (issues.some((issue) => issue.severity === "error")) {
    // ...
}
```

## Generated, visible and evaluated coordinates

Canonical generated evidence and the separate PublicRoundArtifactProjector: see [the coordinate contract and adapter support matrix](v2-completion/V2C-03.md).

### Retained logical rounds

Explicit logical delivery retains each evaluated result before another subround
can overwrite the live session's output. `buildLogicalRoundArtifact(round,
provenanceTemplate)` folds these immutable ordered steps, using the entry's
actual stake/mode and mathematical win total. It does not resolve, refill, draw
or evaluate. Full server capture uses this complete prefix and completes it as
free games finish; pending artifacts represent a committed prefix, not a claim
that the feature ended. Public projection still removes generated/evaluated
coordinate evidence, including on the currently delivered cascade step.

`buildRoundArtifactFromSession()` remains a single played-subround capture for
free-game sessions. For cascade providers it consumes the retained resolver
steps and terminal evaluation. Custom providers must retain those evaluated
results; a displayed final screen alone cannot establish complete math or RNG
continuation. Deferred free-game bank release belongs to actual settlement;
adding that release to per-step mathematical wins would double-count it.

`ReplayRecorder.record({unit: "logical-round", entryCommands, ...})` and Studio
replay requests with the same unit reproduce logical entries and ordered
subrounds. Entry commands preserve explicit bet/mode choices. The default replay
unit remains one domain step; `pokie replay --unit logical-round` selects logical
addressing for capable game packages. WASM/outcome sources do not gain feature
mechanics through this option. Studio's recorded Play history already holds the
original commands, prefix/final artifact and provenance, so re-delivery creates
no additional history record.

## Recorded executable audit replay

`RoundArtifact` schema 1 remains the canonical mathematical observation. A hashed
JSON artifact is validated against its digest when supplied to `RoundArtifactValidator`.
A visible projection has no canonical hash and is not independently replayable.
`AuditRoundRecording` (`pokie.audit-round.v1`, runtime contract
`pokie.session-runtime.v1`) binds artifacts to executable inputs and disposition:

- selected game compatibility/state schema and effective model hash;
- original context, variant/mode, bet, delivery policy, operation/request/attempt
  identities, revision and settlement transaction identities where available;
- complete executable starting/resulting state, including the RNG stream;
- ordered accepted deliveries, mathematical subrounds and saved cascade stages;
- canonical generated/visible screens, evaluated-step evidence, wins, feature
  counters, deferred bank, wallet payout and credits.

`ReplayRecorder.recordAudit(game, liveSession, commands, disposition, context)`
records the supplied session's actual execution without funding or seed substitution.
It is a detached calculation recorder; a caller-provided disposition is evidence,
not authority to settle. `SpinCommandHandler` captures the same evidence inside
its owning result publication boundary. Its retained result exposes `audit`, or
`auditUnavailableReason` when the model/codec cannot support exact reconstruction.
Full history belongs to retained operation/results, not recursive session snapshots.

Direct retries require a request identity or explicit logical delivery identity. Identical
unkeyed calls execute separately. A retry returns its immutable original descriptor and
digest; changed commands, construction context, disposition or model are rejected before
execution. Composite subdeliveries share their owning request and retain distinct logical
cursors. `walletPayout` records the actual signed post-stake wallet adjustment (credit or
debit), including floating-point residue; mathematical stakes and wins remain unchanged.
Captured evidence survives compensation with a compensated disposition. Recovery validates
the original digest and owning operation identity before publishing a new disposition.

```ts
const recording = recorder.recordAudit(game, session, [originalCommand], {
    status: "calculated", sessionId: originalSessionId, durability: "detached",
}, originalContext);
const portable = JSON.parse(JSON.stringify(recording));
validateAuditReplayDescriptor(portable, compatibleGame);
const reproduced = recorder.replay(compatibleGame, portable.audit);
// auditStatus: verified; auditCompletion: completed, pending, or exhausted.
```

`AuditRoundReplay` uses the existing `SessionRuntime` and selected game calculation
path, restoring detached executable state at every accepted boundary. It has no
wallet, store, provider, reconciliation or publication dependencies. Transactional
status is preserved and validated, never applied offline. Retries return retained
historical evidence; they do not append another calculation. A completed verification
of a pending/exhausted prefix does not complete the logical round. Mathematical
steps and saved-stage deliveries remain different; exhaustion retains the evaluated
prefix and final unevaluated refill.

The audit SHA-256 covers the complete envelope; artifact SHA-256 covers canonical
artifact content. Object key ordering is canonical, array ordering is significant.
Errors expose stable `AuditReplayError.code` and `path`: structure/hash, version,
identity, codec unsupported, state, command, order, artifact, execution mismatch or
cancellation. Validation happens before reconstruction, with selected-package
identity/schema/capabilities as authority. Hash-valid semantic inconsistencies also
fail validation or reproduction. Content hashes detect corruption relative to a
trusted digest; a consistently rewritten and rehashed recording is not authenticated.
No signatures, KMS, notarization or stronger fairness claim are added.

Root ESM/CJS exports provide recording and replay. The browser entry exports the
recording types only; Studio uses the server verifier's verdict. Native outcome
libraries retain their selection/hash profile; portable WASM retains its current
runtime replay and compact state, without package audit support.
