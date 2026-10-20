import {existingMechanicsBlueprint, generatedMechanicsGame, replayModesBlueprint} from "../../../v2/fixtures/ExistingMechanicsGame.js";
import {emitPublicRuntime} from "../../../v2/helpers/publicRuntime.js";
import ts from "typescript";
import {StudioReplayExecutionService} from "../../../../cli/studio/replay/StudioReplayExecutionService.js";
import {buildReplayDownload} from "../../../../cli/studio/replay/buildReplayDownload.js";
import {describeReplayResult} from "../../../../cli/studio-client/src/domain/interpret/Replay.js";
import {buildSimulationReportDownload} from "../../../../cli/studio/simulation/buildSimulationReportDownload.js";
import {validateSimulationRequest} from "../../../../cli/studio/simulation/validateSimulationRequest.js";
import {createOverscanGame} from "../../../v2/fixtures/OverscanGame.js";
import {
    AUTHORED_MECHANIC_CATALOG,
    BetModeSelecting,
    ForcingBetModeSelectionRejectedError,
    GamePackageGenerator,
    ReplayDescriptor,
    ReplayRecorder,
    isSimulationReportSet,
    GameSessionHandling,
    loadPokieGame,
    OutcomeLibraryBundleWriter,
    PokieGame,
    PokieGamePackageValidating,
    PokieGamePackageValidationReport,
    PokieGameManifest,
    PokieProject,
    ProjectTargetResolver,
    PROJECT_TYPE_CAPABILITIES,
    SIM_OPERATION,
    assessWasmComponentCompatibility,
    hasDeclaredCanonicalWasmArtifact,
    hasDeclaredCanonicalWasmOperation,
    loadPokieWasmFileRuntime,
    readCanonicalWasmDeclaration,
    SeededPokieWasmHost,
} from "@fromstan/pokie";
import ExcelJS from "exceljs";
import fs from "fs";
import os from "os";
import path from "path";
import {InMemoryStudioSimulationRepository} from "../../../../cli/studio/simulation/InMemoryStudioSimulationRepository.js";
import {BlueprintMaterializationError} from "../../../../cli/materialize/BlueprintMaterializationError.js";
import {BlueprintProjectMaterializer} from "../../../../cli/materialize/BlueprintProjectMaterializer.js";
import {createMaterializingRuntimePackageResolver} from "../../../../cli/materialize/materializeRuntimePackage.js";
import {StudioSimulationJobView} from "../../../../cli/studio/simulation/StudioSimulationJobView.js";
import {StudioSimulationService} from "../../../../cli/studio/simulation/StudioSimulationService.js";
import {FileStudioJobRepository} from "../../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../../cli/studio/jobs/StudioJobService.js";
import {buildOutcomeLibraryBundleModeInput} from "../../../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";
import {createCanonicalWasmFixture} from "../../../fixtures/wasm/createCanonicalWasmFixture.js";

it.each(["simulation", "replay"] as const)("retains %s acquisition failures and safely reuses the same service after repair", async surface => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "v2c22-acquisition-"));
    const artifact = path.join(directory, "game.wasm");
    const sidecar = `${artifact}.pokie-wasm.json`;
    const options = {availableBets: [0.05], reelStrips: [["A"], ["A"]]};
    const fixture = createCanonicalWasmFixture(options);
    const tampered = createCanonicalWasmFixture({...options, trapping: true});
    const jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
    const completed = jest.fn();
    const simulation = new StudioSimulationService(undefined, undefined, undefined, 1, undefined, undefined, undefined, undefined, undefined, undefined, undefined, completed);
    const replay = new StudioReplayExecutionService(undefined, undefined, 1, undefined, undefined, undefined, undefined, completed);
    const service = surface === "simulation" ? simulation : replay;
    service.attachJobService(jobs);
    const operation = surface === "simulation" ? "simulate game rounds" : "replay a game round";
    const capability = surface === "simulation" ? "runtime.play" : "runtime.replay";
    const start = () => surface === "simulation" ? simulation.start(artifact, {rounds: 1, seed: "stale"}) : replay.start(artifact, {round: 1, seed: "stale"});
    const status = (id: string) => surface === "simulation" ? simulation.getStatus(id) : replay.getStatus(artifact, id);
    const result = (id: string) => surface === "simulation" ? simulation.getReport(artifact, id) : replay.getDownload(artifact, id);
    const settle = async (id: string) => {
        // Drain the actual executor and terminal publication, without a timer/mock loader.
        const deadline = Date.now() + 5000;
        while (service.getActiveCount() > 0) {
            if (Date.now() > deadline) throw new Error(`Acquisition job ${id} did not drain.`);
            await new Promise<void>(resolve => {
                setImmediate(resolve);
            });
        }
        return status(id);
    };
    const repair = () => {
        fs.writeFileSync(artifact, fixture.bytes);
        fs.writeFileSync(sidecar, JSON.stringify(fixture.manifest));
    };
    const succeed = async () => {
        const started = start();
        if (started.status !== "created") throw new Error(JSON.stringify(started));
        expect(await settle(started.job.id)).toMatchObject({status: "completed"});
        expect(result(started.job.id)).toMatchObject(surface === "simulation"
            ? {status: "ok", report: {rounds: 1, totalBet: 0.05, totalWin: 0.1}}
            : {status: "ok", descriptor: {round: 1, totalBet: 0.05, totalWin: 0.1, credits: expect.closeTo(1000.05, 8), screen: [["A"], ["A"]]}});
        // Terminal cancellation is a no-op and cannot poison the next execution.
        expect(surface === "simulation" ? simulation.cancel(started.job.id) : replay.cancel(artifact, started.job.id)).toMatchObject({status: "completed"});
    };
    try {
        repair();
        await succeed();
        for (const replacement of [
            // The exact independent malformed-input reproducer, with the original sidecar.
            {bytes: new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]), manifest: fixture.manifest},
            {bytes: fixture.bytes, manifest: {...fixture.manifest, artifact: {...fixture.manifest.artifact!, configurationHash: `sha256:${"0".repeat(64)}`}}},
            // Coordinated executable + outer integrity edits still fail canonical lowering.
            tampered,
        ]) {
            const priorCompletions = completed.mock.calls.length;
            fs.writeFileSync(artifact, replacement.bytes);
            fs.writeFileSync(sidecar, JSON.stringify(replacement.manifest));
            expect(readCanonicalWasmDeclaration(artifact, operation)).toMatchObject({supported: true});
            expect(hasDeclaredCanonicalWasmArtifact(artifact)).toBe(false);
            expect(hasDeclaredCanonicalWasmOperation(artifact, capability)).toBe(false);
            await expect(loadPokieWasmFileRuntime(artifact, new SeededPokieWasmHost("stale"))).rejects.toThrow(/integrity|canonical|descriptor|module|configuration|lowering/i);
            const started = start();
            if (started.status !== "created") throw new Error(JSON.stringify(started));
            expect(await settle(started.job.id)).toMatchObject({status: "failed", error: expect.stringMatching(/integrity|canonical|descriptor|module|configuration|lowering/i)});
            expect(jobs.get(artifact, started.job.id)).toMatchObject({status: "failed"});
            expect(result(started.job.id)).toEqual({status: "not-ready", jobStatus: "failed"});
            expect(completed).toHaveBeenCalledTimes(priorCompletions);
            expect(service.getActiveCount()).toBe(0);
            repair();
            await succeed();
            await succeed();
        }
        // Shape-invalid integrity metadata is not an executable acquisition attempt.
        for (const bytes of ["8", -1]) {
            const malformed = {...fixture.manifest, artifact: {...fixture.manifest.artifact!, bytes}};
            fs.writeFileSync(sidecar, JSON.stringify(malformed));
            expect(assessWasmComponentCompatibility(malformed)).toMatchObject({compatible: false, issues: expect.arrayContaining([expect.objectContaining({path: "artifact"})])});
            expect(readCanonicalWasmDeclaration(artifact, operation)).toMatchObject({supported: false, message: expect.stringContaining('"artifact"')});
            expect(start()).toMatchObject({status: "unsupported", message: expect.stringContaining('"artifact"')});
            expect(service.getActiveCount()).toBe(0);
            repair();
            await succeed();
        }
        fs.writeFileSync(sidecar, JSON.stringify({...fixture.manifest, capabilities: []}));
        expect(start()).toMatchObject({status: "unsupported", message: expect.stringContaining(capability)});
        repair();
        if (surface === "simulation") {
            expect(simulation.start(artifact, {rounds: 1, workers: 2})).toMatchObject({status: "unsupported"});
            expect(simulation.start(artifact, {rounds: 1, convergence: {minRounds: 1, rtpTolerance: 0.01, checkIntervalRounds: 1}})).toMatchObject({status: "unsupported"});
        }
        await succeed();
    } finally {
        await service.cancelAll();
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

it("samples actual portable purchase stake, lifecycle and weighted selections across all modes", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "v2c21-simulation-"));
    const artifact = path.join(directory, "game.wasm");
    const blueprint = replayModesBlueprint(true);
    blueprint.reelSequences!.forEach(reel => {
        if (reel.type === "weighted") reel.variants = reel.variants.map(variant => ({...variant, weight: variant.id === "first" ? 1 : 0}));
    });
    blueprint.paytable.A = {3: 2};
    const fixture = createCanonicalWasmFixture({blueprint});
    fs.writeFileSync(artifact, fixture.bytes);
    fs.writeFileSync(`${artifact}.pokie-wasm.json`, JSON.stringify(fixture.manifest));
    const service = new StudioSimulationService(new InMemoryStudioSimulationRepository());
    try {
        const started = service.start(artifact, {rounds: 4, seed: "purchase", modeName: "all"});
        if (started.status !== "created") throw new Error(JSON.stringify(started));
        const job = await waitForTerminal(service, started.job.id);
        if (job.status !== "completed") throw new Error(JSON.stringify(job));
        const result = service.getReport(artifact, started.job.id);
        if (result.status !== "ok" || !isSimulationReportSet(result.report)) throw new Error(JSON.stringify(result));
        expect(Object.keys(result.report.modes)).toEqual(["base", "ante", "buy", "buy-more"]);
        expect(result.report.modes.buy).toMatchObject({rounds: 2, totalBet: 1, totalWin: 0.4});
        expect(result.report.modes.buy.reelSequences).toHaveLength(3);
        expect(result.report.modes.buy.reelSequences?.map(reel => reel.selections)).toEqual([2, 2, 2]);
        expect(result.report.modes.buy.sampling).toMatchObject({acceptedSubrounds: 4, excludedSubrounds: 0});
        expect(result.report.modes.buy.logicalRounds).toMatchObject({rounds: 2, totalStake: 1, totalWin: 0.4});
    } finally {
        await service.cancelAll();
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

function createFakeSession(options: {failOnRound?: number; stopAfterRounds?: number} = {}): GameSessionHandling {
    let credits = 1000;
    let bet = 1;
    let round = 0;
    let winAmount = 0;

    return {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: (value: number) => {
            bet = value;
        },
        getAvailableBets: () => [1, 2, 5],
        canPlayNextGame: () => options.stopAfterRounds === undefined || round < options.stopAfterRounds,
        play: () => {
            round++;
            if (options.failOnRound !== undefined && round === options.failOnRound) {
                throw new Error(`fake session failed on round ${round}`);
            }
            winAmount = round % 5 === 0 ? bet * 10 : 0;
            credits = credits - bet + winAmount;
        },
        getWinAmount: () => winAmount,
    };
}

function createFakeGame(manifest: PokieGameManifest, sessionOptions: Parameters<typeof createFakeSession>[0] = {}): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => createFakeSession(sessionOptions),
    };
}

// A session implementing the same StakeAmountDetermining contract as SimCommand.test.ts's own
// createFreeGamesAwareFakeGame — round % 5 === 4 is an unstaked (free games) round.
function createFreeGamesAwareFakeGame(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            let credits = 1000;
            const bet = 1;
            let round = 0;
            let pendingWin = 0;
            return {
                getCreditsAmount: () => credits,
                setCreditsAmount: (value: number) => {
                    credits = value;
                },
                getBet: () => bet,
                setBet: () => undefined,
                getAvailableBets: () => [1],
                canPlayNextGame: () => true,
                getStakeAmount: () => (round % 5 === 4 ? 0 : bet),
                play: () => {
                    pendingWin = round % 10 === 0 ? 10 : 0;
                    round++;
                    credits = credits - (round % 5 === 0 ? 0 : bet) + pendingWin;
                },
                getWinAmount: () => pendingWin,
            } as unknown as GameSessionHandling;
        },
    };
}

function flushMacrotask(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

async function waitForTerminal(service: StudioSimulationService, id: string): Promise<StudioSimulationJobView> {
    // PAR recognition performs real asynchronous ZIP/filesystem work. A fixed
    // number of setImmediate ticks can expire before that I/O runs on a busy
    // gate worker, leaving it to finish after Jest tears down this environment.
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        const job = service.getStatus(id);
        if (job && job.status !== "queued" && job.status !== "running" && job.status !== "cancelling") {
            return job;
        }
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 5);
        });
    }
    throw new Error("Timed out waiting for the simulation to reach a terminal state.");
}

// A controllable substitute for the real setImmediate-based yieldToEventLoop: each call queues its
// own resolver rather than resolving immediately, so a test can precisely pause the chunk loop
// between chunks, inspect intermediate progress, then release it one step at a time.
function createControlledYield(): {yieldToEventLoop: () => Promise<void>; pendingCount: () => number; release: () => void} {
    const pending: Array<() => void> = [];
    return {
        yieldToEventLoop: () =>
            new Promise<void>((resolve) => {
                pending.push(resolve);
            }),
        pendingCount: () => pending.length,
        release: () => {
            const resolve = pending.shift();
            resolve?.();
        },
    };
}

describe("StudioSimulationService", () => {
    const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

    it.each([[false, false], [true, false], [false, true], [true, true]])("withholds output through release rejection=%s and cancellation=%s", async (rejectRelease, cancelDuringRelease) => {
        let clock = 1000;
        let finishRelease!: () => void;
        let rejectCleanup!: (error: Error) => void;
        const release = jest.fn(() => new Promise<void>((resolve, reject) => {
            finishRelease = resolve;
            rejectCleanup = reject;
        }));
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-simulation-release-boundary-"));
        const durableRepository = new FileStudioJobRepository(directory);
        const durableJobs = new StudioJobService(durableRepository, () => clock);
        const repository = new InMemoryStudioSimulationRepository();
        const onCompleted = jest.fn();
        const service = new StudioSimulationService(repository, () => Promise.resolve(createFakeGame(manifest)), undefined, undefined, () => clock, undefined, undefined, undefined, undefined, undefined, () => Promise.resolve({runtimePath: "/a", release}), onCompleted);
        service.attachJobService(durableJobs);
        const result = service.start("/a", {rounds: 1, seed: "cleanup"});
        if (result.status !== "created") throw new Error("expected created job");
        try {
            for (let attempt = 0; !release.mock.calls.length && attempt < 100; attempt++) {
                await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
            }
            expect(release).toHaveBeenCalledTimes(1);
            expect(service.getStatusForProject("/a", result.job.id)?.progress?.stage).toBe("finalizing / cleanup");
            expect(service.getReport("/a", result.job.id)).toEqual({status: "not-ready", jobStatus: "running"});
            expect(service.getStatusForProject("/a", result.job.id)?.report).toBeUndefined();
            expect(durableJobs.get("/a", result.job.id)?.result).toBeUndefined();
            expect(onCompleted).not.toHaveBeenCalled();
            expect(service.listReports("/a")).toEqual([]);
            if (cancelDuringRelease) {
                expect(service.cancelForProject("/a", result.job.id)?.status).toBe("cancelling");
                expect(durableJobs.get("/a", result.job.id)?.status).toBe("cancelling");
                expect(onCompleted).not.toHaveBeenCalled();
            }
            clock = 1300;
            if (rejectRelease) rejectCleanup(new Error("release destination is busy"));
            else finishRelease();
            for (let attempt = 0; service.getActiveCount() && attempt < 100; attempt++) {
                await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
            }
            expect(service.getActiveCount()).toBe(0);
            if (rejectRelease) {
                expect(service.getStatusForProject("/a", result.job.id)).toMatchObject({status: "failed", error: expect.stringContaining("restart Studio before retrying"), recovery: {action: "retry", reason: expect.stringContaining("restart Studio before retrying")}});
                expect(service.getReport("/a", result.job.id)).toEqual({status: "not-ready", jobStatus: "failed"});
                expect(durableJobs.get("/a", result.job.id)?.result).toBeUndefined();
                expect(onCompleted).not.toHaveBeenCalled();
                await expect(service.cancelAll()).rejects.toThrow("release destination is busy");
                // A failed drainage must not authorize a graceful shutdown marker.
                await expect(durableJobs.completeGracefulShutdown(false)).rejects.toThrow("could not confirm executor cleanup");
                expect(durableRepository.getProcessState()?.status).toBe("running");
            } else if (cancelDuringRelease) {
                expect(service.getReport("/a", result.job.id)).toEqual({status: "not-ready", jobStatus: "cancelled"});
                expect(durableJobs.get("/a", result.job.id)).toMatchObject({status: "cancelled", recovery: {action: "retry"}});
                expect(durableJobs.get("/a", result.job.id)?.result?.outputs).toBeUndefined();
                expect(repository.get(result.job.id)?.report).toBeUndefined();
                expect(onCompleted).not.toHaveBeenCalled();
                expect(service.listReports("/a")).toEqual([]);
                await service.cancelAll();
            } else {
                expect(service.getReport("/a", result.job.id).status).toBe("ok");
                expect(service.getReport("/a", result.job.id)).toMatchObject({report: {durationMs: 300, spinsPerSecond: 3}});
                expect(service.getStatusForProject("/a", result.job.id)?.durationMs).toBe(300);
                expect(durableJobs.get("/a", result.job.id)?.result?.detail?.report).toMatchObject({durationMs: 300, spinsPerSecond: 3});
                expect(onCompleted).toHaveBeenCalledTimes(1);
                expect(onCompleted.mock.calls[0]?.[0].status).toBe("completed");
                expect(onCompleted.mock.calls[0]?.[0].report?.durationMs).toBe(300);
                expect(service.listReports("/a")).toHaveLength(1);
                await service.cancelAll();
            }
        } finally {
            finishRelease();
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it.each([false, true])("keeps WASM cancellation pending through asynchronous disposal rejection=%s", async (rejectDisposal) => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-wasm-simulation-cleanup-"));
        const wasmPath = path.join(workDir, "game.wasm");
        const fixture = createCanonicalWasmFixture({capabilities: ["runtime.play"]});
        fs.writeFileSync(wasmPath, fixture.bytes);
        fs.writeFileSync(`${wasmPath}.pokie-wasm.json`, JSON.stringify(fixture.manifest));
        const gate = createControlledYield();
        let finishDisposal!: () => void;
        let failDisposal!: (error: Error) => void;
        const disposeRuntime = jest.fn(() => new Promise<void>((resolve, reject) => {
            finishDisposal = resolve;
            failDisposal = reject;
        }));
        const disposeSession = jest.fn();
        const runtime = {
            manifest: fixture.manifest,
            createSession: () => ({
                play: () => Promise.resolve({stake: 1, payout: 1}),
                serialize: () => ({schemaVersion: "pokie.state.v2", seed: "cleanup", drawCount: 2, sequence: 1, credits: 1000}),
                dispose: disposeSession,
            }),
            dispose: disposeRuntime,
        };
        const service = new StudioSimulationService(
            undefined,
            undefined,
            undefined,
            1,
            undefined,
            gate.yieldToEventLoop,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            () => Promise.resolve(runtime as never),
        );
        try {
            const started = service.start(wasmPath, {rounds: 2, seed: "cleanup"});
            if (started.status !== "created") throw new Error(JSON.stringify(started));
            for (let attempt = 0; attempt < 20 && gate.pendingCount() === 0; attempt++) await flushMacrotask();
            expect(gate.pendingCount()).toBe(1);
            service.cancel(started.job.id);
            gate.release();
            for (let attempt = 0; attempt < 20 && disposeRuntime.mock.calls.length === 0; attempt++) await flushMacrotask();
            expect(service.getActiveCount()).toBe(1);
            expect(service.getReport(wasmPath, started.job.id)).toEqual({status: "not-ready", jobStatus: "cancelling"});
            if (rejectDisposal) failDisposal(new Error("WASM release rejected"));
            else finishDisposal();
            await expect(waitForTerminal(service, started.job.id)).resolves.toMatchObject({status: rejectDisposal ? "failed" : "cancelled"});
            expect(service.getActiveCount()).toBe(0);
            if (rejectDisposal) await expect(service.cancelAll()).rejects.toThrow("WASM release rejected");
            expect(disposeSession).toHaveBeenCalledTimes(1);
            expect(disposeRuntime).toHaveBeenCalledTimes(1);
        } finally {
            finishDisposal?.();
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("runs a small simulation to completion and builds a SimulationReport", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFakeGame(manifest)),
        );

        const result = service.start("/a", {rounds: 50, seed: "demo"});
        expect(result.status).toBe("created");
        if (result.status !== "created") {
            return;
        }
        expect(result.job.status).toBe("queued");

        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("completed");
        expect(job.report).toBeDefined();
        expect(job.report?.game).toEqual(manifest);
        expect(job.report?.rounds).toBe(50);
        expect(job.report?.requestedRounds).toBe(50);
        expect(job.report?.seed).toBe("demo");
        expect(job.roundsCompleted).toBe(50);
        expect(job.statistics).toBeDefined();
        expect(typeof job.statistics?.volatility).toBe("number");
        expect(typeof job.statistics?.rtpConfidenceInterval95.low).toBe("number");
        expect(job.statistics?.payoutHistogram).toBeDefined();
        expect(Object.keys(job.statistics?.payoutHistogram ?? {}).length).toBeGreaterThan(0);
    });

    it("materializes a Blueprint through its build capability before the package simulation runner loads it", async () => {
        const blueprintPath = "/projects/sample-slot.blueprint.json";
        const runtimePath = "/runtime-cache/sample-slot";
        const blueprintProject: PokieProject = {
            type: "blueprint",
            rootPath: blueprintPath,
            capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
            provenance: "test Blueprint",
        };
        const release = jest.fn(() => Promise.resolve());
        const materialize = jest.fn(() => Promise.resolve({runtimePath, ownsRuntimePath: true, release}));
        const resolveProject = {resolve: jest.fn(() => Promise.resolve(blueprintProject))};
        const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver("1.3.0", SIM_OPERATION, undefined, {
            resolveProject,
            materializer: {materialize},
        });
        const loadGame = jest.fn(() => Promise.resolve(createFakeGame(manifest)));
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            loadGame,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            resolveRuntimePackageRoot,
        );

        const result = service.start(blueprintPath, {rounds: 5});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("completed");
        expect(resolveProject.resolve).toHaveBeenCalledWith(blueprintPath);
        expect(materialize).toHaveBeenCalledWith(blueprintProject, expect.objectContaining({signal: expect.any(AbortSignal)}));
        expect(loadGame).toHaveBeenCalledWith(runtimePath);
        expect(loadGame).not.toHaveBeenCalledWith(blueprintPath);
        expect(release).toHaveBeenCalledTimes(1);
    });

    it("fails corrupt and incomplete PAR preparation without loading a game or publishing a simulation report", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-sim-malformed-par-"));
        const corrupt = path.join(workDir, "corrupt.xlsx");
        const incomplete = path.join(workDir, "incomplete.xlsx");
        fs.writeFileSync(corrupt, "not an XLSX");
        const workbook = new ExcelJS.Workbook();
        workbook.addWorksheet("Manifest");
        await workbook.xlsx.writeFile(incomplete);
        const loadGame = jest.fn(() => Promise.resolve(createFakeGame(manifest)));
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(), loadGame, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
            createMaterializingRuntimePackageResolver("1.3.0", SIM_OPERATION),
        );

        try {
            for (const workbookPath of [corrupt, incomplete]) {
                const started = service.start(workbookPath, {rounds: 5});
                if (started.status !== "created") throw new Error("expected job to be created");
                const job = await waitForTerminal(service, started.job.id);
                expect(job).toMatchObject({
                    status: "failed",
                    error: expect.stringMatching(/Cannot prepare a runnable runtime.*PAR workbook recognition.*failed PAR recognition\/import stage.*Next:/),
                });
                expect(job.report).toBeUndefined();
            }
            expect(loadGame).not.toHaveBeenCalled();
        } finally {
            await service.cancelAll();
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("cancels the real PAR resolver preparation without loading a game, publishing a report, or retaining either stage", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-sim-par-"));
        const cacheRoot = path.join(workDir, "cache");
        const workbookPath = path.join(workDir, "slot.par.xlsx");
        fs.copyFileSync(path.join(process.cwd(), "examples", "parsheets", "starter.par.xlsx"), workbookPath);
        let signalRuntimeDependenciesStarted: () => void;
        const runtimeDependenciesStarted = new Promise<void>((resolve) => {
            signalRuntimeDependenciesStarted = resolve;
        });
        const runCommand = jest.fn((_command: string, _args: string[], _cwd: string, options: {signal?: AbortSignal} = {}) =>
            new Promise<never>((_resolve, reject) => {
                signalRuntimeDependenciesStarted();
                if (options.signal?.aborted) {
                    reject(new Error("cancelled"));
                    return;
                }
                options.signal?.addEventListener("abort", () => reject(new Error("cancelled")), {once: true});
            }),
        );
        const packageValidator: PokieGamePackageValidating = {
            validate: (packageRoot: string): Promise<PokieGamePackageValidationReport> => Promise.resolve({
                packageRoot,
                valid: true,
                game: manifest,
                errors: [],
                warnings: [],
                suggestions: [],
            }),
        };
        const materializer = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, runCommand, packageValidator, cacheRoot);
        const materialize = jest.spyOn(materializer, "materialize");
        const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver("1.3.0", SIM_OPERATION, undefined, {materializer});
        const loadGame = jest.fn(() => Promise.resolve(createFakeGame(manifest)));
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(), loadGame, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, resolveRuntimePackageRoot,
        );

        try {
            const started = service.start(workbookPath, {rounds: 5});
            if (started.status !== "created") throw new Error("expected job to be created");
            await runtimeDependenciesStarted;
            const temporaryBlueprint = materialize.mock.calls[0][0].rootPath;
            const parStage = path.dirname(temporaryBlueprint);
            const runtimeStage = runCommand.mock.calls[0][2] as string;
            expect(fs.existsSync(parStage)).toBe(true);
            expect(fs.existsSync(runtimeStage)).toBe(true);
            expect(fs.readdirSync(cacheRoot).some((entry) => entry.endsWith(".lock"))).toBe(true);

            service.cancel(started.job.id);
            const job = await waitForTerminal(service, started.job.id);

            expect(job.status).toBe("cancelled");
            expect(job.report).toBeUndefined();
            expect(loadGame).not.toHaveBeenCalled();
            expect(fs.existsSync(parStage)).toBe(false);
            expect(fs.existsSync(runtimeStage)).toBe(false);
            expect(fs.readdirSync(cacheRoot).some((entry) => entry.endsWith(".lock") || entry.includes(".staging-"))).toBe(false);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("preserves the planner-enriched Blueprint materialization diagnostic for the client", async () => {
        const blueprintPath = "/projects/broken.blueprint.json";
        const blueprintProject: PokieProject = {
            type: "blueprint",
            rootPath: blueprintPath,
            capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
            provenance: "test Blueprint",
        };
        const materialize = jest.fn(() =>
            Promise.reject(
                new BlueprintMaterializationError(
                    "dependencies",
                    "Could not install this Blueprint's runtime dependencies.",
                    "npm ERR! ENOTDIR: not a directory, open '/very/technical/path/package.json'",
                ),
            ),
        );
        const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver("1.3.0", SIM_OPERATION, undefined, {
            resolveProject: {resolve: jest.fn(() => Promise.resolve(blueprintProject))},
            materializer: {materialize},
        });
        const loadGame = jest.fn(() => Promise.resolve(createFakeGame(manifest)));
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            loadGame,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            resolveRuntimePackageRoot,
        );

        const result = service.start(blueprintPath, {rounds: 5});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("failed");
        expect(job.error).toMatch(new RegExp(`^Cannot prepare a runnable runtime from ${JSON.stringify(blueprintPath)}\\.`));
        expect(job.error).toContain("Attempted path: blueprint -> tsPackage");
        expect(job.error).toContain("planned/reusable stages: materialize materializeRuntime (blueprint -> tsPackage)");
        expect(job.error).toContain("failed conversion edge: blueprint -> tsPackage");
        expect(job.error).toContain("Next: Fix the reported source or runtime-preparation problem, then retry.");
        expect(job.error).not.toContain("ENOTDIR");
        expect(loadGame).not.toHaveBeenCalled();
    });

    it("rejects every real WASM sidecar state before creating a queued simulation job or loading it as a package", () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-simulation-wasm-"));
        const wasmPath = path.join(workDir, "component.wasm");
        const sidecar = `${wasmPath}.pokie-wasm.json`;
        fs.writeFileSync(wasmPath, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
        const wasmProject: PokieProject = {
            type: "wasm",
            rootPath: wasmPath,
            capabilities: PROJECT_TYPE_CAPABILITIES.wasm,
            provenance: "test WASM component",
        };
        const materialize = jest.fn();
        const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver("1.3.0", SIM_OPERATION, undefined, {
            resolveProject: {resolve: jest.fn(() => Promise.resolve(wasmProject))},
            materializer: {materialize},
        });
        const loadGame = jest.fn(() => Promise.resolve(createFakeGame(manifest)));
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            loadGame,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            resolveRuntimePackageRoot,
        );

        const compatible = {
            schemaVersion: "1.0.0", component: {id: "fixture", version: "1.0.0"},
            serialization: {session: "session", play: "play", state: "state"}, host: {rng: "rng", services: []}, capabilities: [],
        };
        try {
            const cases: readonly [string | undefined, RegExp][] = [
                [JSON.stringify(compatible), /cannot simulate game rounds/],
                [undefined, /no compatible PokieWasmComponentManifest sidecar/],
                ["{", /sidecar at/],
                [JSON.stringify({...compatible, schemaVersion: "2.0.0"}), /not compatible with this POKIE build/],
            ];
            for (const [contents, expected] of cases) {
                if (contents === undefined) fs.rmSync(sidecar, {force: true});
                else fs.writeFileSync(sidecar, contents);
                const result = service.start(wasmPath, {rounds: 5});
                expect(result).toMatchObject({status: "unsupported", message: expect.stringMatching(expected)});
                expect(service.getActiveCount()).toBe(0);
            }
            expect(materialize).not.toHaveBeenCalled();
            expect(loadGame).not.toHaveBeenCalled();
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("keeps a directory named .wasm on the normal simulation lifecycle", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-simulation-package-suffix-"));
        const packageDirectory = path.join(workDir, "game.wasm");
        fs.mkdirSync(packageDirectory);
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFakeGame(manifest)),
        );
        try {
            const result = service.start(packageDirectory, {rounds: 1});
            expect(result.status).toBe("created");
            if (result.status !== "created") throw new Error("expected normal simulation job");
            await expect(waitForTerminal(service, result.job.id)).resolves.toMatchObject({status: "completed"});
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("has no breakdown when the session doesn't implement StakeAmountDetermining/getSimulationCategory", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFakeGame(manifest)),
        );

        const result = service.start("/a", {rounds: 30});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.report?.breakdown).toBeUndefined();
    });

    it("merges a base/freeGames breakdown correctly across multiple chunks", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFreeGamesAwareFakeGame(manifest)),
            undefined,
            10, // chunkSize — 50 rounds means 5 chunks, so this genuinely exercises cross-chunk merging
        );

        const result = service.start("/a", {rounds: 50});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("completed");
        const breakdown = job.report?.breakdown;
        expect(breakdown).toBeDefined();
        expect(breakdown!.components.base.rounds).toBe(40);
        expect(breakdown!.components.freeGames.rounds).toBe(10);
        expect(breakdown!.components.base.rounds + breakdown!.components.freeGames.rounds).toBe(job.report?.rounds);
        expect(breakdown!.components.base.totalWin).toBeGreaterThan(0);
    });

    it("reports partial progress and stops early when the session's canPlayNextGame() returns false", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFakeGame(manifest, {stopAfterRounds: 12})),
            undefined,
            5, // chunkSize
        );

        const result = service.start("/a", {rounds: 100});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("completed");
        expect(job.roundsCompleted).toBe(12);
        expect(job.report?.rounds).toBe(12);
        expect(job.report?.requestedRounds).toBe(100);
        expect(job.report?.stopReason).toBe("sessionStopped");
    });

    it("fails the job with a safe error message (no stack trace) when loading the game throws", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.reject(new Error("Cannot find module './dist/index.js'")),
        );

        const result = service.start("/a", {rounds: 10});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("failed");
        expect(job.error).toBe("Cannot find module './dist/index.js'");
        expect(job.roundsCompleted).toBe(0);
    });

    it("fails the job with a safe error message when the session throws mid-simulation", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFakeGame(manifest, {failOnRound: 7})),
            undefined,
            5, // chunkSize — round 7 falls inside the second chunk
        );

        const result = service.start("/a", {rounds: 100});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("failed");
        expect(job.error).toBe("fake session failed on round 7");
        expect(JSON.stringify(job)).not.toContain("\\n    at ");
    });

    it("returns undefined for an unknown simulation id", () => {
        const service = new StudioSimulationService();

        expect(service.getStatus("does-not-exist")).toBeUndefined();
    });

    it("rejects starting a second simulation for the same projectRoot with a conflict", () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () =>
                new Promise(() => {
                    // never resolves — keeps the first job "queued" forever
                }),
        );

        const first = service.start("/a", {rounds: 1000});
        if (first.status !== "created") {
            throw new Error("expected the first job to be created");
        }
        const second = service.start("/a", {rounds: 500});

        expect(second).toEqual({status: "conflict", activeJobId: first.job.id});
    });

    it("allows a new simulation for a different projectRoot while one is active", () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () =>
                new Promise(() => {
                    // never resolves
                }),
        );

        const first = service.start("/a", {rounds: 1000});
        const second = service.start("/b", {rounds: 1000});

        expect(first.status).toBe("created");
        expect(second.status).toBe("created");
    });

    it("allows starting a new simulation for the same projectRoot once the previous one has completed", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFakeGame(manifest)),
        );

        const first = service.start("/a", {rounds: 10});
        if (first.status !== "created") {
            throw new Error("expected job to be created");
        }
        await waitForTerminal(service, first.job.id);

        const second = service.start("/a", {rounds: 10});

        expect(second.status).toBe("created");
    });

    it("cancels a queued/running job, stopping further progress", async () => {
        const gate = createControlledYield();
        let finishRelease!: () => void;
        const release = jest.fn(() => new Promise<void>((resolve) => {
            finishRelease = resolve;
        }));
        const durableDirectory = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-simulation-jobs-")), "jobs");
        const durableJobs = new StudioJobService(new FileStudioJobRepository(durableDirectory));
        const repository = new InMemoryStudioSimulationRepository();
        const service = new StudioSimulationService(
            repository,
            () => Promise.resolve(createFakeGame(manifest)),
            undefined,
            10, // chunkSize
            undefined,
            gate.yieldToEventLoop,
            undefined,
            undefined,
            undefined,
            undefined,
            () => Promise.resolve({runtimePath: "/a", ownsRuntimePath: true, release}),
        );
        service.attachJobService(durableJobs);

        const result = service.start("/a", {rounds: 25});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        await flushMacrotask();
        expect(gate.pendingCount()).toBe(1); // paused right after the first chunk (10 rounds)
        expect(service.getStatus(result.job.id)?.roundsCompleted).toBe(10);

        // Cancellation can only take effect between chunks (see StudioSimulationService.run()'s own
        // doc comment on why) — cancel() requests it (aborting the controller) but the record only
        // actually transitions to "cancelled" once the paused chunk loop notices, after release().
        const cancelled = service.cancel(result.job.id);
        expect(cancelled?.status).toBe("cancelling");

        gate.release();
        await flushMacrotask();

        expect(release).toHaveBeenCalledTimes(1);
        expect(service.getStatus(result.job.id)?.status).toBe("cancelling");
        expect(durableJobs.list("/a")).toEqual([expect.objectContaining({id: result.job.id, status: "cancelling"})]);
        let drained = false;
        const drainage = service.cancelAll().then(() => {
            drained = true;
        });
        await flushMacrotask();
        expect(drained).toBe(false);
        finishRelease();
        await drainage;

        const job = service.getStatus(result.job.id);
        expect(job?.status).toBe("cancelled");
        // No further chunk ran after the cancel was observed.
        expect(job?.roundsCompleted).toBe(10);
        expect(durableJobs.list("/a")).toEqual([expect.objectContaining({id: result.job.id, status: "cancelled"})]);

        const restarted = new StudioSimulationService(repository, () => Promise.resolve(createFakeGame(manifest)));
        restarted.attachJobService(new StudioJobService(new FileStudioJobRepository(durableDirectory)));
        expect(restarted.getStatusForProject("/a", result.job.id)).toMatchObject({status: "cancelled"});
        fs.rmSync(path.dirname(durableDirectory), {recursive: true, force: true});
    });

    it("is idempotent when cancelling an already-terminal job", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFakeGame(manifest)),
        );

        const result = service.start("/a", {rounds: 10});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        await waitForTerminal(service, result.job.id);

        const cancelled = service.cancel(result.job.id);

        expect(cancelled?.status).toBe("completed");
    });

    it("returns undefined when cancelling an unknown simulation id", () => {
        const service = new StudioSimulationService();

        expect(service.cancel("does-not-exist")).toBeUndefined();
    });

    it("cancelAll() stops every active job across every project", async () => {
        const gate = createControlledYield();
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFakeGame(manifest)),
            undefined,
            10,
            undefined,
            gate.yieldToEventLoop,
        );

        const first = service.start("/a", {rounds: 25});
        const second = service.start("/b", {rounds: 25});
        if (first.status !== "created" || second.status !== "created") {
            throw new Error("expected both jobs to be created");
        }
        await flushMacrotask();

        service.cancelAll();
        gate.release();
        gate.release();
        await flushMacrotask();

        expect(service.getStatus(first.job.id)?.status).toBe("cancelled");
        expect(service.getStatus(second.job.id)?.status).toBe("cancelled");
    });

    describe("cancelActiveForProject / getActiveCount", () => {
        it("cancels only the active job for the given projectRoot, leaving other projects untouched", async () => {
            const gate = createControlledYield();
            const service = new StudioSimulationService(
                new InMemoryStudioSimulationRepository(),
                () => Promise.resolve(createFakeGame(manifest)),
                undefined,
                10,
                undefined,
                gate.yieldToEventLoop,
            );

            const first = service.start("/a", {rounds: 25});
            const second = service.start("/b", {rounds: 25});
            if (first.status !== "created" || second.status !== "created") {
                throw new Error("expected both jobs to be created");
            }
            await flushMacrotask();

            service.cancelActiveForProject("/a");
            gate.release();
            gate.release();
            await flushMacrotask();

            expect(service.getStatus(first.job.id)?.status).toBe("cancelled");
            expect(service.getStatus(second.job.id)?.status).toBe("running");
        });

        it("is a no-op when nothing is active for the given projectRoot", () => {
            const service = new StudioSimulationService();

            expect(() => service.cancelActiveForProject("/nowhere")).not.toThrow();
        });

        it("getActiveCount() reflects the number of currently queued/running jobs across all projects", async () => {
            const gate = createControlledYield();
            const service = new StudioSimulationService(
                new InMemoryStudioSimulationRepository(),
                () => Promise.resolve(createFakeGame(manifest)),
                undefined,
                10,
                undefined,
                gate.yieldToEventLoop,
            );

            expect(service.getActiveCount()).toBe(0);

            const first = service.start("/a", {rounds: 25});
            const second = service.start("/b", {rounds: 25});
            if (first.status !== "created" || second.status !== "created") {
                throw new Error("expected both jobs to be created");
            }
            await flushMacrotask();

            expect(service.getActiveCount()).toBe(2);

            service.cancelAll();
            gate.release();
            gate.release();
            await flushMacrotask();

            expect(service.getActiveCount()).toBe(0);
        });
    });

    describe("listReports / getReport", () => {
        it("lists a completed simulation's report summary", async () => {
            const service = new StudioSimulationService(
                new InMemoryStudioSimulationRepository(),
                () => Promise.resolve(createFakeGame(manifest)),
            );
            const result = service.start("/a", {rounds: 30, seed: "demo"});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }
            await waitForTerminal(service, result.job.id);

            const entries = service.listReports("/a");

            expect(entries).toHaveLength(1);
            expect(entries[0]).toMatchObject({
                id: result.job.id,
                status: "completed",
                game: {id: manifest.id, version: manifest.version},
                requestedRounds: 30,
                actualRounds: 30,
                seed: "demo",
            });
            expect(typeof entries[0].rtp).toBe("number");
            expect(typeof entries[0].hasWarnings).toBe("boolean");
        });

        it("never lists a failed or cancelled job (no report to summarize)", async () => {
            const service = new StudioSimulationService(
                new InMemoryStudioSimulationRepository(),
                () => Promise.reject(new Error("boom")),
            );
            const result = service.start("/a", {rounds: 10});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }
            await waitForTerminal(service, result.job.id);

            expect(service.listReports("/a")).toEqual([]);
        });

        it("never lists another project's reports", async () => {
            const service = new StudioSimulationService(
                new InMemoryStudioSimulationRepository(),
                () => Promise.resolve(createFakeGame(manifest)),
            );
            const result = service.start("/a", {rounds: 10});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }
            await waitForTerminal(service, result.job.id);

            expect(service.listReports("/b")).toEqual([]);
        });

        it("returns the full report for a completed job", async () => {
            const service = new StudioSimulationService(
                new InMemoryStudioSimulationRepository(),
                () => Promise.resolve(createFakeGame(manifest)),
            );
            const result = service.start("/a", {rounds: 10});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }
            const job = await waitForTerminal(service, result.job.id);

            expect(service.getReport("/a", result.job.id)).toEqual({status: "ok", report: job.report, statistics: job.statistics});
        });

        it("includes the same statistics (volatility, confidence intervals) the job's own poll response carried", async () => {
            const service = new StudioSimulationService(
                new InMemoryStudioSimulationRepository(),
                () => Promise.resolve(createFakeGame(manifest)),
            );
            const result = service.start("/a", {rounds: 10});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }
            await waitForTerminal(service, result.job.id);

            const detail = service.getReport("/a", result.job.id);
            if (detail.status !== "ok") {
                throw new Error("expected report to be ok");
            }
            expect(typeof detail.statistics?.volatility).toBe("number");
            expect(typeof detail.statistics?.rtpConfidenceInterval95.low).toBe("number");
        });

        it("returns not-found for an unknown id", () => {
            const service = new StudioSimulationService();

            expect(service.getReport("/a", "does-not-exist")).toEqual({status: "not-found"});
        });

        it("returns not-found (not a leak) when the id belongs to a different project", async () => {
            const service = new StudioSimulationService(
                new InMemoryStudioSimulationRepository(),
                () => Promise.resolve(createFakeGame(manifest)),
            );
            const result = service.start("/a", {rounds: 10});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }
            await waitForTerminal(service, result.job.id);

            expect(service.getReport("/b", result.job.id)).toEqual({status: "not-found"});
        });

        it("returns not-ready with the job's status for a queued/running simulation", () => {
            const service = new StudioSimulationService(
                new InMemoryStudioSimulationRepository(),
                () =>
                    new Promise(() => {
                        // never resolves — keeps the job "queued"
                    }),
            );
            const result = service.start("/a", {rounds: 10});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }

            expect(service.getReport("/a", result.job.id)).toEqual({status: "not-ready", jobStatus: "queued"});
        });

        it("returns not-ready with the job's status for a failed simulation", async () => {
            const service = new StudioSimulationService(
                new InMemoryStudioSimulationRepository(),
                () => Promise.reject(new Error("boom")),
            );
            const result = service.start("/a", {rounds: 10});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }
            await waitForTerminal(service, result.job.id);

            expect(service.getReport("/a", result.job.id)).toEqual({status: "not-ready", jobStatus: "failed"});
        });

        it("returns not-ready with the job's status for a cancelled simulation", async () => {
            const gate = createControlledYield();
            const service = new StudioSimulationService(
                new InMemoryStudioSimulationRepository(),
                () => Promise.resolve(createFakeGame(manifest)),
                undefined,
                10,
                undefined,
                gate.yieldToEventLoop,
            );
            const result = service.start("/a", {rounds: 25});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }
            await flushMacrotask();
            service.cancel(result.job.id);
            gate.release();
            await flushMacrotask();

            expect(service.getReport("/a", result.job.id)).toEqual({status: "not-ready", jobStatus: "cancelled"});
        });
    });
});

describe("StudioSimulationService with a resolved, multi-mode native outcome-library project", () => {
    let bundleRoot: string;

    beforeEach(() => {
        bundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-simulation-outcome-library-test-"));
    });

    afterEach(() => {
        fs.rmSync(bundleRoot, {recursive: true, force: true});
    });

    async function buildMultiModeLibraryProject(): Promise<PokieProject> {
        const bundleDir = path.join(bundleRoot, "library");
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(
            [buildOutcomeLibraryBundleModeInput("base", "base-lib"), buildOutcomeLibraryBundleModeInput("buyFeature", "buy-lib")],
            bundleDir,
        );
        return (await new ProjectTargetResolver().resolve(bundleDir)) as PokieProject;
    }

    it("samples the manifest's own first mode when no mode is explicitly requested, preserving pre-existing behavior", async () => {
        const project = await buildMultiModeLibraryProject();
        const service = new StudioSimulationService();

        const result = service.start(project.rootPath, {rounds: 5, seed: "multi-mode-default-seed"}, project);
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("completed");
        expect(job.modeName).toBe("base");
    });

    it("samples an explicitly-requested non-first mode -- never silently substitutes the manifest's own first mode", async () => {
        const project = await buildMultiModeLibraryProject();
        const service = new StudioSimulationService();

        const result = service.start(project.rootPath, {rounds: 5, seed: "multi-mode-explicit-seed", modeName: "buyFeature"}, project);
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("completed");
        expect(job.modeName).toBe("buyFeature");
    });

    it("fails honestly, naming every real mode, for a mode name that isn't part of this library -- never falls back to the first mode", async () => {
        const project = await buildMultiModeLibraryProject();
        const service = new StudioSimulationService();

        const result = service.start(project.rootPath, {rounds: 5, modeName: "bonus"}, project);
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("failed");
        expect(job.error).toContain('"bonus" is not a mode of this outcome library');
        expect(job.error).toContain("base");
        expect(job.error).toContain("buyFeature");
    });
});

describe("StudioSimulationService (integration, real loadPokieGame + fixture game packages)", () => {
    it("produces a JSON-shaped SimulationReport for a real, plain fixture game (no breakdown)", async () => {
        const fixtureRoot = path.join(__dirname, "..", "..", "fixtures", "playable-game");
        const service = new StudioSimulationService(new InMemoryStudioSimulationRepository(), loadPokieGame, undefined, 200);

        const result = service.start(fixtureRoot, {rounds: 500, seed: "demo"});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("completed");
        expect(job.report?.game).toEqual({id: "playable-game", name: "Playable Game", version: "1.0.0"});
        expect(job.report?.rounds).toBe(500);
        expect(job.report?.breakdown).toBeUndefined();
        expect(JSON.parse(JSON.stringify(job)).report.game.id).toBe("playable-game");
    });

    it("produces a base/freeGames breakdown for a real fixture game with a free-games feature, across chunks", async () => {
        const fixtureRoot = path.join(__dirname, "..", "..", "fixtures", "playable-game-with-free-games");
        const service = new StudioSimulationService(new InMemoryStudioSimulationRepository(), loadPokieGame, undefined, 300);

        const result = service.start(fixtureRoot, {rounds: 3000, seed: "demo"});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("completed");
        if (!job.report || isSimulationReportSet(job.report)) throw new Error("Expected single-mode report");
        const {base, freeGames} = job.report.breakdown!.components;
        expect(base.rounds).toBeGreaterThan(0);
        expect(freeGames.rounds).toBeGreaterThan(0);
        expect(base.rounds + freeGames.rounds).toBe(job.report!.sampling?.acceptedSubrounds ?? job.report!.rounds);
        expect(job.report!.analytics?.subrounds).toBe(base.rounds + freeGames.rounds);
    });
});


describe("Overscan Studio simulation lifecycle", () => {
    it("cancels after a settled command, releases materialization and suppresses a partial report", async () => {
        const game = createOverscanGame();
        const session = game.createSession({seed: "7"});
        game.createSession = () => session;
        const release = jest.fn(() => Promise.resolve());
        const service = new StudioSimulationService(new InMemoryStudioSimulationRepository(), () => Promise.resolve(game), undefined, 3, undefined, undefined, () => "overscan-cancel", undefined, undefined, undefined, () => Promise.resolve({runtimePath: "/overscan", release}));
        const play = session.play.bind(session);
        const spy = jest.spyOn(session, "play").mockImplementation(() => {
            play();
            service.cancel("overscan-cancel");

        });
        try {
            const started = service.start("/overscan", {rounds: 12, seed: "7"});
            if (started.status !== "created") throw new Error("expected simulation");
            const result = await waitForTerminal(service, started.job.id);
            expect(result.status).toBe("cancelled");
            expect(result.roundsCompleted).toBe(1);
            expect(result.report).toBeUndefined();
            expect(spy).toHaveBeenCalledTimes(1);
            expect(release).toHaveBeenCalledTimes(1);
        } finally {
            spy.mockRestore();
            await service.cancelAll();

        }
    });
});

describe("V2C-12 authored Studio simulation mode/report policy", () => {
    function deterministicGame(id: string, symbol = "A") {
        const blueprint = existingMechanicsBlueprint(AUTHORED_MECHANIC_CATALOG.find(row => row.id === id)!);
        blueprint.reelStrips = [[symbol], [symbol], [symbol]];
        return generatedMechanicsGame(blueprint);
    }

    it("executes two fractional ante entries and retains actual stake and jackpot contributions", async () => {
        const game = deterministicGame("accumulating-base-modes");
        const service = new StudioSimulationService(undefined, () => Promise.resolve(game), undefined, 1);
        const request = validateSimulationRequest({rounds: 2, seed: "ante", modeName: "ante"});
        const start = service.start("/authored", request);
        if (start.status !== "created") throw new Error("Not created");
        const job = await waitForTerminal(service, start.job.id);
        expect(job).toMatchObject({status: "completed", modeName: "ante", report: {betMode: "ante", totalBet: expect.closeTo(0.15, 12), jackpot: {totalContributed: expect.closeTo(0.015, 12), pools: {mini: {totalContributed: expect.closeTo(0.015, 12)}}}}});
        const report = job.report!;
        if (isSimulationReportSet(report)) throw new Error("Unexpected set");
        expect(report.reproducibility?.command).toContain("--mode ante");
        for (const format of ["json", "markdown", "html"] as const) {
            expect(buildSimulationReportDownload(report, job.id, format).body).toContain("ante");
            expect(buildSimulationReportDownload(report, job.id, format).body).toMatch(/jackpot/i);
        }
        const repeat = service.start("/authored", request);
        if (repeat.status !== "created") throw new Error("Not created");
        expect((await waitForTerminal(service, repeat.job.id)).report).toMatchObject({totalBet: expect.closeTo(0.15, 12), jackpot: {totalContributed: expect.closeTo(0.015, 12)}});
        await service.cancelAll();
    });

    it.each(["fixed-base-modes", "accumulating-base-modes"])("%s: uses actual stake for awards and pool RTP denominators", async id => {
        const game = deterministicGame(id, "J");
        const service = new StudioSimulationService(undefined, () => Promise.resolve(game));
        const start = service.start("/awards", {rounds: 2, seed: "awards", modeName: "ante"});
        if (start.status !== "created") throw new Error("Not created");
        const job = await waitForTerminal(service, start.job.id);
        if (!job.report || isSimulationReportSet(job.report)) throw new Error("No single report");
        const report = job.report;
        expect(report.jackpot?.awardCount).toBe(2);
        expect(report.jackpot?.totalAwarded).toBeCloseTo(id.startsWith("fixed") ? 20 : 20.015, 12);
        expect(report.jackpot?.totalContributed).toBeCloseTo(0.015, 12);
        expect(report.jackpot?.contribution).toBeCloseTo(report.jackpot!.totalAwarded / report.totalBet, 12);
        expect(report.jackpot?.pools.mini.contribution).toBeCloseTo(report.jackpot!.contribution, 12);
        await service.cancelAll();
    });

    it("retains repeated purchases and zero-stake continuations through independent all-mode runs", async () => {
        const game = deterministicGame("modes");
        const service = new StudioSimulationService(undefined, () => Promise.resolve(game), undefined, 1);
        const started = service.start("/purchases", {rounds: 6, seed: "purchase", modeName: "all"});
        if (started.status !== "created") throw new Error("Not created");
        const job = await waitForTerminal(service, started.job.id);
        expect(job.status).toBe("completed");
        if (!isSimulationReportSet(job.report)) throw new Error("No set");
        expect(Object.keys(job.report.modes)).toEqual(["base", "ante", "buy", "buy-more"]);
        expect(job.report.modes.base.totalBet).toBeCloseTo(0.3);
        expect(job.report.modes.ante.totalBet).toBeCloseTo(0.45);
        expect(job.report.modes.buy.totalBet).toBeCloseTo(1.5);
        expect(job.report.modes["buy-more"].totalBet).toBeCloseTo(2.5);
        expect(job.roundsCompleted).toBe(24);
        expect(job.report).not.toHaveProperty("rtp");
        Object.values(job.report.modes).forEach(report => expect(report.analytics?.subrounds).toBe(6));
        expect(job.report.modes.buy.analytics?.logicalCompletions).toBe(3);
        expect(job.report.modes["buy-more"].analytics?.lifecycle.freeGames.incomplete).toBe(1);
        expect(service.listReports("/purchases")[0]).toMatchObject({modeName: "all", modes: {buy: {rounds: 3, betMode: "buy"}}});
        await service.cancelAll();
    });

    it("retains all-mode history and recovery parameters after restart", async () => {
        const directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c12-modes-"));
        try {
            const game = deterministicGame("accumulating-base-modes");
            const jobs = new StudioJobService(new FileStudioJobRepository(directory));
            const service = new StudioSimulationService(undefined, () => Promise.resolve(game));
            service.attachJobService(jobs);
            const started = service.start(directory, {rounds: 2, seed: "saved", modeName: "all"});
            if (started.status !== "created") throw new Error("Not created");
            const completed = await waitForTerminal(service, started.job.id);
            if (!completed.report || !isSimulationReportSet(completed.report)) throw new Error("Expected all-mode analytics");
            expect(completed.report.modes.ante.analytics).toMatchObject({envelope: {schemaVersion: 1, modelId: game.getConfigHash!()}, paidEntries: 2, totalStake: expect.closeTo(0.15, 12)});
            expect(jobs.get(directory, started.job.id)?.request.modeName).toBe("all");
            const restarted = new StudioSimulationService(undefined, () => Promise.resolve(game));
            restarted.attachJobService(new StudioJobService(new FileStudioJobRepository(directory)));
            expect(restarted.getReport(directory, started.job.id)).toMatchObject({status: "ok", report: JSON.parse(JSON.stringify(completed.report))});
            expect(restarted.listReports(directory)).toMatchObject([{modeName: "all", modes: {ante: {rounds: 2, betMode: "ante"}}}]);
            expect(restarted.getStatusForProject(directory, started.job.id)?.modeName).toBe("all");
            const rerun = restarted.start(directory, {rounds: 2, seed: "saved", modeName: "all"});
            if (rerun.status !== "created") throw new Error("Not created");
            expect((await waitForTerminal(restarted, rerun.job.id)).report).toMatchObject({modes: {ante: {totalBet: expect.closeTo(0.15, 12)}}});
            await service.cancelAll();
            await restarted.cancelAll();
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it("withholds partially completed all-mode reports when a job is cancelled", async () => {
        const game = deterministicGame("accumulating-base-modes");
        const service = new StudioSimulationService(undefined, () => Promise.resolve(game), undefined, 1, Date.now, () => {
            service.cancel(jobId);
            return Promise.resolve();
        });
        const started = service.start("/cancel-modes", {rounds: 2, modeName: "all"});
        if (started.status !== "created") throw new Error("Not created");
        const jobId = started.job.id;
        const completed = await waitForTerminal(service, jobId);
        expect(completed.status).toBe("cancelled");
        expect(completed.report).toBeUndefined();
        expect(service.listReports("/cancel-modes")).toEqual([]);
        await service.cancelAll();
    });

    it("rejects unknown and blank selections without publishing a base report", async () => {
        expect(() => validateSimulationRequest({rounds: 2, modeName: " "})).toThrow('"modeName"');
        const game = deterministicGame("accumulating-base-modes");
        const service = new StudioSimulationService(undefined, () => Promise.resolve(game));
        const start = service.start("/unknown", {rounds: 2, modeName: "missing"});
        if (start.status !== "created") throw new Error("Not created");
        expect(await waitForTerminal(service, start.job.id)).toMatchObject({status: "failed", error: 'Unknown bet mode "missing".'});
        expect(service.listReports("/unknown")).toEqual([]);
        expect(service.getReport("/unknown", start.job.id)).toEqual({status: "not-ready", jobStatus: "failed"});
        await service.cancelAll();
    });
});

describe("V2C-12 separately loaded package simulation to Replay", () => {
    let runtime: ReturnType<typeof emitPublicRuntime>;
    beforeAll(() => {
        runtime = emitPublicRuntime();
    }, 60000);
    afterAll(() => runtime?.dispose());

    it.each([false, true].flatMap(weighted => [false, true].map(typed => ({weighted, typed}))))("completes the financial matrix across package copies (weighted=$weighted, typed=$typed)", async ({weighted, typed}) => {
        const blueprint = replayModesBlueprint(weighted);
        const root = path.join(runtime.directory, `simulation-${weighted}-${typed}`);
        const built = new GamePackageGenerator("1.3.0").generate(blueprint, root);
        const entry = path.join(built.projectRoot, "dist", "index.js");
        if (typed) fs.writeFileSync(entry, ts.transpileModule(fs.readFileSync(path.join(built.projectRoot, "src", "index.ts"), "utf8"), {
            compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
        }).outputText);
        // Native package resolution deliberately avoids Jest's @fromstan/pokie source alias.
        const game = process.getBuiltinModule("module").createRequire(path.join(runtime.directory, "consumer.cjs"))(entry) as PokieGame;
        const session = game.createSession({seed: "v2c12-ordinary-buy-recent"}) as GameSessionHandling & BetModeSelecting;
        session.setCreditsAmount(1000);
        session.setBetMode("buy");
        session.play();
        try {
            session.setBetMode("buy");
            throw new Error("Expected a continuation rejection");
        } catch (error) {
            expect(error).toMatchObject({name: "ForcingBetModeSelectionRejectedError"});
            expect(error).not.toBeInstanceOf(ForcingBetModeSelectionRejectedError);
        }

        const loadGame = () => Promise.resolve(game);
        const jobs = new StudioJobService(new FileStudioJobRepository(path.join(root, "jobs")));
        const simulation = new StudioSimulationService(undefined, loadGame, undefined, 1);
        simulation.attachJobService(jobs);
        const replay = new StudioReplayExecutionService(undefined, loadGame, 1);
        replay.attachJobService(jobs);
        try {
            for (const [modeName, stakes, targets] of [
                ["ante", [0.07500000000000001], [1]],
                ["buy", [0.5, 0, 0.5], [1, 2, 3]],
                ["buy-more", [1.25, 0, 0, 0, 1.25], [1, 2, 4, 5]],
            ] as const) {
                const seed = `v2c12-${weighted ? "weighted" : "ordinary"}-${modeName}-recent`;
                const request = validateSimulationRequest({rounds: stakes.length, seed, workers: 1, modeName});
                const started = simulation.start(root, request);
                if (started.status !== "created") throw new Error("No simulation job");
                const completed = await waitForTerminal(simulation, started.job.id);
                const totalBet = stakes.reduce<number>((sum, stake) => sum + stake, 0);
                expect(completed).toMatchObject({status: "completed", roundsCompleted: stakes.length, report: {seed, betMode: modeName, totalBet, reproducibility: {configHash: game.getConfigHash!()}}});
                expect(jobs.get(root, started.job.id)?.request).toMatchObject(request);
                const restarted = new StudioSimulationService(undefined, loadGame);
                restarted.attachJobService(new StudioJobService(new FileStudioJobRepository(path.join(root, "jobs"))));
                const recent = restarted.listReports(root).find(report => report.id === started.job.id)!;
                expect(recent).toMatchObject({seed, modeName});
                expect(restarted.getReport(root, recent.id)).toMatchObject({status: "ok", report: {totalBet, betMode: modeName}});
                for (const round of targets) {
                    const replayRequest = {round, seed: recent.seed, modeName: recent.modeName, simulationId: recent.id, expectedConfigHash: game.getConfigHash!()};
                    expect(replayRequest).not.toHaveProperty("recording");
                    const start = replay.start(root, replayRequest);
                    if (start.status !== "created") throw new Error("No replay job");
                    const deadline = Date.now() + 10000;
                    while (["queued", "running"].includes(replay.getStatus(root, start.job.id)!.status) && Date.now() < deadline) await flushMacrotask();
                    const job = replay.getStatus(root, start.job.id)!;
                    expect(job).toMatchObject({status: "completed", simulationId: recent.id, completedRounds: round});
                    const download = replay.getDownload(root, job.id);
                    if (download.status !== "ok") throw new Error(JSON.stringify(job));
                    const descriptor = JSON.parse(buildReplayDownload(download.descriptor, job.id).body) as ReplayDescriptor;
                    const expectedCommands = stakes.slice(0, round).map(stake => ({kind: "spin", ...(stake > 0 ? {mode: modeName} : {})}));
                    expect(descriptor).toMatchObject({seed, modePolicy: {betModeId: modeName, selection: "repeat-when-available"}, totalBet: stakes.slice(0, round).reduce<number>((sum, stake) => sum + stake, 0), artifact: {stake: stakes[round - 1], betMode: modeName, provenance: {configHash: game.getConfigHash!()}}});
                    expect(descriptor.commands).toEqual(expectedCommands);
                    expect(descriptor.artifact?.featureEvents).toContainEqual({type: "chargedBetMode", data: {id: modeName}});
                    const view = describeReplayResult(job)!;
                    expect(view.artifact).toMatchObject({stake: descriptor.artifact!.stake, betMode: modeName});
                    expect(view.modePolicy).toEqual(descriptor.modePolicy);
                    const library = new ReplayRecorder().record({game, seed, round, betModeId: modeName});
                    expect(library).toMatchObject({commands: descriptor.commands, modePolicy: descriptor.modePolicy, totalBet: descriptor.totalBet, artifact: {stake: descriptor.artifact!.stake, betMode: modeName}});
                }
                const repeated = restarted.start(root, request);
                if (repeated.status !== "created") throw new Error("No repeated simulation");
                expect(await waitForTerminal(restarted, repeated.job.id)).toMatchObject({status: "completed", report: {totalBet, betMode: modeName}});
                await restarted.cancelAll();
            }
            const all = simulation.start(root, {rounds: 5, workers: 1, seed: "all-modes", modeName: "all"});
            if (all.status !== "created") throw new Error("No all-mode simulation");
            expect(await waitForTerminal(simulation, all.job.id)).toMatchObject({status: "completed", roundsCompleted: 20, report: {modes: {
                base: {totalBet: 0.25}, ante: {totalBet: 0.37500000000000006}, buy: {totalBet: 1.5}, "buy-more": {totalBet: 2.5},
            }}});
        } finally {
            await replay.cancelAll();
            await simulation.cancelAll();
        }
    }, 30000);
});

it.each(["cancelled", "failed"] as const)("persists %s analytics prefixes through restart without publishing reports", async terminal => {
    const directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c16-prefix-"));
    const blueprint = replayModesBlueprint();
    const game = generatedMechanicsGame(blueprint);
    let plays = 0;
    const create = game.createSession.bind(game);
    game.createSession = context => {
        const session = create(context);
        const play = session.play.bind(session);
        session.play = () => {
            if (terminal === "failed" && plays === 1) throw new Error("analytics prefix failure");
            plays++;
            play();
        };
        return session;
    };
    let id = "";
    const service: StudioSimulationService = new StudioSimulationService(undefined, () => Promise.resolve(game), undefined, 1, undefined, () => {
        if (terminal === "cancelled") service.cancel(id);
        return Promise.resolve();
    });
    service.attachJobService(new StudioJobService(new FileStudioJobRepository(directory)));
    try {
        const start = service.start(directory, {rounds: 5, seed: "prefix"});
        if (start.status !== "created") throw new Error("Not created");
        id = start.job.id;
        const finished = await waitForTerminal(service, id);
        expect(finished.status).toBe(terminal);
        expect(finished.observedPrefix?.analytics).toMatchObject({subrounds: 1, paidEntries: 1, envelope: {schemaVersion: 1, modelId: game.getConfigHash!()}});
        expect(service.listReports(directory)).toEqual([]);
        const restarted = new StudioSimulationService(undefined, () => Promise.resolve(game));
        restarted.attachJobService(new StudioJobService(new FileStudioJobRepository(directory)));
        expect(restarted.getStatusForProject(directory, id)?.observedPrefix).toEqual(JSON.parse(JSON.stringify(finished.observedPrefix)));
        expect(restarted.listReports(directory)).toEqual([]);
        await restarted.cancelAll();
    } finally {
        await service.cancelAll();
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

it("retains adaptive request identity, phase and completed report through reattachment and repository reconstruction", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-v2c17-adaptive-"));
    const manifest: PokieGameManifest = {id: "adaptive", name: "Adaptive", version: "1"};
    const gate = createControlledYield();
    const jobs = new StudioJobService(new FileStudioJobRepository(directory));
    const service = new StudioSimulationService(undefined, () => Promise.resolve(createFakeGame(manifest)), undefined, 5, undefined, gate.yieldToEventLoop);
    service.attachJobService(jobs);
    const request = validateSimulationRequest({rounds: 100, seed: "adaptive", convergence: {minRounds: 10, rtpTolerance: 10, checkIntervalRounds: 5, stableChecks: 1}});
    const started = service.start(directory, request);
    if (started.status !== "created") throw new Error("Expected simulation");
    try {
        while (!gate.pendingCount()) await flushMacrotask();
        expect(service.getStatusForProject(directory, started.job.id)).toMatchObject({status: "running", roundsCompleted: 5, progress: {stage: "simulation", current: 5, total: 100}});
        const attached = service.start(directory, request);
        expect(attached).toMatchObject({status: "reattached", job: {id: started.job.id}});
        expect(service.start(directory, {...request, convergence: {...request.convergence!, rtpTolerance: 1}})).toEqual({status: "conflict", activeJobId: started.job.id});
        expect(jobs.get(directory, started.job.id)?.request.convergence).toEqual(request.convergence);
        gate.release();
        const terminal = await waitForTerminal(service, started.job.id);
        expect(terminal).toMatchObject({status: "completed", roundsCompleted: 10, progress: {stage: "completed"}, report: {stopReason: "converged", convergence: request.convergence, diagnostics: {precision: "empiricalPrecision"}}});
        const restarted = new StudioSimulationService();
        restarted.attachJobService(new StudioJobService(new FileStudioJobRepository(directory)));
        expect(restarted.getReport(directory, started.job.id)).toEqual(service.getReport(directory, started.job.id));
        expect(restarted.getStatusForProject(directory, started.job.id)?.convergence).toEqual(request.convergence);
    } finally {
        gate.release();
        await service.cancelAll();
        fs.rmSync(directory, {recursive: true, force: true});
    }
});
