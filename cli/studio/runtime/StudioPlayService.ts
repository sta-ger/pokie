import {
    captureInitialPokieSessionState,
    describeUnsupportedProjectOperation,
    GameSessionHandling,
    InMemoryIdempotencyRepository,
    InMemorySessionRepository,
    InMemoryWallet,
    isTransactionalWalletPort,
    loadPokieGame,
    OUTCOME_SOURCE_SAMPLE_OPERATION,
    PLAY_OPERATION,
    GameWithFreeGamesSessionHandling,
    OutcomeLibraryBundleOutcomeSource,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    PlayFreeGamesStrategy,
    PlayUntilAnyWinStrategy,
    PlayUntilSymbolWinStrategy,
    PokieGame,
    PokieGameContext,
    PokieJsonRoundArtifactProjector,
    PokieProject,
    PokieSessionState,
    PreGeneratedRoundReplayDescriptor,
    PreGeneratedOutcomeSourcing,
    ProjectResolving,
    ProjectTargetMalformedError,
    ProjectTargetResolver,
    resolveGameSessionSerializer,
    resolveOutcomeLibraryModeName,
    RoundArtifact,
    SecureWeightedOutcomeRandomSource,
    SeededWeightedOutcomeRandomSource,
    SpinCommandHandler,
    SpinCommandHandling,
    TransactionalWalletAdapter,
    WeightedOutcomeRandomSource,
    type RoundArtifactJson,
    type VideoSlotSessionHandling,
    type VideoSlotWithFreeGamesSessionHandling,
} from "pokie";
import {deriveDeterministicSeed} from "../../../src/pregenerated/internal/deriveDeterministicSeed.js";
import crypto from "crypto";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../../materialize/materializeRuntimePackage.js";
import {StudioRoundRecorder, type StudioRoundOperation} from "./StudioRoundRecorder.js";
import {describeRuntimePackageLoadError} from "../../commands/internal/describeLocalRuntimeError.js";
import type {StudioRuntimeSessionView} from "./StudioRuntimeSessionView.js";

export type StudioPlaySessionResult = {status: "ok"; session: StudioRuntimeSessionView} | {status: "failed"; error: string};
export type StudioPlaySessionOptions = {readonly signal?: AbortSignal};

// The two shapes an active Play session can take, discriminated by "kind" -- a "runtime" session (a real
// loaded PokieGame, spun through SpinCommandHandler) or an "outcomeSource" session (a resolved
// "outcomeLibrary" project, drawn through its own real OutcomeLibraryBundleOutcomeSource; see
// newOutcomeSourceSession's own doc comment for why "stakeAdapter" never reaches this shape at all).
// `credits` is deliberately mutable only on the outcomeSource variant -- it's Studio's own running ledger
// over real stake/win numbers (see buildOutcomeSourceSessionView), not a value the bundle itself reports,
// so it has nowhere else to live between draws.
type ActiveRuntimeSession = {
    readonly kind: "runtime";
    readonly manifest: {id: string; name: string; version: string};
    readonly spinHandler: SpinCommandHandling;
    // The exact same live object primed into spinHandler (see newSession()) -- spinHandler.handle() plays
    // this same instance in place on every real spin (see SpinCommandHandler's own liveSessions cache), so
    // reading it back here after a spin sees that spin's own just-computed state directly. This is what
    // lets findAnyWin()/findSymbolWin() below drive the engine's own PlayUntilAnyWinStrategy/
    // PlayUntilSymbolWinStrategy against a real session rather than re-deriving an equivalent check from
    // the wire-shaped response.
    readonly session: GameSessionHandling;
    // This session's own creation parameters -- stamped onto every round this session ever produces (see
    // spin()) as that round's own `studioProjectRoot`/`studioSeed`. `seed` is only ever set when
    // newSession() was actually given one, never invented for a session created without one.
    readonly projectRoot: string;
    readonly seed?: string | number;
};

type ActiveOutcomeSourceSession = {
    readonly kind: "outcomeSource";
    readonly manifest: {id: string; name: string; version: string};
    readonly outcomeSource: PreGeneratedOutcomeSourcing;
    // Matches the portable server/CLI selector: a seed-derived source per one-based round.
    roundsPlayed: number;
    credits: number;
    // Same reasoning as ActiveRuntimeSession's own projectRoot/seed above.
    readonly projectRoot: string;
    readonly seed?: string | number;
    // The real outcome-library mode this session's own outcomeSource is bound to (resolved by
    // newOutcomeSourceSession via resolveOutcomeLibraryModeName) -- stamped onto every round this
    // session produces (see spin()) as that round's own `studioModeName`, the same way `seed` already is.
    readonly modeName: string;
};

type ActiveSession = ActiveRuntimeSession | ActiveOutcomeSourceSession;

export type StudioPlaySpinResult =
    | {status: "ok"; session: StudioRuntimeSessionView}
    | {status: "not-found"}
    | {status: "blocked"; error: string}
    | {status: "error"; error: string};

// Play's own backend -- Studio's only game mode (see PlayTab's own doc comment). Never a
// PokieDevServer/PokieClientServer, never an OS port, never a SessionRepository/WalletPort a
// browser-based client could ever be pointed at directly -- it only ever needs one thing: a real
// session it can spin and show the result of. This class gives it exactly that, driving
// PokieGame.createSession()/SpinCommandHandler.handle() -- the exact same primitives PokieDevServer
// itself drives -- directly, in-process, never through an HTTP request/response cycle Studio's own
// browser would have to be given a host/port to reach.
//
// Materialization crosses the same boundary every other CLI runtime operation does (see
// resolveRuntimePackageRoot's own doc comment): a Blueprint project is materialized into a real,
// loadable runtime *before* loadGame ever touches it. What comes back out — a live GameSessionHandling,
// settled through the same wallet/idempotency machinery SpinCommandHandler always uses, capturing a
// real, hashable RoundArtifact (sessionCapturePolicyMode "full") — is never reimplemented here; only
// the "no HTTP server in between" wiring is new.
//
// Holds at most one session at a time -- a process-local, single active instance scoped to Studio's own
// in-process call, not an OS resource that needs stopping — newSession() (Play's "New session"/"Reset"
// alike, see PlayTab's own doc comment) simply discards whatever was active and builds a fresh one, and
// reset() (called on a project switch or Studio shutdown) does the same without creating a replacement.
// Every store below (SessionRepository,
// WalletPort, IdempotencyRepository) is a brand-new in-memory instance created fresh by newSession() --
// never shared across sessions, never shared with any other SpinCommandHandler instance in this or any
// other process -- so singleInstanceDeployment: true is genuinely safe here (see SpinCommandHandler's own
// "Multi-instance safety" doc comment), unlike a deployment that shares a durable store across processes.
//
// Not every project newSession() is given is a loadable package, though — a resolved "outcomeLibrary"
// project has no `pokie.entry`/loadPokieGame contract at all (see ProjectCapabilities.ts), so before ever
// materializing/loading anything, newSession() resolves `projectRoot` the same way ServeCommand's own
// outcome-source routing does (see that class's own doc comment) and, for a resolved "outcomeLibrary"
// project, plays it through its own real OutcomeLibraryBundleOutcomeSource adapter instead -- the exact
// same selector class PreGeneratedSpinCommandHandler/sampleOutcomeSourceProject already use in production
// -- never loadPokieGame, never a regenerated game-model draw (see newOutcomeSourceSession's own doc
// comment). A resolved "stakeAdapter" project (or any other type the resolver hands back that isn't a
// loadable package) has no draw contract of its own and reports the same structured
// "outcomeSource.sample" capability diagnostic describeUnsupportedProjectOperation gives every other POKIE
// surface, as an honest `{status: "failed"}` result, never a package-loading attempt. A path the resolver
// doesn't recognize at all -- including one that doesn't exist on disk, same as before this resolution
// step existed -- falls straight through to the ordinary materialize-and-load flow below, unaffected.
export class StudioPlayService {
    // Real spins are settled through the wallet on every attempt (see spin()'s own doc comment) -- a
    // session with too little balance to keep playing surfaces as spin()'s own honest "blocked" outcome
    // (session.canPlayNextGame() gating spinHandler.handle() exactly as it does for a manual Spin), ending
    // the search with that same result rather than looping past it. Bounded by maxFindScenarioSpins so a
    // symbol/condition rare or impossible to hit for this game can never hang the request indefinitely --
    // exhausting the bound is reported as an honest "error" (the session itself is left sitting on
    // whichever real round it last actually played, exactly as if that had been a plain Spin).
    private static readonly DEFAULT_MAX_FIND_SCENARIO_SPINS = 2000;

    private readonly loadGame: typeof loadPokieGame;
    private readonly resolveRuntimePackageRoot: RuntimePackageResolving;
    private readonly pokieVersion: string;
    private readonly resolveProject: ProjectResolving;
    private readonly outcomeLibraryReader: OutcomeLibraryBundleReading;
    // Overridable only so a test can bound findAnyWin()/findSymbolWin()'s own search loop to a handful of
    // attempts instead of genuinely waiting out 2000 real spins to exercise the "exhausted" path -- see
    // spinUntilMatch()'s own doc comment for why the search itself is real spins, not something a smaller
    // bound changes the nature of.
    private readonly maxFindScenarioSpins: number;
    // The shared history every round-producing action across Studio records into -- see
    // StudioRoundRecorder's own doc comment. Defaults to a private instance so every existing standalone
    // caller/test keeps seeing only its own rounds, exactly as before this recording existed; StudioServer
    // constructs one instance and shares it (and its own outcome-source sample route) so a round played
    // here is visible from anywhere else that reads this same recorder.
    private readonly roundRecorder: StudioRoundRecorder;

    private active: ActiveSession | undefined;
    private currentSessionId: string | undefined;
    private sessionGeneration = 0;

    constructor(
        loadGame: typeof loadPokieGame = loadPokieGame,
        resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
        pokieVersion = "unknown",
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        outcomeLibraryReader: OutcomeLibraryBundleReading = new OutcomeLibraryBundleReader(),
        maxFindScenarioSpins = StudioPlayService.DEFAULT_MAX_FIND_SCENARIO_SPINS,
        roundRecorder: StudioRoundRecorder = new StudioRoundRecorder(),
    ) {
        this.loadGame = loadGame;
        this.resolveRuntimePackageRoot = resolveRuntimePackageRoot;
        this.pokieVersion = pokieVersion;
        this.resolveProject = resolveProject;
        this.outcomeLibraryReader = outcomeLibraryReader;
        this.maxFindScenarioSpins = maxFindScenarioSpins;
        this.roundRecorder = roundRecorder;
    }

    // Materializes/loads `projectRoot` fresh on every call -- never caches a previously loaded game
    // across sessions, always running what's actually on disk now. A Blueprint project's materialized
    // temp directory is only ever
    // needed for the synchronous loadGame() call itself (see resolveRuntimePackageRoot's own doc comment
    // on why a "tsPackage" project's own release() is already a no-op) -- released immediately afterward,
    // never held for this session's own lifetime.
    public async newSession(projectRoot: string, seed?: string | number, modeName?: string, options: StudioPlaySessionOptions = {}): Promise<StudioPlaySessionResult> {
        const generation = ++this.sessionGeneration;
        const assertCurrent = (): void => {
            if (options.signal?.aborted || generation !== this.sessionGeneration) {
                throw new Error("Runtime preparation was cancelled before a runnable game was available.");
            }
        };
        let project: PokieProject | undefined;
        try {
            project = await this.resolveProject.resolve(projectRoot);
            assertCurrent();
        } catch (error) {
            return this.fail(error, projectRoot);
        }

        if (project !== undefined && (project.type === "outcomeLibrary" || project.type === "stakeAdapter")) {
            return this.newOutcomeSourceSession(project, seed, modeName, assertCurrent);
        }
        const diagnostic = project === undefined ? undefined : describeUnsupportedProjectOperation(project, PLAY_OPERATION);
        if (diagnostic !== undefined) {
            return {status: "failed", error: diagnostic.message};
        }

        let game: PokieGame;
        try {
            const resolution = await this.resolveRuntimePackageRoot(projectRoot, {signal: options.signal});
            try {
                assertCurrent();
                game = await this.loadGame(resolution.runtimePath);
                assertCurrent();
            } finally {
                await resolution.release();
            }
        } catch (error) {
            return this.fail(error, projectRoot);
        }

        const manifest = game.getManifest();
        const wallet = new InMemoryWallet();
        const sessionRepository = new InMemorySessionRepository();
        const transactionalWallet = isTransactionalWalletPort(wallet) ? wallet : new TransactionalWalletAdapter(wallet);
        const spinHandler = new SpinCommandHandler(
            game,
            sessionRepository,
            transactionalWallet,
            new InMemoryIdempotencyRepository(),
            undefined,
            // Safe here specifically because every store above was just constructed fresh, right here,
            // for this session alone -- never shared with another SpinCommandHandler instance in this or
            // any other process (see the class doc comment's own "Multi-instance safety" paragraph).
            true,
            undefined,
            true,
            "full",
            this.pokieVersion,
        );

        const context: PokieGameContext | undefined = seed === undefined ? undefined : {seed};
        let session: GameSessionHandling;
        const sessionId = crypto.randomUUID();
        let state: PokieSessionState;
        try {
            session = game.createSession(context);
            spinHandler.primeSession(sessionId, session);
            await wallet.setBalance(sessionId, session.getCreditsAmount());
            state = captureInitialPokieSessionState(context, session, resolveGameSessionSerializer(game), true);
            await sessionRepository.save(sessionId, state);
            assertCurrent();
        } catch (error) {
            return this.fail(error);
        }

        this.active = {kind: "runtime", manifest, spinHandler, session, projectRoot, seed};
        this.currentSessionId = sessionId;

        const credits = await wallet.getBalance(sessionId);
        return {status: "ok", session: this.buildSessionView(sessionId, manifest, state, credits, undefined, state.initialPayload, session)};
    }

    // sessionId is always checked against the one currently active session -- Play never keeps more than
    // one alive at a time (see the class doc comment), so a spin against an id from a session that's
    // since been replaced by a newer newSession() call (or never existed) is honestly "not-found," never
    // silently resurrected.
    // "operation" names the concrete action actually driving this spin -- a plain Spin click always
    // passes the default "spin"; findAnyWin()/findSymbolWin() below pass their own operation through
    // every attempt of their search loop (see spinUntilMatch()), so a round recorded mid-search is never
    // misreported as an ordinary spin. Recording happens exactly once, here, after either branch below
    // has produced a genuine result -- the one choke point every Play tab round (runtime or
    // outcomeSource) passes through, so StudioRoundRecorder never needs a second call site to stay
    // complete.
    public async spin(sessionId: string, operation?: StudioRoundOperation, bet?: number, mode?: string): Promise<StudioPlaySpinResult> {
        if (this.active === undefined || sessionId !== this.currentSessionId) {
            return {status: "not-found"};
        }
        const currentWasmError = await this.invalidateCurrentWasmSession();
        if (currentWasmError !== undefined) return {status: "error", error: currentWasmError};
        const active = this.active;
        const actualOperation = operation ?? "spin";

        let result: StudioPlaySpinResult;
        if (active.kind === "outcomeSource") {
            result = await this.spinOutcomeSource(sessionId, active);
        } else {
            // These are submitted together with a manual Spin, so the canonical SpinCommandHandler
            // applies them immediately before this exact round.  Scenario searches deliberately omit
            // them: they continue from the session state the player already selected.
            const handled = await active.spinHandler.handle(sessionId, undefined, undefined, bet, mode);
            if (handled.status === "not-found") {
                result = {status: "not-found"};
            } else if (handled.status === "blocked") {
                result = {status: "blocked", error: handled.reason};
            } else if (handled.status === "conflict" || handled.status === "recovery-required") {
                // Neither can actually happen here in practice -- this service never passes an
                // expectedVersion, and never shares its stores with another SpinCommandHandler instance
                // (see the class doc comment) -- surfaced as a plain error rather than silently dropped
                // in the (unreachable in normal operation) case they somehow ever did.
                result = {status: "error", error: handled.reason};
            } else {
                result = {
                    status: "ok",
                    session: this.buildSessionView(
                        sessionId,
                        active.manifest,
                        handled.state,
                        handled.credits,
                        handled.win,
                        handled.state.roundPayload,
                        active.session,
                    ),
                };
            }
        }

        if (result.status === "ok") {
            this.roundRecorder.record(result.session, {
                source: active.kind === "outcomeSource" ? "play-outcome-source" : "play",
                operation: actualOperation,
                projectRoot: active.projectRoot,
                seed: active.seed,
                modeName: active.kind === "outcomeSource" ? active.modeName : undefined,
            });
        }
        return result;
    }

    // PlayTab's "Find any win" scenario control -- repeats real, authoritative spin() calls (the exact
    // same path a manual Spin click drives) until one actually wins, up to MAX_FIND_SCENARIO_SPINS
    // attempts. Never computes or predicts a win itself: for a "runtime" session, whether to keep
    // searching is decided by handing the engine's own PlayUntilAnyWinStrategy the same live
    // GameSessionHandling spin() just played (see the class doc comment); for an "outcomeSource" session
    // (no live GameSessionHandling to hand it -- see newOutcomeSourceSession()'s own doc comment), the
    // equivalent real, already-drawn totalWin on that round's own artifact is read instead. Either way,
    // every round along the way -- including the final matching one -- is a genuine settled spin, not a
    // simulated/discarded trial: a search that runs out of attempts still leaves the session sitting on
    // whatever real round it last actually played.
    public findAnyWin(sessionId: string): Promise<StudioPlaySpinResult> {
        return this.spinUntilMatch(
            sessionId,
            "find-any-win",
            (session) => !new PlayUntilAnyWinStrategy().canPlayNextSimulationRound(session),
            (artifact) => artifact.totalWin > 0,
        );
    }

    // PlayTab's "Find symbol win" scenario control -- same real, authoritative search loop as
    // findAnyWin() above, but stops once a round's win actually involves `symbolId` specifically (the
    // chooser's own selected symbol, propagated straight through from the request -- see
    // validatePlayFindSymbolWinRequest.ts). Reuses the engine's own PlayUntilSymbolWinStrategy for a
    // "runtime" session's default configuration (any line/scatter win of this symbol, wilds allowed) --
    // the same primitive AggregateSimulationRunner's own configured play strategies already drive, just
    // pointed at Play's own live session instead of a bulk simulation run. An "outcomeSource" session has
    // no live GameSessionHandling to hand that strategy (see findAnyWin()'s own doc comment), so the
    // equivalent check reads whether the round's own already-computed artifact carries a win for that
    // exact symbolId, straight off RoundArtifactWin.symbolId -- never a second win-evaluation pass.
    public findSymbolWin(sessionId: string, symbolId: string): Promise<StudioPlaySpinResult> {
        // PlayUntilSymbolWinStrategy reads isSymbolScatter()/getWinningLines()/getWinningScatters()
        // unconditionally (see its own doc comment) -- calling it against a "runtime" session whose game
        // doesn't actually implement VideoSlotSessionHandling would throw rather than report an honest
        // result, the same reason getAvailableSymbolsIfSupported() feature-detects before ever reading
        // getAvailableSymbols(). Checked up front, before ever spinning: a game this can't work for at all
        // should never burn a real spin finding that out.
        if (this.active !== undefined && this.active.kind === "runtime" && !this.supportsSymbolWinSearch(this.active.session)) {
            return Promise.resolve({status: "error", error: "This game doesn't report per-symbol win details, so Find symbol win isn't available for it."});
        }
        return this.spinUntilMatch(
            sessionId,
            "find-symbol-win",
            (session) => !new PlayUntilSymbolWinStrategy(symbolId).canPlayNextSimulationRound(session as unknown as VideoSlotSessionHandling<string>),
            (artifact) => artifact.wins.some((win) => win.symbolId === symbolId),
        );
    }

    // PlayTab's "Find free games" scenario control -- the canonical shared "custom scenario" abstraction
    // pokie-examples' own custom-scenario dropdown already uses for its "Free games" entry (see that
    // repo's `games/slot-with-free-games/index.ts`, `new PlayFreeGamesStrategy()`): a real, generic
    // PlayStrategy the "pokie" library ships (src/simulation/playstrategy/PlayFreeGamesStrategy.ts),
    // never a Studio-local reimplementation. Same real, authoritative search loop as findAnyWin()/
    // findSymbolWin() above: for a "runtime" session, whether to keep searching is decided by handing the
    // engine's own PlayFreeGamesStrategy the same live GameSessionHandling spin() just played, exactly as
    // findAnyWin() does for PlayUntilAnyWinStrategy; for an "outcomeSource" session (no live
    // GameSessionHandling -- see findAnyWin()'s own doc comment), the equivalent real, already-computed
    // signal is read off that round's own artifact instead -- its `featureEvents`, specifically the
    // "freeGamesTriggered" event buildRoundArtifactFromSession derives from the exact same
    // getWonFreeGamesNumber() this strategy itself reads, never a second free-games determination.
    public findFreeGames(sessionId: string): Promise<StudioPlaySpinResult> {
        // Same feature-detection-before-ever-spinning reasoning as findSymbolWin() above -- a game whose
        // session doesn't report free-games state at all (an ordinary VideoSlotSessionHandling, no free
        // games mechanics) can never answer this scenario search, so it should never burn a real spin
        // finding that out.
        if (this.active !== undefined && this.active.kind === "runtime" && !this.supportsFreeGamesSearch(this.active.session)) {
            return Promise.resolve({status: "error", error: "This game doesn't support free games, so Find free games isn't available for it."});
        }
        return this.spinUntilMatch(
            sessionId,
            "find-free-games",
            (session) => !new PlayFreeGamesStrategy().canPlayNextSimulationRound(session as unknown as VideoSlotWithFreeGamesSessionHandling),
            (artifact) => (artifact.featureEvents ?? []).some((event) => event.type === "freeGamesTriggered"),
        );
    }

    // Called on a project switch or Studio shutdown -- a genuinely different (or no longer active)
    // project must never leave a previous project's session reachable. Nothing here holds an OS resource
    // (see newSession()'s own doc comment on why materialization is never held past loadGame), so this is
    // just discarding in-memory references, never an async teardown.
    public reset(): void {
        this.sessionGeneration++;
        this.active = undefined;
        this.currentSessionId = undefined;
    }

    // A Play session is a snapshot of an executable package, not permission
    // to keep executing it after its current path has become a component.
    // Re-resolve only `.wasm` paths so ordinary package-session spins retain
    // their existing no-I/O hot path.
    private async invalidateCurrentWasmSession(): Promise<string | undefined> {
        const active = this.active;
        if (active === undefined || !active.projectRoot.toLowerCase().endsWith(".wasm")) return undefined;
        try {
            const project = await this.resolveProject.resolve(active.projectRoot);
            if (project?.type !== "wasm") return undefined;
            const diagnostic = describeUnsupportedProjectOperation(project, PLAY_OPERATION);
            this.reset();
            return diagnostic?.message ?? "POKIE Studio Play is unavailable for this POKIE WASM component.";
        } catch (error) {
            this.reset();
            return error instanceof Error ? error.message : String(error);
        }
    }

    private supportsSymbolWinSearch(session: GameSessionHandling): boolean {
        const candidate = session as Partial<VideoSlotSessionHandling<string>>;
        return (
            typeof candidate.isSymbolScatter === "function" &&
            typeof candidate.getWinningLines === "function" &&
            typeof candidate.getWinningScatters === "function" &&
            typeof candidate.getSymbolsCombination === "function"
        );
    }

    private supportsFreeGamesSearch(session: GameSessionHandling): boolean {
        const candidate = session as Partial<GameWithFreeGamesSessionHandling>;
        return (
            typeof candidate.getWonFreeGamesNumber === "function" &&
            typeof candidate.getFreeGamesNum === "function" &&
            typeof candidate.getFreeGamesSum === "function" &&
            typeof candidate.getFreeGamesBank === "function"
        );
    }

    private async spinUntilMatch(
        sessionId: string,
        operation: StudioRoundOperation,
        matchesLiveSession: (session: GameSessionHandling) => boolean,
        matchesArtifact: (artifact: RoundArtifactJson) => boolean,
    ): Promise<StudioPlaySpinResult> {
        for (let attempt = 0; attempt < this.maxFindScenarioSpins; attempt++) {
            const active = this.active;
            if (active === undefined || sessionId !== this.currentSessionId) {
                return {status: "not-found"};
            }

            const round = await this.spin(sessionId, operation);
            if (round.status !== "ok") {
                return round;
            }

            const matched =
                active.kind === "runtime"
                    ? matchesLiveSession(active.session)
                    : round.session.debug?.artifact !== undefined && matchesArtifact(round.session.debug.artifact);
            if (matched) {
                return round;
            }
        }

        return {
            status: "error",
            error: `No matching round was found within ${this.maxFindScenarioSpins} spins.`,
        };
    }

    // The "outcomeLibrary"/"stakeAdapter" counterpart to the materialize-and-load path above -- reached
    // only once newSession() has already resolved `project` to one of those two types (see this class's
    // own doc comment). A resolved "stakeAdapter" project has no PreGeneratedOutcomeSourcing-style draw
    // contract at all (see OUTCOME_SOURCE_SAMPLE_CAPABILITY's own doc comment) -- describeUnsupportedProjectOperation
    // catches that here, honestly, before ever reading a single file, the same structured diagnostic every
    // other POKIE surface (ServeCommand, the Outcome Library sample route) already gives for it. A resolved
    // "outcomeLibrary" project plays `modeName` -- a real mode from the manifest's own list, resolved via
    // resolveOutcomeLibraryModeName (defaulting to the manifest's own first mode when the caller doesn't
    // request one, same as before Play had a mode picker at all) -- through a real
    // OutcomeLibraryBundleOutcomeSource -- the exact same selector class
    // PreGeneratedSpinCommandHandler/sampleOutcomeSourceProject already use in production -- never
    // loadPokieGame, never a regenerated game-model draw.
    private async newOutcomeSourceSession(project: PokieProject, seed?: string | number, modeName?: string, assertCurrent: () => void = () => undefined): Promise<StudioPlaySessionResult> {
        const diagnostic = describeUnsupportedProjectOperation(project, OUTCOME_SOURCE_SAMPLE_OPERATION);
        if (diagnostic !== undefined) {
            return {status: "failed", error: diagnostic.message};
        }
        if (typeof seed === "string" && seed.trim().length === 0) {
            return {
                status: "failed",
                error: '"seed" must be a non-empty string for an exactly replayable outcome-library Play session. Omit it for an unseeded best-effort session.',
            };
        }

        let bundleGame: {id: string; name: string; version: string};
        let resolvedModeName: string;
        try {
            const manifest = await this.outcomeLibraryReader.readManifest(project.rootPath);
            if (manifest.modes.length === 0) {
                return {status: "failed", error: `"${project.rootPath}" has no outcome-library modes to play.`};
            }
            bundleGame = manifest.game;
            resolvedModeName = resolveOutcomeLibraryModeName(manifest.modes, modeName);
            assertCurrent();
        } catch (error) {
            return this.fail(error);
        }

        const sessionId = crypto.randomUUID();
        // Native outcome-library sessions use the same derived-per-round algorithm as the public server,
        // simulation and CLI replay.  A seeded stream is deterministic too, but would not make a round's
        // portable (seed, round, mode) provenance interchangeable with those public surfaces.
        this.active = {
            kind: "outcomeSource",
            manifest: bundleGame,
            outcomeSource: new OutcomeLibraryBundleOutcomeSource(project.rootPath, resolvedModeName),
            roundsPlayed: 0,
            credits: 0,
            projectRoot: project.rootPath,
            seed,
            modeName: resolvedModeName,
        };
        this.currentSessionId = sessionId;

        return {status: "ok", session: this.buildOutcomeSourceSessionView(sessionId, this.active, undefined)};
    }

    // Draws exactly one real outcome per call from the bundle's own mode this session was created against
    // (see newOutcomeSourceSession) -- a bundle rewritten mid-draw surfaces as PreGeneratedOutcomeSourceConflictError
    // (see OutcomeLibraryBundleOutcomeSource's own doc comment), reported the same honest "error" way any
    // other draw failure is, never silently retried. `active.credits` is mutated in place: Studio's own
    // running ledger over this draw's real stake/totalWin, the only place this bundle-backed session's
    // "credits" figure lives at all (see the class doc comment).
    private async spinOutcomeSource(sessionId: string, active: ActiveOutcomeSourceSession): Promise<StudioPlaySpinResult> {
        let artifact: RoundArtifact;
        let replay: PreGeneratedRoundReplayDescriptor | undefined;
        try {
            const nextRound = active.roundsPlayed + 1;
            const startedAt = Date.now();
            const randomSource: WeightedOutcomeRandomSource =
                active.seed === undefined
                    ? new SecureWeightedOutcomeRandomSource()
                    : new SeededWeightedOutcomeRandomSource(deriveDeterministicSeed(String(active.seed), nextRound));
            const selection = await active.outcomeSource.drawOutcome(randomSource);
            artifact = selection.outcome.artifact;
            if (active.seed !== undefined) {
                replay = {
                    game: active.manifest,
                    libraryId: selection.libraryId,
                    libraryHash: selection.libraryHash,
                    modeName: active.modeName,
                    selectionAlgorithm: "derived-round-seed-v1",
                    seed: String(active.seed),
                    round: nextRound,
                    outcomeId: selection.outcome.id,
                    weight: selection.outcome.weight,
                    totalWin: artifact.totalWin,
                    payoutMultiplier: artifact.payoutMultiplier,
                    stake: artifact.stake,
                    screen: artifact.screen.map((row) => [...row]),
                    artifact,
                    timestamp: startedAt,
                    durationMs: Date.now() - startedAt,
                };
            }
            // Studio serializes one Play request at a time; Object.assign keeps this post-await
            // session update explicit without presenting a stale read/write expression to lint.
            Object.assign(active, {roundsPlayed: nextRound});
        } catch (error) {
            return {status: "error", error: error instanceof Error ? error.message : String(error)};
        }

        active.credits = active.credits - artifact.stake + artifact.totalWin;

        return {status: "ok", session: this.buildOutcomeSourceSessionView(sessionId, active, artifact, replay)};
    }

    private fail(error: unknown, projectRoot = "the selected project"): StudioPlaySessionResult {
        if (error instanceof ProjectTargetMalformedError && error.targetType === "parWorkbook") {
            return {status: "failed", error: describeRuntimePackageLoadError(projectRoot, error).message};
        }
        return {status: "failed", error: error instanceof Error ? error.message : String(error)};
    }

    // Builds a StudioRuntimeSessionView straight off the real, in-process PokieSessionState this call
    // actually produced -- never round-tripped through JSON/fetch first (there is no HTTP boundary here
    // to cross). `debug` is always attached (never gated behind a debug-mode toggle) -- Play's entire
    // point is showing the real round it just played (see the class doc comment), never a version of it
    // with the artifact withheld.
    private buildSessionView(
        sessionId: string,
        manifest: {id: string; name: string; version: string},
        state: PokieSessionState,
        credits: number,
        win: number | undefined,
        serializedPayload: Record<string, unknown> | undefined,
        session: GameSessionHandling,
    ): StudioRuntimeSessionView {
        const view = (
            serializedPayload !== undefined
                // A serializer owns its presentation fields, but SpinCommandHandler's settled `win`
                // is the authoritative amount for this particular round.  Some serializers expose
                // a stale or intentionally partial `win` field; letting it overwrite `handled.win`
                // made Replay's Session Spin list disagree with the recorded RoundArtifact.
                ? {...serializedPayload, sessionId, game: manifest, credits, ...(win !== undefined ? {win} : {})}
                : {
                    sessionId,
                    game: manifest,
                    bet: state.bet,
                    credits,
                    ...(win !== undefined ? {win} : {}),
                    ...(state.screen !== undefined ? {screen: state.screen} : {}),
                }
        ) as StudioRuntimeSessionView;

        const availableSymbols = this.getAvailableSymbolsIfSupported(session);
        if (availableSymbols !== undefined) {
            view.availableSymbols = availableSymbols;
        }

        const debugData =
            state.initialDebugPayload !== undefined || state.roundDebugPayload !== undefined
                ? {...state.initialDebugPayload, ...state.roundDebugPayload}
                : undefined;

        view.debug = {
            stateAfter: state,
            ...(debugData !== undefined ? {debugData} : {}),
            ...this.projectRoundArtifact(state),
        };

        return view;
    }

    // Feature-detected the same way captureScreen.ts's own getSymbolsCombination() check is -- not every
    // GameSessionHandling is a VideoSlotConfigDescribing (see the class doc comment's own "full capture"
    // reasoning for why that's never assumed), so this reads the real, game-reported symbol list only when
    // the session actually exposes one, rather than fabricating or omitting it silently either way.
    private getAvailableSymbolsIfSupported(session: GameSessionHandling): string[] | undefined {
        if (typeof (session as Partial<VideoSlotSessionHandling<string>>).getAvailableSymbols !== "function") {
            return undefined;
        }
        return (session as VideoSlotSessionHandling<string>).getAvailableSymbols();
    }

    // Shared by every buildSessionView() call -- state.roundArtifact/roundArtifactUnavailableReason are
    // mutually exclusive (see PokieSessionState's own doc comment), so exactly one of `artifact`/
    // `artifactUnavailableReason` ever ends up on the built view, never both and never neither once a
    // "full" capture (always on for Play) has run at all.
    private projectRoundArtifact(state: PokieSessionState): {artifact?: RoundArtifactJson} | {artifactUnavailableReason?: string} {
        if (state.roundArtifact !== undefined) {
            return {artifact: new PokieJsonRoundArtifactProjector().project(state.roundArtifact)};
        }
        if (state.roundArtifactUnavailableReason !== undefined) {
            return {artifactUnavailableReason: state.roundArtifactUnavailableReason};
        }
        return {};
    }

    // Builds the outcome-source counterpart to buildSessionView() above -- `artifact` is undefined exactly
    // once, for the view newOutcomeSourceSession() returns before any draw has happened yet (mirrors
    // buildSessionView()'s own initial call, whose `win`/`screen` are equally absent before a first spin).
    // Unlike buildSessionView(), there is never an `artifactUnavailableReason` case here: a drawn
    // WeightedOutcome always carries a real RoundArtifact (see that type's own doc comment) -- so this
    // never fabricates an artifact, and never has to explain a missing one either. `bet`/`win`/`screen` are
    // read straight off that same real, already-hashed artifact -- never a second calculation path.
    private buildOutcomeSourceSessionView(
        sessionId: string,
        active: ActiveOutcomeSourceSession,
        artifact: RoundArtifact | undefined,
        replay?: PreGeneratedRoundReplayDescriptor,
    ): StudioRuntimeSessionView {
        const view = {
            sessionId,
            game: active.manifest,
            credits: active.credits,
            ...(artifact !== undefined
                ? {bet: artifact.stake, win: artifact.totalWin, screen: artifact.screen.map((row) => [...row])}
                : {}),
            ...(replay === undefined ? {} : {replay}),
        } as StudioRuntimeSessionView;

        if (artifact !== undefined) {
            view.debug = {artifact: new PokieJsonRoundArtifactProjector().project(artifact)};
        }

        return view;
    }
}
