import crypto from "crypto";
import http, {IncomingMessage, ServerResponse} from "http";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import type {PokieGameContext} from "../gamepackage/PokieGameContext.js";
import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {PokieDevServerAddress} from "./PokieDevServerAddress.js";
import type {PokieDevServerHandling} from "./PokieDevServerHandling.js";
import type {PokieDevServerOptions} from "./PokieDevServerOptions.js";
import type {PokieDevSessionResponse} from "./PokieDevSessionResponse.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

type SessionWithScreen = GameSessionHandling & {
    getSymbolsCombination(): {toMatrix(transposed?: boolean): unknown[][]};
};

// The first experimental "pokie serve": a local/dev reference HTTP server over a single loaded
// PokieGame, with sessions kept in memory for the lifetime of the process. Deliberately has no
// wallet, real-money, auth, RGS, or operator logic — see docs/cli.md.
export class PokieDevServer implements PokieDevServerHandling {
    private readonly game: PokieGame;
    private readonly host: string;
    private readonly port: number;
    private readonly sessions = new Map<string, GameSessionHandling>();
    private server: http.Server | undefined;

    constructor(game: PokieGame, options: PokieDevServerOptions = {}) {
        this.game = game;
        this.host = options.host ?? DEFAULT_HOST;
        this.port = options.port ?? DEFAULT_PORT;
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

        if (method === "POST" && spinSessionId !== undefined) {
            this.handleSpin(spinSessionId, res);
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
        this.sessions.set(sessionId, session);

        this.sendJson(res, 201, this.buildSessionResponse(sessionId, session));
    }

    private handleSpin(sessionId: string, res: ServerResponse): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            this.sendJson(res, 404, {error: `Unknown sessionId "${sessionId}".`});
            return;
        }

        session.play();
        this.sendJson(res, 200, this.buildSessionResponse(sessionId, session, session.getWinAmount()));
    }

    private buildSessionResponse(sessionId: string, session: GameSessionHandling, win?: number): PokieDevSessionResponse {
        const manifest = this.game.getManifest();
        const response: PokieDevSessionResponse = {
            sessionId,
            game: {id: manifest.id, name: manifest.name, version: manifest.version},
            bet: session.getBet(),
            credits: session.getCreditsAmount(),
        };
        if (win !== undefined) {
            response.win = win;
        }
        const screen = this.captureScreen(session);
        if (screen !== null) {
            response.screen = screen;
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
