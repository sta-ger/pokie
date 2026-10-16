import {PokieWasmWorkerProtocol, type PokieWasmWorkerRequest, type PokieWasmWorkerResponse} from "./worker.js";

export type PokieWasmWorkerScope = {readonly project: string; readonly generation: string; readonly artifact: string; readonly job: string};
export type PokieWasmWorkerProgress = {readonly completed: number; readonly total?: number; readonly statistics?: import("../simulation/SimulationStatistics.js").SimulationStatistics};
export interface PokieWasmWorkerPort {
    postMessage(message: unknown): void;
    addEventListener(type: string, listener: (event: MessageEvent & ErrorEvent) => void): void;
    removeEventListener(type: string, listener: (event: MessageEvent & ErrorEvent) => void): void;
    terminate(): void;
}
type Pending = {resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; progress?: (value: PokieWasmWorkerProgress) => void};

/** One transport owns one Worker. Termination settles every request and removes all listeners.
 * Scope is echoed across the actual message boundary; neither path nor an old id grants ownership.
 */
export interface PokieWasmWorkerTransporting {
    request(request: WorkerCommand, progress?: (value: PokieWasmWorkerProgress) => void): Promise<unknown>;
    dispose(reason?: string): void;
    bindJob(job: string): void;
    getDiagnostics(): {pending: number; disposed: boolean};
}
export class PokieWasmWorkerClient implements PokieWasmWorkerTransporting {
    private readonly pending = new Map<string, Pending>();
    private readonly worker: PokieWasmWorkerPort;
    private nextId = 0;
    private disposed = false;
    public constructor(createWorker: () => PokieWasmWorkerPort, private scope: PokieWasmWorkerScope, private readonly idleTimeoutMs = 30000) {
        this.worker = createWorker();
        this.worker.addEventListener("message", this.message);
        this.worker.addEventListener("error", this.error);
        this.worker.addEventListener("messageerror", this.messageerror);
    }

    public request(request: WorkerCommand, progress?: (value: PokieWasmWorkerProgress) => void): Promise<unknown> {
        if (this.disposed) return Promise.reject(new Error("The WASM Worker was terminated. Start a new operation."));
        const id = `${this.scope.job}:${++this.nextId}`;
        return new Promise((resolve, reject) => {
            this.pending.set(id, {resolve, reject, timer: this.timeout(id), progress});
            try {
                this.worker.postMessage({scope: this.scope, request: {...request, id}});
            } catch (error) {
                this.fail(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    public bindJob(job: string): void {
        if (this.disposed || this.pending.size || !job) throw new Error("Cannot replace a WASM Worker job while a request is pending or the Worker is disposed.");
        this.scope = {...this.scope, job};
    }
    public dispose(reason = "The WASM Worker operation was cancelled."): void {
        this.fail(new Error(reason));
    }
    public getDiagnostics(): {pending: number; disposed: boolean} {
        return {pending: this.pending.size, disposed: this.disposed};
    }
    private readonly message = (event: MessageEvent): void => {
        const value: unknown = event.data;
        if (!record(value) || !sameScope(value.scope, this.scope)) {
            this.fail(new Error("Malformed or stale WASM Worker scope."));
            return;
        }
        if (typeof value.id !== "string" || !this.pending.has(value.id)) {
            this.fail(new Error("Unexpected WASM Worker response id."));
            return;
        }
        const pending = this.pending.get(value.id)!;
        clearTimeout(pending.timer);
        if (value.type === "progress") {
            if (!record(value.progress) || !Number.isSafeInteger(value.progress.completed) || (value.progress.completed as number) < 0) {
                this.fail(new Error("Malformed WASM Worker progress."));
                return;
            }
            pending.timer = this.timeout(value.id);
            pending.progress?.(value.progress as PokieWasmWorkerProgress);
            return;
        }
        if (value.type !== "response" || typeof value.ok !== "boolean" || (!value.ok && typeof value.error !== "string")) {
            this.fail(new Error("Malformed WASM Worker response."));
            return;
        }
        if (!value.ok && value.fatal === true) {
            this.fail(new Error(value.error as string));
            return;
        }
        this.pending.delete(value.id);
        if (value.ok) pending.resolve(value.result);
        else pending.reject(Object.assign(new Error(value.error as string), value.committedProgress === undefined ? {} : {committedProgress: value.committedProgress}));
    };
    private readonly error = (event: ErrorEvent): void => this.fail(new Error(event.message || "WASM Worker failed to load or execute. Retry the operation."));
    private readonly messageerror = (): void => this.fail(new Error("WASM Worker message could not be deserialized. Retry the operation."));

    private timeout(id: string): ReturnType<typeof setTimeout> {
        return setTimeout(() => this.fail(new Error(`WASM Worker request ${id} stopped responding. Its Worker was terminated; retry the operation.`)), this.idleTimeoutMs);
    }
    private fail(error: Error): void {
        if (this.disposed) return;
        this.disposed = true;
        this.worker.removeEventListener("message", this.message);
        this.worker.removeEventListener("error", this.error);
        this.worker.removeEventListener("messageerror", this.messageerror);
        this.worker.terminate();
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.pending.clear();
    }
}

type WorkerCommand = PokieWasmWorkerRequest extends infer R ? R extends {id: string} ? Omit<R, "id"> : never : never;

/** Production Worker entry installation, also used by browser verification fixtures. */
export function installPokieWasmWorker(port: Pick<PokieWasmWorkerPort, "postMessage" | "addEventListener">): void {
    let scope: PokieWasmWorkerScope | undefined;
    let queue: Promise<void> = Promise.resolve();
    const protocol = new PokieWasmWorkerProtocol((id, progress) => port.postMessage({scope, id, type: "progress", progress}));
    port.addEventListener("message", event => {
        const data: unknown = event.data;
        if (!record(data) || !validScope(data.scope) || !record(data.request)) return;
        if (scope === undefined) scope = data.scope;
        if (data.scope.project !== scope.project || data.scope.generation !== scope.generation || data.scope.artifact !== scope.artifact) return;
        const requestScope = data.scope;
        const request = data.request as PokieWasmWorkerRequest;
        const respond = async (): Promise<void> => {
            scope = requestScope;
            const response: PokieWasmWorkerResponse = await protocol.handle(request);
            port.postMessage({...response, scope: requestScope, type: "response"});
        };
        // Cancellation must be processed while an asynchronous bounded loop yields.
        if (request.type === "cancel" || request.type === "dispose") respond();
        else queue = queue.then(respond, respond);
    });
}
function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validScope(value: unknown): value is PokieWasmWorkerScope {
    return record(value) && ["project", "generation", "artifact", "job"].every(key => typeof value[key] === "string" && value[key] !== "");
}
function sameScope(left: unknown, right: PokieWasmWorkerScope): boolean {
    return validScope(left) && left.project === right.project && left.generation === right.generation && left.artifact === right.artifact && left.job === right.job;
}
