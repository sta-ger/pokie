import http, {IncomingMessage, ServerResponse} from "http";
import {SecureWeightedOutcomeRandomSource} from "../pregenerated/SecureWeightedOutcomeRandomSource.js";
import {SeededWeightedOutcomeRandomSource} from "../pregenerated/SeededWeightedOutcomeRandomSource.js";
import type {WeightedOutcomeRandomSource} from "../pregenerated/WeightedOutcomeRandomSource.js";
import {PreGeneratedRoundResultProjector} from "../pregenerated/PreGeneratedRoundResultProjector.js";
import type {PreGeneratedRoundResult} from "../pregenerated/PreGeneratedRoundResult.js";
import {OutcomeLibraryBundleOutcomeSource} from "../weightedoutcome/bundle/OutcomeLibraryBundleOutcomeSource.js";
import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import type {PokieProject} from "../project/PokieProject.js";
import {sampleOutcomeSourceProject, OutcomeSourceSampleResult} from "../project/sampleOutcomeSourceProject.js";
import type {PokieDevServerAddress} from "./PokieDevServerAddress.js";
import type {PokieDevServerHandling} from "./PokieDevServerHandling.js";
import type {PokieDevServerOptions} from "./PokieDevServerOptions.js";
import {InMemoryIdempotencyRepository} from "./idempotency/InMemoryIdempotencyRepository.js";
import {InMemoryPreGeneratedSessionRepository} from "./pregenerated/InMemoryPreGeneratedSessionRepository.js";
import type {PreGeneratedSessionRepository} from "./pregenerated/PreGeneratedSessionRepository.js";
import {PreGeneratedSpinCommandHandler} from "./pregenerated/PreGeneratedSpinCommandHandler.js";
import type {PreGeneratedSpinCommandResult} from "./pregenerated/PreGeneratedSpinCommandResult.js";
import {InMemoryWallet} from "./wallet/InMemoryWallet.js";
import {isTransactionalWalletPort} from "./wallet/isTransactionalWalletPort.js";
import {TransactionalWalletAdapter} from "./wallet/TransactionalWalletAdapter.js";
import type {TransactionalWalletPort} from "./wallet/TransactionalWalletPort.js";
import {WalletInsufficientFundsError} from "./wallet/WalletInsufficientFundsError.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const DEFAULT_INITIAL_BALANCE = 1000;

type SampleFn = (project: PokieProject, modeName: string, randomSource: WeightedOutcomeRandomSource) => Promise<OutcomeSourceSampleResult>;
type GameSummary = {id: string; name: string; version: string};
type SpinRequest = {requestId?: string; bet?: number; mode?: string};
type RecordedRound = {result: PreGeneratedRoundResult; roundsPlayed: number};

// A native Outcome Library is a complete source of rounds, but it is not a loadable PokieGame. This
// server therefore implements the same Player-facing /sessions contract as PokieDevServer directly on
// PreGeneratedSpinCommandHandler and OutcomeLibraryBundleOutcomeSource. The latter reads the bundle's
// index and exact selected outcome record; it never invokes loadPokieGame or regenerates model math.
//
// /outcome-source/sample remains available as the explicitly stateless inspection endpoint. Normal
// Player traffic uses /sessions and /sessions/:id/spin, where the canonical pre-generated handler owns
// deterministic selection, wallet settlement, requestId idempotency, and the artifact's provenance.
export class OutcomeSourceDevServer implements PokieDevServerHandling {
    private readonly project: PokieProject;
    private readonly modeName: string;
    private readonly host: string;
    private readonly port: number;
    private readonly sample: SampleFn;
    private readonly reader = new OutcomeLibraryBundleReader();
    private readonly sessionRepository: PreGeneratedSessionRepository;
    private readonly wallet: TransactionalWalletPort;
    private readonly spinHandler: PreGeneratedSpinCommandHandler;
    private readonly projector = new PreGeneratedRoundResultProjector();
    private readonly roundsBySession = new Map<string, RecordedRound>();
    private readonly gameSummary: Promise<GameSummary>;
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
        this.sessionRepository = options.preGeneratedSessionRepository ?? new InMemoryPreGeneratedSessionRepository();
        const configuredWallet = options.wallet ?? new InMemoryWallet();
        this.wallet = isTransactionalWalletPort(configuredWallet) ? configuredWallet : new TransactionalWalletAdapter(configuredWallet);
        this.spinHandler = new PreGeneratedSpinCommandHandler(
            new OutcomeLibraryBundleOutcomeSource(project.rootPath, modeName),
            this.wallet,
            this.sessionRepository,
            options.preGeneratedIdempotencyRepository ?? new InMemoryIdempotencyRepository<PreGeneratedSpinCommandResult>(),
        );
        this.gameSummary = this.reader.readManifest(project.rootPath).then((manifest) => ({
            id: manifest.game.id,
            name: manifest.game.name,
            version: manifest.game.version,
        }));
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
            this.sendJson(res, 200, await this.gameSummary);
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
        if (method === "POST" && url.pathname === "/sessions") {
            await this.handleCreateSession(req, res);
            return;
        }

        const sessionId = this.matchSessionRoute(url.pathname);
        if (method === "GET" && sessionId !== undefined) {
            await this.handleGetSession(sessionId, res, this.isInternalDataRequested(url));
            return;
        }
        const spinSessionId = this.matchSpinRoute(url.pathname);
        if (method === "POST" && spinSessionId !== undefined) {
            await this.handleSpin(spinSessionId, req, res, this.isInternalDataRequested(url));
            return;
        }

        this.sendJson(res, 404, {error: `Not found: ${method} ${url.pathname}`});
    }

    private async handleSample(req: IncomingMessage, res: ServerResponse): Promise<void> {
        let seed: string | undefined;
        try {
            seed = await this.readSeed(req);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        const randomSource = seed !== undefined ? new SeededWeightedOutcomeRandomSource(seed) : new SecureWeightedOutcomeRandomSource();
        this.sendJson(res, 200, await this.sample(this.project, this.modeName, randomSource));
    }

    private async handleCreateSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
        let request: {seed?: string | number; initialBalance?: number};
        try {
            request = await this.readCreateSessionRequest(req);
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        // Capture the identity from this exact mode index at session creation. Every spin verifies it
        // against the same index/record read that selected its outcome, so a rebuilt bundle cannot
        // silently reinterpret an existing session.
        const index = await this.reader.readModeIndex(this.project.rootPath, this.modeName);
        const sessionId = crypto.randomUUID();
        await this.sessionRepository.save(sessionId, {
            libraryId: index.libraryId,
            libraryHash: index.libraryHash,
            seed: request.seed === undefined ? crypto.randomUUID() : String(request.seed),
            roundsPlayed: 0,
        });
        await this.wallet.setBalance(sessionId, request.initialBalance ?? DEFAULT_INITIAL_BALANCE);
        this.sendJson(res, 201, {sessionId, game: await this.gameSummary, credits: await this.wallet.getBalance(sessionId)});
    }

    private async handleGetSession(sessionId: string, res: ServerResponse, includeInternal: boolean): Promise<void> {
        const state = await this.sessionRepository.load(sessionId);
        if (state === undefined) {
            this.sendJson(res, 404, {error: `Unknown sessionId "${sessionId}".`});
            return;
        }

        const recorded = this.roundsBySession.get(sessionId);
        const response = recorded === undefined
            ? {sessionId, game: await this.gameSummary, credits: await this.wallet.getBalance(sessionId)}
            : await this.buildRoundResponse(recorded.result);
        if (includeInternal) {
            response.internal = recorded === undefined ? {session: state} : this.projector.projectInternal(recorded.result);
        }
        this.sendJson(res, 200, response);
    }

    private async handleSpin(sessionId: string, req: IncomingMessage, res: ServerResponse, includeInternal: boolean): Promise<void> {
        let request: SpinRequest;
        try {
            request = await this.readSpinRequest(req);
            if (request.bet !== undefined) {
                throw new Error('"bet" is not supported for a pre-generated outcome-library session; each selected artifact carries its canonical stake.');
            }
            if (request.mode !== undefined && request.mode !== this.modeName) {
                throw new Error(`"mode" must be "${this.modeName}" for this outcome-library server.`);
            }
        } catch (error) {
            this.sendJson(res, 400, {error: error instanceof Error ? error.message : String(error)});
            return;
        }

        let result: PreGeneratedSpinCommandResult;
        try {
            result = await this.spinHandler.handle(sessionId, request.requestId);
        } catch (error) {
            if (error instanceof WalletInsufficientFundsError) {
                this.sendJson(res, 400, {error: error.message});
                return;
            }
            throw error;
        }
        if (result.status === "not-found") {
            this.sendJson(res, 404, {error: `Unknown sessionId "${sessionId}".`});
            return;
        }
        if (result.status === "conflict") {
            this.sendJson(res, 409, {error: result.reason});
            return;
        }

        const state = await this.sessionRepository.load(sessionId);
        const previousRecord = this.roundsBySession.get(sessionId);
        // A repeated requestId may replay an older cached round after a later round has already been
        // served. It must return that original result, but must not replace the Player/GET session's
        // latest-round view with stale artifact data while its credits/state remain at the later round.
        if (
            state !== undefined &&
            (previousRecord === undefined ||
                state.roundsPlayed > previousRecord.roundsPlayed ||
                (state.roundsPlayed === previousRecord.roundsPlayed && result.result.runtime.roundId === previousRecord.result.runtime.roundId))
        ) {
            this.roundsBySession.set(sessionId, {result: result.result, roundsPlayed: state.roundsPlayed});
        }
        const response = await this.buildRoundResponse(result.result);
        if (includeInternal) {
            response.internal = this.projector.projectInternal(result.result);
        }
        this.sendJson(res, 200, response);
    }

    private async buildRoundResponse(result: PreGeneratedRoundResult): Promise<Record<string, unknown> & {internal?: unknown}> {
        return {...this.projector.projectPublic(result), game: await this.gameSummary, bet: result.artifact.stake};
    }

    private isInternalDataRequested(url: URL): boolean {
        const value = url.searchParams.get("debug");
        return value === "1" || value === "true";
    }

    private matchSessionRoute(pathname: string): string | undefined {
        const segments = pathname.split("/").filter((segment) => segment.length > 0);
        return segments.length === 2 && segments[0] === "sessions" ? decodeURIComponent(segments[1]) : undefined;
    }

    private matchSpinRoute(pathname: string): string | undefined {
        const segments = pathname.split("/").filter((segment) => segment.length > 0);
        return segments.length === 3 && segments[0] === "sessions" && segments[2] === "spin" ? decodeURIComponent(segments[1]) : undefined;
    }

    private async readSeed(req: IncomingMessage): Promise<string | undefined> {
        const parsed = await this.readJsonBody(req);
        if (parsed === undefined || parsed === null || typeof parsed !== "object") {
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

    private async readCreateSessionRequest(req: IncomingMessage): Promise<{seed?: string | number; initialBalance?: number}> {
        const parsed = await this.readJsonBody(req);
        if (parsed === undefined || parsed === null || typeof parsed !== "object") {
            return {};
        }
        const {seed, initialBalance} = parsed as {seed?: unknown; initialBalance?: unknown};
        if (seed !== undefined && typeof seed !== "string" && typeof seed !== "number") {
            throw new Error('"seed" must be a string or number.');
        }
        if (initialBalance !== undefined && (typeof initialBalance !== "number" || !Number.isFinite(initialBalance) || initialBalance < 0)) {
            throw new Error('"initialBalance" must be a finite number >= 0.');
        }
        return {seed: seed as string | number | undefined, initialBalance: initialBalance as number | undefined};
    }

    private async readSpinRequest(req: IncomingMessage): Promise<SpinRequest> {
        const parsed = await this.readJsonBody(req);
        if (parsed === undefined || parsed === null || typeof parsed !== "object") {
            return {};
        }
        const {requestId, bet, mode} = parsed as {requestId?: unknown; bet?: unknown; mode?: unknown};
        if (requestId !== undefined && typeof requestId !== "string") {
            throw new Error('"requestId" must be a string.');
        }
        if (bet !== undefined && typeof bet !== "number") {
            throw new Error('"bet" must be a number.');
        }
        if (mode !== undefined && typeof mode !== "string") {
            throw new Error('"mode" must be a string.');
        }
        return {requestId: requestId as string | undefined, bet: bet as number | undefined, mode: mode as string | undefined};
    }

    private async readJsonBody(req: IncomingMessage): Promise<unknown | undefined> {
        const raw = await this.readBody(req);
        if (!raw) {
            return undefined;
        }
        try {
            return JSON.parse(raw);
        } catch {
            throw new Error("Request body is not valid JSON.");
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

    private sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
        res.writeHead(statusCode, {"Content-Type": "application/json"});
        res.end(JSON.stringify(body));
    }
}
