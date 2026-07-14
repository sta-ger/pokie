[← Back to docs index](README.md)

# Round Artifacts

`artifact/` is a third, separate view of "what happened in a round" alongside `net/` (client transport) and
`replay/` (seed/round replay descriptors): a canonical, hashable, storage/audit-grade record — `RoundArtifact` —
built directly off already-computed runtime state, with a standard JSON projection and a stable content hash.
It's for persisting, diffing, or auditing a completed round later, not for driving a game client (see
[Network Serialization](serialization.md) for that) or for re-playing one (see `pokie replay` in [CLI](cli.md)).

## Data shapes

```ts
type RoundArtifactWin<T = string> = {
    type: string;
    id: string;
    symbolId: T;
    winAmount: number;
    winningPositions: number[][];
    multiplierBreakdown: WinMultiplierBreakdown[];
    metadata: Record<string, unknown>;
};

type RoundArtifactFeatureEvent = {
    type: string;
    data?: Record<string, unknown>;
};

type RoundArtifactProvenance = {
    game: PokieGameManifest;    // id/name/version/description?/author? — reused, not duplicated
    pokieVersion: string;
    configHash?: string;        // e.g. computeBlueprintHash() output, for a "pokie build"-generated game
};

type RoundStepArtifact<T = string> = {
    index: number;
    screen: T[][];
    totalWin: number;
    wins: RoundArtifactWin<T>[];
    featureEvents?: RoundArtifactFeatureEvent[];
    debug?: Record<string, unknown>;
};

type RoundArtifact<T = string> = {
    schemaVersion: number;
    roundId: string;
    provenance: RoundArtifactProvenance;
    betMode: string;             // caller-supplied, e.g. "base" / "freeGames" — never inferred
    stake: number;
    totalWin: number;
    payoutMultiplier: number;    // stake > 0 ? totalWin / stake : 0
    screen: T[][];               // the last step's screen
    steps: RoundStepArtifact<T>[];
    wins: RoundArtifactWin<T>[]; // flattened across all steps
    featureEvents?: RoundArtifactFeatureEvent[];
    debug?: Record<string, unknown>;
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
interface RoundArtifactProjector<T, TOutput> {
    project(artifact: RoundArtifact<T>): TOutput;
}

class PokieJsonRoundArtifactProjector<T = string> implements RoundArtifactProjector<T, RoundArtifactJson<T>> {
    project(artifact: RoundArtifact<T>): RoundArtifactJson<T>;
}

function computeRoundArtifactHash<T = string>(artifact: RoundArtifact<T>): string; // "sha256:<hex>"
```

`RoundArtifact` is transport/storage-agnostic; `PokieJsonRoundArtifactProjector` is the standard, ready-made
projection to a plain JSON-safe object (`RoundArtifactJson` — the same fields, in a fixed order, plus `hash`).
Implement `RoundArtifactProjector` directly for a different representation (a flat row for a data warehouse, for
example) without touching `RoundArtifact` itself.

`computeRoundArtifactHash` hashes an artifact's content, not its source object's own key order — own keys, and any
nested free-form `metadata`/`debug`/feature-event `data` blob's keys, are sorted before hashing (array order is
always left as-is, since it's meaningful everywhere it appears — `steps`, `wins`, `screen`, winning positions).
Two artifacts built from the same content hash identically regardless of construction order; changing any
semantic field (an amount, a position, a screen symbol) changes the hash.

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
`GameBlueprintValidator` — see [Game Packages](game-packages.md)). Checks structural invariants: `roundId` and
`provenance` fields are non-empty, `stake`/`totalWin` are non-negative, `payoutMultiplier` matches
`totalWin / stake`, `steps` is non-empty with indices `0..n-1` in order, and the round-level `totalWin`/`wins`
agree with the sum/concatenation of each step's own.

```ts
const issues = new RoundArtifactValidator().validate(artifact);
if (issues.some((issue) => issue.severity === "error")) {
    // ...
}
```
