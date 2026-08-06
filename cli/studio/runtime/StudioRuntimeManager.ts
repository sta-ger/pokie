import {
    computeWeightedOutcomeLibraryHash,
    FileSessionRepository,
    InMemorySessionRepository,
    loadPokieGame,
    PokieClientServer,
    PokieClientServerHandling,
    PokieClientServerOptions,
    PokieDevServer,
    PokieDevServerHandling,
    PokieDevServerOptions,
    PokieGame,
    PokieJsonRoundArtifactProjector,
    WeightedOutcomeLibrary,
    type RoundArtifactJson,
} from "pokie";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../../materialize/materializeRuntimePackage.js";
import type {OutcomeLibrarySelector} from "../outcomeLibrary/OutcomeLibrarySelector.js";
import {StudioOutcomeLibraryService, type ResolvedOutcomeLibrary} from "../outcomeLibrary/StudioOutcomeLibraryService.js";
import {RuntimeHttpResult, RuntimeSessionClient} from "./RuntimeSessionClient.js";
import type {StudioRuntimeSessionView} from "./StudioRuntimeSessionView.js";
import type {StudioRuntimeStateView} from "./StudioRuntimeStateView.js";
import type {ValidatedStartRuntimeRequest} from "./validateStartRuntimeRequest.js";

export type StudioRuntimeStartResult =
    | {status: "started"; view: StudioRuntimeStateView}
    | {status: "already-running"; view: StudioRuntimeStateView}
    | {status: "failed"; error: string};

export type StudioRuntimeStopResult = {status: "stopped"} | {status: "already-stopped"};

export type StudioRuntimeSessionResult =
    | {status: "ok"; session: StudioRuntimeSessionView}
    | {status: "not-found"}
    | {status: "not-running"}
    | {status: "error"; error: string};

export type StudioRuntimeSpinResult =
    | {status: "ok"; session: StudioRuntimeSessionView}
    | {status: "not-found"}
    | {status: "blocked"; error: string}
    | {status: "conflict"; error: string}
    | {status: "not-running"}
    | {status: "error"; error: string};

// resolvePreGeneratedLibraryOrFail()'s own result -- see that method's doc comment. "none" means no
// preGeneratedLibrarySelector was requested at all (a plain start/restart).
type PreGeneratedLibraryResolution =
    | {status: "none"}
    | {status: "ok"; library: WeightedOutcomeLibrary<string>; summary: {libraryId: string; hash: string}}
    | {status: "failed"; error: string};

// The non-"failed" subset restart() passes into startInternal() as its already-validated preflight
// snapshot -- see startInternal()'s own doc comment for why this must be reused as-is, never re-resolved.
type PinnedPreGeneratedLibraryResolution = Exclude<PreGeneratedLibraryResolution, {status: "failed"}>;

// Owns at most one PokieDevServerHandling instance for "the current project" — a process-local
// lifecycle manager, same "constructor-injected loadGame, everything else overridable" shape as
// StudioSimulationService/StudioReplayExecutionService, but for a genuinely long-lived server resource
// rather than a chunked background job. Drives PokieDevServer/SessionRepository/WalletPort/the network
// serializers/idempotency/optimistic-locking directly and in-process — never spawns `pokie serve`/
// `pokie dev` as a subprocess, never reimplements any of their logic.
//
// It also owns a second, paired PokieClientServerHandling instance -- the Runtime tab's "Open Player"
// server (see startInternal()/stopServerIfAny()), started against and stopped alongside the PokieDevServer
// above exactly the way `pokie dev` pairs the two. This is what makes "Open Player" open the exact same
// canonical player (cli/client's compiled assets, the same connection/error/retry adapter) `pokie dev`/
// `pokie client` already serve, rather than Studio reimplementing a second player surface of its own.
//
// Session Tools (createSession/getSession/spin) never touch a live GameSessionHandling, a
// SessionRepository, or a WalletPort directly — they go through RuntimeSessionClient, a small typed
// HTTP adapter that talks to this manager's own running server exactly like an external client would
// (see that class's own doc comment). This is what keeps Studio's domain layer from ever duplicating
// PokieDevServer's HTTP contract, and what guarantees Studio's own API can never leak a repository
// instance, a WalletPort, or a raw session object — it only ever has the same plain JSON any client of
// the real server would get back.
export class StudioRuntimeManager {
    private static readonly MAX_RECENT_SPINS = 20;

    private readonly loadGame: typeof loadPokieGame;
    private readonly createServer: (game: PokieGame, options: PokieDevServerOptions) => PokieDevServerHandling;
    // Where the compiled cli/client assets live (dist/cli/client at runtime) -- the exact same
    // clientRoot ClientCommand/DevCommand are given, so the player this manager serves is byte-for-byte
    // the same canonical player, not a second copy. See those commands' own doc comments for why this
    // has no default that resolves it here (needs import.meta.url); StudioServer wires the real one in.
    private readonly clientRoot: string;
    private readonly createClientServer: (clientRoot: string, options: PokieClientServerOptions) => PokieClientServerHandling;
    private readonly resolveOutcomeLibrary: (projectRoot: string, selector: OutcomeLibrarySelector) => Promise<ResolvedOutcomeLibrary>;
    // Crosses from "the projectRoot Studio has open" to "a real, loadable runtime" before this.loadGame
    // ever touches it -- see materializeRuntimePackage.ts's own doc comment. Defaults to a no-op
    // passthrough so every existing caller/test keeps behaving exactly as before this boundary existed;
    // StudioServer wires the real, materializing one in.
    private readonly resolveRuntimePackageRoot: RuntimePackageResolving;
    // Stamped into every server this manager starts as PokieDevServerOptions.pokieVersion, so a "full"
    // capture policy's own RoundArtifact provenance is genuinely this pokie release, not the "unknown"
    // fallback that option otherwise defaults to. Defaults to "unknown" itself here too -- the same
    // fallback StudioReplayExecutionService already uses when it isn't given a real one either -- so
    // every existing caller/test that doesn't pass one keeps compiling and behaving predictably.
    private readonly pokieVersion: string;

    private state: StudioRuntimeStateView = {status: "stopped"};
    private server: PokieDevServerHandling | undefined;
    // The Runtime tab's "Open Player" server -- a real PokieClientServer pointed at `server`'s own
    // address, started/stopped alongside it (see startInternal()/stopServerIfAny()). Never a route on
    // this Studio server itself: keeping it a genuinely separate, independently-listening server is what
    // makes "Open Player" byte-for-byte the same player surface `pokie dev` opens, not a Studio-specific
    // reimplementation of it.
    private clientServer: PokieClientServerHandling | undefined;
    private sessionClient: RuntimeSessionClient | undefined;
    private debugEnabled = false;
    private defaultSeed: string | number | undefined;
    private lastOptions: ValidatedStartRuntimeRequest | undefined;
    private fileSessionDirectory: string | undefined;
    // Set exactly when the current server is running against a pre-generated outcome library (see
    // startInternal()) -- createSession()/getSession()/spin() branch on this to talk to
    // PokieDevServer's own separate `/pregenerated-sessions*` namespace instead of the live `/sessions*`
    // one. Cleared on every teardown path alongside everything else in stopServerIfAny(), so a later
    // start (plain or pre-generated) never inherits a stale mode from a previous one.
    private preGeneratedLibrary: {libraryId: string; hash: string} | undefined;
    // Most-recent-first, bounded -- the game server itself keeps no round history at all (each spin
    // overwrites the previous session state), so this is the only place "find a past spin by request id"
    // can look. Studio's own bookkeeping only, same pattern StudioSimulationService/
    // StudioReplayExecutionService already use for their own in-memory job repositories -- never touches
    // core session/game logic. Cleared on every teardown path (see stopServerIfAny()) so a spin from a
    // previous project (or a previous runtime start) never leaks into a later one.
    private recentSpins: StudioRuntimeSessionView[] = [];
    // Session-local round counters backing each recorded spin's `studioRound` -- keyed by sessionId,
    // strictly increasing per session regardless of `recentSpins`' own MAX_RECENT_SPINS eviction, so
    // "Round 23 in session X" stays correctly numbered even once round 1-3's own entries have scrolled
    // out of the bounded list. Cleared alongside `recentSpins` on every teardown path (see
    // stopServerIfAny()) for the same reason -- a round count from a torn-down runtime instance must
    // never bleed into a later one, even if a later session happens to reuse the same id.
    private sessionRoundCounters = new Map<string, number>();

    constructor(
        loadGame: typeof loadPokieGame = loadPokieGame,
        createServer: (game: PokieGame, options: PokieDevServerOptions) => PokieDevServerHandling = (game, options) =>
            new PokieDevServer(game, options),
        // Defaults to a fresh StudioOutcomeLibraryService -- the exact same selector resolution
        // (path/bundle-mode/Stake Engine export, containment, validation) the Outcome Libraries tab's
        // own select()/compare() already use, so a pre-generated handoff can never resolve a library
        // differently than the tab that offered it.
        resolveOutcomeLibrary: (projectRoot: string, selector: OutcomeLibrarySelector) => Promise<ResolvedOutcomeLibrary> = (projectRoot, selector) =>
            new StudioOutcomeLibraryService().resolveLibrary(projectRoot, selector),
        resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
        pokieVersion = "unknown",
        clientRoot = "",
        createClientServer: (clientRoot: string, options: PokieClientServerOptions) => PokieClientServerHandling = (clientRoot, options) =>
            new PokieClientServer(clientRoot, options),
    ) {
        this.loadGame = loadGame;
        this.createServer = createServer;
        this.resolveOutcomeLibrary = resolveOutcomeLibrary;
        this.resolveRuntimePackageRoot = resolveRuntimePackageRoot;
        this.pokieVersion = pokieVersion;
        this.clientRoot = clientRoot;
        this.createClientServer = createClientServer;
    }

    public getState(): StudioRuntimeStateView {
        return this.state;
    }

    // Rejects a second start while running/starting rather than silently restarting — same
    // "already active" conflict StudioSimulationService.start()/StudioReplayExecutionService.start()
    // return for a second job against the same projectRoot. The synchronous check-and-flip-to-
    // "starting" below (before any `await`) is what closes the race window for two calls arriving in
    // the same tick — see the class doc comment.
    public start(projectRoot: string, options: ValidatedStartRuntimeRequest): Promise<StudioRuntimeStartResult> {
        if (this.state.status === "running" || this.state.status === "starting") {
            return Promise.resolve({status: "already-running", view: this.state});
        }
        return this.startInternal(projectRoot, options);
    }

    // Always supersedes whatever is currently running (or not) — unlike start(), restarting while
    // already running is exactly the point, so there's no conflict case here. Omitting `options`
    // reuses the last successful start's options, so the UI's Restart button can resend nothing.
    //
    // A requested pre-generated library is resolved and hash-checked as a *preflight*, before anything
    // currently running is touched — the Outcome Libraries tab's "Use in runtime" handoff always goes
    // through here (never start()), so a stale/invalid library must never tear down an already-working
    // runtime (its server, sessions, recent-spin history) only to then fail to replace it with anything.
    // A failure here returns a plain result without going through fail() (which would overwrite
    // `this.state`) — the currently running (or stopped) state is left exactly as it was.
    //
    // The *exact* resolution this preflight already validated is then pinned and passed straight into
    // startInternal() rather than re-resolved after teardown -- otherwise the file could change again in
    // the gap between this check and the server actually starting, and the server would end up running
    // something other than what was just validated (a second, narrower TOCTOU window on top of the one
    // teardown-ordering itself used to open). See startInternal()'s own doc comment.
    public async restart(projectRoot: string, options?: ValidatedStartRuntimeRequest): Promise<StudioRuntimeStartResult> {
        const effectiveOptions = options ?? this.lastOptions;
        if (effectiveOptions === undefined) {
            return {status: "failed", error: "Nothing to restart — start the runtime at least once first."};
        }

        const preflight = await this.resolvePreGeneratedLibraryOrFail(projectRoot, effectiveOptions);
        if (preflight.status === "failed") {
            return {status: "failed", error: preflight.error};
        }

        await this.stopServerIfAny();
        return this.startInternal(projectRoot, effectiveOptions, preflight);
    }

    // Idempotent — stopping an already-stopped runtime is a no-op that still returns a clean result,
    // never an error, same "repeated request can't corrupt state" guarantee as
    // StudioSimulationService.cancel()/StudioReplayExecutionService.cancel().
    public async stop(): Promise<StudioRuntimeStopResult> {
        if (this.state.status === "stopped") {
            return {status: "already-stopped"};
        }
        await this.stopServerIfAny();
        return {status: "stopped"};
    }

    // Called from StudioServer when Studio switches to a different project (or back to Home) — unlike
    // StudioSimulationService/StudioReplayExecutionService's jobs (merely scoped by projectRoot, never
    // stopped on switch), a Runtime server holds an OS port and is explicitly on/off state, so it must
    // be fully torn down here, not just left running unseen. Also clears every per-project setting
    // (debug flag, default seed, last start options, any file-mode temp directory) so a later start
    // for a *different* project never inherits a stale configuration.
    public async stopForProjectSwitch(): Promise<void> {
        await this.stopServerIfAny();
        await this.resetProjectScopedState();
    }

    // Called from StudioServer.stop() alongside simulationService.cancelAll()/replayService.cancelAll()
    // — same reasoning, so a stopped Studio process never leaves a runtime server listening on a port
    // nobody is serving Studio's own HTTP API on anymore.
    public async stopForShutdown(): Promise<void> {
        await this.stopServerIfAny();
        await this.resetProjectScopedState();
    }

    // "initialBalance" only ever reaches the pre-generated create endpoint -- a live session's initial
    // credits come entirely from the game's own session initialization (see createSession's own route,
    // which never accepts a balance), and a pre-generated session's wallet otherwise starts at a literal
    // 0 with no way to fund it afterward (see PokieDevServer's own "no session-side default credits"
    // reasoning) -- without this, every spin against a fresh pre-generated session would fail outright.
    public async createSession(seed?: string | number, initialBalance?: number): Promise<StudioRuntimeSessionResult> {
        if (this.state.status !== "running" || !this.sessionClient) {
            return {status: "not-running"};
        }
        const effectiveSeed = seed ?? this.defaultSeed;
        if (this.preGeneratedLibrary !== undefined) {
            // The pre-generated create endpoint only ever accepts a string seed (see
            // RuntimeSessionClient.createPreGeneratedSession's own doc comment) -- a numeric seed is
            // stringified rather than silently dropped.
            const preGeneratedSeed = effectiveSeed === undefined ? undefined : String(effectiveSeed);
            return this.translateSessionResult(await this.sessionClient.createPreGeneratedSession(preGeneratedSeed, initialBalance), true);
        }
        return this.translateSessionResult(await this.sessionClient.createSession(effectiveSeed));
    }

    public async getSession(sessionId: string): Promise<StudioRuntimeSessionResult> {
        if (this.state.status !== "running" || !this.sessionClient) {
            return {status: "not-running"};
        }
        if (this.preGeneratedLibrary !== undefined) {
            // PokieDevServer's own pre-generated namespace has no GET-by-id route at all (only create +
            // spin) -- an honest limitation of the engine's own API, not something Studio papers over by
            // faking a lookup or misreporting it as "not found" (which would imply the session simply
            // doesn't exist, rather than that this operation isn't supported in this mode).
            return {status: "error", error: "Loading a session by id isn't supported while the runtime is using a pre-generated outcome library."};
        }
        return this.translateSessionResult(await this.sessionClient.getSession(sessionId));
    }

    public async spin(sessionId: string, requestId?: string, expectedVersion?: number): Promise<StudioRuntimeSpinResult> {
        if (this.state.status !== "running" || !this.sessionClient) {
            return {status: "not-running"};
        }
        // No expectedVersion/optimistic-locking support in pre-generated mode -- PreGeneratedSpinCommandHandler.handle()
        // has no such parameter, unlike the live spin path (see RuntimeSessionClient.spinPreGenerated's own doc comment).
        const result =
            this.preGeneratedLibrary !== undefined
                ? this.translateSpinResult(await this.sessionClient.spinPreGenerated(sessionId, requestId), true)
                : this.translateSpinResult(await this.sessionClient.spin(sessionId, requestId, expectedVersion));
        if (result.status === "ok") {
            // Recorded from this call's own requestId parameter, not read back out of `internal` --
            // unlike `debug.requestId` (only ever attached when debugEnabled, see buildSessionView()),
            // this is Studio's own bookkeeping, so it's on every recorded spin the caller actually named
            // a requestId for, regardless of debug mode. See StudioRuntimeSessionView's own doc comment.
            if (requestId !== undefined) {
                result.session.studioRequestId = requestId;
            }
            this.recordRecentSpin(result.session);
        }
        return result;
    }

    // Read-only snapshot, most-recent-first -- the Replay & Debug tab's "Session Spin" find method lists
    // and looks up by requestId against this directly, via each entry's own `studioRequestId` (present
    // whenever the spin was made with a requestId, regardless of debug mode).
    public listRecentSpins(): StudioRuntimeSessionView[] {
        return [...this.recentSpins];
    }

    // Stamps every *newly* recorded spin with its own unambiguous, session-scoped identity --
    // `studioRound` (this session's 1-based round index), `studioRecordedAt` (when Studio first recorded
    // it, ISO -- the game server itself returns no timestamp), and `studioSource` (live play vs. a
    // pre-generated outcome library, since the two can otherwise look identical in the list). Retrying the
    // *same* (sessionId, studioRequestId) pair -- e.g. the Debug tab's "Retry last request", or a genuine
    // network-level retry -- replays the same underlying round rather than playing a new one (see
    // SpinCommandHandler's idempotent-replay path): this canonical identity is what's deduplicated on,
    // reusing the original entry's round/timestamp/source verbatim and leaving the list itself untouched
    // rather than filing (or bumping the position of) a second entry for what is the same round. A spin
    // made *without* a requestId can't be identified as a retry of anything (there's no id to match on),
    // so it's always treated as its own new round. This never dedupes a legitimate round from a
    // *different* session, since the match always requires sessionId to agree too, not studioRequestId
    // alone.
    private recordRecentSpin(session: StudioRuntimeSessionView): void {
        const requestId = session.studioRequestId;
        if (requestId !== undefined) {
            const duplicate = this.recentSpins.find((entry) => entry.sessionId === session.sessionId && entry.studioRequestId === requestId);
            if (duplicate !== undefined) {
                session.studioRound = duplicate.studioRound;
                session.studioRecordedAt = duplicate.studioRecordedAt;
                session.studioSource = duplicate.studioSource;
                return;
            }
        }

        session.studioRound = this.nextSessionRound(session.sessionId);
        session.studioRecordedAt = new Date().toISOString();
        session.studioSource = this.preGeneratedLibrary !== undefined ? "pre-generated" : "live";

        this.recentSpins.unshift(session);
        if (this.recentSpins.length > StudioRuntimeManager.MAX_RECENT_SPINS) {
            this.recentSpins.length = StudioRuntimeManager.MAX_RECENT_SPINS;
        }
    }

    private nextSessionRound(sessionId: string): number {
        const next = (this.sessionRoundCounters.get(sessionId) ?? 0) + 1;
        this.sessionRoundCounters.set(sessionId, next);
        return next;
    }

    // Shared by startInternal() and restart()'s own preflight -- resolves options.preGeneratedLibrarySelector
    // (if any) via the injected resolveOutcomeLibrary, and checks its hash against
    // options.preGeneratedLibraryExpectedHash (the hash the Outcome Libraries tab already showed the user
    // at Select/Inspect time -- same expectedLeftHash/leftSnapshotStale snapshot-consistency contract
    // StudioOutcomeLibraryService.compare() uses). The library is *always* re-resolved fresh (a handoff
    // should run what's actually on disk now, not a cached copy); a mismatch, an invalid library, or an
    // unresolvable path all come back as "failed" with a clear, client-safe message, never a thrown
    // exception -- this never touches `this.state` or anything else in the process, purely a query.
    private async resolvePreGeneratedLibraryOrFail(
        projectRoot: string,
        options: ValidatedStartRuntimeRequest,
    ): Promise<PreGeneratedLibraryResolution> {
        if (options.preGeneratedLibrarySelector === undefined) {
            return {status: "none"};
        }
        const resolved = await this.resolveOutcomeLibrary(projectRoot, options.preGeneratedLibrarySelector);
        if (resolved.status === "load-error") {
            return {status: "failed", error: `Could not resolve the pre-generated outcome library: ${resolved.error}`};
        }
        if (resolved.status === "invalid") {
            return {status: "failed", error: `The selected pre-generated outcome library is invalid: ${resolved.errors.map((issue) => issue.message).join(" ")}`};
        }
        const hash = computeWeightedOutcomeLibraryHash(resolved.library);
        if (options.preGeneratedLibraryExpectedHash !== undefined && hash !== options.preGeneratedLibraryExpectedHash) {
            return {
                status: "failed",
                error:
                    "The selected pre-generated outcome library changed since you selected it in Outcome Libraries " +
                    `(expected hash ${options.preGeneratedLibraryExpectedHash}, found ${hash}). ` +
                    "Re-select it in Outcome Libraries and try again.",
            };
        }
        return {status: "ok", library: resolved.library, summary: {libraryId: resolved.library.libraryId, hash}};
    }

    // "pinnedPreGeneratedResolution", when given, is restart()'s own already-validated preflight result --
    // reused as-is instead of resolving options.preGeneratedLibrarySelector a second time here. Re-resolving
    // after teardown would leave a real (if narrow) TOCTOU window open: the file could change again in the
    // gap between restart()'s preflight and this point, and the server would end up running content that
    // was never actually the thing validated. start() never has a preflight of its own (nothing running yet
    // to protect from a premature teardown), so it's omitted there and this method resolves fresh, exactly
    // as it always has.
    private async startInternal(
        projectRoot: string,
        options: ValidatedStartRuntimeRequest,
        pinnedPreGeneratedResolution?: PinnedPreGeneratedLibraryResolution,
    ): Promise<StudioRuntimeStartResult> {
        this.state = {status: "starting"};

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

        // An unresolvable/invalid/changed selector must fail the whole start attempt -- never a server
        // silently running in plain-RNG mode, or against content that moved on since the handoff was
        // offered, when the caller asked for pre-generated -- same "no well-formed input, no pipeline
        // call" ordering StudioDeploymentService.run() already follows for its own per-mode library loads.
        const preGeneratedResolution = pinnedPreGeneratedResolution ?? (await this.resolvePreGeneratedLibraryOrFail(projectRoot, options));
        if (preGeneratedResolution.status === "failed") {
            return this.fail(new Error(preGeneratedResolution.error));
        }
        const preGeneratedOutcomeLibrary: PokieDevServerOptions["preGeneratedOutcomeLibrary"] =
            preGeneratedResolution.status === "ok" ? preGeneratedResolution.library : undefined;
        const preGeneratedLibrary = preGeneratedResolution.status === "ok" ? preGeneratedResolution.summary : undefined;

        const sessionRepository =
            options.repositoryMode === "file" ? new FileSessionRepository(this.resolveFileSessionDirectory()) : new InMemorySessionRepository();

        // Ties the underlying server's own persistence-level capture policy (see
        // PokieDevServerOptions.captureDebugSessionData's own doc comment) to this same runtime's debug
        // toggle: full inspection by default (options.debug defaults to true -- see
        // validateStartRuntimeRequest), but a user who explicitly starts this runtime with debug mode off
        // also gets a server that never captures debug-only content into session state in the first
        // place, not just one that withholds it from responses.
        //
        // `sessionCapturePolicyMode` is always "full", independent of `options.debug` above -- unlike
        // debug-only serializer payloads (a legitimate opt-out even for local dev), a Studio/dev session's
        // whole point is a fully inspectable recorded round (see PokieDevServerOptions.
        // sessionCapturePolicyMode's own doc comment); a user turning off `?debug=1`-only content should
        // never also lose the RoundArtifact itself.
        const server = this.createServer(game, {
            host: options.host,
            port: options.port ?? 0,
            sessionRepository,
            preGeneratedOutcomeLibrary,
            captureDebugSessionData: options.debug,
            sessionCapturePolicyMode: "full",
            pokieVersion: this.pokieVersion,
        });

        let address;
        try {
            address = await server.start();
        } catch (error) {
            return this.fail(error);
        }

        // Started right alongside the API server, pointed at its own just-resolved address -- the exact
        // same pairing DevCommand.run() sets up for `pokie dev` (see that class's own doc comment). A
        // failure here must not leave the API server it was meant to accompany listening on a port
        // nobody will ever stop -- `server` is stopped directly (this.server is never assigned until
        // both servers are confirmed up), rather than through stopServerIfAny(), which would also try to
        // stop a clientServer that never started.
        const clientServer = this.createClientServer(this.clientRoot, {host: undefined, port: 0, apiAddress: address});
        let playerAddress;
        try {
            playerAddress = await clientServer.start();
        } catch (error) {
            await server.stop();
            return this.fail(error);
        }

        this.server = server;
        this.clientServer = clientServer;
        const baseUrl = `http://${address.host}:${address.port}`;
        this.sessionClient = new RuntimeSessionClient(baseUrl);
        this.debugEnabled = options.debug;
        this.defaultSeed = options.seed;
        this.lastOptions = options;
        this.preGeneratedLibrary = preGeneratedLibrary;

        const view: StudioRuntimeStateView = {
            status: "running",
            host: address.host,
            port: address.port,
            baseUrl,
            playerUrl: `http://${playerAddress.host}:${playerAddress.port}`,
            debug: options.debug,
            repositoryMode: options.repositoryMode,
            startedAt: new Date().toISOString(),
            ...(preGeneratedLibrary !== undefined ? {preGenerated: preGeneratedLibrary} : {}),
        };
        this.state = view;
        return {status: "started", view};
    }

    private fail(error: unknown): StudioRuntimeStartResult {
        const message = error instanceof Error ? error.message : String(error);
        this.state = {status: "failed", error: message};
        return {status: "failed", error: message};
    }

    private async stopServerIfAny(): Promise<void> {
        this.state = {status: "stopping"};
        if (this.clientServer) {
            await this.clientServer.stop();
        }
        if (this.server) {
            await this.server.stop();
        }
        this.server = undefined;
        this.clientServer = undefined;
        this.sessionClient = undefined;
        this.preGeneratedLibrary = undefined;
        this.state = {status: "stopped"};
        // Every teardown path (manual Stop, Restart, project switch, Studio shutdown) already funnels
        // through here -- a stopped server's past spins are neither reachable nor meaningful to keep
        // around (in-memory sessions are gone; even file-mode sessions have no server serving them), so
        // this is the one place recentSpins needs clearing, not a separate per-caller responsibility.
        this.recentSpins = [];
        this.sessionRoundCounters = new Map();
    }

    private async resetProjectScopedState(): Promise<void> {
        this.lastOptions = undefined;
        this.debugEnabled = false;
        this.defaultSeed = undefined;
        if (this.fileSessionDirectory !== undefined) {
            const directory = this.fileSessionDirectory;
            this.fileSessionDirectory = undefined;
            try {
                await fs.promises.rm(directory, {recursive: true, force: true});
            } catch {
                // Best-effort cleanup only — a leftover directory under os.tmpdir() is harmless and
                // the OS will eventually reclaim it; nothing here should ever surface to the caller.
            }
        }
    }

    // Lazily created once, then reused across every subsequent start/restart for as long as this
    // manager isn't reset by a project switch — so "file" mode genuinely demonstrates session
    // persistence across a manual Stop→Start or a Restart, which is the whole point of offering it.
    private resolveFileSessionDirectory(): string {
        if (this.fileSessionDirectory === undefined) {
            this.fileSessionDirectory = path.join(os.tmpdir(), "pokie-studio-runtime-sessions", crypto.randomUUID());
        }
        fs.mkdirSync(this.fileSessionDirectory, {recursive: true});
        return this.fileSessionDirectory;
    }

    private translateSessionResult(result: RuntimeHttpResult, preGenerated = false): StudioRuntimeSessionResult {
        if (result.status === 200 || result.status === 201) {
            return {status: "ok", session: preGenerated ? this.buildPreGeneratedSessionView(result.body) : this.buildSessionView(result.body)};
        }
        if (result.status === 404) {
            return {status: "not-found"};
        }
        return {status: "error", error: this.extractError(result.body)};
    }

    private translateSpinResult(result: RuntimeHttpResult, preGenerated = false): StudioRuntimeSpinResult {
        if (result.status === 200) {
            return {status: "ok", session: preGenerated ? this.buildPreGeneratedSessionView(result.body) : this.buildSessionView(result.body)};
        }
        if (result.status === 404) {
            return {status: "not-found"};
        }
        if (result.status === 400) {
            return {status: "blocked", error: this.extractError(result.body)};
        }
        if (result.status === 409) {
            return {status: "conflict", error: this.extractError(result.body)};
        }
        return {status: "error", error: this.extractError(result.body)};
    }

    private extractError(body: unknown): string {
        if (typeof body === "object" && body !== null && typeof (body as {error?: unknown}).error === "string") {
            return (body as {error: string}).error;
        }
        return "Runtime request failed.";
    }

    // Builds Studio's own StudioRuntimeSessionView from PokieDevServer's raw JSON response — the one
    // place `internal` gets translated: `sessionVersion` is hoisted out unconditionally (see the class
    // doc comment for why), the rest of `internal` only when this runtime was started with debug mode
    // on. The raw `internal` field itself is never forwarded as-is.
    private buildSessionView(body: unknown): StudioRuntimeSessionView {
        const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
        const {internal, ...publicFields} = record;
        const view = {...publicFields} as StudioRuntimeSessionView;

        if (typeof internal === "object" && internal !== null) {
            const internalRecord = internal as Record<string, unknown>;
            if (typeof internalRecord.sessionVersion === "number") {
                view.sessionVersion = internalRecord.sessionVersion;
            }
            if (this.debugEnabled) {
                const stateAfterRecord =
                    typeof internalRecord.stateAfter === "object" && internalRecord.stateAfter !== null
                        ? (internalRecord.stateAfter as {roundArtifact?: unknown; roundArtifactUnavailableReason?: string})
                        : undefined;
                view.debug = {
                    stateAfter: internalRecord.stateAfter,
                    stateBefore: internalRecord.stateBefore,
                    debugData: internalRecord.debugData as Record<string, unknown> | undefined,
                    requestId: internalRecord.requestId as string | undefined,
                    ...this.projectRoundArtifact(stateAfterRecord?.roundArtifact, stateAfterRecord?.roundArtifactUnavailableReason),
                };
            }
        }

        return view;
    }

    // Shared by both buildSessionView (live spins, reading PokieSessionState.roundArtifact) and
    // buildPreGeneratedSessionView (pre-generated spins, reading PreGeneratedRoundInternalView.artifact)
    // -- one raw RoundArtifact in, the same JSON-projected/hashed shape RoundArtifactInspector already
    // expects out. Defensive: both producers already build the raw artifact via the same
    // buildRoundArtifactFromSession helper StudioReplayExecutionService itself uses, so projection should
    // never actually fail here -- but this reads across a wire boundary, so a malformed artifact reports
    // an honest reason rather than throwing and losing the whole spin response.
    //
    // `raw` here is already the result of RuntimeSessionClient's own `response.json()` -- genuinely plain
    // JSON content, but parsed by the platform's `fetch` implementation, which isn't guaranteed to
    // construct its result objects against this module's own realm's `Object.prototype` (observable, for
    // example, under Jest's per-test-file VM sandboxing). toCanonicalJson's plain-object check is a
    // strict prototype identity check by design (see its own doc comment), so it would otherwise reject
    // genuinely-plain cross-realm objects as if they were something exotic. Round-tripping through this
    // realm's own JSON.parse/JSON.stringify first re-materializes the same content as plain objects
    // native to this realm before it ever reaches toCanonicalJson.
    private projectRoundArtifact(raw: unknown, unavailableReason: string | undefined): {artifact?: RoundArtifactJson; artifactUnavailableReason?: string} {
        if (raw === undefined) {
            return unavailableReason !== undefined ? {artifactUnavailableReason: unavailableReason} : {};
        }
        try {
            const local = JSON.parse(JSON.stringify(raw)) as Parameters<PokieJsonRoundArtifactProjector["project"]>[0];
            return {artifact: new PokieJsonRoundArtifactProjector().project(local)};
        } catch (error) {
            return {artifactUnavailableReason: `Round artifact could not be projected: ${error instanceof Error ? error.message : String(error)}`};
        }
    }

    // The pre-generated counterpart to buildSessionView() -- PreGeneratedSessionResponse's own `internal`
    // (PreGeneratedRoundInternalView: `{selection, runtime, artifact}`) is a genuinely different shape
    // from the live path's (`{stateAfter, stateBefore, debugData, requestId}`), and pre-generated rounds
    // never carry a sessionVersion over HTTP at all (PokieDevServer's own pre-generated route never
    // includes one) -- so this never tries to force the live shape's own field names onto it. The public
    // fields (sessionId/game/credits/bet/win/screen/...) are structurally the same either way and are
    // spread through exactly like buildSessionView() does; the raw `internal` object (when debug mode is
    // on) is attached as-is under `debug`, which the Runtime tab already renders as a generic JSON dump
    // rather than reading specific field names out of it.
    private buildPreGeneratedSessionView(body: unknown): StudioRuntimeSessionView {
        const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
        const {internal, ...publicFields} = record;
        const view = {...publicFields} as StudioRuntimeSessionView;

        if (this.debugEnabled && typeof internal === "object" && internal !== null) {
            // PreGeneratedRoundInternalView's own `artifact` is the raw RoundArtifact this round was
            // selected with -- always present on that shape, but still raw (unhashed, uncanonicalized),
            // unlike the projected form projectRoundArtifact below produces. `selection`/`runtime` pass
            // through unchanged: the Runtime tab's Advanced JSON dump still shows them as-is.
            const {artifact: rawArtifact, ...restInternal} = internal as Record<string, unknown>;
            view.debug = {
                ...restInternal,
                ...this.projectRoundArtifact(rawArtifact, undefined),
            } as StudioRuntimeSessionView["debug"];
        }

        return view;
    }
}
