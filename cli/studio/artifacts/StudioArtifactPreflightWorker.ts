import {Worker} from "worker_threads";
import fs from "fs";
import os from "os";
import path from "path";
import type {ArtifactTargetType, PackageBlueprintExtractionResult} from "@fromstan/pokie";
import type {StudioArtifactPreflighting, StudioPreparedArtifactPreview} from "./StudioArtifactPreflighting.js";
import type {StudioArtifactTargetView} from "./StudioArtifactTargetView.js";
import {canonicalStudioProjectIdentity} from "../jobs/canonicalStudioProjectIdentity.js";

/**
 * A single inspection slot bounds installed runtime graphs in a long-lived Studio process.
 * Native import caches and dependency process listeners die with the worker. The parent owns
 * and drains its temporary directory, including when cancellation interrupts snapshot creation.
 */
export class StudioArtifactPreflightWorker implements StudioArtifactPreflighting {
    private tail: Promise<unknown> = Promise.resolve();
    private readonly requests = new Map<AbortController, {projectRoot: string; target?: ArtifactTargetType | "packageModel"; promise: Promise<unknown>}>();
    private readonly cleanupFailures: unknown[] = [];
    private accepting = true;
    private readonly workerEntry: string;

    public constructor(
        private readonly pokieVersion: string,
        private readonly runtimePackageRoot: string,
        workerEntry?: string,
    ) {
        this.workerEntry = workerEntry ?? path.join(runtimePackageRoot, "dist/cli/studio/artifacts/artifactPreflightWorkerEntry.js");
    }

    public extractPackage(projectRoot: string, signal?: AbortSignal): Promise<PackageBlueprintExtractionResult> {
        return this.run(projectRoot, "packageModel", undefined, signal);
    }

    public listTargets(projectRoot: string, signal?: AbortSignal): Promise<readonly StudioArtifactTargetView[]> {
        return this.run(projectRoot, undefined, undefined, signal);
    }

    public preparePreview(projectRoot: string, target: ArtifactTargetType, outDir?: string, signal?: AbortSignal): Promise<StudioPreparedArtifactPreview> {
        return this.run(projectRoot, target, outDir, signal);
    }

    public cancelForProject(projectRoot: string): void {
        const identity = canonicalStudioProjectIdentity(projectRoot);
        for (const [controller, request] of this.requests) if (request.projectRoot === identity) controller.abort();
    }

    public async cancelAll(): Promise<void> {
        this.accepting = false;
        for (const controller of this.requests.keys()) controller.abort();
        await Promise.allSettled([...this.requests.values()].map(request => request.promise));
        if (this.cleanupFailures.length > 0) throw this.cleanupFailures[0];
    }

    private run<T>(projectRoot: string, target?: ArtifactTargetType | "packageModel", outDir?: string, signal?: AbortSignal): Promise<T> {
        if (!this.accepting) return Promise.reject(new Error("Studio artifact preflight is stopping."));
        const identity = canonicalStudioProjectIdentity(projectRoot);
        for (const [owner, request] of this.requests) {
            if (request.projectRoot === identity && request.target === target) owner.abort();
        }
        const controller = new AbortController();
        const abort = (): void => controller.abort();
        signal?.addEventListener("abort", abort, {once: true});
        if (signal?.aborted) abort();
        const operation = this.tail.catch(() => undefined).then(async (): Promise<T> => {
            controller.signal.throwIfAborted();
            if (this.cleanupFailures.length > 0) throw this.cleanupFailures[0];
            const temporaryRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pokie-preflight-"));
            let worker: Worker | undefined;
            let stop: (() => void) | undefined;
            try {
                controller.signal.throwIfAborted();
                worker = new Worker(this.workerEntry, {
                    execArgv: [],
                    env: {...process.env, TMPDIR: temporaryRoot, TMP: temporaryRoot, TEMP: temporaryRoot},
                    workerData: {pokieVersion: this.pokieVersion, runtimePackageRoot: this.runtimePackageRoot, projectRoot, target, outDir},
                });
                return await new Promise<T>((resolve, reject) => {
                    stop = () => reject(new Error("Artifact preflight cancelled."));
                    controller.signal.addEventListener("abort", stop, {once: true});
                    worker!.once("message", (message: {result: T; error?: string}) => {
                        if (message.error !== undefined) reject(new Error(message.error));
                        else resolve(message.result);
                    });
                    worker!.once("error", reject);
                    worker!.once("exit", code => reject(new Error(`Artifact preflight stopped before completion (exit ${code}).`)));
                    if (controller.signal.aborted) stop();
                });
            } finally {
                if (stop !== undefined) controller.signal.removeEventListener("abort", stop);
                // Termination and cleanup finish before another plan can acquire the slot.
                await this.drainWorker(worker, temporaryRoot);
            }
        });
        const completion = operation.finally(() => {
            signal?.removeEventListener("abort", abort);
            this.requests.delete(controller);
        });
        this.requests.set(controller, {projectRoot: identity, target, promise: completion});
        this.tail = completion;
        // Observe a rejected tail even when no successor is submitted.
        this.tail.catch(() => undefined);
        return completion;
    }

    private async drainWorker(worker: Worker | undefined, temporaryRoot: string): Promise<void> {
        try {
            try {
                await worker?.terminate();
            } finally {
                await fs.promises.rm(temporaryRoot, {recursive: true, force: true});
            }
        } catch (error) {
            this.cleanupFailures.push(error);
            throw error;
        }
    }

}
