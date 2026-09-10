import fs from "fs";
import os from "os";
import path from "path";
import {
    describeWasmLifecycleBoundary,
    type ArtifactConversionPlan,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleValidator,
    Paytable,
    type ExactEnumerationCheckpoint,
    type PokieGame,
    type SymbolsCombinationsGenerating,
    SymbolsSequence,
    VideoSlotConfig,
    VideoSlotSession,
} from "pokie";
import {createUnresolvedRuntimePlan} from "../../../../cli/studio/artifacts/createExternalArtifactConversionPlan.js";
import type {StudioOutcomeLibraryGenerateResultView} from "../../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateResultView.js";
import {StudioOutcomeLibraryGenerateJobService} from "../../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateJobService.js";
import {StudioOutcomeLibraryGenerateService} from "../../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.js";

const plannedOutcomeLibrary: ArtifactConversionPlan = {
    status: "planned",
    source: {kind: "tsPackage", capabilities: ["outcome-library-generate"]},
    target: {kind: "outcomeLibrary", capabilities: ["outcome-library-read"]},
    steps: [{kind: "generateOutcomeLibrary", choice: "materialize", estimatedWork: "generate", input: {kind: "tsPackage", capabilities: []}, output: {kind: "outcomeLibrary", capabilities: []}}],
    preflight: {destinationKind: "directory", estimatedWork: "generate", losses: [], oneWay: false},
};

function build614656OutcomeGame(): PokieGame {
    const symbols = Array.from({length: 28}, (_unused, index) => `S${index}`);
    const config = new VideoSlotConfig<string>();
    config.setReelsNumber(4);
    config.setReelsSymbolsNumber(1);
    config.setAvailableSymbols(symbols);
    const paytable = new Paytable<string>(config.getAvailableBets(), symbols, [], 4);
    paytable.setPayoutForSymbol("S0", 4, 1);
    config.setPaytable(paytable);
    config.setSymbolsSequences(Array.from({length: 4}, () => new SymbolsSequence<string>().fromNumbersOfSymbols(
        Object.fromEntries(symbols.map((symbol) => [symbol, 1])),
    )));
    return {
        getManifest: () => ({id: "studio-614656-slot", name: "Studio 614,656 Slot", version: "1.0.0"}),
        createSession: () => new VideoSlotSession<string>(config),
        createExactEnumerationSession: (generator: SymbolsCombinationsGenerating) => new VideoSlotSession<string>(config, generator),
    };
}

describe("StudioOutcomeLibraryGenerateJobService", () => {
    let projectRoot: string;

    beforeEach(() => {
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcome-library-job-"));
    });

    afterEach(() => {
        fs.rmSync(projectRoot, {recursive: true, force: true});
    });

    it("rejects every real WASM sidecar state before reserving or resuming a job", async () => {
        const wasmPath = path.join(projectRoot, "component.wasm");
        const sidecar = `${wasmPath}.pokie-wasm.json`;
        fs.writeFileSync(wasmPath, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
        const compatible = {
            schemaVersion: "1.0.0", component: {id: "fixture", version: "1.0.0"},
            serialization: {session: "session", play: "play", state: "state"}, host: {rng: "rng", services: []}, capabilities: [],
        };
        const generate = jest.fn();
        const jobs = new StudioOutcomeLibraryGenerateJobService({
            generate,
            wasmBoundaryDiagnostic: (projectPath: string) => describeWasmLifecycleBoundary(projectPath, "generate an Outcome Library"),
        } as unknown as StudioOutcomeLibraryGenerateService);
        const cases: readonly [string | undefined, RegExp][] = [
            [JSON.stringify(compatible), /cannot generate an Outcome Library/],
            [undefined, /no compatible PokieWasmComponentManifest sidecar/],
            ["{", /sidecar at/],
            [JSON.stringify({...compatible, schemaVersion: "2.0.0"}), /not compatible with this POKIE build/],
        ];
        for (const [contents, expected] of cases) {
            if (contents === undefined) fs.rmSync(sidecar, {force: true});
            else fs.writeFileSync(sidecar, contents);
            expect(() => jobs.start(wasmPath, {})).toThrow(expected);
            await expect(jobs.resumeForProject(wasmPath, "checkpoint")).rejects.toThrow(expected);
            expect(jobs.listForProject(wasmPath)).toEqual([]);
        }
        expect(generate).not.toHaveBeenCalled();
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

    it("exposes the writer's real terminal lifecycle stages instead of leaving 100% work labelled as generation", async () => {
        const generate = jest.fn((root: string, _request: unknown, onLifecycleStage?: (stage: "finalization") => void) => {
            onLifecycleStage?.("finalization");
            return {
                status: "cancelled" as const,
                processedRawIndex: BigInt(5),
                progressTotal: BigInt(5),
                recovery: "Retry after finalization.",
                plan: createUnresolvedRuntimePlan(root, "outcomeLibrary"),
            };
        });
        const jobs = new StudioOutcomeLibraryGenerateJobService({generate} as unknown as StudioOutcomeLibraryGenerateService);
        const started = jobs.start(projectRoot, {generation: "sampled"});

        expect(started).toMatchObject({status: "queued", lifecycleStage: "generation"});
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(jobs.getStatusForProject(projectRoot, started.id)).toMatchObject({status: "cancelled", lifecycleStage: "finalization"});
    });

    it("reports a retry conflict for a missing persisted recovery instead of silently losing the job", async () => {
        const jobs = new StudioOutcomeLibraryGenerateJobService({generate: jest.fn()} as unknown as StudioOutcomeLibraryGenerateService);

        await expect(jobs.resumeForProject(projectRoot, "f8b7f8bb-2b27-4c87-a136-04910e1602fe")).resolves.toMatchObject({
            status: "failed",
            result: {status: "conflict", error: expect.stringMatching(/missing or corrupt/i)},
        });
        expect(fs.existsSync(path.join(projectRoot, "outcomelibrary"))).toBe(false);
    });

    it("rejects a persisted checkpoint whose recovery authority was redirected without touching external state", async () => {
        const checkpoint: ExactEnumerationCheckpoint = {
            processedRawIndex: BigInt(1), progressTotal: BigInt(6), sourceEnumerationId: "fixture-source", grids: new Map(),
        };
        const generate = jest.fn(async (root: string, request: {readonly signal?: AbortSignal}) => {
            await new Promise<void>((resolve) => {
                request.signal?.addEventListener("abort", () => resolve(), {once: true});
            });
            return {status: "cancelled" as const, processedRawIndex: BigInt(1), progressTotal: BigInt(6), checkpoint, recovery: "resume", plan: createUnresolvedRuntimePlan(root, "outcomeLibrary")};
        });
        const rebindCheckpointRequest = jest.fn();
        const jobs = new StudioOutcomeLibraryGenerateJobService({generate, rebindCheckpointRequest} as unknown as StudioOutcomeLibraryGenerateService);
        const job = jobs.start(projectRoot, {generation: "exact"});
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        jobs.cancelForProject(projectRoot, job.id);
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        const checkpointPath = path.join(projectRoot, ".pokie", "outcome-library-checkpoints", `${job.id}.json`);
        const persisted = JSON.parse(fs.readFileSync(checkpointPath, "utf8")) as {checkpoint: {recoveryAuthorityId: string}};
        persisted.checkpoint.recoveryAuthorityId = "8cf7648a-6884-47f2-bffd-269811ab1d7c";
        fs.writeFileSync(checkpointPath, JSON.stringify(persisted));
        const externalDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-external-recovery-"));
        const externalFile = path.join(externalDirectory, "untouched.txt");
        fs.writeFileSync(externalFile, "external");
        try {
            await expect(jobs.resumeForProject(projectRoot, job.id)).resolves.toMatchObject({
                status: "failed", result: {status: "conflict", error: expect.stringMatching(/missing or corrupt/i)},
            });
            expect(rebindCheckpointRequest).not.toHaveBeenCalled();
            expect(fs.readFileSync(externalFile, "utf8")).toBe("external");
        } finally {
            fs.rmSync(externalDirectory, {recursive: true, force: true});
        }
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

    it("persists, restarts, and deeply validates a native 614,656-outcome Studio recovery", async () => {
        const game = build614656OutcomeGame();
        const createService = () => new StudioOutcomeLibraryGenerateService(
            "9.9.9",
            () => Promise.resolve(game),
            undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
            {prepare: () => Promise.resolve(plannedOutcomeLibrary)},
        );
        const first = createService();
        const preflight = await first.estimate(projectRoot, {generation: "exact"});
        if (preflight.status !== "ok") throw new Error(`expected exact preflight, got ${preflight.status}`);
        const initialJobs = new StudioOutcomeLibraryGenerateJobService(first);
        const started = initialJobs.start(projectRoot, {generation: "exact", preflightToken: preflight.preflightToken});
        let running = initialJobs.getStatusForProject(projectRoot, started.id);
        while (running?.progress === undefined) {
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });
            running = initialJobs.getStatusForProject(projectRoot, started.id);
        }
        initialJobs.cancelForProject(projectRoot, started.id);
        do {
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });
            running = initialJobs.getStatusForProject(projectRoot, started.id);
        } while (running?.status === "queued" || running?.status === "running");
        expect(running).toMatchObject({status: "cancelled", result: {checkpoint: {id: started.id, progressTotal: "614656"}}});

        const checkpointPath = path.join(projectRoot, ".pokie", "outcome-library-checkpoints", `${started.id}.json`);
        const stagingDirectory = path.join(projectRoot, ".pokie", "outcome-library-recovery", started.id);
        expect(fs.existsSync(checkpointPath)).toBe(true);
        expect(fs.existsSync(stagingDirectory)).toBe(true);

        const restartedJobs = new StudioOutcomeLibraryGenerateJobService(createService());
        await restartedJobs.resumeForProject(projectRoot, started.id);
        let resumed = restartedJobs.getStatusForProject(projectRoot, started.id);
        while (resumed?.status === "queued" || resumed?.status === "running") {
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });
            resumed = restartedJobs.getStatusForProject(projectRoot, started.id);
        }
        expect(resumed).toMatchObject({status: "completed", result: {status: "ok", mode: {outcomeCount: 614_656}, generator: {strategy: "exact", totalOutcomeSpaceSize: 614_656}}});
        const bundleDir = path.join(projectRoot, "outcomelibrary");
        expect(await new OutcomeLibraryBundleValidator().validate(bundleDir, {deep: true})).toEqual([]);
        const manifest = await new OutcomeLibraryBundleReader().readManifest(bundleDir);
        expect(manifest).toMatchObject({game: {id: "studio-614656-slot"}, modes: [expect.objectContaining({outcomeCount: 614_656, generator: expect.objectContaining({strategy: "exact", totalOutcomeSpaceSize: 614_656})})]});
        expect(fs.existsSync(checkpointPath)).toBe(false);
        expect(fs.existsSync(stagingDirectory)).toBe(false);
    }, 3_600_000);
});
