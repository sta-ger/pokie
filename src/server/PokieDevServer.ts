import crypto from "crypto";
import http, {IncomingMessage, ServerResponse} from "http";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import type {PokieGameContext} from "../gamepackage/PokieGameContext.js";
import type {GameSessionSerializing} from "../net/GameSessionSerializing.js";
import {PreGeneratedRoundResultProjector} from "../pregenerated/PreGeneratedRoundResultProjector.js";
import {computeWeightedOutcomeLibraryHash} from "../weightedoutcome/computeWeightedOutcomeLibraryHash.js";
import type {WeightedOutcomeLibrary} from "../weightedoutcome/WeightedOutcomeLibrary.js";
import type {PokieDevServerAddress} from "./PokieDevServerAddress.js";
import type {PokieDevServerHandling} from "./PokieDevServerHandling.js";
import type {PokieDevServerOptions} from "./PokieDevServerOptions.js";
import type {PokieDevSessionResponse} from "./PokieDevSessionResponse.js";
import type {PokieInternalSessionData} from "./PokieInternalSessionData.js";
import {InMemoryIdempotencyRepository} from "./idempotency/InMemoryIdempotencyRepository.js";
import {InMemoryPreGeneratedSessionRepository} from "./pregenerated/InMemoryPreGeneratedSessionRepository.js";
import {PreGeneratedLibraryProvenanceMismatchError} from "./pregenerated/PreGeneratedLibraryProvenanceMismatchError.js";
import type {PreGeneratedSessionRepository} from "./pregenerated/PreGeneratedSessionRepository.js";
import type {PreGeneratedSessionResponse} from "./pregenerated/PreGeneratedSessionResponse.js";
import {PreGeneratedSpinCommandHandler} from "./pregenerated/PreGeneratedSpinCommandHandler.js";
import type {PreGeneratedSpinCommandHandling} from "./pregenerated/PreGeneratedSpinCommandHandling.js";
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
// status, meaning either a versioned sessionRepository rejected this attempt because the session's
// version moved between load and save (mainly a repository shared across multiple PokieDevServer
// instances/processes), or the request itself declared an `expectedSessionVersion` that no longer
// matches — see SpinCommandHandling.handle()'s own doc comment for the distinction.
//
// Pre-generated rounds (additive, opt-in-only — see PokieDevServerOptions.preGeneratedOutcomeLibrary):
// when a WeightedOutcomeLibrary is configured, two further routes become active in their own separate
// namespace, `POST /pregenerated-sessions` and `POST /pregenerated-sessions/:id/spin`, drawing rounds
// from that fixed, already-built library (see WeightedOutcomeSelector/PreGeneratedSpinCommandHandler)
// instead of running the loaded game's own calculation path — no live GameSessionHandling is ever
// created for these. They share the same wallet/idempotency machinery as the live spin path (an
// explicitly configured `wallet` is reused as-is; the default is this server's own InMemoryWallet) and
// the same public/internal response split (PreGeneratedRoundResultProjector, `?debug=1`). Without
// `preGeneratedOutcomeLibrary`, both routes 404 exactly like any other unknown route — the existing
// `/sessions` routes are entirely unaffected either way.
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
    private readonly preGeneratedOutcomeLibrary: WeightedOutcomeLibrary | undefined;
    private readonly preGeneratedLibraryHash: string | undefined;
    private readonly preGeneratedSessionRepository: PreGeneratedSessionRepository | undefined;
    private readonly preGeneratedSpinCommandHandler: PreGeneratedSpinCommandHandling | undefined;
    private readonly preGeneratedProjector = new PreGeneratedRoundResultProjector();
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

        if (options.preGeneratedOutcomeLibrary !== undefined) {
            this.assertLibraryMatchesGameManifest(options.preGeneratedOutcomeLibrary, game.getManifest());
            this.preGeneratedOutcomeLibrary = options.preGeneratedOutcomeLibrary;
            this.preGeneratedLibraryHash = computeWeightedOutcomeLibraryHash(options.preGeneratedOutcomeLibrary);
            this.preGeneratedSessionRepository = options.preGeneratedSessionRepository ?? new InMemoryPreGeneratedSessionRepository();
            this.preGeneratedSpinCommandHandler = new PreGeneratedSpinCommandHandler(
                options.preGeneratedOutcomeLibrary,
                this.preGeneratedLibraryHash,
                transactionalWallet,
                this.preGeneratedSessionRepository,
                options.preGeneratedIdempotencyRepository ?? new InMemoryIdempotencyRepository(),
            );
        }
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

        // Own separate namespace (`/pregenerated-sessions`) — never overlaps with the `/sessions`
        // routes above, so this is a purely additive branch with no effect on the existing routes.
        if (method === "POST" && url.pathname === "/pregenerated-sessions") {
            await this.handleCreatePreGeneratedSession(req, res);
            return;
        }

        const preGeneratedSpinSessionId = this.matchPreGeneratedSpinRoute(url.pathname);
        if (method === "POST" && preGeneratedSpinSessionId !== undefined) {
            await this.handlePreGeneratedSpin(preGeneratedSpinSessionId, req, res, includeInternal);
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

    private matchPreGeneratedSpinRoute(pathname: string): string | undefined {
        const segments = pathname.split("/").filter((segment) => segment.length > 0);
        if (segments.length === 3 && segments[0] === "pregenerated-sessions" && segments[2] === "spin") {
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
        let spinRequest: {requestId?: string; expectedVersion?: number};
        try {
            spinRequest = await this.readSpinRequest(req);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.spinCommandHandler.handle(sessionId, spinRequest.requestId, spinRequest.expectedVersion);

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

    // Fails fast, before the server can ever start(): every outcome in a WeightedOutcomeLibrary shares
    // the same provenance.game (guaranteed by buildWeightedOutcomeLibrary's own homogeneity check), so
    // checking the first outcome is enough to catch a library built for a different game or a different
    // version of this one — a configuration mistake that must never surface as a served round instead of
    // a clear startup error.
    private assertLibraryMatchesGameManifest(library: WeightedOutcomeLibrary, manifest: {id: string; version: string}): void {
        const provenanceGame = library.outcomes[0]?.artifact.provenance.game;
        if (provenanceGame === undefined || provenanceGame.id !== manifest.id || provenanceGame.version !== manifest.version) {
            throw new PreGeneratedLibraryProvenanceMismatchError(
                `preGeneratedOutcomeLibrary "${library.libraryId}" was built for game ` +
                    `${JSON.stringify(provenanceGame)}, but the loaded game's manifest is ` +
                    `{id: ${JSON.stringify(manifest.id)}, version: ${JSON.stringify(manifest.version)}}.`,
            );
        }
    }

    // Creates a pre-generated session — no live GameSessionHandling is ever constructed for this path
    // (see the class doc comment, "Pre-generated rounds"). 404s (rather than 400) when no
    // preGeneratedOutcomeLibrary was configured, same as any other route this server doesn't have.
    private async handleCreatePreGeneratedSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (!this.preGeneratedSpinCommandHandler || !this.preGeneratedSessionRepository || !this.preGeneratedOutcomeLibrary) {
            this.sendJson(res, 404, {error: "Not found: POST /pregenerated-sessions"});
            return;
        }

        let request: {seed?: string; initialBalance?: number};
        try {
            request = await this.readCreatePreGeneratedSessionRequest(req);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const sessionId = crypto.randomUUID();
        const seed = request.seed ?? crypto.randomUUID();
        await this.preGeneratedSessionRepository.save(sessionId, {
            libraryId: this.preGeneratedOutcomeLibrary.libraryId,
            libraryHash: this.preGeneratedLibraryHash!,
            seed,
            roundsPlayed: 0,
        });
        // Unlike a live session, there's no session-side "default credits" to seed the wallet from —
        // an explicit `initialBalance` in the request body is the only way to start above the wallet's
        // own default (0 for the default InMemoryWallet, or whatever a caller-configured wallet already
        // returns for an id it's never seen).
        if (request.initialBalance !== undefined) {
            await this.wallet.setBalance(sessionId, request.initialBalance);
        }

        const credits = await this.wallet.getBalance(sessionId);
        const response: PreGeneratedSessionResponse = {sessionId, game: this.preGeneratedGameSummary(), credits};
        this.sendJson(res, 201, response);
    }

    private async handlePreGeneratedSpin(
        sessionId: string,
        req: IncomingMessage,
        res: ServerResponse,
        includeInternal: boolean,
    ): Promise<void> {
        if (!this.preGeneratedSpinCommandHandler) {
            this.sendJson(res, 404, {error: `Not found: POST /pregenerated-sessions/${sessionId}/spin`});
            return;
        }

        let requestId: string | undefined;
        try {
            ({requestId} = await this.readSpinRequest(req));
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const result = await this.preGeneratedSpinCommandHandler.handle(sessionId, requestId);
        if (result.status === "not-found") {
            this.sendJson(res, 404, {error: `Unknown sessionId "${sessionId}".`});
            return;
        }

        if (result.status === "conflict") {
            // Either a session/library mismatch (caught before anything was applied) or a versioned
            // PreGeneratedSessionRepository rejecting this attempt's save because the session's version
            // moved between load and save — see PreGeneratedSpinCommandResult's own doc comment for the
            // distinction. Every wallet transaction this attempt applied was already reversed by
            // PreGeneratedSpinCommandHandler before returning this, so there's nothing to roll back here;
            // the client should retry.
            this.sendJson(res, 409, {error: result.reason});
            return;
        }

        const publicView = this.preGeneratedProjector.projectPublic(result.result);
        const response: PreGeneratedSessionResponse = {...publicView, game: this.preGeneratedGameSummary()};
        if (includeInternal) {
            response.internal = this.preGeneratedProjector.projectInternal(result.result);
        }
        this.sendJson(res, 200, response);
    }

    private preGeneratedGameSummary(): {id: string; name: string; version: string} {
        const manifest = this.game.getManifest();
        return {id: manifest.id, name: manifest.name, version: manifest.version};
    }

    private async readCreatePreGeneratedSessionRequest(req: IncomingMessage): Promise<{seed?: string; initialBalance?: number}> {
        const raw = await this.readBody(req);
        if (!raw) {
            return {};
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            throw new Error("Request body is not valid JSON.");
        }
        if (parsed === null || typeof parsed !== "object") {
            return {};
        }

        const {seed, initialBalance} = parsed as {seed?: unknown; initialBalance?: unknown};
        if (seed !== undefined && typeof seed !== "string") {
            throw new Error('"seed" must be a string.');
        }
        if (initialBalance !== undefined && (typeof initialBalance !== "number" || !Number.isFinite(initialBalance))) {
            throw new Error('"initialBalance" must be a finite number.');
        }

        return {seed: seed as string | undefined, initialBalance: initialBalance as number | undefined};
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

    // `requestId` (idempotency, see the class doc comment) and `expectedVersion` (a caller-declared
    // optimistic-locking precondition — see SpinCommandHandling.handle()'s own doc comment) are both
    // optional and read from the same JSON body.
    private async readSpinRequest(req: IncomingMessage): Promise<{requestId?: string; expectedVersion?: number}> {
        const raw = await this.readBody(req);
        if (!raw) {
            return {};
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            throw new Error("Request body is not valid JSON.");
        }
        if (parsed === null || typeof parsed !== "object") {
            return {};
        }

        const {requestId, expectedSessionVersion} = parsed as {requestId?: unknown; expectedSessionVersion?: unknown};

        if (requestId !== undefined && typeof requestId !== "string") {
            throw new Error('"requestId" must be a string.');
        }

        if (
            expectedSessionVersion !== undefined &&
            (typeof expectedSessionVersion !== "number" || !Number.isInteger(expectedSessionVersion) || expectedSessionVersion < 1)
        ) {
            throw new Error('"expectedSessionVersion" must be a positive integer.');
        }

        return {
            requestId: requestId as string | undefined,
            expectedVersion: expectedSessionVersion as number | undefined,
        };
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
