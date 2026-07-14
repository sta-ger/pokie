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
import {RoundArtifactBuildError} from "pokie";

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
import {buildRoundArtifactFromSession} from "pokie";

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
import {buildRoundArtifact} from "pokie";

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
import {PokieJsonRoundArtifactProjector} from "pokie";

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
