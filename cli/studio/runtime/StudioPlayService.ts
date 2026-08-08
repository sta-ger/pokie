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
    OutcomeLibraryBundleOutcomeSource,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    PokieGame,
    PokieGameContext,
    PokieJsonRoundArtifactProjector,
    PokieProject,
    PokieSessionState,
    PreGeneratedOutcomeSourcing,
    ProjectResolving,
    ProjectTargetResolver,
    resolveGameSessionSerializer,
    RoundArtifact,
    SecureWeightedOutcomeRandomSource,
    SeededWeightedOutcomeRandomSource,
    SpinCommandHandler,
    SpinCommandHandling,
    TransactionalWalletAdapter,
    WeightedOutcomeRandomSource,
    type RoundArtifactJson,
} from "pokie";
import crypto from "crypto";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../../materialize/materializeRuntimePackage.js";
import type {StudioRuntimeSessionView} from "./StudioRuntimeSessionView.js";

export type StudioPlaySessionResult = {status: "ok"; session: StudioRuntimeSessionView} | {status: "failed"; error: string};

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
};

type ActiveOutcomeSourceSession = {
    readonly kind: "outcomeSource";
    readonly manifest: {id: string; name: string; version: string};
    readonly outcomeSource: PreGeneratedOutcomeSourcing;
    readonly randomSource: WeightedOutcomeRandomSource;
    credits: number;
};

type ActiveSession = ActiveRuntimeSession | ActiveOutcomeSourceSession;

export type StudioPlaySpinResult =
    | {status: "ok"; session: StudioRuntimeSessionView}
    | {status: "not-found"}
    | {status: "blocked"; error: string}
    | {status: "error"; error: string};

// Play's own backend counterpart to StudioRuntimeManager -- but never a PokieDevServer/PokieClientServer,
// never an OS port, never a SessionRepository/WalletPort a browser-based client could ever be pointed at
// directly. Studio's "normal game mode" (see PlayTab's own doc comment) never needs the Runtime tab's own
// HTTP API testing/diagnostics surface (raw JSON, requestId/expectedVersion overrides, a second "Open
// Player" server) -- it only ever needs one thing: a real session it can spin and show the result of. This
// class gives it exactly that, driving PokieGame.createSession()/SpinCommandHandler.handle() -- the exact
// same primitives PokieDevServer itself drives -- directly, in-process, never through an HTTP request/
// response cycle Studio's own browser would have to be given a host/port to reach.
//
// Materialization crosses the same boundary StudioRuntimeManager.startInternal() does (see
// resolveRuntimePackageRoot's own doc comment): a Blueprint project is materialized into a real, loadable
// runtime *before* loadGame ever touches it, exactly like every other CLI runtime operation. What comes
// back out — a live GameSessionHandling, settled through the same wallet/idempotency machinery
// SpinCommandHandler always uses, capturing a real, hashable RoundArtifact (sessionCapturePolicyMode
// "full", same as StudioRuntimeManager's own runtime) — is never reimplemented here; only the "no HTTP
// server in between" wiring is new.
//
// Holds at most one session at a time, the same "process-local, single active instance" shape
// StudioRuntimeManager's own server has, but scoped to Studio's own in-process call, not an OS resource
// that needs stopping — newSession() (Play's "New session"/"Reset" alike, see PlayTab's own doc comment)
// simply discards whatever was active and builds a fresh one, and reset() (called on a project switch or
// Studio shutdown) does the same without creating a replacement. Every store below (SessionRepository,
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
    private readonly loadGame: typeof loadPokieGame;
    private readonly resolveRuntimePackageRoot: RuntimePackageResolving;
    private readonly pokieVersion: string;
    private readonly resolveProject: ProjectResolving;
    private readonly outcomeLibraryReader: OutcomeLibraryBundleReading;

    private active: ActiveSession | undefined;
    private currentSessionId: string | undefined;

    constructor(
        loadGame: typeof loadPokieGame = loadPokieGame,
        resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
        pokieVersion = "unknown",
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        outcomeLibraryReader: OutcomeLibraryBundleReading = new OutcomeLibraryBundleReader(),
    ) {
        this.loadGame = loadGame;
        this.resolveRuntimePackageRoot = resolveRuntimePackageRoot;
        this.pokieVersion = pokieVersion;
        this.resolveProject = resolveProject;
        this.outcomeLibraryReader = outcomeLibraryReader;
    }

    // Materializes/loads `projectRoot` fresh on every call -- never caches a previously loaded game across
    // sessions, the same "always run what's actually on disk now" posture StudioRuntimeManager.start()
    // itself takes for its own server. A Blueprint project's materialized temp directory is only ever
    // needed for the synchronous loadGame() call itself (see resolveRuntimePackageRoot's own doc comment
    // on why a "tsPackage" project's own release() is already a no-op) -- released immediately afterward,
    // never held for this session's own lifetime.
    public async newSession(projectRoot: string, seed?: string | number): Promise<StudioPlaySessionResult> {
        let project: PokieProject | undefined;
        try {
            project = await this.resolveProject.resolve(projectRoot);
        } catch (error) {
            return this.fail(error);
        }

        if (project !== undefined && (project.type === "outcomeLibrary" || project.type === "stakeAdapter")) {
            return this.newOutcomeSourceSession(project, seed);
        }

        let game: PokieGame;
        try {
            const resolution = await this.resolveRuntimePackageRoot(projectRoot);
            try {
                game = await this.loadGame(resolution.runtimePath);
            } finally {
                await resolution.release();
            }
        } catch (error) {
            return this.fail(error);
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
        } catch (error) {
            return this.fail(error);
        }

        this.active = {kind: "runtime", manifest, spinHandler};
        this.currentSessionId = sessionId;

        const credits = await wallet.getBalance(sessionId);
        return {status: "ok", session: this.buildSessionView(sessionId, manifest, state, credits, undefined, state.initialPayload)};
    }

    // sessionId is always checked against the one currently active session -- Play never keeps more than
    // one alive at a time (see the class doc comment), so a spin against an id from a session that's
    // since been replaced by a newer newSession() call (or never existed) is honestly "not-found," never
    // silently resurrected.
    public async spin(sessionId: string): Promise<StudioPlaySpinResult> {
        if (this.active === undefined || sessionId !== this.currentSessionId) {
            return {status: "not-found"};
        }

        if (this.active.kind === "outcomeSource") {
            return this.spinOutcomeSource(sessionId, this.active);
        }

        const result = await this.active.spinHandler.handle(sessionId);
        if (result.status === "not-found") {
            return {status: "not-found"};
        }
        if (result.status === "blocked") {
            return {status: "blocked", error: result.reason};
        }
        if (result.status === "conflict" || result.status === "recovery-required") {
            // Neither can actually happen here in practice -- this service never passes an
            // expectedVersion, and never shares its stores with another SpinCommandHandler instance (see
            // the class doc comment) -- surfaced as a plain error rather than silently dropped in the
            // (unreachable in normal operation) case they somehow ever did.
            return {status: "error", error: result.reason};
        }

        return {
            status: "ok",
            session: this.buildSessionView(sessionId, this.active.manifest, result.state, result.credits, result.win, result.state.roundPayload),
        };
    }

    // Called on a project switch or Studio shutdown -- a genuinely different (or no longer active)
    // project must never leave a previous project's session reachable, same reasoning as
    // StudioRuntimeManager.stopForProjectSwitch()/stopForShutdown(). Nothing here holds an OS resource
    // (see newSession()'s own doc comment on why materialization is never held past loadGame), so this is
    // just discarding in-memory references, never an async teardown.
    public reset(): void {
        this.active = undefined;
        this.currentSessionId = undefined;
    }

    // The "outcomeLibrary"/"stakeAdapter" counterpart to the materialize-and-load path above -- reached
    // only once newSession() has already resolved `project` to one of those two types (see this class's
    // own doc comment). A resolved "stakeAdapter" project has no PreGeneratedOutcomeSourcing-style draw
    // contract at all (see OUTCOME_SOURCE_SAMPLE_CAPABILITY's own doc comment) -- describeUnsupportedProjectOperation
    // catches that here, honestly, before ever reading a single file, the same structured diagnostic every
    // other POKIE surface (ServeCommand, the Outcome Library sample route) already gives for it. A resolved
    // "outcomeLibrary" project plays its manifest's own first mode (Play has no mode picker of its own,
    // unlike the dedicated Outcome Library sample route) through a real OutcomeLibraryBundleOutcomeSource --
    // the exact same selector class PreGeneratedSpinCommandHandler/sampleOutcomeSourceProject already use in
    // production -- never loadPokieGame, never a regenerated game-model draw.
    private async newOutcomeSourceSession(project: PokieProject, seed?: string | number): Promise<StudioPlaySessionResult> {
        const diagnostic = describeUnsupportedProjectOperation(project, OUTCOME_SOURCE_SAMPLE_OPERATION);
        if (diagnostic !== undefined) {
            return {status: "failed", error: diagnostic.message};
        }

        let bundleGame: {id: string; name: string; version: string};
        let modeName: string;
        try {
            const manifest = await this.outcomeLibraryReader.readManifest(project.rootPath);
            if (manifest.modes.length === 0) {
                return {status: "failed", error: `"${project.rootPath}" has no outcome-library modes to play.`};
            }
            bundleGame = manifest.game;
            modeName = manifest.modes[0].modeName;
        } catch (error) {
            return this.fail(error);
        }

        const sessionId = crypto.randomUUID();
        // A given seed drives one SeededWeightedOutcomeRandomSource shared by every draw made against this
        // exact session -- the same "a given seed always plays out the same way" contract PlayTab's own doc
        // comment promises for a live game's own createSession({seed}) context, just built out of a source
        // that has no session-scoped RNG of its own to seed instead.
        const randomSource: WeightedOutcomeRandomSource =
            seed === undefined ? new SecureWeightedOutcomeRandomSource() : new SeededWeightedOutcomeRandomSource(String(seed));

        this.active = {
            kind: "outcomeSource",
            manifest: bundleGame,
            outcomeSource: new OutcomeLibraryBundleOutcomeSource(project.rootPath, modeName),
            randomSource,
            credits: 0,
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
        try {
            const selection = await active.outcomeSource.drawOutcome(active.randomSource);
            artifact = selection.outcome.artifact;
        } catch (error) {
            return {status: "error", error: error instanceof Error ? error.message : String(error)};
        }

        active.credits = active.credits - artifact.stake + artifact.totalWin;

        return {status: "ok", session: this.buildOutcomeSourceSessionView(sessionId, active, artifact)};
    }

    private fail(error: unknown): StudioPlaySessionResult {
        return {status: "failed", error: error instanceof Error ? error.message : String(error)};
    }

    // Builds the same StudioRuntimeSessionView shape StudioRuntimeManager.buildSessionView() builds from
    // PokieDevServer's raw HTTP response -- but reading straight off the real, in-process PokieSessionState
    // this call actually produced, never round-tripped through JSON/fetch first (there is no HTTP
    // boundary here to cross). `debug` is always attached (never gated behind a debug-mode toggle the way
    // StudioRuntimeManager's own is) -- Play's entire point is showing the real round it just played (see
    // the class doc comment), never a version of it with the artifact withheld.
    private buildSessionView(
        sessionId: string,
        manifest: {id: string; name: string; version: string},
        state: PokieSessionState,
        credits: number,
        win: number | undefined,
        serializedPayload: Record<string, unknown> | undefined,
    ): StudioRuntimeSessionView {
        const view = (
            serializedPayload !== undefined
                ? {...serializedPayload, sessionId, game: manifest, credits}
                : {
                    sessionId,
                    game: manifest,
                    bet: state.bet,
                    credits,
                    ...(win !== undefined ? {win} : {}),
                    ...(state.screen !== undefined ? {screen: state.screen} : {}),
                }
        ) as StudioRuntimeSessionView;

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
    ): StudioRuntimeSessionView {
        const view = {
            sessionId,
            game: active.manifest,
            credits: active.credits,
            ...(artifact !== undefined
                ? {bet: artifact.stake, win: artifact.totalWin, screen: artifact.screen.map((row) => [...row])}
                : {}),
        } as StudioRuntimeSessionView;

        if (artifact !== undefined) {
            view.debug = {artifact: new PokieJsonRoundArtifactProjector().project(artifact)};
        }

        return view;
    }
}
