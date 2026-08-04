import http, {IncomingMessage, ServerResponse} from "http";
import {SecureWeightedOutcomeRandomSource} from "../pregenerated/SecureWeightedOutcomeRandomSource.js";
import {SeededWeightedOutcomeRandomSource} from "../pregenerated/SeededWeightedOutcomeRandomSource.js";
import type {WeightedOutcomeRandomSource} from "../pregenerated/WeightedOutcomeRandomSource.js";
import type {PokieProject} from "../project/PokieProject.js";
import {sampleOutcomeSourceProject, OutcomeSourceSampleResult} from "../project/sampleOutcomeSourceProject.js";
import type {PokieDevServerAddress} from "./PokieDevServerAddress.js";
import type {PokieDevServerHandling} from "./PokieDevServerHandling.js";
import type {PokieDevServerOptions} from "./PokieDevServerOptions.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

type SampleFn = (project: PokieProject, modeName: string, randomSource: WeightedOutcomeRandomSource) => Promise<OutcomeSourceSampleResult>;

// The "pokie serve" counterpart to PokieDevServer for a resolved "outcomeLibrary" project, wired in by
// ServeCommand instead of PokieDevServer whenever a resolved packageRoot is a native outcome library (see
// ServeCommand's own routing) -- never loadPokieGame, never a live GameSessionHandling, never a regenerated
// game-model calculation. There is no game behind a pure outcome-library project to run play() against or
// report a manifest for, so this server is deliberately much narrower than PokieDevServer: a single mode's
// worth of stateless draws through the exact same OutcomeLibraryBundleOutcomeSource selector path
// PreGeneratedSpinCommandHandler/sampleOutcomeSourceProject already use in production, with no session,
// wallet, or credits concept of its own -- a caller wanting session/wallet semantics over pre-generated
// rounds already has that in PokieDevServer's own `preGeneratedOutcomeLibrary` option, layered on a real
// game. ServeCommand never constructs this for a "stakeAdapter" project -- that target is rejected with the
// structured outcomeSource.serve capability diagnostic before this class is ever reached (a "stakeAdapter"
// export has no draw contract at all -- see OUTCOME_SOURCE_SAMPLE_CAPABILITY's own doc comment).
export class OutcomeSourceDevServer implements PokieDevServerHandling {
    private readonly project: PokieProject;
    private readonly modeName: string;
    private readonly host: string;
    private readonly port: number;
    private readonly sample: SampleFn;
    private server: http.Server | undefined;

    constructor(
        project: PokieProject,
        modeName: string,
        options: PokieDevServerOptions = {},
        sample: SampleFn = sampleOutcomeSourceProject,
    ) {
        this.project = project;
        this.modeName = modeName;
        this.host = options.host ?? DEFAULT_HOST;
        this.port = options.port ?? DEFAULT_PORT;
        this.sample = sample;
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

        // Same rationale as PokieDevServer's own unconditional CORS headers -- a browser-based client
        // served from a different origin needs these to read this API's responses at all.
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

        if (method === "GET" && url.pathname === "/outcome-source") {
            this.sendJson(res, 200, {type: this.project.type, rootPath: this.project.rootPath, modeName: this.modeName});
            return;
        }

        if (method === "POST" && url.pathname === "/outcome-source/sample") {
            await this.handleSample(req, res);
            return;
        }

        this.sendJson(res, 404, {error: `Not found: ${method} ${url.pathname}`});
    }

    // Draws exactly one outcome per request -- there is no session to advance a round counter against,
    // so an explicit `seed` in the request body (rather than one derived from a session's own state, the
    // way PreGeneratedSpinCommandHandler derives one per round) is what makes a given draw reproducible;
    // omitting it draws from SecureWeightedOutcomeRandomSource instead, same default OutcomeSourceCommand's
    // own "sample" verb uses. Always 200: a well-formed request against a project this server was
    // constructed for is never expected to hit sample()'s own {supported: false} branch (ServeCommand
    // already rejected an unsupported project before ever constructing this server), but the response
    // still carries whatever sample() returns verbatim rather than assuming success.
    private async handleSample(req: IncomingMessage, res: ServerResponse): Promise<void> {
        let seed: string | undefined;
        try {
            seed = await this.readSeed(req);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const randomSource = seed !== undefined ? new SeededWeightedOutcomeRandomSource(seed) : new SecureWeightedOutcomeRandomSource();
        const result = await this.sample(this.project, this.modeName, randomSource);
        this.sendJson(res, 200, result);
    }

    private async readSeed(req: IncomingMessage): Promise<string | undefined> {
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
        if (typeof seed !== "string") {
            throw new Error('"seed" must be a string.');
        }
        return seed;
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
