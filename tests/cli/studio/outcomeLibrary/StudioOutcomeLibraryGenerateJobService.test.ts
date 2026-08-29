import fs from "fs";
import os from "os";
import path from "path";
import type {ExactEnumerationCheckpoint} from "pokie";
import {createUnresolvedRuntimePlan} from "../../../../cli/studio/artifacts/createExternalArtifactConversionPlan.js";
import type {StudioOutcomeLibraryGenerateResultView} from "../../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateResultView.js";
import {StudioOutcomeLibraryGenerateJobService} from "../../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateJobService.js";
import type {StudioOutcomeLibraryGenerateService} from "../../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.js";

describe("StudioOutcomeLibraryGenerateJobService", () => {
    let projectRoot: string;

    beforeEach(() => {
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcome-library-job-"));
    });

    afterEach(() => {
        fs.rmSync(projectRoot, {recursive: true, force: true});
    });

    it("cancels active project work and all remaining work through Studio lifecycle ownership", async () => {
        const checkpoint: ExactEnumerationCheckpoint = {
            processedRawIndex: BigInt(1), progressTotal: BigInt(6), sourceEnumerationId: "fixture-source", grids: new Map(),
        };
        const cancelled = (root: string): Extract<StudioOutcomeLibraryGenerateResultView, {status: "cancelled"}> => ({
            status: "cancelled", processedRawIndex: BigInt(1), progressTotal: BigInt(6), checkpoint,
            recovery: "resume", plan: createUnresolvedRuntimePlan(root, "outcomeLibrary"),
        });
        const generate = jest.fn(async (root: string, request: {readonly signal?: AbortSignal}) => {
            await new Promise<void>((resolve) => {
                request.signal?.addEventListener("abort", () => resolve(), {once: true});
            });
            return cancelled(root);
        });
        const jobs = new StudioOutcomeLibraryGenerateJobService({generate} as unknown as StudioOutcomeLibraryGenerateService);
        const otherProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcome-library-job-other-"));
        try {
            const first = jobs.start(projectRoot, {});
            const second = jobs.start(otherProjectRoot, {});
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });

            // The project lifecycle must not release its context while this
            // generation still owns its checkpoint/publication cleanup.
            await jobs.cancelActiveForProject(projectRoot);
            expect(jobs.getStatusForProject(projectRoot, first.id)).toMatchObject({status: "cancelled", cancellationRequested: true});
            expect(jobs.getStatusForProject(otherProjectRoot, second.id)).toMatchObject({status: "running"});

            await jobs.cancelAll();
            expect(jobs.getStatusForProject(otherProjectRoot, second.id)).toMatchObject({status: "cancelled", cancellationRequested: true});
        } finally {
            fs.rmSync(otherProjectRoot, {recursive: true, force: true});
        }
    });

    it("keeps one resolved bundle destination owned until cancelled work finishes cleanup", async () => {
        const checkpoint: ExactEnumerationCheckpoint = {
            processedRawIndex: BigInt(1), progressTotal: BigInt(2), sourceEnumerationId: "fixture-source", grids: new Map(),
        };
        const destination = path.join(projectRoot, "shared-bundle");
        const generate = jest.fn(async (root: string, request: {readonly signal?: AbortSignal}) => {
            if (!request.signal?.aborted) {
                await new Promise<void>((resolve) => {
                    request.signal?.addEventListener("abort", () => resolve(), {once: true});
                });
            }
            return {
                status: "cancelled" as const, processedRawIndex: BigInt(1), progressTotal: BigInt(2), checkpoint,
                recovery: "resume", plan: createUnresolvedRuntimePlan(root, "outcomeLibrary"),
            };
        });
        const service = {
            generate,
            getPreflightBinding: jest.fn(() => ({requestKey: "request", gameId: "game", gameVersion: "1", destination, requiresBounded: false})),
        } as unknown as StudioOutcomeLibraryGenerateService;
        const jobs = new StudioOutcomeLibraryGenerateJobService(service);

        jobs.start(projectRoot, {preflightToken: "first"});
        expect(jobs.isDestinationActive(projectRoot, destination)).toBe(true);
        expect(() => jobs.start(projectRoot, {preflightToken: "second"})).toThrow("already active for this destination");

        await jobs.cancelAll();
        expect(jobs.isDestinationActive(projectRoot, destination)).toBe(false);
        expect(jobs.start(projectRoot, {preflightToken: "third"})).toMatchObject({status: "queued"});
        await jobs.cancelAll();
    });

    it("keeps bounded cancellation retryable without persisting or exposing an exact checkpoint", async () => {
        const generate = jest.fn((root: string) => ({
            status: "cancelled" as const,
            processedRawIndex: BigInt(2),
            progressTotal: BigInt(5),
            recovery: "Retry the same bounded request.",
            plan: createUnresolvedRuntimePlan(root, "outcomeLibrary"),
        }));
        const jobs = new StudioOutcomeLibraryGenerateJobService({generate} as unknown as StudioOutcomeLibraryGenerateService);

        const job = jobs.start(projectRoot, {generation: "sampled"});
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });

        expect(jobs.getStatusForProject(projectRoot, job.id)).toMatchObject({
            status: "cancelled",
            result: {status: "cancelled", recovery: expect.stringMatching(/Retry/)},
        });
        expect(jobs.getStatusForProject(projectRoot, job.id)?.result).not.toHaveProperty("checkpoint");
        expect(fs.existsSync(path.join(projectRoot, ".pokie", "outcome-library-checkpoints", `${job.id}.json`))).toBe(false);
    });

    it("rebinds an immutable checkpoint before resume and removes it after successful publication", async () => {
        const checkpoint: ExactEnumerationCheckpoint = {
            processedRawIndex: BigInt(1), progressTotal: BigInt(6), sourceEnumerationId: "fixture-source", grids: new Map(),
        };
        let runs = 0;
        const generate = jest.fn(async (root: string, request: {readonly signal?: AbortSignal}) => {
            runs += 1;
            if (runs === 1) {
                await new Promise<void>((resolve) => {
                    request.signal?.addEventListener("abort", () => {
                        resolve();
                    }, {once: true});
                });
                return {status: "cancelled" as const, processedRawIndex: BigInt(1), progressTotal: BigInt(6), checkpoint, recovery: "resume", plan: createUnresolvedRuntimePlan(root, "outcomeLibrary")};
            }
            return {
                status: "ok" as const, bundleDir: "outcomelibrary", files: [], warnings: [],
                mode: {modeName: "base", libraryId: "library", hash: "hash", outcomeCount: 1, totalWeight: 1, rtp: 1},
                generator: {} as never, coverage: 1, selector: {kind: "bundle" as const, bundleDir: "outcomelibrary", modeName: "base"}, plan: createUnresolvedRuntimePlan(root, "outcomeLibrary"),
            };
        });
        const binding = {requestKey: JSON.stringify({generation: "exact"}), gameId: "game", gameVersion: "1", configHash: "config", destination: path.join(projectRoot, "outcomelibrary")};
        const service = {
            generate,
            getPreflightBinding: jest.fn(() => binding),
            rebindCheckpointRequest: jest.fn((_root: string, request: unknown) => Promise.resolve({request: {...request as object, preflightToken: "fresh-token"}})),
        } as unknown as StudioOutcomeLibraryGenerateService;
        const jobs = new StudioOutcomeLibraryGenerateJobService(service);
        const job = jobs.start(projectRoot, {generation: "exact", preflightToken: "original-token"});
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        jobs.cancelForProject(projectRoot, job.id);
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        const checkpointPath = path.join(projectRoot, ".pokie", "outcome-library-checkpoints", `${job.id}.json`);
        expect(fs.existsSync(checkpointPath)).toBe(true);

        await jobs.resumeForProject(projectRoot, job.id);
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(service.rebindCheckpointRequest).toHaveBeenCalledWith(projectRoot, expect.objectContaining({generation: "exact", preflightToken: "original-token"}), expect.objectContaining({requestIdentity: expect.any(String)}));
        expect(jobs.getStatusForProject(projectRoot, job.id)).toMatchObject({status: "completed"});
        expect(fs.existsSync(checkpointPath)).toBe(false);
    });
});
