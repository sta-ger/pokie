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
failure and use the existing compensation path; there is no cross-store atomicity claim.

For unchanged packages, the live snapshot policy is captured separately for every built-in composition
node at `primeSession()`. A custom decorator inside free-game or bet-mode sessions may have no codec or
an opaque legacy capture. The outer feature counters and selected modes still receive validation, and
complete built-in descendants cannot become partial because their parent is live-only. Retained current,
previous, cached and captured results use this same policy. Without the trusted live object, these
undeclared compositions reject restoration before constructing a replacement or writing recovery data.
