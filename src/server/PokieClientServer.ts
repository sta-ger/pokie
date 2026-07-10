import fs from "fs";
import http, {IncomingMessage, ServerResponse} from "http";
import path from "path";
import type {PokieClientServerHandling} from "./PokieClientServerHandling.js";
import type {PokieClientServerOptions} from "./PokieClientServerOptions.js";
import type {PokieDevServerAddress} from "./PokieDevServerAddress.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3100;
const DEFAULT_API_HOST = "127.0.0.1";
const DEFAULT_API_PORT = 3000;

const CONTENT_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
};

// The static half of the local preview workflow (see docs/cli.md): serves the browser client app
// (built from cli/client, a fixed, known, small set of files under `clientRoot`) plus one small
// GET /config endpoint telling that app which `pokie serve` API origin to talk to. Deliberately
// never starts or proxies to an API server itself — `pokie client` and `pokie serve` are two
// separately-run commands by design (see `pokie dev`, which runs both together). PokieDevServer is
// the one that needs CORS headers for this split-origin setup to work at all; this server serves
// same-origin static assets to the browser that requests them, so it needs none itself.
export class PokieClientServer implements PokieClientServerHandling {
    private readonly clientRoot: string;
    private readonly host: string;
    private readonly port: number;
    private readonly apiAddress: {host: string; port: number};
    private server: http.Server | undefined;

    constructor(clientRoot: string, options: PokieClientServerOptions = {}) {
        this.clientRoot = path.resolve(clientRoot);
        this.host = options.host ?? DEFAULT_HOST;
        this.port = options.port ?? DEFAULT_PORT;
        this.apiAddress = options.apiAddress ?? {host: DEFAULT_API_HOST, port: DEFAULT_API_PORT};
    }

    public start(): Promise<PokieDevServerAddress> {
        return new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });
            server.once("error", reject);
            server.listen(this.port, this.host, () => {
                const address = server.address();
                if (address === null || typeof address === "string") {
                    reject(new Error("Failed to determine the client server's bound address."));
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

    private handleRequest(req: IncomingMessage, res: ServerResponse): void {
        const url = new URL(req.url ?? "/", "http://localhost");

        if (req.method === "GET" && url.pathname === "/config") {
            this.sendJson(res, 200, {apiBaseUrl: `http://${this.apiAddress.host}:${this.apiAddress.port}`});
            return;
        }

        if (req.method !== "GET") {
            this.sendJson(res, 405, {error: `Method not allowed: ${req.method ?? "?"}.`});
            return;
        }

        const filePath = this.resolveStaticFilePath(url.pathname);
        if (filePath === undefined) {
            this.sendJson(res, 404, {error: `Not found: ${url.pathname}`});
            return;
        }
        this.sendFile(res, filePath);
    }

    // Safe-by-construction: resolves the decoded pathname under `clientRoot`, then rejects anything
    // whose resolved absolute path doesn't stay under that root (path traversal via "..", encoded
    // separators, etc.). `clientRoot` only ever holds a small, fixed, known set of built assets —
    // not user-supplied filenames — so this containment check is sufficient (unlike
    // FileSessionRepository's untrusted-sessionId case, no filename hashing is needed here).
    private resolveStaticFilePath(pathname: string): string | undefined {
        const decodedPath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
        const resolved = path.resolve(this.clientRoot, `.${decodedPath}`);
        const rootWithSep = this.clientRoot.endsWith(path.sep) ? this.clientRoot : this.clientRoot + path.sep;
        if (resolved !== this.clientRoot && !resolved.startsWith(rootWithSep)) {
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
