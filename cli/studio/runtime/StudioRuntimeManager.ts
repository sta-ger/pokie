import {
    FileSessionRepository,
    InMemorySessionRepository,
    loadPokieGame,
    PokieDevServer,
    PokieDevServerHandling,
    PokieDevServerOptions,
    PokieGame,
} from "pokie";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
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

    private state: StudioRuntimeStateView = {status: "stopped"};
    private server: PokieDevServerHandling | undefined;
    private sessionClient: RuntimeSessionClient | undefined;
    private debugEnabled = false;
    private defaultSeed: string | number | undefined;
    private lastOptions: ValidatedStartRuntimeRequest | undefined;
    private fileSessionDirectory: string | undefined;
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
    ) {
        this.loadGame = loadGame;
        this.createServer = createServer;
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
    public async restart(projectRoot: string, options?: ValidatedStartRuntimeRequest): Promise<StudioRuntimeStartResult> {
        const effectiveOptions = options ?? this.lastOptions;
        if (effectiveOptions === undefined) {
            return {status: "failed", error: "Nothing to restart — start the runtime at least once first."};
        }
        await this.stopServerIfAny();
        return this.startInternal(projectRoot, effectiveOptions);
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

    public async createSession(seed?: string | number): Promise<StudioRuntimeSessionResult> {
        if (this.state.status !== "running" || !this.sessionClient) {
            return {status: "not-running"};
        }
        return this.translateSessionResult(await this.sessionClient.createSession(seed ?? this.defaultSeed));
    }

    public async getSession(sessionId: string): Promise<StudioRuntimeSessionResult> {
        if (this.state.status !== "running" || !this.sessionClient) {
            return {status: "not-running"};
        }
        return this.translateSessionResult(await this.sessionClient.getSession(sessionId));
    }

    public async spin(sessionId: string, requestId?: string, expectedVersion?: number): Promise<StudioRuntimeSpinResult> {
        if (this.state.status !== "running" || !this.sessionClient) {
            return {status: "not-running"};
        }
        const result = this.translateSpinResult(await this.sessionClient.spin(sessionId, requestId, expectedVersion));
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

    private async startInternal(projectRoot: string, options: ValidatedStartRuntimeRequest): Promise<StudioRuntimeStartResult> {
        this.state = {status: "starting"};

        let game: PokieGame;
        try {
            game = await this.loadGame(projectRoot);
        } catch (error) {
            return this.fail(error);
        }

        const sessionRepository =
            options.repositoryMode === "file" ? new FileSessionRepository(this.resolveFileSessionDirectory()) : new InMemorySessionRepository();

        const server = this.createServer(game, {host: options.host, port: options.port ?? 0, sessionRepository});

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

        const view: StudioRuntimeStateView = {
            status: "running",
            host: address.host,
            port: address.port,
            baseUrl,
            debug: options.debug,
            repositoryMode: options.repositoryMode,
            startedAt: new Date().toISOString(),
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

    private translateSessionResult(result: RuntimeHttpResult): StudioRuntimeSessionResult {
        if (result.status === 200 || result.status === 201) {
            return {status: "ok", session: this.buildSessionView(result.body)};
        }
        if (result.status === 404) {
            return {status: "not-found"};
        }
        return {status: "error", error: this.extractError(result.body)};
    }

    private translateSpinResult(result: RuntimeHttpResult): StudioRuntimeSpinResult {
        if (result.status === 200) {
            return {status: "ok", session: this.buildSessionView(result.body)};
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
}
