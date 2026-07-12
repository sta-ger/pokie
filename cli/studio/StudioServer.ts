import {loadPokieGame, PokieDevServerAddress} from "pokie";
import fs from "fs";
import http, {IncomingMessage, ServerResponse} from "http";
import path from "path";
import type {GamePackageCreating} from "../scaffold/GamePackageCreating.js";
import {InMemoryRecentProjectsRepository} from "./InMemoryRecentProjectsRepository.js";
import type {RecentProjectsRepository} from "./RecentProjectsRepository.js";
import type {StudioContext} from "./StudioContext.js";
import type {StudioServerHandling} from "./StudioServerHandling.js";
import type {StudioServerOptions} from "./StudioServerOptions.js";
import type {StudioToolHandling} from "./StudioToolHandling.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3200;

const CONTENT_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
};

// The first minimal stage of POKIE Studio (see docs/cli.md): serves the studio-client app shell
// (built from cli/studio-client) plus a small same-origin JSON API. Unlike PokieDevServer/
// PokieClientServer (deliberately two separate origins for the dev/reference workflow), Studio's
// frontend and API share one server/origin — there's no split-origin CORS need here.
//
// Holds exactly one mutable `currentContext` for the lifetime of the process: a single Studio
// instance models one active local session, same single-user-local-tool assumption as
// PokieDevServer's own session/wallet state. Create/Open switch it to "project"; Close resets it to
// "home". This is intentionally not multi-tenant — a shared/remote Studio is out of scope, see
// docs/cli.md.
//
// Project mode itself is a stub at this stage: GET /api/context reports it and studio-client renders
// a placeholder view, but no tool (build/sim/serve/...) is wired up yet — that's what `toolHandlers`
// (see StudioToolHandling) is the extension point for.
export class StudioServer implements StudioServerHandling {
    private readonly host: string;
    private readonly port: number;
    private readonly studioRoot: string;
    private readonly recentProjectsRepository: RecentProjectsRepository;
    private readonly gamePackageCreator: GamePackageCreating;
    private readonly loadGame: typeof loadPokieGame;
    private readonly toolHandlers: StudioToolHandling[];
    private currentContext: StudioContext;
    private server: http.Server | undefined;

    constructor(options: StudioServerOptions) {
        this.host = options.host ?? DEFAULT_HOST;
        this.port = options.port ?? DEFAULT_PORT;
        this.studioRoot = path.resolve(options.studioRoot);
        this.recentProjectsRepository = options.recentProjectsRepository ?? new InMemoryRecentProjectsRepository();
        this.gamePackageCreator = options.gamePackageCreator;
        this.loadGame = options.loadGame ?? loadPokieGame;
        this.toolHandlers = options.toolHandlers ?? [];
        this.currentContext = options.initialContext ?? {mode: "home"};
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
                    reject(new Error("Failed to determine the studio server's bound address."));
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

        if (method === "GET" && url.pathname === "/api/health") {
            this.sendJson(res, 200, {status: "ok"});
            return;
        }

        if (method === "GET" && url.pathname === "/api/context") {
            this.sendJson(res, 200, this.currentContext);
            return;
        }

        if (method === "GET" && url.pathname === "/api/recent-projects") {
            this.sendJson(res, 200, await this.recentProjectsRepository.list());
            return;
        }

        if (method === "POST" && url.pathname === "/api/projects/create") {
            await this.handleCreateProject(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/projects/open") {
            await this.handleOpenProject(req, res);
            return;
        }

        if (method === "POST" && url.pathname === "/api/projects/close") {
            this.currentContext = {mode: "home"};
            this.sendJson(res, 200, {context: this.currentContext});
            return;
        }

        const toolId = this.matchToolRoute(url.pathname);
        if (toolId !== undefined) {
            const handled = await this.tryToolHandlers(toolId, method, url, req);
            if (handled !== undefined) {
                this.sendJson(res, handled.status, handled.body);
                return;
            }
        }

        if (method !== "GET") {
            this.sendJson(res, 404, {error: `Not found: ${method} ${url.pathname}`});
            return;
        }

        const filePath = this.resolveStaticFilePath(url.pathname);
        if (filePath === undefined) {
            this.sendJson(res, 404, {error: `Not found: ${url.pathname}`});
            return;
        }
        this.sendFile(res, filePath);
    }

    private matchToolRoute(pathname: string): string | undefined {
        const segments = pathname.split("/").filter((segment) => segment.length > 0);
        if (segments.length >= 3 && segments[0] === "api" && segments[1] === "tools") {
            return decodeURIComponent(segments[2]);
        }
        return undefined;
    }

    private async tryToolHandlers(
        toolId: string,
        method: string,
        url: URL,
        req: IncomingMessage,
    ): Promise<{status: number; body: unknown} | undefined> {
        const handler = this.toolHandlers.find((candidate) => candidate.getToolId() === toolId);
        if (handler === undefined) {
            return undefined;
        }
        const body = await this.readJsonBody(req);
        return handler.handle(this.currentContext, {method, url, body});
    }

    private async handleCreateProject(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        const name = (body as {name?: unknown} | undefined)?.name;
        if (typeof name !== "string" || name.trim().length === 0) {
            this.sendJson(res, 400, {error: '"name" is required.'});
            return;
        }

        let result;
        try {
            result = this.gamePackageCreator.create(process.cwd(), name);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        this.currentContext = {mode: "project", projectRoot: result.projectRoot};
        await this.recentProjectsRepository.add({
            projectRoot: result.projectRoot,
            name: result.manifest.name,
            openedAt: new Date().toISOString(),
        });
        this.sendJson(res, 201, {context: this.currentContext, manifest: result.manifest});
    }

    private async handleOpenProject(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.readJsonBody(req);
        const projectRoot = (body as {projectRoot?: unknown} | undefined)?.projectRoot;
        if (typeof projectRoot !== "string" || projectRoot.trim().length === 0) {
            this.sendJson(res, 400, {error: '"projectRoot" is required.'});
            return;
        }

        let manifest;
        try {
            const game = await this.loadGame(projectRoot);
            manifest = game.getManifest();
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const resolvedRoot = path.resolve(projectRoot);
        this.currentContext = {mode: "project", projectRoot: resolvedRoot};
        await this.recentProjectsRepository.add({
            projectRoot: resolvedRoot,
            name: manifest.name,
            openedAt: new Date().toISOString(),
        });
        this.sendJson(res, 200, {context: this.currentContext, manifest});
    }

    private async readJsonBody(req: IncomingMessage): Promise<unknown> {
        const raw = await this.readBody(req);
        if (!raw) {
            return undefined;
        }
        try {
            return JSON.parse(raw);
        } catch {
            return undefined;
        }
    }

    private readBody(req: IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            req.on("data", (chunk: Buffer) => chunks.push(chunk));
            req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
            req.on("error", reject);
        });
    }

    // Safe-by-construction, same containment approach as PokieClientServer.resolveStaticFilePath
    // (kept as its own copy here rather than a shared import — studioRoot and clientRoot are
    // different, independently-configured static asset roots with no other coupling).
    private resolveStaticFilePath(pathname: string): string | undefined {
        const decodedPath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
        const resolved = path.resolve(this.studioRoot, `.${decodedPath}`);
        const rootWithSep = this.studioRoot.endsWith(path.sep) ? this.studioRoot : this.studioRoot + path.sep;
        if (resolved !== this.studioRoot && !resolved.startsWith(rootWithSep)) {
            return undefined;
        }
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
            return undefined;
        }
        return resolved;
    }

    private sendFile(res: ServerResponse, filePath: string): void {
        const contentType = CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream";
        res.writeHead(200, {"Content-Type": contentType});
        res.end(fs.readFileSync(filePath));
    }

    private sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
        res.writeHead(statusCode, {"Content-Type": "application/json"});
        res.end(JSON.stringify(body));
    }
}
