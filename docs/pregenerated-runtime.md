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
    nextInt(exclusiveUpperBound: number): number; // exact, unbiased integer in [0, exclusiveUpperBound)
}

class SeededWeightedOutcomeRandomSource implements WeightedOutcomeRandomSource {
    constructor(seed: string);
}

class SecureWeightedOutcomeRandomSource implements WeightedOutcomeRandomSource {}

class WeightedOutcomeSelector implements WeightedOutcomeSelecting {
    select<T = string>(library: WeightedOutcomeLibrary<T>, randomSource: WeightedOutcomeRandomSource): WeightedOutcome<T>;
}
```

`WeightedOutcomeSelector` draws exactly one `WeightedOutcome` from a library: it draws a single exact integer in
`[0, totalWeight)` via `randomSource.nextInt()` and walks the (already canonically sorted) outcomes' exact integer
cumulative sums until one contains that point — proportional selection, with no game calculation and no
floating-point rounding anywhere in the decision. Selection requires every outcome's `weight` — and their sum — to
be a positive safe integer (`Number.isSafeInteger`); this is *stricter* than `WeightedOutcomeLibrary` itself
requires (`buildWeightedOutcomeLibrary`/`WeightedOutcomeLibraryAnalyzer` accept any finite weight > 0, since exact
statistical analysis works over ratios, not draws) — a library meant to be *drawn from* at runtime needs integer
weights so a draw can be exactly unbiased.

Randomness is injected, not hardwired, and both implementations share one rejection-sampling core
(`drawUnbiasedInt`, internal) so they can never silently drift apart on what "unbiased" means:

- `SeededWeightedOutcomeRandomSource` takes its seed as a **plain string, in full** — never folded down into a
  32-bit integer first (a hash-then-truncate step would throw away almost all of a hash digest's own entropy and
  reintroduce a birthday-bound collision risk across different seeds a full string doesn't have to accept). It's
  built as a small hash-counter DRBG: block #0/#1/#2/... of its output stream are each
  `SHA-256("<seed>:<counter>")`, concatenated on demand into an arbitrarily long byte stream, from which unbiased
  integers up to `2^53` are drawn via rejection sampling. Deterministic and reproducible — the same seed always
  produces the same sequence — which is what makes `PreGeneratedRoundReplayer`'s reconstruction of a past round
  exact rather than best-effort.
- `SecureWeightedOutcomeRandomSource` draws raw bytes from `crypto.randomBytes` (not `crypto.randomInt`, which is
  itself unbiased but capped at ranges below `2^48` — too small for a library whose total weight can exceed that,
  e.g. a fine-grained reel-combination count in the billions) and reduces them the same way.

Both are exact/unbiased for any `exclusiveUpperBound` up to `2^53`, not just powers of two: a plain
`Math.floor(nextFloat() * n)` (or `raw % n` alone) would subtly favor smaller remainders whenever `n` doesn't
evenly divide the underlying draw space, silently skewing outcome probabilities — rejecting any draw that lands in
that leftover remainder and redrawing removes the bias entirely rather than merely shrinking it.

Assumes `library` is otherwise already validly built (non-empty, canonically sorted — guaranteed by
`buildWeightedOutcomeLibrary`) and does not re-validate that part; validate a library from an untrusted source
first (`WeightedOutcomeLibraryValidator`). Still fails fast with `WeightedOutcomeSelectionError` — including on a
non-integer/overflowing weight, or a `randomSource` that breaks its own contract — as a defensive backstop rather
than silently producing a wrong or biased result. There is deliberately no fallback to "the last outcome": with
exact integer arithmetic, every draw is provably within range, so anything that would have needed a fallback is a
real bug surfaced as an error instead.

## PreGeneratedOutcomeSourcing — decoupling the runtime from a full library

```ts
type PreGeneratedOutcomeSelection<T = string> = {
    libraryId: string;
    libraryHash: string;
    totalWeight: number;
    outcome: WeightedOutcome<T>;
};

interface PreGeneratedOutcomeSourcing<T = string> {
    drawOutcome(randomSource: WeightedOutcomeRandomSource): Promise<PreGeneratedOutcomeSelection<T>>;
}
```

`PreGeneratedSpinCommandHandler` is wired to a `PreGeneratedOutcomeSourcing`, not to a `WeightedOutcomeLibrary`
directly — it never knows or cares whether a draw came from memory or from disk. Every draw is atomic: it returns
the outcome *together with* the exact `libraryId`/`libraryHash`/`totalWeight` it was drawn against, all read from
the same underlying snapshot. Two implementations ship out of the box:

- **`InMemoryPreGeneratedOutcomeSource`** — wraps an already-built `WeightedOutcomeLibrary` and a caller-claimed
  `libraryHash`, verified against `computeWeightedOutcomeLibraryHash(library)` once, at construction (fails fast
  with `InMemoryPreGeneratedOutcomeSourceError` on a mismatch — the library never changes for this adapter's
  whole lifetime, so there's nothing to gain from re-verifying on every draw). Internally reuses
  `WeightedOutcomeSelector`, so its own draws are byte-for-byte the same as before this abstraction existed.
- **`OutcomeLibraryBundleOutcomeSource`** (see [Outcome Library Bundle](outcome-library-bundle.md)) — reads a
  canonical outcome-library bundle directly off disk: one small `index_<modeName>.json` read per draw (never the
  full outcomes file, never `readLibrary()`), a weighted pick by exact integer cumulative weight over that
  index's own entries, then a single byte-range read for exactly the winning outcome. The whole `{libraryId,
  libraryHash, totalWeight, outcome}` result comes from that *one* index read, never a separately-fetched hash —
  see "Library identity" below for why that matters.

### Source-level conflicts and selection validation

```ts
class PreGeneratedOutcomeSourceConflictError extends Error {}

class PreGeneratedOutcomeSelectionValidator<T = string> implements ValidationRule<PreGeneratedOutcomeSelection<T>> {
    validate(selection: PreGeneratedOutcomeSelection<T>): ValidationIssue[];
}
```

`drawOutcome()` may throw `PreGeneratedOutcomeSourceConflictError` to signal that the content this draw relied on
no longer matches what the source itself last promised — `OutcomeLibraryBundleOutcomeSource` throws it whenever
the underlying byte-range read detects an id/weight/`recordHash` mismatch (the bundle changed mid-draw, or a
record was tampered with in place — see [Outcome Library Bundle](outcome-library-bundle.md#validation)). Any
other `PreGeneratedOutcomeSourcing` implementation — including a hand-written test double or a buggy custom
source — can throw the same error for its own reasons and get identical treatment.

`PreGeneratedOutcomeSelectionValidator` checks a drawn selection's own structural well-formedness: non-empty
`libraryId`/`outcome.id`, a valid-format `libraryHash`, positive-safe-integer `weight`/`totalWeight`, `weight <=
totalWeight`, and an `outcome.artifact` that passes `RoundArtifactValidator`. It runs in two places, deliberately:
immediately after every draw in `PreGeneratedSpinCommandHandler` (see below), and again inside
`buildPreGeneratedRoundResult` as a defensive backstop for any other caller of that function. A hand-crafted or
forged `PreGeneratedOutcomeSourcing` implementation is just as capable of returning a structurally invalid
selection as a real adapter drifting out of sync would be — this is what catches it either way.

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

`buildPreGeneratedRoundResult({expectedLibraryId, expectedLibraryHash, selection, runtime})` is the one place a
`PreGeneratedRoundResult` is assembled — from a `PreGeneratedOutcomeSelection` already produced by a
`PreGeneratedOutcomeSourcing` implementation, never a full `WeightedOutcomeLibrary`. It fails fast with
**`PreGeneratedRoundBuildError`** on: a `selection` whose own `libraryId`/`libraryHash` doesn't match the caller's
`expectedLibraryId`/`expectedLibraryHash` (a defensive backstop mirroring the identity check
`PreGeneratedSpinCommandHandler` itself already performs before ever reaching this point), a non-positive-safe-
integer `selection.outcome.weight`/`selection.totalWeight` (the same integer requirement `WeightedOutcomeSelector`
itself needs), an invalid `runtime.roundId`/`sessionId`, a non-finite balance, a malformed transaction entry, or
content that isn't JSON-safe. `artifact` is always the exact object reference the selection's own outcome
already holds — canonical library content is never copied, re-derived, or re-run through a second calculation
path. There is no longer a "the outcome must be the library's own array element" reference-identity check —
without a full library there's no array to check against — but that guarantee now comes structurally from
`PreGeneratedOutcomeSourcing` itself: the only way to obtain a `PreGeneratedOutcomeSelection` at all is a real
source's own `drawOutcome()`, which always produces a genuine, already-verified outcome.

`PreGeneratedRoundResultValidator` checks the same invariants defensively, over an already-built (or
untrusted/round-tripped) result, delegating `artifact`'s own validity to a real `RoundArtifactValidator` — never
throws, same convention as `WeightedOutcomeLibraryValidator`. It requires `selection.weight`/`selection.totalWeight`
to be positive safe integers too (not just finite numbers > 0), and additionally cross-checks fields no
single-field check can catch on its own: `selection.probability === selection.weight / selection.totalWeight`
(within a small epsilon), `selection.weight <= selection.totalWeight`, that `runtime.transactions`' total debit
equals `artifact.stake` and total credit equals `artifact.totalWin`, that `runtime.balanceAfter` reconciles with
`balanceBefore` and those same transactions, and that every transaction id in `runtime.transactions` is unique.

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
routes, which are completely unaffected either way. The constructor itself fails fast — before `start()` is ever
called — with `PreGeneratedLibraryProvenanceMismatchError` if the configured library's own provenance (every
outcome shares the same `provenance.game`, guaranteed by `buildWeightedOutcomeLibrary`'s homogeneity check) doesn't
match the loaded `PokieGame`'s manifest: a library built for the wrong game, or the wrong version of this one, is a
configuration mistake caught at startup, never something a caller discovers mid-round.

- `POST /pregenerated-sessions` — body `{seed?: string; initialBalance?: number}` — creates a session with a tiny
  persisted state (`{libraryId, libraryHash, seed, roundsPlayed}`; see `PreGeneratedSessionState`) and, when given,
  seeds the wallet balance (there's no live session to default it from, unlike the `/sessions` path).
- `POST /pregenerated-sessions/:id/spin` — body `{requestId?: string}` — draws the session's next round
  deterministically (its configured `PreGeneratedOutcomeSourcing`, seeded from the session's own `seed` and round
  index), settles the wallet (debit `artifact.stake`, credit `artifact.totalWin` when positive), and returns the
  public projection by default, or the full internal view under `?debug=1` (same convention as the live spin
  path). `PokieDevServerOptions.preGeneratedOutcomeLibrary` is wrapped in an `InMemoryPreGeneratedOutcomeSource`
  internally; nothing about that option itself changed.

`PreGeneratedSpinCommandHandler` orchestrates this: idempotency replay (same `IdempotencyRepository` contract as
`SpinCommandHandler`, keyed by `(sessionId, requestId)`), per-session command serialization, and best-effort
wallet/session-state compensation on failure — the same shape as `SpinCommandHandler`'s own orchestration, applied
to a configured `PreGeneratedOutcomeSourcing` instead of a live `GameSessionHandling`. No live session object is
ever created for this path.

### Library identity — always checked against the exact version a draw came from

The session's own `libraryId`/`libraryHash` is compared against the *exact* identity the outcome source reports it
just drew from — never a separately-fetched, potentially stale or newer snapshot. The draw always happens first
(deterministic, no wallet/session side effects), immediately followed by this comparison, before the idempotency
cache is ever consulted and before any wallet transaction. This matters for the in-memory adapter too (a stale
cached result must never stand in for a fresh conflict check when a session was migrated to a different library),
but it's essential for a bundle-backed source: `OutcomeLibraryBundleOutcomeSource` reads its mode's index fresh on
every `drawOutcome()` call, so if the bundle is rebuilt in place between two spins (e.g. a redeploy regenerating
the same `libraryId`/mode with different weights), the very next draw's own atomic result already reflects that —
there is no separate, independently-refreshed "current identity" call that could observe a different version than
the draw itself did.

Every wallet transaction for an attempt gets its own id, `{roundId}:{attemptId}:debit`/`:credit` — `roundId` is the
requestId (or a fresh id when none was given), stable across every retry of that same logical request, exactly
mirroring `SpinCommandHandler`'s own convention; `attemptId` is freshly minted every time the method actually runs.
This matters more here than it might first appear: two separate `PreGeneratedSpinCommandHandler` instances (e.g.
two server processes) can both be asked to settle the *same* `(sessionId, requestId)` — a client retry that landed
on a different instance while the first instance's attempt is still in flight. Without a fresh `attemptId`, both
attempts would derive identical transaction ids for the same `requestId`; if the losing attempt's own
optimistic-locking save then conflicts and its compensation reverses "its" transactions, it would actually reverse
the *winning* attempt's already-committed, identically-id'd transactions — corrupting a round that had already
legitimately settled. A fresh `attemptId` per attempt keeps every attempt's own transactions uniquely identified,
so a losing attempt's compensation can only ever touch its own.

### Conflicts (HTTP 409)

A spin can come back `409` for four distinct reasons, all surfaced as a `"conflict"` `PreGeneratedSpinCommandResult`,
and all — except the last — caught before the idempotency cache is consulted and before any wallet transaction,
so there's nothing to compensate:

- **Source-level conflict**: `drawOutcome()` itself threw `PreGeneratedOutcomeSourceConflictError` — the content
  this draw relied on no longer matches what the source last promised (e.g. a bundle rewritten, or one of its
  records tampered in place, between the index being read and the winning record's own byte range being read).
- **Invalid selection**: the drawn selection failed `PreGeneratedOutcomeSelectionValidator` — a forged or buggy
  custom `PreGeneratedOutcomeSourcing` implementation returned something structurally untrustworthy (an empty
  `libraryId`, a weight exceeding `totalWeight`, an artifact that fails `RoundArtifactValidator`, ...).
- **Library mismatch**: the loaded session's own `libraryId`/`libraryHash` (stamped at creation) doesn't match the
  identity the handler's outcome source reports for the round it just atomically drew — e.g. a session from
  before a redeploy that swapped the library/bundle, or a same-id library/bundle regenerated with different
  weights. A stale cached result can never bypass it either, since all three checks above run before the
  idempotency cache is ever consulted.
- **Optimistic-locking version conflict**: when the configured `PreGeneratedSessionRepository` additionally
  implements `VersionedPreGeneratedSessionRepository` (`InMemoryPreGeneratedSessionRepository` does out of the
  box — the same additive pattern as `VersionedSessionRepository`/`isVersionedSessionRepository` for the live spin
  path), the state loaded at the start of an attempt is saved back via `saveVersioned()` with the version it was
  read at. A mismatch — someone else's save landed in between, e.g. another `PreGeneratedSpinCommandHandler`
  instance sharing this repository — throws `PreGeneratedSessionVersionConflictError`, caught and turned into a
  `"conflict"` result only *after* every wallet transaction this attempt applied has already been reversed (using
  that attempt's own `attemptId`-scoped transaction ids, so a winning concurrent attempt's transactions are never
  touched — see above). A played result's own `version` field carries the repository's new revision when one is
  available.
