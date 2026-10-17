import {SimulationAccumulator} from "../SimulationAccumulator.js";
import {SimulationStatisticsMerger} from "../SimulationStatisticsMerger.js";
import type {Worker} from "worker_threads";
import {getDefaultWorkerEntryUrl} from "./internal/defaultWorkerEntryUrl.js";
import type {SimulationWorkerMessage} from "./internal/SimulationWorkerMessage.js";
import {SimulationCancelledError} from "./SimulationCancelledError.js";
import type {SimulationWorkerRequest} from "./SimulationWorkerRequest.js";
import {SimulationWorkerFailureError} from "./SimulationWorkerFailureError.js";
import type {SimulationWorkerResult} from "./SimulationWorkerResult.js";

type WorkerThreadsModule = {
    Worker: new (filename: URL, options: {workerData: SimulationWorkerRequest}) => Worker;
};

// Keep the Node-only worker_threads dependency out of browser bundles. The public package root also
// exports client-facing code, so a literal dynamic import would still let a browser bundler discover
// and externalize this Node builtin before a simulation ever asks to use worker threads.
// eslint-disable-next-line no-new-func -- preserves a native runtime import in both ESM and CJS output.
const importWorkerThreads = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<WorkerThreadsModule>;

// Jest evaluates source modules in a VM without a dynamic-import callback. Keep the CommonJS
// fallback equally indirect so browser bundles do not discover the Node-only builtin merely by
// inspecting this public simulation API.
// eslint-disable-next-line no-new-func -- mirrors the narrowly-scoped dynamic-import workaround above.
const requireWorkerThreads = new Function("nodeRequire", "return nodeRequire('worker_threads')") as (
    nodeRequire: NodeRequire,
) => WorkerThreadsModule;

export type SimulationWorkerProgress = {workerIndex: number; roundsCompleted: number};

export type SimulationWorkerCoordinatorRunOptions = {
    signal?: AbortSignal;
    onProgress?: (progress: SimulationWorkerProgress) => void;
    onPhase?: (phase: "simulation" | "finalizing / cleanup") => void;
};

// Owns the actual worker_threads lifecycle for one simulation run: spawns one real Worker per
// SimulationWorkerRequest (see internal/simulationWorkerEntry.ts for what runs inside each), collects
// their progress/result/error messages, and enforces the "one worker's failure ends the whole
// simulation" / "cancellation stops every worker" rules (see docs/simulation.md). run() never
// resolves with a partial result: it either resolves once every requested worker has reported a
// result, or rejects — and by the time it settles either way, every worker thread this call spawned
// has been told to terminate.
export class SimulationWorkerCoordinator {
    private readonly workerEntryUrl: URL | undefined;
    private readonly createWorker: ((request: SimulationWorkerRequest) => Worker) | undefined;

    // Neither argument is required. With no `createWorker` override, run() spawns a real Worker at
    // `workerEntryUrl`; with neither given, it falls back to this package's own bundled worker entry
    // (see internal/defaultWorkerEntryUrl.ts for why that needs an indirect dynamic import rather than
    // a plain constructor-time default). Tests substitute a fake `createWorker` (no real thread ever
    // spawned) or a real, test-supplied entry URL instead.
    constructor(workerEntryUrl?: URL, createWorker?: (request: SimulationWorkerRequest) => Worker) {
        this.workerEntryUrl = workerEntryUrl;
        this.createWorker = createWorker;
    }

    public async run(
        requests: SimulationWorkerRequest[],
        options: SimulationWorkerCoordinatorRunOptions = {},
    ): Promise<SimulationWorkerResult[]> {
        const {signal, onProgress, onPhase} = options;
        if (signal?.aborted) {
            throw new SimulationCancelledError();
        }
        if (requests.length === 0) {
            return [];
        }

        requests = requests.map(request => request.requireCleanup ? {...request, cancellation: request.cancellation ?? new SharedArrayBuffer(4)} : request);
        const createWorker = this.createWorker ?? (await this.buildDefaultCreateWorker());

        return new Promise((resolve, reject) => {
            const workers: Worker[] = [];
            // .fill(undefined) matters: new Array(n) alone produces holes, not actual `undefined`
            // elements, and Array.prototype.every() silently skips holes — which would make the
            // "every result is in" check below resolve prematurely after only the first worker
            // reports in.
            const results = new Array<SimulationWorkerResult | undefined>(requests.length).fill(undefined);
            const prefixes = new Map<number, import("../SimulationAccumulatorSnapshot.js").SimulationAccumulatorSnapshot>();
            let settled = false;
            let failureContext = "";
            let drainageError: unknown;
            let drainageCleanupError: unknown;
            const terminalWorkers = new Set<number>();
            const observedPrefix = () => prefixes.size ? new SimulationStatisticsMerger().merge([...prefixes.values()].map(accumulator => ({accumulator}))).statistics : undefined;
            const drainage: Promise<boolean>[] = [];
            const acknowledgements: ((confirmed: boolean) => void)[] = [];
            const finalizing = new Set<number>();

            const terminateAll = async (): Promise<void> => {
                for (const request of requests) if (request.cancellation) Atomics.store(new Int32Array(request.cancellation), 0, 1);
                let confirmed = true;
                if (drainage.length) {
                    let timer: ReturnType<typeof setTimeout> | undefined;
                    try {
                        confirmed = await Promise.race([
                            Promise.all(drainage).then(values => values.every(Boolean)),
                            new Promise<boolean>(resolve => {
                                timer = setTimeout(() => resolve(false), 5000);
                            }),
                        ]);
                    } finally {
                        if (timer) clearTimeout(timer);
                    }
                }
                const outcomes = await Promise.allSettled(workers.map((worker) => Promise.resolve().then(() => worker.terminate())));
                const failures = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
                if (failures.length || !confirmed) throw new Error(`Worker cleanup unconfirmed: ${failures.map(outcome => String(outcome.reason)).join("; ") || "runtime release acknowledgement absent"}. ${failureContext}`);
            };

            const onAbort = (): void => {
                finish(() => reject(new SimulationCancelledError(prefixes.size ? new SimulationStatisticsMerger().merge([...prefixes.values()].map(accumulator => ({accumulator}))).statistics : undefined)));
            };

            const rejectWithPrefix = (error: unknown): void => {
                try {
                    if (error instanceof Error) Object.assign(error, {observedPrefix: observedPrefix()});
                    reject(error);
                } catch (validationError) {
                    reject(validationError);
                }
            };

            async function finish(action: () => void): Promise<void> {
                if (settled) {
                    return;
                }
                settled = true;
                signal?.removeEventListener("abort", onAbort);
                let phaseError: unknown;
                try {
                    onPhase?.("finalizing / cleanup");
                } catch (error) {
                    phaseError = error;
                }
                try {
                    await terminateAll();
                } catch (error) {
                    rejectWithPrefix(error);
                    return;
                } finally {
                    for (const worker of workers) worker.removeAllListeners();
                }
                if (drainageCleanupError !== undefined) {
                    rejectWithPrefix(drainageCleanupError);
                    return;
                }
                if (drainageError !== undefined) {
                    rejectWithPrefix(drainageError);
                    return;
                }
                if (phaseError !== undefined) {
                    rejectWithPrefix(phaseError);
                    return;
                }
                try {
                    action();
                } catch (error) {
                    rejectWithPrefix(error);
                }
            }

            signal?.addEventListener("abort", onAbort);

            const observeWorker = (worker: Worker, index: number): void => {
                const request = requests[index];

                worker.on("message", (raw: unknown) => {
                    if (terminalWorkers.has(index)) return;
                    if (raw === null || typeof raw !== "object" || typeof (raw as {type?: unknown}).type !== "string") {
                        drainageError = new SimulationWorkerFailureError(request.workerIndex, "received a malformed message from the worker.");
                        acknowledgements[index]?.(false);
                        finish(() => rejectWithPrefix(drainageError));
                        return;
                    }

                    const message = raw as SimulationWorkerMessage;
                    try {
                        if (["progress", "result", "error", "phase"].includes(message.type) && message.workerIndex !== request.workerIndex) throw new SimulationWorkerFailureError(request.workerIndex, "message identity does not match its request.");
                        if (message.type === "result" && !message.accumulator) throw new Error("Simulation worker terminal result has no snapshot.");
                        if ((message.type === "progress" || message.type === "result" || message.type === "error") && message.accumulator) {
                            SimulationAccumulator.fromSnapshot(message.accumulator);
                            if (message.accumulator.rounds < (prefixes.get(index)?.rounds ?? 0) || message.accumulator.rounds > request.rounds) throw new Error("Simulation worker snapshot is outside its accepted work range.");
                            if (message.type !== "error" && message.roundsCompleted !== message.accumulator.rounds) throw new Error("Simulation worker progress disagrees with accepted subrounds.");
                            if (message.type === "result" && message.accumulator.analytics && message.accumulator.analytics.envelope.modelId !== (message.configHash ?? null)) throw new Error("Simulation worker analytics model identity disagrees with its result provenance.");
                            const next = new Map(prefixes).set(index, message.accumulator);
                            new SimulationStatisticsMerger().merge([...next.values()].map(accumulator => ({accumulator})));
                            prefixes.set(index, message.accumulator);
                        }
                        if (message.type === "result" || message.type === "error") {
                            terminalWorkers.add(index);
                            acknowledgements[index]?.(true);
                            if (message.type === "error" && (!message.cancelled || message.cleanupFailed)) {
                                const reason = message.cleanupFailed ? `Worker runtime cleanup failed: ${message.message}` : message.message;
                                const failure = new SimulationWorkerFailureError(message.workerIndex, reason);
                                if (message.cleanupFailed) drainageCleanupError = failure;
                                else drainageError = failure;
                            }
                        }
                        // Cancellation/observer failure stops callbacks, but terminal snapshots and
                        // cleanup failures still belong to this invocation until drainage settles.
                        if (settled) return;
                        switch (message.type) {
                            case "phase":
                                if (message.phase === "finalizing / cleanup") finalizing.add(index);
                                else if (message.phase === "simulation") onPhase?.("simulation");
                                else throw new SimulationWorkerFailureError(request.workerIndex, "invalid worker phase.");
                                if (finalizing.size === requests.length) onPhase?.("finalizing / cleanup");
                                return;
                            case "progress":
                                onProgress?.({workerIndex: message.workerIndex, roundsCompleted: message.roundsCompleted});
                                return;
                            case "error":
                                failureContext = message.message;
                                finish(() => rejectWithPrefix(new SimulationWorkerFailureError(message.workerIndex, message.message, prefixes.size ? new SimulationStatisticsMerger().merge([...prefixes.values()].map(accumulator => ({accumulator}))).statistics : undefined)));
                                return;
                            case "result": {
                                const result: SimulationWorkerResult = {
                                    workerIndex: message.workerIndex,
                                    manifest: message.manifest,
                                    configHash: message.configHash,
                                    accumulator: message.accumulator,
                                    breakdown: message.breakdown,
                                    jackpot: message.jackpot,
                                    roundsCompleted: message.roundsCompleted,
                                    stopReason: message.stopReason,
                                    convergence: message.convergence,
                                };
                                results[index] = result;
                                prefixes.set(index, result.accumulator);
                                if (results.every((entry) => entry !== undefined)) {
                                    finish(() => resolve(results as SimulationWorkerResult[]));
                                }
                                return;
                            }
                            default:
                                finish(() =>
                                    rejectWithPrefix(
                                        new SimulationWorkerFailureError(
                                            request.workerIndex,
                                            `received an unrecognized message from the worker.`,
                                        ),
                                    ),
                                );
                        }
                    } catch (error) {
                        drainageError = error;
                        if (message.type === "result" || message.type === "error") acknowledgements[index]?.(false);
                        finish(() => rejectWithPrefix(error));
                    }
                });

                worker.on("messageerror", (error: Error) => {
                    finish(() =>
                        rejectWithPrefix(new SimulationWorkerFailureError(request.workerIndex, `received an unparseable message: ${error.message}`)),
                    );
                });

                worker.on("error", (error: Error) => {
                    finish(() => rejectWithPrefix(new SimulationWorkerFailureError(request.workerIndex, error.message)));
                });

                worker.on("exit", (code: number) => {
                    if (settled) {
                        return;
                    }
                    if (code !== 0 || results[index] === undefined) {
                        finish(() =>
                            rejectWithPrefix(new SimulationWorkerFailureError(request.workerIndex, `worker exited prematurely with code ${code}.`)),
                        );
                    }
                });
            };

            // Creation itself is a lifecycle boundary too.  A failure while
            // creating worker N used to escape before the coordinator owned a
            // promise, leaking workers 0..N-1.  Keep the partial list and run
            // it through the same settled cleanup path as every later error.
            for (let index = 0; index < requests.length; index++) {
                if (settled || signal?.aborted) {
                    onAbort();
                    return;
                }
                try {
                    workers.push(createWorker(requests[index]));
                    if (requests[index].requireCleanup) {
                        drainage.push(new Promise<boolean>(done => {
                            acknowledgements[index] = done;
                        }));
                        workers[index].on("exit", () => acknowledgements[index](false));
                        workers[index].on("error", () => acknowledgements[index](false));
                    }
                    observeWorker(workers[index], index);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    finish(() => rejectWithPrefix(new SimulationWorkerFailureError(requests[index].workerIndex, `could not create worker: ${message}`)));
                    return;
                }
            }
        });
    }

    private async buildDefaultCreateWorker(): Promise<(request: SimulationWorkerRequest) => Worker> {
        const url = this.workerEntryUrl ?? (await getDefaultWorkerEntryUrl());
        const {Worker: NodeWorker} = await this.resolveWorkerThreads();
        return (request) => new NodeWorker(url, {workerData: request});
    }

    private async resolveWorkerThreads(): Promise<WorkerThreadsModule> {
        // Jest reuses a Node process across VM test environments. A native
        // import of this builtin can retain a callback from an environment
        // that has already been torn down. Resolve it synchronously in the
        // CommonJS VM, as the default worker entry resolver already does.
        if (typeof process !== "undefined" && process.env?.JEST_WORKER_ID !== undefined && typeof require === "function") {
            return requireWorkerThreads(require);
        }
        try {
            return await importWorkerThreads("worker_threads");
        } catch (error) {
            if (!isVmDynamicImportUnavailable(error) || typeof require !== "function") {
                throw error;
            }
            return requireWorkerThreads(require);
        }
    }
}

function isVmDynamicImportUnavailable(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as {code?: unknown}).code === "ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG"
    );
}
