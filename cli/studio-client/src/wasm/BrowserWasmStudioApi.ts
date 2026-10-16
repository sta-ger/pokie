import {PokieWasmWorkerClient, type PokieWasmWorkerPort, type PokieWasmWorkerProgress} from "../../../../src/wasm/PokieWasmWorkerClient.js";
import {validatePokieWasmBrowserArtifact, type PokieWasmBrowserArtifact} from "../../../../src/wasm/loadPokieWasmBrowserArtifact.js";
import type {PokieWasmFeatureSessionState, PokieWasmSessionState} from "../../../../src/wasm/PokieWasmRuntimeApi.js";
import type {StudioJobView} from "../api/types.js";
import type {FetchLike} from "../api/apiClient.js";

type Execution = {generation: number; publishing?: boolean; client: PokieWasmWorkerClient; artifact: PokieWasmBrowserArtifact; id: string; request: Record<string, unknown>; cancelled: boolean; progress?: PokieWasmWorkerProgress; timer?: ReturnType<typeof setTimeout>};
type Session = {client: PokieWasmWorkerClient; artifact: PokieWasmBrowserArtifact; seed: string; id: string; view: Record<string, unknown>; lastRequest?: string; lastBinding?: string; lastResult?: unknown};

type Publication = {url: string; binding: string; execution: Execution; view: Record<string, unknown>; output: unknown; fresh: boolean; old?: Session; failure?: {message: string; continuation: {roundId: string; cursor: number}; requestId?: string}};
class PlayFailure extends Error {
    public constructor(message: string, public readonly recovery: Record<string, unknown>) {
        super(message);
    }
}

/** One tab owns browser Workers. The server remains the durable job/report/round owner.
 * Existing API DTOs and poll hooks are reused, so reload discovers interrupted work without retrying it.
 */
export interface BrowserWasmStudioApiHandling {
    readonly fetch: FetchLike;
    dispose(beacon?: (url: string, body: string) => void): void;
}
export class BrowserWasmStudioApi implements BrowserWasmStudioApiHandling {
    private project: string | undefined;
    private generation = 0;
    private contextRequest = 0;
    private publication: Publication | undefined;
    private playRunning = false;
    private readonly owner = crypto.randomUUID();
    private readonly executions = new Map<string, Execution>();
    private session: Session | undefined;
    private sessionWatchGeneration = 0;
    private sessionWatch: ReturnType<typeof setTimeout> | undefined;
    private disposed = false;
    private readonly network: FetchLike;
    private readonly createWorker: () => PokieWasmWorkerPort;
    public constructor(network: FetchLike, createWorker: () => PokieWasmWorkerPort) {
        this.network = network;
        this.createWorker = createWorker;
    }

    public readonly fetch: FetchLike = async (url, init) => {
        const method = init?.method ?? "GET";
        if (this.project && method === "POST" && ((url === "/api/project/play/session" || url === "/api/project/play/session/restore") || (/\/play\/sessions\/[^/]+\/spin$/).test(url))) {
            if (this.playRunning) return response(400, {status: "failed", code: "recovery-required", retryDisposition: "safe-to-retry", error: "A Play request is still pending."});
            this.playRunning = true;
            try {
                const session = await this.play(url, JSON.parse(init?.body ?? "{}") as Record<string, unknown>);
                return response(200, {status: "ok", session});
            } catch (error) {
                return response(400, {status: "failed", code: "invalid-command", retryDisposition: "rejected", error: message(error), ...(error instanceof PlayFailure ? error.recovery : {})});
            } finally {
                this.playRunning = false;
            }
        }
        if (this.project && method === "POST" && (url === "/api/project/simulations" || url === "/api/project/replays")) {
            const operation = url.endsWith("simulations") ? "simulation" : "replay";
            const started = await this.start(operation, JSON.parse(init?.body ?? "{}") as Record<string, unknown>);
            if (!started.ok) return started;
            const execution = await started.json() as Execution;
            // Start returns the retained job before execution. Only this owner dispatches once.
            this.execute(execution, operation);
            return this.network(`${url}/${execution.id}`);
        }
        if (method === "DELETE") {
            const id = url.split("/").pop()!;
            const execution = this.executions.get(id);
            if (execution) this.cancel(execution);
        }
        if (method === "POST" && (/\/jobs\/[^/]+\/cancel$/).test(url)) {
            const id = url.split("/").slice(-2)[0];
            const execution = this.executions.get(id);
            if (execution) this.cancel(execution);
        }
        const contextBoundary = ["/api/project/context", "/api/context", "/api/home/projects/open", "/api/project/close"].includes(url);
        const contextRequest = contextBoundary ? ++this.contextRequest : this.contextRequest;
        const result = await this.network(url, init);
        const currentContext = () => contextRequest === this.contextRequest && !this.disposed;
        if (url === "/api/project/context" && result.ok) {
            const body = await result.json() as {status: string; type?: string; projectRoot?: string};
            if (currentContext()) this.select(body.status === "loaded" && body.type === "wasm" ? body.projectRoot : undefined);
            return response(result.status, body);
        }
        if (url === "/api/context" && result.ok) {
            const body = await result.json() as {mode: string};
            if (currentContext() && body.mode !== "project") this.select(undefined);
            return response(result.status, body);
        }
        if ((url === "/api/home/projects/open" || url === "/api/project/close") && result.ok && currentContext()) this.select(undefined);
        return result;
    };

    public dispose(beacon?: (url: string, body: string) => void): void {
        this.disposed = true;
        this.generation++;
        this.contextRequest++;
        this.publication = undefined;
        this.releaseSession(beacon);
        for (const execution of this.executions.values()) {
            this.cancel(execution);
            clearTimeout(execution.timer);
            beacon?.(`/api/project/wasm/jobs/${execution.id}/finish`, JSON.stringify({...this.binding(execution), cleanup: true, status: "cancelled", progress: execution.progress}));
        }
        this.executions.clear();
    }
    private select(project: string | undefined): void {
        if (project === this.project) return;
        this.generation++;
        this.project = project;
        this.publication = undefined;
        this.releaseSession();
        for (const execution of this.executions.values()) this.cancel(execution);
    }
    private async artifact(): Promise<PokieWasmBrowserArtifact> {
        const project = this.project;
        const generation = this.generation;
        if (!project || this.disposed) throw new Error("Open the WASM Project before executing it.");
        const result = await this.network("/api/project/wasm/artifact", {cache: "no-store"});
        const body = await result.json();
        if (!result.ok) throw new Error(record(body) && typeof body.error === "string" ? body.error : "Cannot load the WASM artifact and sidecar. Rebuild and reopen the Project.");
        const artifact = await validatePokieWasmBrowserArtifact(body as PokieWasmBrowserArtifact, project);
        if (project !== this.project || generation !== this.generation || this.disposed) throw new Error("The WASM Project was replaced while loading.");
        return artifact;
    }
    private async start(operation: string, request: Record<string, unknown>): Promise<Awaited<ReturnType<FetchLike>>> {
        const artifact = await this.artifact();
        const generation = this.generation;
        const result = await this.network("/api/project/wasm/jobs", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({owner: this.owner, projectRoot: artifact.projectRoot, generation: artifact.generation, artifactIdentity: artifact.manifest.artifact!.sha256, operation, request})});
        if (!result.ok) return result;
        const body = await result.json() as {job: StudioJobView; artifact: PokieWasmBrowserArtifact; request: Record<string, unknown>};
        let client: PokieWasmWorkerClient | undefined;
        try {
            await validatePokieWasmBrowserArtifact(body.artifact, artifact.projectRoot, artifact.manifest.artifact!.sha256);
            if (generation !== this.generation || this.disposed || body.artifact.generation !== artifact.generation) throw new Error("WASM Project changed during admission.");
            client = operation === "browser-play" && request.action === "spin" ? this.session?.client : undefined;
            client ??= new PokieWasmWorkerClient(this.createWorker, {project: artifact.projectRoot, generation: artifact.generation, artifact: artifact.manifest.artifact!.sha256, job: body.job.id});
            if (client === this.session?.client) {
                this.watchSession();
            }
            client.bindJob(body.job.id);
            const execution: Execution = {generation, id: body.job.id, client, artifact: body.artifact, request: body.request, cancelled: false};
            this.executions.set(execution.id, execution);
            this.heartbeat(execution);
            return response(201, execution);
        } catch (error) {
            client?.dispose();
            await this.network(`/api/project/wasm/jobs/${body.job.id}/finish`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({owner: this.owner, generation: artifact.generation, artifactIdentity: artifact.manifest.artifact!.sha256, cleanup: true, status: "failed", error: message(error)})});
            throw error;
        }
    }
    private async initialize(execution: Execution): Promise<void> {
        await execution.client.request({type: "instantiate", bytes: new Uint8Array(execution.artifact.bytes), manifest: execution.artifact.manifest, seed: String(execution.request.seed)});
        if (execution.cancelled) throw new Error("WASM operation cancelled before initialization.");
    }
    private async execute(execution: Execution, operation: "simulation" | "replay"): Promise<void> {
        try {
            await this.initialize(execution);
            const output = await execution.client.request(operation === "simulation"
                ? {type: "simulate", rounds: execution.request.rounds as number, seed: String(execution.request.seed), mode: execution.request.modeName as string | undefined}
                : {type: "replay-target", options: execution.request as never}, progress => {
                execution.progress = progress;
            });
            execution.client.dispose("Browser Worker completed and released.");
            await this.finish(execution, "completed", output);
        } catch (error) {
            execution.client.dispose();
            await this.finish(execution, execution.cancelled ? "cancelled" : "failed", undefined, message(error)).catch(() => undefined);
        }
    }
    private async play(url: string, input: Record<string, unknown>): Promise<unknown> {
        if (this.publication) {
            if (this.publication.url !== url || this.publication.binding !== JSON.stringify(input)) throw new PlayFailure("Retry the pending Play request before submitting another command.", {retryDisposition: "safe-to-retry"});
            return this.publishPlay(this.publication);
        }
        const restoring = url.endsWith("/restore");
        const fresh = url === "/api/project/play/session" || restoring;
        if (!fresh && (!this.session || !url.includes(`/sessions/${this.session.id}/`))) throw new Error("This browser session no longer exists. Start a new session.");
        const old = this.session;
        if (!fresh && input.requestId && input.requestId === old?.lastRequest) {
            const current = await this.artifact();
            if (current.generation !== old.artifact.generation || current.manifest.artifact!.sha256 !== old.artifact.manifest.artifact!.sha256) throw new Error("The WASM artifact changed. Start a new session.");
            if (old.lastBinding !== JSON.stringify(input)) throw new Error("Play request identity conflicts with its original command. Start a new request.");
            return old.lastResult;
        }
        let action = fresh ? "new" : "spin";
        let seed = fresh ? input.seed : old!.seed;
        if (restoring) {
            action = "restore";
            seed = (input.state as {seed?: string})?.seed;
        }
        const started = await this.start("browser-play", {action, seed, ...(restoring ? {state: input.state} : {}), ...(fresh ? {} : {sessionId: old!.id, command: input})});
        if (!started.ok) {
            const value = await started.json() as {error?: string};
            throw new Error(value.error ?? "Cannot admit the WASM Play operation.");
        }
        const execution = await started.json() as Execution;
        try {
            if (fresh) {
                await this.initialize(execution);
                if (restoring) await execution.client.request({type: "restore", state: input.state as never});
            } else if (old!.artifact.generation !== execution.artifact.generation || old!.artifact.manifest.artifact!.sha256 !== execution.artifact.manifest.artifact!.sha256) {
                this.releaseSession();
                throw new Error("The artifact changed. Start a new session before playing again.");
            }
            const before = fresh ? undefined : await execution.client.request({type: "view"}) as {state?: PokieWasmSessionState};
            let round: unknown;
            let failure: Publication["failure"];
            try {
                if (!fresh) round = await execution.client.request({type: "play", command: {kind: "spin", ...input}});
            } catch (error) {
                const progress = record(error) && record(error.committedProgress) ? error.committedProgress : undefined;
                if (!progress || !record(progress.round) || !record(progress.continuation)) throw error;
                round = progress.round;
                failure = {message: message(error), continuation: progress.continuation as {roundId: string; cursor: number}, requestId: input.requestId as string | undefined};
            }
            const view = await execution.client.request({type: "view"}) as Record<string, unknown>;
            const restoredRound = restoring ? (view.state as PokieWasmFeatureSessionState)?.feature?.lastRound : undefined;
            const publication: Publication = {url, binding: JSON.stringify(input), execution, view, fresh, old, failure,
                output: {...view, round, restoredRound, stateBefore: before?.state, stateAfter: view.state}};
            // Retain the accepted output before touching the network, including artifacts
            // with no serialization capability. Retry publishes this execution, never plays again.
            this.publication = publication;
        } catch (error) {
            const release = fresh || execution.cancelled || execution.client.getDiagnostics().disposed;
            if (release) execution.client.dispose();
            await this.finish(execution, execution.cancelled ? "cancelled" : "failed", undefined, message(error)).catch(() => undefined);
            if (release && this.session?.client === execution.client) this.releaseSession();
            else if (this.session?.client === execution.client) this.watchSession();
            throw error;
        }
        return this.publishPlay(this.publication!);
    }
    private async publishPlay(publication: Publication): Promise<unknown> {
        const {execution, fresh, old, view, failure} = publication;
        let terminal: StudioJobView;
        try {
            terminal = await this.finish(execution, "completed", publication.output);
        } catch (error) {
            throw new PlayFailure(message(error), {retryDisposition: "safe-to-retry"});
        }
        if (this.publication === publication) this.publication = undefined;
        if (this.disposed || execution.generation !== this.generation || execution.cancelled || (fresh ? this.session !== old : this.session?.client !== execution.client)) {
            execution.client.dispose();
            const sessionId = fresh ? execution.id : old!.id;
            await this.network(`/api/project/wasm/sessions/${sessionId}/dispose`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(this.binding(execution))}).catch(() => undefined);
            throw new PlayFailure("The WASM Play owner changed before publication completed.", {retryDisposition: "safe-to-retry"});
        }
        if (terminal.status !== "completed" || !terminal.result?.detail?.session) {
            execution.client.dispose();
            if (this.session?.client === execution.client) this.releaseSession();
            throw new PlayFailure(terminal.error ?? "WASM Play was interrupted. Start a new session.", {retryDisposition: "safe-to-retry"});
        }
        const result = terminal.result.detail.session;
        if (fresh) this.releaseSession();
        this.session = {client: execution.client, artifact: execution.artifact, seed: String(execution.request.seed), id: fresh ? execution.id : old!.id, view,
            ...(!failure ? {lastRequest: (JSON.parse(publication.binding) as {requestId?: string}).requestId, lastBinding: publication.binding, lastResult: result} : {})};
        this.watchSession();
        if (failure) throw new PlayFailure(failure.message, {code: "execution-error", retryDisposition: "safe-to-retry", committedProgress: {...failure.continuation, requestId: failure.requestId}, session: result});
        return result;
    }
    private heartbeat(execution: Execution): void {
        execution.timer = setTimeout(() => {
            if (!this.ownsExecution(execution)) return;
            this.network(`/api/project/wasm/jobs/${execution.id}/heartbeat`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({...this.binding(execution), progress: execution.progress})}).then(async result => {
                const body = await result.json() as {cancel?: boolean};
                if (!this.ownsExecution(execution)) return;
                if (!result.ok || body.cancel) this.cancel(execution);
                else this.heartbeat(execution);
            }).catch(() => {
                if (this.ownsExecution(execution)) this.cancel(execution);
            });
        }, 250);
    }
    private ownsExecution(execution: Execution): boolean {
        return !this.disposed && !execution.cancelled && !execution.publishing && execution.generation === this.generation && this.executions.get(execution.id) === execution;
    }
    private binding(execution: Execution): Record<string, unknown> {
        return {owner: this.owner, generation: execution.artifact.generation, artifactIdentity: execution.artifact.manifest.artifact!.sha256};
    }
    private async finish(execution: Execution, status: string, output?: unknown, error?: string): Promise<StudioJobView> {
        clearTimeout(execution.timer);
        execution.publishing = true;
        const result = await this.network(`/api/project/wasm/jobs/${execution.id}/finish`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({...this.binding(execution), cleanup: true, status, output, error, progress: execution.progress})});
        const body = await result.json();
        if (!result.ok) throw new Error(record(body) && typeof body.error === "string" ? body.error : "Could not publish WASM Worker result. Inspect the retained job and retry.");
        if (this.executions.get(execution.id) === execution) this.executions.delete(execution.id);
        return body as StudioJobView;
    }
    private cancel(execution: Execution): void {
        execution.cancelled = true;
        execution.client.dispose();
    }
    private watchSession(): void {
        clearTimeout(this.sessionWatch);
        const session = this.session;
        const generation = ++this.sessionWatchGeneration;
        if (!session || this.disposed) return;
        this.sessionWatch = setTimeout(() => {
            this.network(`/api/project/wasm/sessions/${session.id}/heartbeat`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(this.sessionBinding(session))}).then(async response => {
                const body = await response.json() as {cancel?: boolean};
                if (this.session !== session || generation !== this.sessionWatchGeneration) return;
                if (!response.ok || body.cancel) this.releaseSession();
                else this.watchSession();
            }).catch(() => {
                if (this.session === session && generation === this.sessionWatchGeneration) this.releaseSession();
            });
        }, 1000);
    }
    private sessionBinding(session: Session): Record<string, unknown> {
        return {owner: this.owner, generation: session.artifact.generation, artifactIdentity: session.artifact.manifest.artifact!.sha256};
    }
    private releaseSession(beacon?: (url: string, body: string) => void): void {
        this.sessionWatchGeneration++;
        clearTimeout(this.sessionWatch);
        const session = this.session;
        this.session = undefined;
        if (!session) return;
        session.client.dispose("WASM Play session released.");
        const url = `/api/project/wasm/sessions/${session.id}/dispose`;
        const body = JSON.stringify(this.sessionBinding(session));
        if (beacon) beacon(url, body);
        else this.network(url, {method: "POST", headers: {"Content-Type": "application/json"}, body}).catch(() => undefined);
    }

}
function response(status: number, body: unknown): Awaited<ReturnType<FetchLike>> {
    return {status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body)};
}
function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
