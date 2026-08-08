import {
    captureInitialPokieSessionState,
    GameSessionHandling,
    InMemoryIdempotencyRepository,
    InMemorySessionRepository,
    InMemoryWallet,
    isTransactionalWalletPort,
    loadPokieGame,
    PokieGame,
    PokieGameContext,
    PokieJsonRoundArtifactProjector,
    PokieSessionState,
    resolveGameSessionSerializer,
    SpinCommandHandler,
    SpinCommandHandling,
    TransactionalWalletAdapter,
    type RoundArtifactJson,
} from "pokie";
import crypto from "crypto";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../../materialize/materializeRuntimePackage.js";
import type {StudioRuntimeSessionView} from "./StudioRuntimeSessionView.js";

export type StudioPlaySessionResult = {status: "ok"; session: StudioRuntimeSessionView} | {status: "failed"; error: string};

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
export class StudioPlayService {
    private readonly loadGame: typeof loadPokieGame;
    private readonly resolveRuntimePackageRoot: RuntimePackageResolving;
    private readonly pokieVersion: string;

    private manifest: {id: string; name: string; version: string} | undefined;
    private spinHandler: SpinCommandHandling | undefined;
    private currentSessionId: string | undefined;

    constructor(
        loadGame: typeof loadPokieGame = loadPokieGame,
        resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
        pokieVersion = "unknown",
    ) {
        this.loadGame = loadGame;
        this.resolveRuntimePackageRoot = resolveRuntimePackageRoot;
        this.pokieVersion = pokieVersion;
    }

    // Materializes/loads `projectRoot` fresh on every call -- never caches a previously loaded game across
    // sessions, the same "always run what's actually on disk now" posture StudioRuntimeManager.start()
    // itself takes for its own server. A Blueprint project's materialized temp directory is only ever
    // needed for the synchronous loadGame() call itself (see resolveRuntimePackageRoot's own doc comment
    // on why a "tsPackage" project's own release() is already a no-op) -- released immediately afterward,
    // never held for this session's own lifetime.
    public async newSession(projectRoot: string, seed?: string | number): Promise<StudioPlaySessionResult> {
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

        this.manifest = manifest;
        this.spinHandler = spinHandler;
        this.currentSessionId = sessionId;

        const credits = await wallet.getBalance(sessionId);
        return {status: "ok", session: this.buildSessionView(sessionId, manifest, state, credits, undefined, state.initialPayload)};
    }

    // sessionId is always checked against the one currently active session -- Play never keeps more than
    // one alive at a time (see the class doc comment), so a spin against an id from a session that's
    // since been replaced by a newer newSession() call (or never existed) is honestly "not-found," never
    // silently resurrected.
    public async spin(sessionId: string): Promise<StudioPlaySpinResult> {
        if (this.spinHandler === undefined || this.manifest === undefined || sessionId !== this.currentSessionId) {
            return {status: "not-found"};
        }

        const result = await this.spinHandler.handle(sessionId);
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
            session: this.buildSessionView(sessionId, this.manifest, result.state, result.credits, result.win, result.state.roundPayload),
        };
    }

    // Called on a project switch or Studio shutdown -- a genuinely different (or no longer active)
    // project must never leave a previous project's session reachable, same reasoning as
    // StudioRuntimeManager.stopForProjectSwitch()/stopForShutdown(). Nothing here holds an OS resource
    // (see newSession()'s own doc comment on why materialization is never held past loadGame), so this is
    // just discarding in-memory references, never an async teardown.
    public reset(): void {
        this.manifest = undefined;
        this.spinHandler = undefined;
        this.currentSessionId = undefined;
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
}
