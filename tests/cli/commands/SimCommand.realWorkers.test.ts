import {loadPokieGame, SimulationReport} from "@fromstan/pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {pathToFileURL} from "url";
import {SimCommand} from "../../../cli/commands/SimCommand.js";
import {emitPublicRuntime} from "../../v2/helpers/publicRuntime.js";

// Extracted from SimCommand.test.ts: this describe spawns real worker_threads (17 spawns across
// its 6 tests), which is why it lives in the "pokie-integration" lane instead of the default fast
// "pokie" lane -- see jest.config.mjs.
describe("SimCommand (integration, real loadPokieGame + --workers, real worker threads)", () => {
    jest.setTimeout(30000);
    let runtime: ReturnType<typeof emitPublicRuntime>;
    let fixtureRoot: string;
    let configFixture: string;
    let workerEntryUrl: URL;
    let outDir: string;

    beforeAll(() => {
        // Emit the current source into a private package. Existing root dist may
        // predate the snapshot schema; existence alone cannot establish compatibility.
        runtime = emitPublicRuntime();
        fixtureRoot = path.join(runtime.directory, "playable-game");
        configFixture = path.join(runtime.directory, "playable-game-with-config-hash");
        fs.cpSync(path.join(__dirname, "..", "fixtures", "playable-game"), fixtureRoot, {recursive: true});
        fs.cpSync(path.join(__dirname, "..", "fixtures", "playable-game-with-config-hash"), configFixture, {recursive: true});
        workerEntryUrl = pathToFileURL(path.join(runtime.directory, "node_modules/@fromstan/pokie/dist/esm/simulation/parallel/internal/simulationWorkerEntry.js"));
    }, 120000);

    afterAll(() => runtime?.dispose());

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-sim-workers-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("runs with --workers 2 across real worker threads and produces a full report", async () => {
        const command = new SimCommand(loadPokieGame, undefined, undefined, workerEntryUrl);
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
        const command = new SimCommand(loadPokieGame, undefined, undefined, workerEntryUrl);
        const outFile = path.join(outDir, "report.json");

        // 1001 rounds across 4 workers forces an uneven split (251/250/250/250).
        await command.run([fixtureRoot, "--rounds", "1001", "--workers", "4", "--out", outFile]);

        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReport;
        expect(report.rounds).toBe(1001);
        expect(report.workers).toBe(4);
    });

    it("carries the resolved model config hash from real workers into the canonical report", async () => {
        const command = new SimCommand(loadPokieGame, undefined, undefined, workerEntryUrl);
        const outFile = path.join(outDir, "config-hash-report.json");

        await command.run([configFixture, "--rounds", "100", "--seed", "model-identity", "--workers", "2", "--out", outFile]);

        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReport;
        expect(report.reproducibility?.configHash).toBe("sha256:fixture-config-hash");
        expect(report.analytics?.envelope.modelId).toBe("sha256:fixture-config-hash");
    });

    it("--workers 1 explicitly given still works without a worker entry point (in-process path)", async () => {
        const command = new SimCommand(loadPokieGame);
        const outFile = path.join(outDir, "report.json");

        await command.run([fixtureRoot, "--rounds", "100", "--workers", "1", "--out", outFile]);

        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReport;
        expect(report.rounds).toBe(100);
        expect(report.workers).toBe(1);
    });

    it("produces a reproducible report for the same seed and workers count", async () => {
        const command = new SimCommand(loadPokieGame, undefined, undefined, workerEntryUrl);
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
        const singleWorkerCommand = new SimCommand(loadPokieGame);
        const multiWorkerCommand = new SimCommand(loadPokieGame, undefined, undefined, workerEntryUrl);
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
        expect(multi.rounds).toBe(5000);
        expect(multi.workers).toBe(4);
    });
});
