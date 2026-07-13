import {Worker} from "worker_threads";
import {SimulationCancelledError} from "./SimulationCancelledError.js";
import type {SimulationWorkerMessage} from "./SimulationWorkerMessage.js";
import type {SimulationWorkerRequest} from "./SimulationWorkerRequest.js";
import {SimulationWorkerFailureError} from "./SimulationWorkerFailureError.js";
import type {SimulationWorkerResult} from "./SimulationWorkerResult.js";

export type SimulationWorkerProgress = {workerIndex: number; roundsCompleted: number};

export type SimulationWorkerCoordinatorRunOptions = {
    signal?: AbortSignal;
    onProgress?: (progress: SimulationWorkerProgress) => void;
};

// Owns the actual worker_threads lifecycle for one simulation run: spawns one real Worker per
// SimulationWorkerRequest (see simulationWorkerEntry.ts for what runs inside each), collects their
// progress/result/error messages, and enforces the "one worker's failure ends the whole simulation" /
// "cancellation stops every worker" rules (see docs/simulation.md). run() never resolves with a
// partial result: it either resolves once every requested worker has reported a result, or rejects —
// and by the time it settles either way, every worker thread this call spawned has been told to
// terminate.
export class SimulationWorkerCoordinator {
    private readonly createWorker: (request: SimulationWorkerRequest) => Worker;

    // `workerEntryUrl` has no default on purpose (mirrors ClientCommand/StudioCommand's own
    // clientRoot/studioRoot — see cli/pokie.ts's ownSimulationWorkerEntryUrl()): resolving it needs
    // import.meta.url, which only works in the real ESM build, not a direct ts-jest unit-test import
    // of this file. Tests inject either a fake createWorker (no real thread spawned) or a real,
    // test-supplied entry URL.
    constructor(workerEntryUrl: URL, createWorker?: (request: SimulationWorkerRequest) => Worker) {
        this.createWorker = createWorker ?? ((request) => new Worker(workerEntryUrl, {workerData: request}));
    }

    public run(
        requests: SimulationWorkerRequest[],
        options: SimulationWorkerCoordinatorRunOptions = {},
    ): Promise<SimulationWorkerResult[]> {
        const {signal, onProgress} = options;

        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(new SimulationCancelledError());
                return;
            }
            if (requests.length === 0) {
                resolve([]);
                return;
            }

            const workers = requests.map((request) => this.createWorker(request));
            // .fill(undefined) matters: new Array(n) alone produces holes, not actual `undefined`
            // elements, and Array.prototype.every() silently skips holes — which would make the
            // "every result is in" check below resolve prematurely after only the first worker
            // reports in.
            const results = new Array<SimulationWorkerResult | undefined>(requests.length).fill(undefined);
            let settled = false;

            const terminateAll = (): void => {
                for (const worker of workers) {
                    // Best-effort: a worker that already exited/errored rejects terminate() too — never
                    // let that mask the real reason this run is ending.
                    worker.terminate().catch(() => undefined);
                }
            };

            const onAbort = (): void => finish(() => reject(new SimulationCancelledError()));

            function finish(action: () => void): void {
                if (settled) {
                    return;
                }
                settled = true;
                signal?.removeEventListener("abort", onAbort);
                terminateAll();
                action();
            }

            signal?.addEventListener("abort", onAbort);

            workers.forEach((worker, index) => {
                const request = requests[index];

                worker.on("message", (raw: unknown) => {
                    if (settled) {
                        return;
                    }
                    if (raw === null || typeof raw !== "object" || typeof (raw as {type?: unknown}).type !== "string") {
                        finish(() =>
                            reject(new SimulationWorkerFailureError(request.workerIndex, "received a malformed message from the worker.")),
                        );
                        return;
                    }

                    const message = raw as SimulationWorkerMessage;
                    switch (message.type) {
                        case "progress":
                            onProgress?.({workerIndex: message.workerIndex, roundsCompleted: message.roundsCompleted});
                            return;
                        case "error":
                            finish(() => reject(new SimulationWorkerFailureError(message.workerIndex, message.message)));
                            return;
                        case "result": {
                            const result: SimulationWorkerResult = {
                                workerIndex: message.workerIndex,
                                manifest: message.manifest,
                                accumulator: message.accumulator,
                                breakdown: message.breakdown,
                                roundsCompleted: message.roundsCompleted,
                            };
                            results[index] = result;
                            if (results.every((entry) => entry !== undefined)) {
                                finish(() => resolve(results as SimulationWorkerResult[]));
                            }
                            return;
                        }
                        default:
                            finish(() =>
                                reject(
                                    new SimulationWorkerFailureError(
                                        request.workerIndex,
                                        `received an unrecognized message from the worker.`,
                                    ),
                                ),
                            );
                    }
                });

                worker.on("messageerror", (error: Error) => {
                    finish(() =>
                        reject(new SimulationWorkerFailureError(request.workerIndex, `received an unparseable message: ${error.message}`)),
                    );
                });

                worker.on("error", (error: Error) => {
                    finish(() => reject(new SimulationWorkerFailureError(request.workerIndex, error.message)));
                });

                worker.on("exit", (code: number) => {
                    if (settled) {
                        return;
                    }
                    if (code !== 0 || results[index] === undefined) {
                        finish(() =>
                            reject(new SimulationWorkerFailureError(request.workerIndex, `worker exited prematurely with code ${code}.`)),
                        );
                    }
                });
            });
        });
    }
}
