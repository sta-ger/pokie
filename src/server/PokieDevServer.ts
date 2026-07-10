import crypto from "crypto";
import http, {IncomingMessage, ServerResponse} from "http";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import type {PokieGameContext} from "../gamepackage/PokieGameContext.js";
import type {PokieDevServerAddress} from "./PokieDevServerAddress.js";
import type {PokieDevServerHandling} from "./PokieDevServerHandling.js";
import type {PokieDevServerOptions} from "./PokieDevServerOptions.js";
import type {PokieDevSessionResponse} from "./PokieDevSessionResponse.js";
import {InMemoryIdempotencyRepository} from "./idempotency/InMemoryIdempotencyRepository.js";
import {capturePokieSessionState} from "./session/capturePokieSessionState.js";
import {InMemorySessionRepository} from "./session/InMemorySessionRepository.js";
import type {PokieSessionState} from "./session/PokieSessionState.js";
import type {SessionRepository} from "./session/SessionRepository.js";
import {SpinCommandHandler} from "./spin/SpinCommandHandler.js";
import type {SpinCommandHandling} from "./spin/SpinCommandHandling.js";
import {InMemoryWallet} from "./wallet/InMemoryWallet.js";
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
// A live GameSessionHandling object — needed to actually run play() against, not just a state
// snapshot — is cached and reconstructed by SpinCommandHandler, which owns the spin endpoint's whole
// orchestration (idempotency, canPlayNextGame() gate, play(), wallet settlement, persistence). This
// server's own job is HTTP request/response translation plus session creation (POST /sessions),
// which primes SpinCommandHandler's live-session cache with the freshly constructed session so the
// very next spin against it reuses that exact object instead of reconstructing one from state.
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
    private readonly spinCommandHandler: SpinCommandHandling;
    private server: http.Server | undefined;

    constructor(game: PokieGame, options: PokieDevServerOptions = {}) {
        this.game = game;
        this.host = options.host ?? DEFAULT_HOST;
        this.port = options.port ?? DEFAULT_PORT;
        this.sessionRepository = options.sessionRepository ?? new InMemorySessionRepository();
        this.usesDefaultWallet = options.wallet === undefined;
        this.wallet = options.wallet ?? new InMemoryWallet();
        this.spinCommandHandler = new SpinCommandHandler(
            this.game,
            this.sessionRepository,
            this.wallet,
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

        if (method === "GET" && url.pathname === "/health") {
            this.sendJson(res, 200, {status: "ok"});
            return;
        }

        if (method === "GET" && url.pathname === "/game") {
            this.sendJson(res, 200, this.game.getManifest());
            return;
        }

        if (method === "POST" && url.pathname === "/sessions") {
            await this.handleCreateSession(req, res);
            return;
        }

        if (method === "GET" && sessionId !== undefined) {
            await this.handleGetSession(sessionId, res);
            return;
        }

        if (method === "POST" && spinSessionId !== undefined) {
            await this.handleSpin(spinSessionId, req, res);
            return;
        }

        this.sendJson(res, 404, {error: `Not found: ${method} ${url.pathname}`});
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

    private async handleCreateSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
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

        const state = capturePokieSessionState(context, session);
        await this.sessionRepository.save(sessionId, state);

        const credits = await this.wallet.getBalance(sessionId);
        this.sendJson(res, 201, this.buildSessionResponse(sessionId, state, credits));
    }

    private async handleSpin(sessionId: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
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

        this.sendJson(res, 200, this.buildSessionResponse(result.sessionId, result.state, result.credits, result.win));
    }

    private async handleGetSession(sessionId: string, res: ServerResponse): Promise<void> {
        const state = await this.sessionRepository.load(sessionId);
        if (!state) {
            this.sendJson(res, 404, {error: `Unknown sessionId "${sessionId}".`});
            return;
        }

        const credits = await this.wallet.getBalance(sessionId);
        this.sendJson(res, 200, this.buildSessionResponse(sessionId, state, credits, state.win));
    }

    private buildSessionResponse(
        sessionId: string,
        state: PokieSessionState,
        credits: number,
        win?: number,
    ): PokieDevSessionResponse {
        const manifest = this.game.getManifest();
        const response: PokieDevSessionResponse = {
            sessionId,
            game: {id: manifest.id, name: manifest.name, version: manifest.version},
            bet: state.bet,
            credits,
        };
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
