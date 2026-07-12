import {GamePackageInspecting, GamePackageInspector, loadPokieGame, PokieDevServerAddress, PokieGamePackageValidating, PokieGamePackageValidator} from "pokie";
import fs from "fs";
import http, {IncomingMessage, ServerResponse} from "http";
import path from "path";
import type {GamePackageCreating} from "../scaffold/GamePackageCreating.js";
import {InMemoryRecentProjectsRepository} from "./InMemoryRecentProjectsRepository.js";
import {loadProjectDashboardContext} from "./loadProjectDashboardContext.js";
import type {ProjectDashboardContext} from "./ProjectDashboardContext.js";
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
// The Project Dashboard (GET /api/project/context, /api/project/inspect, /api/project/validate) is
// the first real Project-mode feature built on top of that stub — see docs/cli.md. It reuses
// GamePackageInspecting/PokieGamePackageValidating exactly as `pokie inspect`/`pokie validate` do,
// and loadPokieGame exactly as Open Project already did — no business logic is duplicated, and no
// CLI command is ever spawned as a subprocess.
export class StudioServer implements StudioServerHandling {
    private readonly host: string;
    private readonly port: number;
    private readonly studioRoot: string;
    private readonly recentProjectsRepository: RecentProjectsRepository;
    private readonly gamePackageCreator: GamePackageCreating;
    private readonly loadGame: typeof loadPokieGame;
    private readonly gamePackageInspector: GamePackageInspecting;
    private readonly gamePackageValidator: PokieGamePackageValidating;
    private readonly toolHandlers: StudioToolHandling[];
    private currentContext: StudioContext;
    // undefined exactly when currentContext.mode === "home" — kept as a separate field (rather than
    // folded into StudioContext) since StudioContext is also returned synchronously by
    // create/open/close, while this can lag behind briefly after startup (see start()'s background
    // load for `pokie .`/`pokie <path>`).
    private projectDashboard: ProjectDashboardContext | undefined;
    private server: http.Server | undefined;

    constructor(options: StudioServerOptions) {
        this.host = options.host ?? DEFAULT_HOST;
        this.port = options.port ?? DEFAULT_PORT;
        this.studioRoot = path.resolve(options.studioRoot);
        this.recentProjectsRepository = options.recentProjectsRepository ?? new InMemoryRecentProjectsRepository();
        this.gamePackageCreator = options.gamePackageCreator;
        this.loadGame = options.loadGame ?? loadPokieGame;
        this.gamePackageInspector = options.gamePackageInspector ?? new GamePackageInspector();
        this.gamePackageValidator = options.gamePackageValidator ?? new PokieGamePackageValidator();
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
                // Deliberately not awaited: the HTTP server must be reachable immediately (the
                // browser opens right away — see StudioCommand), not block on loading the entry
                // module. GET /api/project/context reports "loading" for the brief window until this
                // settles into "loaded"/"error" — see loadProjectDashboardContext.
                if (this.currentContext.mode === "project") {
                    this.startProjectDashboardLoad(this.currentContext.projectRoot);
                }
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

    private startProjectDashboardLoad(projectRoot: string): void {
        this.projectDashboard = {status: "loading", projectRoot};
        loadProjectDashboardContext(projectRoot, this.loadGame)
            .then((dashboard) => {
                this.projectDashboard = dashboard;
            })
            .catch(() => {
                // loadProjectDashboardContext itself never rejects (it catches internally) — this is
                // an extra safety net only, so a StudioServer never crashes on a background load.
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
            this.projectDashboard = undefined;
            this.sendJson(res, 200, {context: this.currentContext});
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/context") {
            this.sendJson(res, 200, this.projectDashboard ?? {status: "empty"});
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/inspect") {
            this.handleInspectProject(res);
            return;
        }

        if (method === "GET" && url.pathname === "/api/project/validate") {
            await this.handleValidateProject(res);
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
        // No separate load needed: GamePackageCreating.create() already returned a trustworthy
        // manifest without needing to execute the (likely not yet built) scaffolded entry module —
        // see loadProjectDashboardContext's own doc comment for why Open, which has no such manifest
        // in hand up front, goes through an actual load instead.
        this.projectDashboard = {status: "loaded", projectRoot: result.projectRoot, game: result.manifest};
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

        // loadProjectDashboardContext only ever resolves "loaded" or "error" (see its own doc
        // comment) — "empty"/"loading" are exclusively synthesized elsewhere in this class — but the
        // check is spelled as `!== "loaded"` rather than `=== "error"` so TypeScript can narrow
        // `dashboard` to the "loaded" variant below without a cast.
        const dashboard = await loadProjectDashboardContext(projectRoot, this.loadGame);
        if (dashboard.status !== "loaded") {
            const message = dashboard.status === "error" ? dashboard.error : `Could not load "${projectRoot}".`;
            this.sendJson(res, 400, {error: message});
            return;
        }

        this.currentContext = {mode: "project", projectRoot: dashboard.projectRoot};
        this.projectDashboard = dashboard;
        await this.recentProjectsRepository.add({
            projectRoot: dashboard.projectRoot,
            name: dashboard.game.name,
            openedAt: new Date().toISOString(),
        });
        this.sendJson(res, 200, {context: this.currentContext, manifest: dashboard.game});
    }

    private handleInspectProject(res: ServerResponse): void {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        this.sendJson(res, 200, this.gamePackageInspector.inspect(this.currentContext.projectRoot));
    }

    private async handleValidateProject(res: ServerResponse): Promise<void> {
        if (this.currentContext.mode !== "project") {
            this.sendJson(res, 409, {error: "No active project."});
            return;
        }
        this.sendJson(res, 200, await this.gamePackageValidator.validate(this.currentContext.projectRoot));
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
