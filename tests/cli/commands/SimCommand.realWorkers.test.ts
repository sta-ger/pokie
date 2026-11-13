import {loadPokieGame, ParallelSimulationRunner, SimulationReport, SimulationWorkerCoordinator} from "@fromstan/pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {pathToFileURL} from "url";
import {Worker} from "node:worker_threads";
import {resolvePokieGameDependencyRoots} from "../../../src/gamepackage/resolvePokieGameEntryModule.js";
import {createPackageExtractionTestEnvironment} from "../../v2/fixtures/PackageExtractionFixture.js";
import {SimCommand} from "../../../cli/commands/SimCommand.js";
import {emitPublicRuntime} from "../../v2/helpers/publicRuntime.js";

// Extracted from SimCommand.test.ts: this describe spawns real worker_threads (17 spawns across
// its 6 tests), which is why it lives in the "pokie-integration" lane instead of the default fast
// "pokie" lane -- see jest.config.mjs.
describe("SimCommand (integration, real loadPokieGame + --workers, real worker threads)", () => {
    // Four real workers each acquire an isolated dependency graph under gate contention.
    jest.setTimeout(120_000);
    let runtime: ReturnType<typeof emitPublicRuntime>;
    let nativeLoadGame: typeof loadPokieGame;
    let restoreRuntimeEnvironment: (() => void) | undefined;
    const activeWorkers = new Set<Worker>();
    let started: number;
    let phases: Array<{phase: string; elapsedMs: number}>;
    const record = (phase: string): void => {
        phases.push({phase, elapsedMs: Math.round(performance.now() - started)});
    };
    let fixtureRoot: string;
    let configFixture: string;
    let workerEntryUrl: URL;
    let outDir: string;

    beforeAll(async () => {
        // Emit the current source into a private package. Existing root dist may
        // predate the snapshot schema; existence alone cannot establish compatibility.
        restoreRuntimeEnvironment = createPackageExtractionTestEnvironment({stageRuntime: false});
        // These consumers execute JS, not declarations or source maps. Keep both
        // native module formats without repeatedly copying unused compiler outputs.
        runtime = emitPublicRuntime({runtimeFilesOnly: true});
        // Jest replaces module.createRequire and remaps bare POKIE imports to
        // source. Use Node's actual loader so metadata, sessions and workers all
        // consume the compiled runtime and release its native module cache.
        const nativeRequire = process.getBuiltinModule("module").createRequire(path.join(runtime.directory, "consumer.cjs"));
        nativeLoadGame = (nativeRequire("@fromstan/pokie") as {loadPokieGame: typeof loadPokieGame}).loadPokieGame;
        fixtureRoot = path.join(runtime.directory, "playable-game");
        configFixture = path.join(runtime.directory, "playable-game-with-config-hash");
        fs.cpSync(path.join(__dirname, "..", "fixtures", "playable-game"), fixtureRoot, {recursive: true, filter: source => !["node_modules", ".pokie-runtime-cache"].includes(path.basename(source))});
        fs.cpSync(path.join(__dirname, "..", "fixtures", "playable-game-with-config-hash"), configFixture, {recursive: true, filter: source => !["node_modules", ".pokie-runtime-cache"].includes(path.basename(source))});
        for (const root of [fixtureRoot, configFixture]) {
            const manifest = path.join(root, "package.json");
            // Omitted dependencies deliberately bind to the loader's host. In the
            // Jest caller that is the whole checkout; workers must use this same
            // private compiled installation as the metadata and in-process loads.
            fs.writeFileSync(manifest, JSON.stringify({...JSON.parse(fs.readFileSync(manifest, "utf8")), dependencies: {"@fromstan/pokie": "*"}}));
            expect((await resolvePokieGameDependencyRoots(root))["@fromstan/pokie"]).toBe(path.join(runtime.directory, "node_modules/@fromstan/pokie"));
        }
        workerEntryUrl = pathToFileURL(path.join(runtime.directory, "node_modules/@fromstan/pokie/dist/esm/simulation/parallel/internal/simulationWorkerEntry.js"));
    }, 120000);

    afterAll(() => {
        try {
            runtime?.dispose();
        } finally {
            restoreRuntimeEnvironment?.();
        }
    });

    beforeEach(() => {
        started = performance.now();
        phases = [];
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-sim-workers-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);

    });

    afterEach(() => {
        try {
            // Verify cleanup before deleting storage could conceal leaked leases.
            expect(activeWorkers.size).toBe(0);
            expect(fs.readdirSync(os.tmpdir()).filter(name => name.startsWith("pokie-runtime-"))).toEqual([]);
        } finally {
            console.info(`SimCommand real-worker phases: ${JSON.stringify(phases)}`);
            if (outDir) fs.rmSync(outDir, {recursive: true, force: true});
            jest.restoreAllMocks();
        }
    });

    function createCommand(withWorkerEntry = true): SimCommand {
        let loads = 0;
        return new SimCommand(async root => {
            const load = ++loads;
            record(`load-${load}-start`);
            const game = await nativeLoadGame(root);
            record(`load-${load}-end`);
            const release = game.release?.bind(game);
            if (release) Reflect.defineProperty(game, "release", {configurable: true, value: async () => {
                record(`load-${load}-release-start`);
                try {
                    await release();
                } finally {
                    record(`load-${load}-release-end`);
                }
            }});
            return game;
        }, undefined, undefined, withWorkerEntry ? workerEntryUrl : undefined,
        (root, rounds, options) => new ParallelSimulationRunner(root, rounds, {
            ...options,
            onPhase: record,
            createWorkerCoordinator: entry => new SimulationWorkerCoordinator(entry, request => {
                // Explicit fixture context supports direct Jest as well as npm. Native
                // workers do not inherit Jest's virtual process.env/os.tmpdir override.
                const worker = new Worker(entry!, {workerData: request, env: {...process.env, TMPDIR: os.tmpdir()}});
                activeWorkers.add(worker);
                record(`worker-${request.workerIndex}-started`);
                worker.on("message", (message: {type: string}) => {
                    if (message.type === "result" || message.type === "error") record(`worker-${request.workerIndex}-${message.type}`);
                });
                worker.once("exit", () => {
                    activeWorkers.delete(worker);
                    record(`worker-${request.workerIndex}-exited`);
                });
                return worker;
            }),
        }));
    }

    it("runs with --workers 2 across real worker threads and produces a full report", async () => {
        const command = createCommand();
        const outFile = path.join(outDir, "report.json");

        await command.run([fixtureRoot, "--rounds", "1000", "--seed", "demo", "--workers", "2", "--out", outFile]);

        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReport;
        expect(report.rounds).toBe(1000);
        expect(report.workers).toBe(2);
        expect(report.reproducibility?.command).toContain("--workers 2");
        expect(report.reproducibility?.workerSeedStrategy).toBeDefined();
        expect(report.analytics).toMatchObject({envelope: {schemaVersion: 1}, subrounds: 1000, paidEntries: 1000, totalStake: report.totalBet, totalWin: report.totalWin});
        expect(report.totalBet).toBeGreaterThan(0);
        expect(Number.isFinite(report.rtp)).toBe(true);
    });

    it("runs with --workers 4, splitting rounds unevenly across workers, and rounds still add up exactly", async () => {
        const command = createCommand();
        const outFile = path.join(outDir, "report.json");

        // 1001 rounds across 4 workers forces an uneven split (251/250/250/250).
        await command.run([fixtureRoot, "--rounds", "1001", "--workers", "4", "--out", outFile]);

        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReport;
        expect(report.rounds).toBe(1001);
        expect(report.workers).toBe(4);
    });

    it("carries the resolved model config hash from real workers into the canonical report", async () => {
        const command = createCommand();
        const outFile = path.join(outDir, "config-hash-report.json");

        await command.run([configFixture, "--rounds", "100", "--seed", "model-identity", "--workers", "2", "--out", outFile]);

        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReport;
        expect(report.reproducibility?.configHash).toBe("sha256:fixture-config-hash");
        expect(report.analytics?.envelope.modelId).toBe("sha256:fixture-config-hash");
    });

    it("--workers 1 explicitly given still works without a worker entry point (in-process path)", async () => {
        const command = createCommand(false);
        const outFile = path.join(outDir, "report.json");

        await command.run([fixtureRoot, "--rounds", "100", "--workers", "1", "--out", outFile]);

        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReport;
        expect(report.rounds).toBe(100);
        expect(report.workers).toBe(1);
    });

    it("produces a reproducible report for the same seed and workers count", async () => {
        const command = createCommand();
        const firstFile = path.join(outDir, "first.json");
        const secondFile = path.join(outDir, "second.json");

        await command.run([fixtureRoot, "--rounds", "600", "--seed", "reproducible", "--workers", "3", "--out", firstFile]);
        await command.run([fixtureRoot, "--rounds", "600", "--seed", "reproducible", "--workers", "3", "--out", secondFile]);

        const first = JSON.parse(fs.readFileSync(firstFile, "utf-8")) as SimulationReport;
        const second = JSON.parse(fs.readFileSync(secondFile, "utf-8")) as SimulationReport;

        expect(second.totalBet).toBe(first.totalBet);
        expect(second.totalWin).toBe(first.totalWin);
        expect(second.rtp).toBe(first.rtp);
        expect(second.hitFrequency).toBe(first.hitFrequency);
        expect(second.maxWin).toBe(first.maxWin);
    });

    it("a smoke comparison of workers=1 vs workers=4 timing — both complete and produce valid reports (no asserted speedup)", async () => {
        const singleWorkerCommand = createCommand(false);
        const multiWorkerCommand = createCommand();
        const singleFile = path.join(outDir, "single.json");
        const multiFile = path.join(outDir, "multi.json");

        // A non-flaky smoke test: it never asserts that --workers 4 is faster (real CI machines can
        // have as little as 1 usable core, making parallel workers slower than sequential once thread
        // spawn overhead is counted) — it only asserts both configurations actually complete and
        // produce a full, valid report for the same workload.
        await singleWorkerCommand.run([fixtureRoot, "--rounds", "5000", "--out", singleFile]);
        await multiWorkerCommand.run([fixtureRoot, "--rounds", "5000", "--workers", "4", "--out", multiFile]);

        const single = JSON.parse(fs.readFileSync(singleFile, "utf-8")) as SimulationReport;
        const multi = JSON.parse(fs.readFileSync(multiFile, "utf-8")) as SimulationReport;
        expect(single.rounds).toBe(5000);
        expect(single.workers).toBe(1);
        expect(multi.rounds).toBe(5000);
        expect(multi.workers).toBe(4);
        for (const report of [single, multi]) {
            expect(report.totalBet).toBeGreaterThan(0);
            expect(Number.isFinite(report.rtp)).toBe(true);
            expect(report.analytics).toMatchObject({subrounds: 5000, paidEntries: 5000, totalStake: report.totalBet, totalWin: report.totalWin});
        }
        expect(phases.filter(item => (/worker-\d-result$/).test(item.phase))).toHaveLength(4);
        expect(phases.filter(item => (/worker-\d-exited$/).test(item.phase))).toHaveLength(4);
    });
});
