import {parentPort, workerData} from "node:worker_threads";
import {AdvancedModelSourceValidator, type AdvancedAnalysisLimits} from "@fromstan/pokie";

// Keep the worker alive until the parent receives the terminal message (an async validation may
// have no active I/O handle of its own).
parentPort!.ref();
const request = workerData as {root: string; limits?: Partial<AdvancedAnalysisLimits>};
new AdvancedModelSourceValidator().validate(request.root, {limits: request.limits}).then(
    (report) => parentPort!.postMessage({report}),
    (error: unknown) => parentPort!.postMessage({error: error instanceof Error ? error.message : String(error)}),
);
