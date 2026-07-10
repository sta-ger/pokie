import crypto from "crypto";
import http, {IncomingMessage, ServerResponse} from "http";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import type {PokieGameContext} from "../gamepackage/PokieGameContext.js";
import type {BuildableFromSessionState} from "../session/BuildableFromSessionState.js";
import type {ConvertableToSessionState} from "../session/ConvertableToSessionState.js";
import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {PokieDevServerAddress} from "./PokieDevServerAddress.js";
import type {PokieDevServerHandling} from "./PokieDevServerHandling.js";
import type {PokieDevServerOptions} from "./PokieDevServerOptions.js";
import type {PokieDevSessionResponse} from "./PokieDevSessionResponse.js";
import {InMemorySessionRepository} from "./session/InMemorySessionRepository.js";
import type {PokieSessionState} from "./session/PokieSessionState.js";
import type {SessionRepository} from "./session/SessionRepository.js";
import {InMemoryWallet} from "./wallet/InMemoryWallet.js";
import type {WalletPort} from "./wallet/WalletPort.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

type SessionWithScreen = GameSessionHandling & {
    getSymbolsCombination(): {toMatrix(transposed?: boolean): unknown[][]};
};

// The first experimental "pokie serve": a local/dev reference HTTP server over a single loaded
// PokieGame. Deliberately has no real-money, auth, RGS, or operator logic — see docs/cli.md.
//
// Game state (bet/win/screen, plus a game's own opaque featureState — see ConvertableToSessionState/
// BuildableFromSessionState below) goes through a replaceable SessionRepository —
// InMemorySessionRepository by default, or a FileSessionRepository so it survives a restart. Credits
// go through a separate WalletPort (InMemoryWallet by default) and are deliberately never part of the
// persisted session state. `liveSessions` is neither of those: it's a process-local cache of
// already-constructed GameSessionHandling objects, needed because play() has to run against a real
// session object, not a plain state snapshot — a cache miss (e.g. after a restart) reconstructs one
// from the repository's state via `game.createSession()`, then restores its featureState if the game
// implements BuildableFromSessionState (snapshot-only fallback if it doesn't).
export class PokieDevServer implements PokieDevServerHandling {
    private readonly game: PokieGame;
    private readonly host: string;
    private readonly port: number;
    private readonly sessionRepository: SessionRepository;
    private readonly wallet: WalletPort;
    private readonly liveSessions = new Map<string, GameSessionHandling>();
    private server: http.Server | undefined;

    constructor(game: PokieGame, options: PokieDevServerOptions = {}) {
        this.game = game;
        this.host = options.host ?? DEFAULT_HOST;
        this.port = options.port ?? DEFAULT_PORT;
        this.sessionRepository = options.sessionRepository ?? new InMemorySessionRepository();
        this.wallet = options.wallet ?? new InMemoryWallet();
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
            await this.handleSpin(spinSessionId, res);
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
        this.liveSessions.set(sessionId, session);

        // The wallet is the sole source of truth for a new session's starting balance (its
        // InMemoryWallet.initialBalance, or whatever a custom WalletPort.getBalance() returns for an
        // id it's never seen) — the session's own default credits are never written back into it.
        session.setCreditsAmount(await this.wallet.getBalance(sessionId));

        const state: PokieSessionState = {context, bet: session.getBet(), win: session.getWinAmount()};
        const screen = this.captureScreen(session);
        if (screen !== null) {
            state.screen = screen;
        }
        const featureState = this.captureFeatureState(session);
        if (featureState !== undefined) {
            state.featureState = featureState;
        }
        await this.sessionRepository.save(sessionId, state);

        const credits = await this.wallet.getBalance(sessionId);
        this.sendJson(res, 201, this.buildSessionResponse(sessionId, state, credits));
    }

    private async handleSpin(sessionId: string, res: ServerResponse): Promise<void> {
        const state = await this.sessionRepository.load(sessionId);
        if (!state) {
            this.sendJson(res, 404, {error: `Unknown sessionId "${sessionId}".`});
            return;
        }

        let session = this.liveSessions.get(sessionId);
        if (!session) {
            session = this.game.createSession(state.context);
            session.setBet(state.bet);
            this.restoreFeatureState(session, state.featureState);
            this.liveSessions.set(sessionId, session);
        }

        session.setCreditsAmount(await this.wallet.getBalance(sessionId));
        session.play();
        const win = session.getWinAmount();
        await this.wallet.setBalance(sessionId, session.getCreditsAmount());

        const newState: PokieSessionState = {context: state.context, bet: session.getBet(), win};
        const screen = this.captureScreen(session);
        if (screen !== null) {
            newState.screen = screen;
        }
        const featureState = this.captureFeatureState(session);
        if (featureState !== undefined) {
            newState.featureState = featureState;
        }
        await this.sessionRepository.save(sessionId, newState);

        const credits = await this.wallet.getBalance(sessionId);
        this.sendJson(res, 200, this.buildSessionResponse(sessionId, newState, credits, win));
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

    private captureScreen(session: GameSessionHandling): unknown[][] | null {
        if (!this.hasSymbolsCombination(session)) {
            return null;
        }
        return session.getSymbolsCombination().toMatrix();
    }

    private hasSymbolsCombination(session: GameSessionHandling): session is SessionWithScreen {
        return typeof (session as Partial<SessionWithScreen>).getSymbolsCombination === "function";
    }

    private captureFeatureState(session: GameSessionHandling): unknown {
        if (!this.canCaptureSessionState(session)) {
            return undefined;
        }
        return session.toSessionState();
    }

    private restoreFeatureState(session: GameSessionHandling, featureState: unknown): void {
        if (featureState === undefined || !this.canRestoreSessionState(session)) {
            return;
        }
        session.fromSessionState(featureState);
    }

    private canCaptureSessionState(
        session: GameSessionHandling,
    ): session is GameSessionHandling & ConvertableToSessionState {
        return typeof (session as Partial<ConvertableToSessionState>).toSessionState === "function";
    }

    private canRestoreSessionState(
        session: GameSessionHandling,
    ): session is GameSessionHandling & BuildableFromSessionState {
        return typeof (session as Partial<BuildableFromSessionState>).fromSessionState === "function";
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
