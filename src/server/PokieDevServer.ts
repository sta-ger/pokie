import crypto from "crypto";
import http, {IncomingMessage, ServerResponse} from "http";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import type {PokieGameContext} from "../gamepackage/PokieGameContext.js";
import type {GameSessionSerializing} from "../net/GameSessionSerializing.js";
import type {PokieDevServerAddress} from "./PokieDevServerAddress.js";
import type {PokieDevServerHandling} from "./PokieDevServerHandling.js";
import type {PokieDevServerOptions} from "./PokieDevServerOptions.js";
import type {PokieDevSessionResponse} from "./PokieDevSessionResponse.js";
import type {PokieInternalSessionData} from "./PokieInternalSessionData.js";
import {InMemoryIdempotencyRepository} from "./idempotency/InMemoryIdempotencyRepository.js";
import {captureInitialPokieSessionState} from "./session/captureInitialPokieSessionState.js";
import {InMemorySessionRepository} from "./session/InMemorySessionRepository.js";
import {isVersionedSessionRepository} from "./session/isVersionedSessionRepository.js";
import type {PokieSessionState} from "./session/PokieSessionState.js";
import {resolveGameSessionSerializer} from "./session/resolveGameSessionSerializer.js";
import type {SessionRepository} from "./session/SessionRepository.js";
import {SpinCommandHandler} from "./spin/SpinCommandHandler.js";
import type {SpinCommandHandling} from "./spin/SpinCommandHandling.js";
import {InMemoryWallet} from "./wallet/InMemoryWallet.js";
import {isTransactionalWalletPort} from "./wallet/isTransactionalWalletPort.js";
import {TransactionalWalletAdapter} from "./wallet/TransactionalWalletAdapter.js";
import type {WalletPort} from "./wallet/WalletPort.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

// The first experimental "pokie serve": a local/dev reference HTTP server over a single loaded
// PokieGame. Deliberately has no real-money, auth, RGS, or operator logic — see docs/cli.md.
//
// Game state (bet/win/screen, plus a game's own opaque featureState — see ConvertableToSessionState/
// BuildableFromSessionState below) goes through a replaceable SessionRepository —
// InMemorySessionRepository by default, or a FileSessionRepository so it survives a restart. Credits
// go through a separate WalletPort (InMemoryWallet by default) and are deliberately never part of the
// persisted session state.
//
// Response payload: if the loaded PokieGame implements the optional getSessionSerializer(), its
// net/ serializer's rich, game-specific output is used instead of this server's own narrow default
// DTO — see PokieDevSessionResponse and buildSessionResponse(). That rich payload is split in two:
// POST /sessions returns the serializer's getInitialData() output (captured once, at creation — see
// captureInitialPokieSessionState.ts), POST /sessions/:id/spin returns getRoundData()'s output for
// that round (captured after every play() — see captureRoundPokieSessionState.ts), and
// GET /sessions/:id returns the two merged (see mergeSerializedPayloads()) so a client reloading the
// page can fully restore its UI from one response.
// CORS headers are sent unconditionally on every response so a browser-based client served from a
// different origin (see `pokie client`) can read them.
//
// A live GameSessionHandling object — needed to actually run play() against, not just a state
// snapshot — is cached and reconstructed by SpinCommandHandler, which owns the spin endpoint's whole
// orchestration (idempotency, canPlayNextGame() gate, play(), wallet settlement, persistence). This
// server's own job is HTTP request/response translation plus session creation (POST /sessions),
// which primes SpinCommandHandler's live-session cache with the freshly constructed session so the
// very next spin against it reuses that exact object instead of reconstructing one from state.
//
// Public/internal response split: every endpoint below returns a public-only PokieDevSessionResponse
// by default — client-safe data only, exactly what buildSessionResponse() has always built. A
// request can explicitly opt into an additional `internal` field (`?debug=1`/`?debug=true` — see
// isInternalDataRequested()) carrying audit/dev-only data never sent otherwise: the session's raw
// PokieSessionState before/after the round, and, when the loaded game's serializer implements the
// optional getInitialDebugData()/getRoundDebugData() (see GameSessionSerializing), its debug-only
// payload — RNG info, reel stops, evaluator traces, whatever the game author chose to expose. POKIE
// is still not an RGS: this is a dev-friendly window into otherwise-hidden state, not an audit trail
// guarantee — see PokieInternalSessionData. When the configured sessionRepository additionally
// implements VersionedSessionRepository, `internal.sessionVersion` also carries that repository's
// own optimistic-locking revision for the session.
//
// A spin can also come back `409` instead of `200`/`400`/`404`: SpinCommandHandler's "conflict"
// status, meaning a versioned sessionRepository rejected this attempt because the session's version
// moved between load and save — see SpinCommandHandler's own doc comment for when this actually
// happens (mainly a repository shared across multiple PokieDevServer instances/processes).
export class PokieDevServer implements PokieDevServerHandling {
    private readonly game: PokieGame;
    private readonly host: string;
    private readonly port: number;
    private readonly sessionRepository: SessionRepository;
    private readonly wallet: WalletPort;
    // True only when the caller didn't pass a `wallet` option, i.e. this.wallet is our own default
    // InMemoryWallet. In that case a fresh session's own getCreditsAmount() seeds its wallet balance,
    // preserving pokie serve's original out-of-box behavior. A caller-supplied WalletPort (including
    // an explicitly constructed `new InMemoryWallet(initialBalance)`) is never seeded this way — it
    // stays the sole source of a new session's starting balance, see handleCreateSession.
    private readonly usesDefaultWallet: boolean;
    private readonly sessionSerializer: GameSessionSerializing | undefined;
    private readonly spinCommandHandler: SpinCommandHandling;
    private server: http.Server | undefined;

    constructor(game: PokieGame, options: PokieDevServerOptions = {}) {
        this.game = game;
        this.host = options.host ?? DEFAULT_HOST;
        this.port = options.port ?? DEFAULT_PORT;
        this.sessionRepository = options.sessionRepository ?? new InMemorySessionRepository();
        this.usesDefaultWallet = options.wallet === undefined;
        this.wallet = options.wallet ?? new InMemoryWallet();
        this.sessionSerializer = resolveGameSessionSerializer(game);
        // SpinCommandHandler always settles a spin through a TransactionalWalletPort. this.wallet
        // itself stays a plain WalletPort (the type PokieDevServerOptions has always exposed, so a
        // caller's existing custom implementation keeps compiling and working unchanged) — if it
        // doesn't already implement the transactional API natively (InMemoryWallet does), it's
        // wrapped in an adapter that gives it one via an in-memory transaction ledger.
        const transactionalWallet = isTransactionalWalletPort(this.wallet)
            ? this.wallet
            : new TransactionalWalletAdapter(this.wallet);
        this.spinCommandHandler = new SpinCommandHandler(
            this.game,
            this.sessionRepository,
            transactionalWallet,
            options.idempotencyRepository ?? new InMemoryIdempotencyRepository(),
        );
    }

    public start(): Promise<PokieDevServerAddress> {
        return new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                this.handleRequest(req, res).catch((error) => {
                    this.sendJson(res, 500, {error: error instanceof Error ? error.message : String(error)});
                });
            });
            server.once("error", reject);
            server.listen(this.port, this.host, () => {
                const address = server.address();
                if (address === null || typeof address === "string") {
                    reject(new Error("Failed to determine the dev server's bound address."));
                    return;
                }
                this.server = server;
                resolve({host: this.host, port: address.port});
            });
        });
    }

    public stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                resolve();
                return;
            }
            this.server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }

    private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const method = req.method ?? "GET";
        const url = new URL(req.url ?? "/", "http://localhost");
        const spinSessionId = this.matchSpinRoute(url.pathname);
        const sessionId = this.matchSessionRoute(url.pathname);

        // Unconditional, on every response (including errors): a browser-based client — e.g.
        // `pokie client`, served from a different origin/port by design (see docs/cli.md) — needs
        // these to read this API's responses at all, not just JSON bodies that happen to succeed.
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }

        if (method === "GET" && url.pathname === "/health") {
            this.sendJson(res, 200, {status: "ok"});
            return;
        }

        if (method === "GET" && url.pathname === "/game") {
            this.sendJson(res, 200, this.game.getManifest());
            return;
        }

        const includeInternal = this.isInternalDataRequested(url);

        if (method === "POST" && url.pathname === "/sessions") {
            await this.handleCreateSession(req, res, includeInternal);
            return;
        }

        if (method === "GET" && sessionId !== undefined) {
            await this.handleGetSession(sessionId, res, includeInternal);
            return;
        }

        if (method === "POST" && spinSessionId !== undefined) {
            await this.handleSpin(spinSessionId, req, res, includeInternal);
            return;
        }

        this.sendJson(res, 404, {error: `Not found: ${method} ${url.pathname}`});
    }

    // Explicit opt-in only: `?debug=1`/`?debug=true` on any of the three session endpoints below.
    // Anything else (absent, empty, any other value) keeps the response public-only — see
    // PokieDevSessionResponse/PokieInternalSessionData for what that split actually contains.
    private isInternalDataRequested(url: URL): boolean {
        const value = url.searchParams.get("debug");
        return value === "1" || value === "true";
    }

    private matchSpinRoute(pathname: string): string | undefined {
        const segments = pathname.split("/").filter((segment) => segment.length > 0);
        if (segments.length === 3 && segments[0] === "sessions" && segments[2] === "spin") {
            return decodeURIComponent(segments[1]);
        }
        return undefined;
    }

    private matchSessionRoute(pathname: string): string | undefined {
        const segments = pathname.split("/").filter((segment) => segment.length > 0);
        if (segments.length === 2 && segments[0] === "sessions") {
            return decodeURIComponent(segments[1]);
        }
        return undefined;
    }

    private async handleCreateSession(req: IncomingMessage, res: ServerResponse, includeInternal: boolean): Promise<void> {
        let context: PokieGameContext | undefined;
        try {
            context = await this.readSeedContext(req);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const session = this.game.createSession(context);
        const sessionId = crypto.randomUUID();
        this.spinCommandHandler.primeSession(sessionId, session);

        if (this.usesDefaultWallet) {
            // No wallet was configured: seed the default InMemoryWallet from this session's own
            // starting credits, same as pokie serve's original out-of-box behavior.
            await this.wallet.setBalance(sessionId, session.getCreditsAmount());
        } else {
            // A wallet was explicitly configured: it's the sole source of truth for a new session's
            // starting balance (its initialBalance, or whatever a custom WalletPort.getBalance()
            // returns for an id it's never seen) — the session's own default credits never overwrite it.
            session.setCreditsAmount(await this.wallet.getBalance(sessionId));
        }

        const state = captureInitialPokieSessionState(context, session, this.sessionSerializer);
        await this.sessionRepository.save(sessionId, state);

        const credits = await this.wallet.getBalance(sessionId);
        const response = this.buildSessionResponse(sessionId, state, credits, undefined, state.initialPayload);
        if (includeInternal) {
            // The save above always went through the plain save() (a fresh sessionId has no prior
            // version to be conditional on), so the version it landed at is read back separately here
            // — only under ?debug=1, never on the hot path.
            const version = isVersionedSessionRepository(this.sessionRepository)
                ? (await this.sessionRepository.loadVersioned(sessionId))?.version
                : undefined;
            response.internal = this.buildInternalSessionData(state, undefined, undefined, version);
        }
        this.sendJson(res, 201, response);
    }

    private async handleSpin(sessionId: string, req: IncomingMessage, res: ServerResponse, includeInternal: boolean): Promise<void> {
        let requestId: string | undefined;
        try {
            requestId = await this.readSpinRequestId(req);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.spinCommandHandler.handle(sessionId, requestId);

        if (result.status === "not-found") {
            this.sendJson(res, 404, {error: `Unknown sessionId "${sessionId}".`});
            return;
        }

        if (result.status === "blocked") {
            this.sendJson(res, 400, {error: result.reason});
            return;
        }

        if (result.status === "conflict") {
            // A versioned SessionRepository (see VersionedSessionRepository) rejected this attempt's
            // save because the session's version moved between load and save — e.g. a concurrent
            // attempt on another PokieDevServer instance sharing this repository committed first.
            // Every wallet transaction this attempt applied was already reversed by SpinCommandHandler
            // before returning this, so there's nothing to roll back here; the client should retry.
            this.sendJson(res, 409, {error: result.reason});
            return;
        }

        const response = this.buildSessionResponse(result.sessionId, result.state, result.credits, result.win, result.state.roundPayload);
        if (includeInternal) {
            response.internal = this.buildInternalSessionData(result.state, result.previousState, result.requestId, result.version);
        }
        this.sendJson(res, 200, response);
    }

    private async handleGetSession(sessionId: string, res: ServerResponse, includeInternal: boolean): Promise<void> {
        const supportsVersioning = isVersionedSessionRepository(this.sessionRepository);
        const versioned = supportsVersioning ? await this.sessionRepository.loadVersioned(sessionId) : undefined;
        const state = supportsVersioning ? versioned?.state : await this.sessionRepository.load(sessionId);
        if (!state) {
            this.sendJson(res, 404, {error: `Unknown sessionId "${sessionId}".`});
            return;
        }

        const credits = await this.wallet.getBalance(sessionId);
        const response = this.buildSessionResponse(sessionId, state, credits, state.win, this.mergeSerializedPayloads(state));
        if (includeInternal) {
            response.internal = this.buildInternalSessionData(state, undefined, undefined, versioned?.version);
        }
        this.sendJson(res, 200, response);
    }

    // GET /sessions/:id needs everything a client would need to fully restore its UI, so it merges
    // the session's own `initialPayload` (descriptive data — paytable, availableSymbols, ... —
    // captured once at creation) with its latest `roundPayload` (the actual last-round outcome),
    // round data winning on any overlapping key since it's the fresher of the two. Returns
    // undefined — not `{}` — when neither is present, so buildSessionResponse still takes the
    // legacy path for a game without a serializer instead of wrongly treating an empty object as a
    // "rich" payload.
    private mergeSerializedPayloads(state: PokieSessionState): Record<string, unknown> | undefined {
        if (state.initialPayload === undefined && state.roundPayload === undefined) {
            return undefined;
        }
        return {...state.initialPayload, ...state.roundPayload};
    }

    // The debug-payload counterpart to mergeSerializedPayloads() above — same merge, over
    // initialDebugPayload/roundDebugPayload instead. Only ever read when a request explicitly asked
    // for internal data (see isInternalDataRequested/buildInternalSessionData); never merged into the
    // public response.
    private mergeSerializedDebugPayloads(state: PokieSessionState): Record<string, unknown> | undefined {
        if (state.initialDebugPayload === undefined && state.roundDebugPayload === undefined) {
            return undefined;
        }
        return {...state.initialDebugPayload, ...state.roundDebugPayload};
    }

    // Builds the internal/debug companion to a public response — only ever called when a request
    // explicitly opted in via isInternalDataRequested(). `previousState`/`requestId` are only ever
    // given on a spin response (session creation and GET have neither a "before" state nor a
    // requestId of their own) — see PokieInternalSessionData's own doc comment for what each field
    // means.
    private buildInternalSessionData(
        state: PokieSessionState,
        previousState: PokieSessionState | undefined,
        requestId: string | undefined,
        sessionVersion: number | undefined,
    ): PokieInternalSessionData {
        const internal: PokieInternalSessionData = {stateAfter: state};
        if (previousState !== undefined) {
            internal.stateBefore = previousState;
        }
        const debugData = this.mergeSerializedDebugPayloads(state);
        if (debugData !== undefined) {
            internal.debugData = debugData;
        }
        if (requestId !== undefined) {
            internal.requestId = requestId;
        }
        if (sessionVersion !== undefined) {
            internal.sessionVersion = sessionVersion;
        }
        return internal;
    }

    private buildSessionResponse(
        sessionId: string,
        state: PokieSessionState,
        credits: number,
        win: number | undefined,
        serializedPayload: Record<string, unknown> | undefined,
    ): PokieDevSessionResponse {
        const manifest = this.game.getManifest();
        const game = {id: manifest.id, name: manifest.name, version: manifest.version};

        // Rich path: the loaded game provided a serializer (see PokieGame.getSessionSerializer).
        // `serializedPayload` is whichever of initialPayload/roundPayload/their merge the caller
        // determined is right for this endpoint (session creation/spin/restore respectively) — see
        // captureInitialPokieSessionState.ts/captureRoundPokieSessionState.ts and this class's own
        // handleCreateSession/handleSpin/handleGetSession. `credits` is always the authoritative
        // wallet balance, overriding whatever the serializer itself computed from
        // session.getCreditsAmount().
        if (serializedPayload !== undefined) {
            return {...serializedPayload, sessionId, game, credits};
        }

        // Legacy/default path: unchanged from before this game ever had the option of a serializer.
        const response: PokieDevSessionResponse = {sessionId, game, bet: state.bet, credits};
        if (win !== undefined) {
            response.win = win;
        }
        if (state.screen !== undefined) {
            response.screen = state.screen;
        }
        return response;
    }

    private async readSeedContext(req: IncomingMessage): Promise<PokieGameContext | undefined> {
        const raw = await this.readBody(req);
        if (!raw) {
            return undefined;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            throw new Error("Request body is not valid JSON.");
        }
        if (parsed === null || typeof parsed !== "object") {
            return undefined;
        }

        const {seed} = parsed as {seed?: unknown};
        if (seed === undefined) {
            return undefined;
        }
        if (typeof seed !== "string" && typeof seed !== "number") {
            throw new Error('"seed" must be a string or number.');
        }
        return {seed};
    }

    private async readSpinRequestId(req: IncomingMessage): Promise<string | undefined> {
        const raw = await this.readBody(req);
        if (!raw) {
            return undefined;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            throw new Error("Request body is not valid JSON.");
        }
        if (parsed === null || typeof parsed !== "object") {
            return undefined;
        }

        const {requestId} = parsed as {requestId?: unknown};
        if (requestId === undefined) {
            return undefined;
        }
        if (typeof requestId !== "string") {
            throw new Error('"requestId" must be a string.');
        }
        return requestId;
    }

    private readBody(req: IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            req.on("data", (chunk: Buffer) => chunks.push(chunk));
            req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
            req.on("error", reject);
        });
    }

    private sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
        const json = JSON.stringify(body);
        res.writeHead(statusCode, {"Content-Type": "application/json"});
        res.end(json);
    }
}
