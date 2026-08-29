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

            jobs.cancelActiveForProject(projectRoot);
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });
            expect(jobs.getStatusForProject(projectRoot, first.id)).toMatchObject({status: "cancelled", cancellationRequested: true});
            expect(jobs.getStatusForProject(otherProjectRoot, second.id)).toMatchObject({status: "running"});

            jobs.cancelAll();
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });
            expect(jobs.getStatusForProject(otherProjectRoot, second.id)).toMatchObject({status: "cancelled", cancellationRequested: true});
        } finally {
            fs.rmSync(otherProjectRoot, {recursive: true, force: true});
        }
    });
});
