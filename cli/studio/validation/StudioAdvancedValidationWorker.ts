import fs from "fs";
import path from "path";
import {Worker} from "worker_threads";
import {
    AdvancedModelSourceValidator,
    type AdvancedModelSourceValidating,
    type AdvancedModelValidationReport,
    type AdvancedValidationOptions,
    type MathDefinitionInput,
} from "@fromstan/pokie";

// Advanced validation is deliberately separate from the request's event loop: a package's declared
// model can take seconds to read and analyse, and a synchronous validator blocks every other Studio
// route (including a Play request queued behind the Overview check). The worker owns that CPU work;
// the HTTP request only waits for its message. A missing/unbuilt worker entry (embedded tests, a
// source checkout without dist) falls back to the in-process validator so Studio still works.
export class StudioAdvancedValidationWorker implements AdvancedModelSourceValidating {
    private readonly workerEntry: string;
    private readonly fallback = new AdvancedModelSourceValidator();

    public constructor(runtimePackageRoot: string, workerEntry?: string) {
        this.workerEntry = workerEntry ?? path.join(runtimePackageRoot, "dist/cli/studio/validation/advancedValidationWorkerEntry.js");
    }

    public validate(input: MathDefinitionInput, options: AdvancedValidationOptions = {}): Promise<AdvancedModelValidationReport> {
        if (typeof input !== "string" || !fs.existsSync(this.workerEntry)) {
            return this.fallback.validate(input, options);
        }
        if (options.signal?.aborted) return this.fallback.validate(input, options);

        return new Promise<AdvancedModelValidationReport>((resolve, reject) => {
            let worker: Worker;
            try {
                worker = new Worker(this.workerEntry, {
                    execArgv: [],
                    workerData: {root: input, ...(options.limits === undefined ? {} : {limits: options.limits})},
                });
            } catch {
                this.fallback.validate(input, options).then(resolve, reject);
                return;
            }

            let settled = false;
            const finish = (complete: () => void): void => {
                if (settled) return;
                settled = true;
                options.signal?.removeEventListener("abort", abort);
                worker.terminate().catch(() => undefined);
                complete();
            };
            const abort = (): void => finish(() => {
                // The in-process validator short-circuits an already-aborted signal into its normal
                // cancelled report, preserving the pre-worker request semantics.
                this.fallback.validate(input, {signal: options.signal}).then(resolve, reject);
            });
            options.signal?.addEventListener("abort", abort, {once: true});

            worker.once("message", (message: {report?: AdvancedModelValidationReport; error?: string}) => {
                if (message.error !== undefined) finish(() => reject(new Error(message.error)));
                else if (message.report !== undefined) finish(() => resolve(message.report!));
                else finish(() => reject(new Error("Advanced validation worker returned no report.")));
            });
            worker.once("error", (error) => finish(() => reject(error)));
            worker.once("exit", (code) => {
                if (!settled) finish(() => reject(new Error(`Advanced validation stopped before completion (exit ${code}).`)));
            });
        });
    }
}
