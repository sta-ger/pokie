[← Back to docs index](README.md)

# Pre-Generated Runtime

`pregenerated/` is the runtime counterpart to [Weighted Outcome Library](weighted-outcome-library.md): instead of
running a game's own calculation path, it draws one already-computed [`RoundArtifact`](round-artifacts.md) from a
`WeightedOutcomeLibrary`, proportional to each outcome's weight, and materializes it into a served round —
stamped with which library/outcome produced it and the runtime-only facts (round/session/request ids, wallet
balances, transactions) that only exist because a real round was played. This is the first vertical slice built
directly on top of a `WeightedOutcomeLibrary` as *content*, rather than as an analysis input.

## Selecting an outcome

```ts
interface WeightedOutcomeRandomSource {
    nextUnitInterval(): number; // must return a finite number in [0, 1)
}

class SeededWeightedOutcomeRandomSource implements WeightedOutcomeRandomSource {
    constructor(seed: number);
}

class SecureWeightedOutcomeRandomSource implements WeightedOutcomeRandomSource {}

class WeightedOutcomeSelector implements WeightedOutcomeSelecting {
    select<T = string>(library: WeightedOutcomeLibrary<T>, randomSource: WeightedOutcomeRandomSource): WeightedOutcome<T>;
}
```

`WeightedOutcomeSelector` draws exactly one `WeightedOutcome` from a library: it scales a single
`randomSource.nextUnitInterval()` draw by the library's total weight and walks the (already canonically sorted)
outcomes until the cumulative weight passes that point — proportional selection, with no game calculation
involved. Randomness is injected, not hardwired: `SeededWeightedOutcomeRandomSource` (mulberry32) gives
reproducible draws for replay/regression tests, `SecureWeightedOutcomeRandomSource` is for production. Assumes
`library` is already validly built (see `buildWeightedOutcomeLibrary`) and throws `WeightedOutcomeSelectionError`
only as a defensive backstop (an empty library, an invalid total weight, or a `randomSource` that breaks its own
`[0, 1)` contract).

## The runtime result

```ts
type PreGeneratedRoundSelectionProvenance = {
    libraryId: string;
    libraryHash: string;
    outcomeId: string;
    weight: number;
    totalWeight: number;
    probability: number;
};

type PreGeneratedRoundRuntimeContext = {
    roundId: string;
    sessionId: string;
    requestId?: string;
    balanceBefore: number;
    balanceAfter: number;
    transactions: readonly {id: string; type: "debit" | "credit"; amount: number}[];
};

type PreGeneratedRoundResult<T = string> = {
    schemaVersion: number;
    selection: PreGeneratedRoundSelectionProvenance;
    runtime: PreGeneratedRoundRuntimeContext;
    artifact: RoundArtifact<T>; // the library's own artifact reference, never copied or mutated
};
```

`buildPreGeneratedRoundResult({library, libraryHash, outcome, runtime})` is the one place a `PreGeneratedRoundResult`
is assembled. It fails fast with **`PreGeneratedRoundBuildError`** on: an `outcome` that isn't actually present in
`library` (by id *and* artifact identity), an invalid `runtime.roundId`/`sessionId`, a non-finite balance, a
malformed transaction entry, or content that isn't JSON-safe. `artifact` is always the exact object reference the
library already holds — canonical library content is never copied, re-derived, or re-run through a second
calculation path, and the library itself is never mutated.

`PreGeneratedRoundResultValidator` checks the same invariants defensively, over an already-built (or
untrusted/round-tripped) result, delegating `artifact`'s own validity to a real `RoundArtifactValidator` — never
throws, same convention as `WeightedOutcomeLibraryValidator`.

## Public/internal projection

```ts
class PreGeneratedRoundResultProjector<T = string> {
    projectPublic(result: PreGeneratedRoundResult<T>): PreGeneratedRoundPublicView<T>;
    projectInternal(result: PreGeneratedRoundResult<T>): PreGeneratedRoundInternalView<T>;
}
```

`projectPublic()` is exactly what a client needs to render a round (`roundId`, `sessionId`, `requestId?`,
`credits`, `win`, `payoutMultiplier`, `screen`, `wins`) — never the library/outcome/weight provenance that
produced it. `projectInternal()` is the full audit trail (`selection`, `runtime`, the raw `artifact`). This
mirrors `PokieDevServer`'s own public/internal response split (see [CLI](cli.md), "pokie serve") field-for-field
where the concepts overlap.

## Replay

```ts
class PreGeneratedRoundReplayer implements PreGeneratedRoundReplaying {
    replay<T = string>(options: {library: WeightedOutcomeLibrary<T>; libraryHash: string; seed: string; round: number}): PreGeneratedRoundReplayDescriptor;
}
```

Unlike `replay/ReplayRecorder` (which best-effort replays a *live* session round by round, since there's no
seek-to-round primitive there), `PreGeneratedRoundReplayer` is exact: a round's outcome is fully determined by
`(seed, round)` via a shared derivation (`deriveDeterministicSeed`), so replaying the same pair against the same
library always reproduces the identical draw — no wallet, session, or idempotency state involved.

## Server integration (`pokie serve`)

`PokieDevServer` gains two additive, opt-in-only routes when `PokieDevServerOptions.preGeneratedOutcomeLibrary`
is configured — a separate namespace (`/pregenerated-sessions`) that never overlaps with the existing `/sessions`
routes, which are completely unaffected either way:

- `POST /pregenerated-sessions` — body `{seed?: string; initialBalance?: number}` — creates a session with a tiny
  persisted state (`{libraryId, seed, roundsPlayed}`; see `PreGeneratedSessionState`) and, when given, seeds the
  wallet balance (there's no live session to default it from, unlike the `/sessions` path).
- `POST /pregenerated-sessions/:id/spin` — body `{requestId?: string}` — draws the session's next round
  deterministically (`WeightedOutcomeSelector`, seeded from the session's own `seed` and round index), settles
  the wallet (debit `artifact.stake`, credit `artifact.totalWin` when positive), and returns the public projection
  by default, or the full internal view under `?debug=1` (same convention as the live spin path).

`PreGeneratedSpinCommandHandler` orchestrates this: idempotency replay (same `IdempotencyRepository` contract as
`SpinCommandHandler`, keyed by `(sessionId, requestId)`), per-session command serialization, and best-effort
wallet/session-state compensation on failure — the same shape as `SpinCommandHandler`'s own orchestration, applied
to a fixed, pre-enumerated library instead of a live `GameSessionHandling`. No live session object is ever created
for this path.
