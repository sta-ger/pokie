import {
    computeWeightedOutcomeLibraryHash,
    FileSessionRepository,
    InMemorySessionRepository,
    loadPokieGame,
    PokieDevServer,
    PokieDevServerHandling,
    PokieDevServerOptions,
    PokieGame,
    WeightedOutcomeLibrary,
} from "pokie";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
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
    private readonly resolveOutcomeLibrary: (projectRoot: string, selector: OutcomeLibrarySelector) => Promise<ResolvedOutcomeLibrary>;

    private state: StudioRuntimeStateView = {status: "stopped"};
    private server: PokieDevServerHandling | undefined;
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
    ) {
        this.loadGame = loadGame;
        this.createServer = createServer;
        this.resolveOutcomeLibrary = resolveOutcomeLibrary;
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

    private recordRecentSpin(session: StudioRuntimeSessionView): void {
        this.recentSpins.unshift(session);
        if (this.recentSpins.length > StudioRuntimeManager.MAX_RECENT_SPINS) {
            this.recentSpins.length = StudioRuntimeManager.MAX_RECENT_SPINS;
        }
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
            game = await this.loadGame(projectRoot);
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

        const server = this.createServer(game, {host: options.host, port: options.port ?? 0, sessionRepository, preGeneratedOutcomeLibrary});

        let address;
        try {
            address = await server.start();
        } catch (error) {
            return this.fail(error);
        }

        this.server = server;
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
        if (this.server) {
            await this.server.stop();
        }
        this.server = undefined;
        this.sessionClient = undefined;
        this.preGeneratedLibrary = undefined;
        this.state = {status: "stopped"};
        // Every teardown path (manual Stop, Restart, project switch, Studio shutdown) already funnels
        // through here -- a stopped server's past spins are neither reachable nor meaningful to keep
        // around (in-memory sessions are gone; even file-mode sessions have no server serving them), so
        // this is the one place recentSpins needs clearing, not a separate per-caller responsibility.
        this.recentSpins = [];
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
                view.debug = {
                    stateAfter: internalRecord.stateAfter,
                    stateBefore: internalRecord.stateBefore,
                    debugData: internalRecord.debugData as Record<string, unknown> | undefined,
                    requestId: internalRecord.requestId as string | undefined,
                };
            }
        }

        return view;
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

        if (this.debugEnabled && internal !== undefined) {
            view.debug = internal as StudioRuntimeSessionView["debug"];
        }

        return view;
    }
}
