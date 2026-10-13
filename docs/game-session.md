[← Back to docs index](README.md)

# Game Session & Configuration

## The generic layer: `GameSession` / `GameSessionConfig`

`GameSessionConfig` (implements `GameSessionConfigRepresenting`) holds the bare essentials any bet-based game needs:

```ts
setAvailableBets(availableBets: number[]): void
getAvailableBets(): number[]
setCreditsAmount(creditsAmount: number): void
getCreditsAmount(): number
setBet(bet: number): void          // no validation — see note below
getBet(): number
isBetAvailable(bet: number): boolean
```

Defaults (no-arg constructor): `availableBets = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100]`, `creditsAmount = 1000`,
`bet = availableBets[0]` (`1`).

> **`GameSessionConfig.setBet` does not validate against `availableBets`.** It's dumb storage. Validation happens
> one layer up, in `GameSession.setBet`.

`GameSession` (implements `GameSessionHandling`) is the actual play loop:

```ts
constructor(config: GameSessionConfigRepresenting = new GameSessionConfig(), winAmountCalculator: WinAmountDetermining = new NoWinAmount())
getCreditsAmount(): number
setCreditsAmount(creditsAmount: number): void
getWinAmount(): number              // delegates to the injected WinAmountDetermining
getAvailableBets(): number[]
getBet(): number
setBet(bet: number): void           // rejects unavailable bets, falls back to getAvailableBets()[0]
canPlayNextGame(): boolean          // credits >= bet
play(): void                        // if canPlayNextGame(), credits -= bet
```

`GameSessionHandling` intentionally excludes bet-list mutation (`setAvailableBets`) — a running session can read
available bets but not redefine the set; that stays a config-only call (`config.setAvailableBets(...)`).

## The video-slot layer: `VideoSlotSession` / `VideoSlotConfig`

`VideoSlotSession` wraps a `GameSessionHandling`, a `SymbolsCombinationsGenerating`, and a `VideoSlotWinCalculating`
around a `VideoSlotConfigRepresenting`:

```ts
constructor(
    config: VideoSlotConfigRepresenting = new VideoSlotConfig(),
    combinationsGenerator: SymbolsCombinationsGenerating = new SymbolsCombinationsGenerator(config),
    winCalculator: VideoSlotWinCalculating = new VideoSlotWinCalculator(config),
    baseSession: GameSessionHandling = new GameSession(config),
)

play(): void  // places the bet, generates a new combination, calculates win, adds win to credits
getSymbolsCombination(): SymbolsCombinationDescribing
getWinEvaluationResult(): WinEvaluationResult
getWinningLines(): Record<string, WinningLineDescribing>
getWinningScatters(): Record<string, WinningScatterDescribing>
getLinesWinning(): number
getScattersWinning(): number
getWinAmount(): number
getPaytable(): PaytableRepresenting
getSymbolsSequences(): SymbolsSequenceDescribing[]
getReelsSymbolsNumber(): number
getReelsNumber(): number
getAvailableSymbols(): string[]
isSymbolWild(symbolId: string): boolean
isSymbolScatter(symbolId: string): boolean
getWildSymbols(): string[]
getScatterSymbols(): string[]
getLinesDefinitions(): LinesDefinitionsDescribing
getLinesPatterns(): LinesPatternsDescribing
// plus the base session surface: getCreditsAmount/setCreditsAmount, getBet/setBet, getAvailableBets, canPlayNextGame
```

`VideoSlotSession.getWinEvaluationResult()` is now the canonical per-round breakdown. The old
`getWinningLines()` / `getWinningScatters()` methods remain as compatibility views derived from that object. For
legacy cluster/value/ways record getters, keep using the underlying `VideoSlotWinCalculator` when needed.

Legacy custom win calculators that only implement `calculateWin()` / `getWinAmount()` / `getWinningLines()` /
`getWinningScatters()` continue to work: `VideoSlotSession.play()` and `VideoSlotSession.getWinAmount()` fall back to
the legacy calculator amount instead of treating the win as zero.

`VideoSlotConfig` (implements `VideoSlotConfigRepresenting`) is where the game's shape lives:

```ts
constructor(baseConfig = new GameSessionConfig(), sequencesGenerator: ReelsSymbolsSequencesGenerating = new ReelsSymbolsSequencesGenerator())

getReelsNumber(): number / setReelsNumber(n: number): void
getReelsSymbolsNumber(): number / setReelsSymbolsNumber(n: number): void   // visible rows per reel
getAvailableSymbols(): string[] / setAvailableSymbols(symbols: string[]): void
getWildSymbols(): string[] / setWildSymbols(symbols: string[]): void
getWildSubstitutions(): Partial<Record<string, string[]>> / setWildSubstitutions(v): void  // see paytable-and-wins.md
getScatterSymbols(): string[] / setScatterSymbols(symbols: string[]): void
isSymbolWild(symbolId: string): boolean
isSymbolScatter(symbolId: string): boolean
getPaytable(): PaytableRepresenting / setPaytable(p: PaytableRepresenting): void
getLinesDefinitions(): LinesDefinitionsDescribing / setLinesDefinitions(d): void
getLinesPatterns(): LinesPatternsDescribing / setLinesPatterns(p): void
getSymbolsSequences(): SymbolsSequenceDescribing[] / setSymbolsSequences(s): void
// plus GameSessionConfigRepresenting: bet, credits, available bets
```

Defaults (no-arg constructor): 5 reels × 3 rows, `availableSymbols = ["A","K","Q","J","10","9","W","S"]`,
`wilds = ["W"]`, `scatters = ["S"]`, `linesDefinitions = new HorizontalLines(5, 3)`,
`linesPatterns = new LeftToRightLinesPatterns(5)`, and per-reel symbol sequences built automatically (see below).

### Reel sequence auto-generation

`VideoSlotConfig` builds one `SymbolsSequence` per reel by delegating to the injected `ReelsSymbolsSequencesGenerating`
(2nd constructor argument). The default, `ReelsSymbolsSequencesGenerator`: 15 copies of each non-wild/non-scatter
symbol, 5 copies of each wild, 3 copies of each scatter, then shuffles — re-rolling the shuffle until no reel has a
scatter symbol as part of a multi-symbol stack (so scatters land as single symbols on each reel by default). This
runs:

- once, in the constructor,
- again whenever `setScatterSymbols(...)` is called,
- again whenever `setAvailableSymbols(...)` is called.

Calling `setSymbolsSequences(...)` yourself overrides whatever was auto-generated — this is how you supply your own,
math-model-tuned reel strips (see [Reels & Symbol Sequences](reels-and-sequences.md) and
[Modeling Slot Math with POKIE](math-modeling.md)). If instead you want a *different generation algorithm* to run
automatically on every `setAvailableSymbols`/`setScatterSymbols` call (e.g. weighted by paytable, or without the
"no scattered stacks" constraint), implement `ReelsSymbolsSequencesGenerating` and pass it as the 2nd constructor
argument instead of replacing the generated sequences after the fact:

```ts
import {ReelsSymbolsSequencesGenerating, SymbolsSequenceDescribing, VideoSlotConfig} from "@fromstan/pokie";

class WeightedReelsGenerator implements ReelsSymbolsSequencesGenerating {
    public generate(reelsNumber: number, availableSymbols: string[], wildSymbols: string[], scatterSymbols: string[]): SymbolsSequenceDescribing[] {
        // your own strip-generation logic
    }
}

const config = new VideoSlotConfig(new GameSessionConfig(), new WeightedReelsGenerator());
```

### Example: a custom 5×3 game

```ts
import {
    VideoSlotConfig, VideoSlotSession, SymbolsSequence,
    LinesDefinitionsFor5x3, LeftToRightLinesPatterns, Paytable,
} from "@fromstan/pokie";

const config = new VideoSlotConfig();
config.setAvailableSymbols(["A", "K", "Q", "J", "10", "W", "S"]);
config.setWildSymbols(["W"]);
config.setScatterSymbols(["S"]);
config.setLinesDefinitions(new LinesDefinitionsFor5x3());
config.setLinesPatterns(new LeftToRightLinesPatterns(5, 2)); // min. 2 symbols from the left to win

const paytable = new Paytable(config.getAvailableBets(), ["A", "K", "Q", "J", "10"], ["W"], 5);
paytable.setPayoutForSymbol("A", 3, 5);  // 3-of-a-kind pays 5x bet, across every available bet
config.setPaytable(paytable);

const session = new VideoSlotSession(config);
session.setBet(10);
session.play();
```

### Symbol IDs are generic

Every class that touches a symbol ID (`VideoSlotConfig`, `VideoSlotSession`, `Paytable`, `SymbolsSequence`,
`SymbolsCombination`, `WinningLine`, `WinningScatter`, the win calculators/analyzer, the free-games layer, the `net/`
serializers, and `PlayUntilSymbolWinStrategy`) is generic over a type parameter `T extends string | number | symbol`,
defaulting to `T = string`. The default keeps every existing call site — `new VideoSlotConfig()`,
`VideoSlotSessionHandling`, etc. — working exactly as before with no changes required.

Pass an explicit type argument to use something other than plain strings, e.g. numeric symbol codes:

```ts
import {VideoSlotConfig, VideoSlotSession, SymbolsSequence} from "@fromstan/pokie";

const config = new VideoSlotConfig<number>();
config.setAvailableSymbols([1, 2, 3, 4, 100, 200]); // 100 = wild, 200 = scatter
config.setWildSymbols([100]);
config.setScatterSymbols([200]);
config.setSymbolsSequences(
    new Array(config.getReelsNumber())
        .fill(0)
        .map(() => new SymbolsSequence<number>().fromNumberOfEachSymbol([1, 2, 3, 4, 100, 200], 15)),
);

const session = new VideoSlotSession<number>(config);
session.play();
session.getSymbolsCombination().toMatrix(); // number[][]
```

A `string`-literal union (e.g. `"A" | "K" | "Q"`) also works as `T`, giving compile-time exhaustiveness checks over a
fixed symbol set instead of plain unchecked `string`.

See [Paylines & Line Patterns](paylines-and-patterns.md) and [Paytable & Win Calculation](paytable-and-wins.md) for
details on lines/patterns/paytable, [Free Games](free-games.md) for the bonus-round layer on top of this, and
[Resizable Grid](resizable-grid.md) for a grid whose per-reel height can change between rounds.

## Headless commands and repository ownership

`PokieGame` is the game definition and `GameSessionHandling` remains its injected OOP domain session.
`SessionRuntime` implements the portable `SessionRuntimeHandling` command boundary. Its `SessionCommand`
(currently `{kind: "spin", bet?, mode?}`) produces `SessionCommandResult`; JavaScript inputs are checked too.
The adapter calls the injected session's `play()` once. A successful `prepare()` returns a ready command with `rollback` and `execute` callbacks for settlement adapters; rejected preparation has no executor. A ready command executes once; rollback disables its executor and cannot undo an executed round. It does not calculate payouts. Constructor defaults,
legacy setter fallback, injected collaborators and decorator composition remain available to direct callers.

Simulation (including aggregate/worker execution), replay, Studio scenario spins and exact enumeration use
this boundary. They need neither a repository nor wallet transactions. Exact enumeration replaces only the
combinations generator; session math still owns wins, paid stakes and free-game grants. Existing cancellation,
worker shutdown and runtime lease ownership remain with the calling tool, between settled rounds.
Studio package replay consumes this boundary's returned stake and win for its totals. A prepared command's
first rollback is terminal: later rollback or execute calls cannot change a subsequently settled command.

For repository sessions, `SpinCommandHandler` implements `RepositoryCommandHandling`. Its `execute()` accepts
`RepositoryCommand` (the same command plus `sessionId`, optional `requestId` and `expectedVersion`) and returns
`SpinCommandResult` after settlement and persistence. The positional `handle()` delegates to the same dispatcher and retains its legacy operational-error rejection behavior. `execute()` returns typed operational failures (`storage-error`, `settlement-error`, `execution-error`) after compensation; `handle()` rejects with the original exception object. Custom adapters can use `RuntimeCommandError` to retain a classified primary cause. Wallet
settlement, queuing, idempotency, compensation and reconciliation stay in this adapter. `primeSession()` is an
cache registration: save an initial record first and pass its committed revision. For a package without
repository declarations, it also captures trusted live schema/command authority from that object. An unversioned repository
cannot authorize reuse of a live-only cache; durable sessions reconstruct on every new command.
The selected game's `getSessionStateSchema()` declares the codec before reconstruction. For example,
`{kind: "seeded-video-slot"}` restores the built-in RNG and resolved reel strips; optional `reels` and
`symbols` constrain the reconstructed model. Composed free-games/bet-mode schemas declare their nested
`base`. A custom schema also requires `PokieGame.validateSessionState(state, context)`, and its session
must capture and restore the complete model and executable state. Packages without a declaration can
keep a primed live session but cannot promise durable reconstruction. An unchanged
`getManifest()`/`createSession()` package uses the primed object's captured supported bets, modes and schema
as process-local authority. Serve and Studio Play/scenario searches use this same handler path. Such records
remain `live-only`; losing the object returns `restoration-unsupported` before construction or recovery writes.
For durable recovery or construction-free retries after live-state loss, declare
`getSessionCommandCapabilities(context)`, the selected model's supported `bets` and optional executable
`modes`. It must resolve without constructing a session or consuming RNG. Persisted capabilities may
restrict the trusted set, but cannot add selections. Generated games and scaffolds supply these declarations;
hand-authored packages opt into recovery alongside their compatibility promise.
Direct constructors and `SessionRuntime` do not require these repository declarations. See [serialization](serialization.md).

Syntactically valid retries validate the current record and the complete retained result before returning
it. With declared command authority, already-computed retries can recover without a live executable object, including live-only sessions;
new rounds still require that object or complete durable state. Unsupported bet/mode selections reject
before pending recovery writes. Schema matching applies to live-only records even when `featureState`
is absent. A game explicitly supplies `validateLiveSessionState` to authorize partial state. Generated/scaffolded
policies accept `{}` for an unseeded generator and require the complete seeded snapshot when a seed is supplied. They validate any captured RNG/reels, required feature counters and nested envelopes. A custom codec
always runs its selected-game validator. `validateLiveSessionState(state, context)` can explicitly validate
a partial snapshot, including an intentionally absent snapshot; it grants no reconstruction
authority. Completed retries use this same policy and return retained accounting without constructing a session. Revision conflicts reject new rounds; completed retries return their
original settled result even when the caller repeats its original revision.

```ts
import {
  SpinCommandHandler, captureInitialPokieSessionState,
  InMemorySessionRepository, InMemoryWallet,
} from "@fromstan/pokie";

// game implements PokieGame, and may have been loaded with loadPokieGameRuntime().
const context = {seed: "demo"};
const session = game.createSession(context);
const repository = new InMemorySessionRepository();
const wallet = new InMemoryWallet();
const id = "demo-session";
await wallet.setBalance(id, session.getCreditsAmount());
await repository.save(id, captureInitialPokieSessionState(
  context, session, game.getSessionSerializer?.(), false, game,
));
// A fresh handler needs no retained session or priming.
const runtime = new SpinCommandHandler(game, repository, wallet);
const result = await runtime.execute({kind: "spin", sessionId: id, expectedVersion: 1});
if (result.status === "played") {
  console.log(result.win, result.credits, result.stake, result.state);
} else if (result.status === "not-found") {
  console.log("Session is absent; explicitly choose whether to create another.");
} else {
  console.log(result.status, result.reason);
}
```

`FileSessionRepository` can replace the repository above. Supply an independently durable wallet and retry
stores when restart recovery must include money and requests. Keep the game runtime lease until its sessions
are disposed, and release it on success, failure and cancellation.

Rejection precedence is syntax/identifiers → repository presence and identity/semantic state → committed
idempotent result → supported selection and revision → reconstruction → pending reconciliation → reversible
command preparation → execution/settlement/save. A legitimate committed retry reproduces its original
selection even if a new, syntactically valid bet/mode was supplied. Invalid syntax, incompatible/corrupt
records and unsupported new selections cannot initiate recovery writes. Restoration exceptions are
`corrupt-state`, never an invitation to construct defaults. Settlement/save exceptions retain the original
failure and use the existing compensation path when independent ports are selected;
the explicit transactional round store below provides local reference atomicity.

For unchanged packages, the live snapshot policy is captured separately for every built-in composition
node at `primeSession()`. A custom decorator inside free-game or bet-mode sessions may have no codec or
an opaque legacy capture. The outer feature counters and selected modes still receive validation, and
complete built-in descendants cannot become partial because their parent is live-only. Retained current,
previous, cached and captured results use this same policy. Without the trusted live object, these
undeclared compositions reject restoration before constructing a replacement or writing recovery data.

## Durable transactional reference rounds

Select `SqliteTransactionalRoundStore` explicitly for canonical, completely restorable
sessions. This is a **local test/reference ledger**, not an external wallet or RGS.
The optional adapter requires Node >=22.16 with `node:sqlite` enabled (implementation
verification uses Node 24.18). Other package runtimes remain supported for portable,
browser and compensation paths. Root imports do not load SQLite; unsupported selection
fails with an upgrade/configuration error and never falls back to memory.

```ts
import {
    SqliteTransactionalRoundStore, SpinCommandHandler,
    captureInitialPokieSessionState,
} from "@fromstan/pokie";

const store = await SqliteTransactionalRoundStore.open("./rounds.sqlite", {lockWaitMs: 5000});
const context = {seed: "reference-seed"};
const session = game.createSession(context);
await store.initialize("session-1", captureInitialPokieSessionState(
    context, session, game.getSessionSerializer?.(), true, game,
), game);
const handler = new SpinCommandHandler(game, store);
const result = await handler.execute({kind: "spin", sessionId: "session-1",
    requestId: "caller-stable-key", expectedVersion: 1, bet: 0.05});
await store.close();
// A new process opens the same file and retrieves the detached historical response,
// without constructing a session or executing the domain engine:
const reopened = await SqliteTransactionalRoundStore.open("./rounds.sqlite");
const committed = await reopened.lookupResult("session-1", "caller-stable-key");
await reopened.close();
```

Use a supported authored bet; fractional stakes remain numbers without integer conversion.
Initialization rejects duplicate session IDs, incompatible/invalid state and live-only
engines. The selected game must declare its complete codec and command authority.

SQLite schema version 1/application ID `0x504f4b49` is validated on open; unknown or
altered schemas fail, with no automatic migration. `sessions` holds executable state,
RNG, revision and balance; `requests` holds the original intent and exact JSON response;
`operations` holds the terminal calculation/settlement record; `ledger` holds debit and
payout rows. WAL plus `synchronous=FULL`, foreign keys and one `BEGIN IMMEDIATE`
transaction commit all these participants together. Exceptions before commit roll back
all writes. Fresh executable objects are reconstructed inside ownership, discarded on
failure and never published into a live cache. This avoids RNG/feature/selection drift.
A rolled-back calculation may be attempted again after a crash; arbitrary callback side
effects outside SQLite are **not** exactly once. One committed logical round and its
saved result survive. Successful concurrent duplicates calculate only once.

The database write lock is acquired before loading the revision, looking up identity,
constructing an engine or calculating. It serializes all sessions on that database.
Different keys with the same `expectedVersion` yield one winner and one `conflict`,
without loser settlement. Without a version precondition, rounds consume successive
committed states. Lock acquisition waits asynchronously, bounded by `lockWaitMs`,
then reports `storage-error` before calculation; retry the same identity after contention
ends. There is no automatic round retry. An uncertain commit is looked up on the
connection after rollback/transaction completion; if storage itself cannot confirm it,
reopen and look up the original key before executing again. Never guess or compensate.

Durable request identity is `(sessionId, requestId, kind, supplied bet, supplied mode,
supplied expectedVersion)`. Omitted fields are explicit absence, distinct from supplied
values; later session selections never redefine identity. A changed payload under the
same session/key returns `identity-conflict` (HTTP 409), during contention or after
commit. Restore the original intent; a fresh key is not an identity-conflict recovery.
An identical retry returns its historical response even after later revisions, including
its original expectedVersion. The same key in different sessions is independent.
Omitting requestId generates a new internal operation identity for each call: storage
is still atomic, but caller retries cannot promise duplicate suppression. Responses
and reads are detached JSON snapshots, including the original debug capture; HTTP
still projects public and explicitly requested debug data separately.

`TransactionalRoundStore.transact` owns the connection and supplies callback-scoped
`RoundTransaction` participants. Never retain them, call outer store methods from that
callback, or combine them with independent repositories/wallets. Outside the callback,
use readSession/getBalance/lookupResult; initialize is the only direct creation write.
`close()` rejects new calls, drains accepted work and releases the connection. Ordinary
errors release transaction locks; a failed rollback quarantines/closes the connection
while preserving the primary failure. Reopening after process death needs no manual
lock cleanup. Direct library callers own close; a configured `PokieDevServer` owns it.
Atomic reconciliation only observes complete results; it performs no compensating writes
and has no incomplete committed operations to sweep. `primeSession` does not supply
executable authority to this path.

The existing repository/wallet constructor retains **weaker process-local compensation**,
including its legacy replay semantics (changed bet/mode may replay an old saved result).
Implementing existing port interfaces, even over one database, does not make that path
atomic. `FileSessionRepository` instance-local queues are not cross-process locks.
Studio Play/scenarios, pre-generated handlers and outcome-source serving retain their
existing in-memory/compensation contracts. Durable Studio job records do not make Play
rounds durable. Browser/portable/WASM consumers have no SQLite requirement.

## Durable external-wallet reconciliation

`SqliteExternalRoundStore` is an explicit **local durable intent/outbox**, with an independent
`DurableWalletPort`. It provides reconciliation, not distributed ACID. The reference
`SqliteTransactionalRoundStore` ledger alone participates in SQLite's round transaction.
Never mix either composition with separately supplied repositories or wallets.

```ts
const intents = await SqliteExternalRoundStore.open("./external-rounds.sqlite", provider, {
    callTimeoutMs: 2000, recoveryWaitMs: 5000,
});
const server = new PokieDevServer(game, {
    externalRoundStore: intents, settlementGuarantee: "external-reconciliation",
});
// Or initialize a captured durably-restorable session and use:
const handler = new SpinCommandHandler(game, intents);
await handler.execute({kind: "spin", sessionId, requestId: "stable-logical-round",
    expectedVersion: 1, bet: 0.05, mode: "base"});
```

A provider explicitly declares durable idempotency, authoritative inspection and permanent
session/kind/amount identity binding, plus a durable terminal-rejection fence. These are provider promises requiring independent
contract verification, not inferred from method names. Duplicate debit/credit calls must
return their **original** balance even after unrelated transactions or provider restart.
In-memory wallets, plain `WalletPort`, `TransactionalWalletAdapter`, incomplete inspection,
and non-durable operation/result repositories are incapable of this guarantee. Select the
legacy independent-port constructor or `settlementGuarantee: "compensation"` for those
weaker local/dev configurations. A strong selection without its capable store fails at
construction/open, before calculation or settlement. SQLite is optional, loaded only on
explicit open; Node with `node:sqlite` transaction inspection and WAL/FULL support is required.
Unsupported selections never fall back to memory. Existing ESM/CJS root exports include
both composition and capability contracts; browser/WASM entries remain portable.

The external store first reserves the session and freezes the command envelope. It restores
and calculates through the canonical handler using a private local ledger, then persists
both permanent wallet IDs and exact canonical leg kinds/amounts (captured from ledger calls,
never reconstructed from balances), complete executable/RNG continuation and detached
response **before the first effective remote action**. No real wallet calls run inside the
reference store transaction. Each remote phase has committed local intent before dispatch.
Only confirmed settlement publishes the new session revision and retained result together.
Committed kind/amount must match the captured leg; its original provider balance is authoritative
even when unrelated provider activity changes the balance. The response and persisted session
credits use the payout leg’s historical provider balance. Calculation payloads and artifacts
retain the calculation snapshot; no exclusive provider balance ownership is assumed.
A pending round blocks other request IDs for that session across store/handler instances;
owner tokens and bounded leases fence late local publication. Expired ownership permits
recovery with the original remote IDs, never replacement charge IDs. Provider idempotency
must cover overlapping late dispatches from stale owners.

Inspection distinguishes `unknown`, `pending`, `not-applied` (authoritative), `committed`
(with original kind, amount and balance), `compensated`, and terminal `rejected`
(with bound kind, amount and reason). `rejected` must permanently fence all earlier in-flight
and future dispatches of that identity. `not-applied` permits redispatch of the same identity
but cannot prove terminal rejection, even following an insufficient-funds response. A provider reservation that
remains pending must finish through its provider lifecycle or operator recovery; POKIE
cannot guess its outcome. Unknown/pending/compensated, malformed inspection, inspection
failure and exhausted budgets return `recovery-required`, retaining intent and blocking
fresh settlement. A rejected promise can have applied its debit/payout: it never authorizes
intent deletion, compensation or a new identity. The same original command resumes via
`execute`, `handle`, `reconcileOne`, `reconcileAll` or the handler's reconciliation service.
A confirmed payout recovers the saved response without replaying the game.

Network calls have a finite timeout and receive an abort signal where supported. Cancellation
before dispatch has no remote effect; cancellation/timeout after possible dispatch preserves
ambiguity. Aborting a request does not prove the provider cancelled its transaction. Timers
and listeners are released, and late acknowledgement has no publication authority. Direct
`execute(command, signal)` supports caller cancellation; HTTP disconnection still drains the
accepted round on shutdown. Server stop rejects new admission, drains bounded accepted work
and closes owned storage before caller game release. Library callers own `close()`.

Strong identities include session, requestId and the exact original bet/mode/version envelope.
Identical completed retries precede stale-version checking and return the original accounting,
revision and request-specific public/debug projection after restart and subsequent rounds.
Different payloads conflict; keys across sessions remain independent. Numeric stakes, including
0.05, 7.5, 1e-7 and zero free stakes, remain numbers without rounding or string conversion.
Invalid commands, blocked/insufficient funds, corruption, identity/revision conflicts,
storage/settlement/execution failures and unresolved recovery are non-success outcomes.
Confirmed preparation/balance failures release the session reservation and report
`retryDisposition: "safe-to-retry"` through domain and HTTP errors. The original envelope
remains bound but preparation can run again after recovery; these transient errors are not
permanently saved as completed results. The player can Retry or submit a fresh logical round
after that explicit disposition. A provider’s terminal rejected debit retains its historical
error and also permits a fresh round. Transport loss, errors without the disposition,
`recovery-required` and `identity-conflict` preserve the original pending identity and payload;
they never authorize a new charge key. A rejected payout after committed debit still requires
operator recovery and keeps the session reserved.

The controllable independent provider for controller verification is
`tests/server/wallet/fixtures/ControllableDurableWallet.ts`. Its separate SQLite database,
pre/post-action disconnects, missing acknowledgement, inspection overrides and debit/payout
counters exercise the lifecycle without substituting the local reference ledger. Candidate
implementation checks and pending independent evidence are recorded in
[V2C-05](v2-completion/V2C-05.md).
