import {EventEmitter} from "events";
import {GameBlueprint, WeightedOutcomeLibrary, WeightedOutcomeLibraryAnalyzer, WeightedOutcomeLibraryValidator} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {OutcomeLibraryCommand} from "../../cli/commands/OutcomeLibraryCommand.js";

// End-to-end happy path for "pokie outcomelibrary generate": package (a real "pokie build" output) ->
// generate (drives the built package's own runtime) -> validate (WeightedOutcomeLibraryValidator, the
// library-level counterpart to the bundle-level "outcomelibrary validate" also exercised below) ->
// analyze (WeightedOutcomeLibraryAnalyzer) -> bundle ("outcomelibrary build" + "outcomelibrary validate
// --deep"), plus multi-mode, unsupported-mechanics, and cancel/resume scenarios -- run as real commands
// against real, disk-backed packages, never a hand-built PokieGame test double (see
// tests/weightedoutcome/generate/generateExactWeightedOutcomeLibrary.test.ts for that lower-level core
// coverage; this file is the CLI's own surface).
describe("CLI workflow (integration): pokie outcomelibrary generate -> validate -> analyze -> bundle", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcomelibrary-generate-e2e-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
        (console.error as jest.Mock).mockRestore();
    });

    // Same hand-computable math model as tests/weightedoutcome/generate/GenerateTestFixtures.ts's own
    // buildFixtureGame(): 2 reels, 1 row, reel 0 = ["A","A","B"] (3 stops), reel 1 = ["A","B"] (2 stops)
    // -- exactly 4 distinct grids ((A,A) w=2, (A,B) w=2, (B,A) w=1, (B,B) w=1), a 2-of-a-kind "A" paying
    // 5x -- small enough to verify the CLI's own output by hand, not just "it produced something".
    function finiteBlueprint(id: string): GameBlueprint {
        return {
            manifest: {id, name: "Exact Enum CLI Slot", version: "1.0.0"},
            reels: 2,
            rows: 1,
            symbols: ["A", "B"],
            paytable: {A: {2: 5}},
            reelStrips: [
                ["A", "A", "B"],
                ["A", "B"],
            ],
        };
    }

    // 3 reels of 20 stops each (8,000 raw reel-stop combinations -- comfortably above
    // accumulateUniqueGridWeights's own YIELD_EVERY=5,000 progress/cancellation checkpoint, so a
    // cancellation actually lands mid-sweep, not before the first checkpoint) but still only 2 symbols
    // over a single visible row, so the DISTINCT grid count (at most 2^3 = 8) -- and therefore the real
    // per-grid win-calculation work in phase 2 -- stays tiny regardless of the raw sweep size.
    function largeButBoundedBlueprint(id: string): GameBlueprint {
        const stripOf = (offset: number): string[] => Array.from({length: 20}, (_unused, index) => ((index + offset) % 3 === 0 ? "A" : "B"));
        return {
            manifest: {id, name: "Large Bounded CLI Slot", version: "1.0.0"},
            reels: 3,
            rows: 1,
            symbols: ["A", "B"],
            paytable: {A: {3: 5}},
            reelStrips: [stripOf(0), stripOf(1), stripOf(2)],
        };
    }

    function freeGamesBlueprint(id: string): GameBlueprint {
        return {
            manifest: {id, name: "Free Games CLI Slot", version: "1.0.0"},
            reels: 3,
            rows: 3,
            symbols: ["A", "B", "S"],
            scatters: ["S"],
            paytable: {A: {3: 5}, B: {3: 2}, S: {3: 2}},
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 10}}},
            reelStrips: [
                ["A", "B", "S"],
                ["A", "B", "S"],
                ["A", "B", "S"],
            ],
        };
    }

    // Builds a real package via the real "pokie build <config.json> --out <dir>" CLI, exactly as a user
    // would run it -- the "package" step of "package -> generate -> validate -> analyze -> bundle".
    async function buildPackage(blueprint: GameBlueprint, dirName: string): Promise<string> {
        const blueprintPath = path.join(workDir, `${dirName}.blueprint.json`);
        fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));
        const outDir = path.join(workDir, dirName);
        const exitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--out", outDir]);
        expect(exitCode).toBe(0);
        return outDir;
    }

    function readLibrary(filePath: string): WeightedOutcomeLibrary {
        return JSON.parse(fs.readFileSync(filePath, "utf-8")) as WeightedOutcomeLibrary;
    }

    it("package -> generate -> validate -> analyze -> bundle: exact weights match the hand-computable fixture", async () => {
        const packageRoot = await buildPackage(finiteBlueprint("exact-cli-slot"), "pkg");

        const libraryFile = path.join(workDir, "base.json");
        const generateExit = await new OutcomeLibraryCommand("1.3.0").run([
            "generate",
            packageRoot,
            "--stake",
            "1",
            "--out",
            libraryFile,
            "--format",
            "json",
        ]);
        expect(generateExit).toBe(0);

        const library = readLibrary(libraryFile);
        expect(library.outcomes).toHaveLength(4);
        expect(library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(6);

        // validate (library-level, WeightedOutcomeLibraryValidator -- distinct from the bundle-level
        // "outcomelibrary validate" exercised later in this same test).
        const issues = new WeightedOutcomeLibraryValidator().validate(library);
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);

        // analyze: exact statistics, hand-computed from the same 4 grids GenerateTestFixtures documents
        // (winner weight 2 of 6 paying 5x, everything else 0x).
        const analysis = new WeightedOutcomeLibraryAnalyzer().analyze(library);
        expect(analysis.totalWeight).toBe(6);
        expect(analysis.rtp).toBeCloseTo((2 * 5) / 6, 10);
        expect(analysis.hitFrequency).toBeCloseTo(2 / 6, 10);
        expect(analysis.maxWin).toBe(5);

        // bundle: "outcomelibrary build" wraps the generated library into a canonical bundle, then the
        // bundle-level "outcomelibrary validate --deep" proves the whole round trip is self-consistent.
        const configPath = path.join(workDir, "bundle-config.json");
        fs.writeFileSync(configPath, JSON.stringify({modes: [{modeName: "base", libraryPath: "base.json"}]}));
        const bundleDir = path.join(workDir, "bundle");
        const buildExit = await new OutcomeLibraryCommand("1.3.0").run(["build", configPath, "--out", bundleDir]);
        expect(buildExit).toBe(0);

        const validateExit = await new OutcomeLibraryCommand("1.3.0").run(["validate", bundleDir, "--deep"]);
        expect(validateExit).toBe(0);
    });

    it("multi-mode: generating each mode separately and bundling them together produces a bundle with both modes", async () => {
        const packageRoot = await buildPackage(finiteBlueprint("multi-mode-cli-slot"), "pkg");

        const baseFile = path.join(workDir, "base.json");
        const bonusFile = path.join(workDir, "bonus.json");
        expect(await new OutcomeLibraryCommand("1.3.0").run(["generate", packageRoot, "--mode", "base", "--stake", "1", "--out", baseFile])).toBe(0);
        expect(await new OutcomeLibraryCommand("1.3.0").run(["generate", packageRoot, "--mode", "bonus", "--stake", "2", "--out", bonusFile])).toBe(0);

        const baseLibrary = readLibrary(baseFile);
        const bonusLibrary = readLibrary(bonusFile);
        // Same underlying reel-stop enumeration either way -- --mode/--stake only thread into
        // provenance/betMode/stake, never the reachable grids/weights themselves.
        expect(bonusLibrary.outcomes.map((outcome) => outcome.weight)).toEqual(baseLibrary.outcomes.map((outcome) => outcome.weight));
        expect(baseLibrary.libraryId).toBe("multi-mode-cli-slot-base");
        expect(bonusLibrary.libraryId).toBe("multi-mode-cli-slot-bonus");

        const configPath = path.join(workDir, "bundle-config.json");
        fs.writeFileSync(
            configPath,
            JSON.stringify({
                modes: [
                    {modeName: "base", libraryPath: "base.json"},
                    {modeName: "bonus", libraryPath: "bonus.json"},
                ],
            }),
        );
        const bundleDir = path.join(workDir, "bundle");
        expect(await new OutcomeLibraryCommand("1.3.0").run(["build", configPath, "--out", bundleDir])).toBe(0);
        expect(await new OutcomeLibraryCommand("1.3.0").run(["validate", bundleDir, "--deep"])).toBe(0);

        const manifest = JSON.parse(fs.readFileSync(path.join(bundleDir, "manifest.json"), "utf-8")) as {modes: Array<{modeName: string}>};
        expect(manifest.modes.map((mode) => mode.modeName).sort()).toEqual(["base", "bonus"]);
    });

    it("fails closed with weighted-outcome-library-generation-unsupported for a package whose mechanic isn't exactly enumerable (free games)", async () => {
        const packageRoot = await buildPackage(freeGamesBlueprint("freegames-cli-slot"), "pkg");

        const exitCode = await new OutcomeLibraryCommand("1.3.0").run(["generate", packageRoot]);

        expect(exitCode).toBe(1);
        const printedErrors = (console.error as jest.Mock).mock.calls.flat().join("\n");
        expect(printedErrors).toContain("weighted-outcome-library-generation-unsupported");
    });

    it("resume/cancel: a SIGINT-cancelled sweep's checkpoint resumes into the exact same complete library an uninterrupted sweep would produce", async () => {
        const packageRoot = await buildPackage(largeButBoundedBlueprint("resume-cli-slot"), "pkg");

        // Ground truth: the same package, generated in one uninterrupted run.
        const fullFile = path.join(workDir, "full.json");
        expect(await new OutcomeLibraryCommand("1.3.0").run(["generate", packageRoot, "--out", fullFile])).toBe(0);
        const fullLibrary = readLibrary(fullFile);
        expect(fullLibrary.outcomes.length).toBeGreaterThan(0);

        // Cancel deterministically at the first progress checkpoint (raw index 5,000 of 8,000) --
        // console.error's own mock implementation fires "SIGINT" on this run's own injected fake
        // process synchronously, from inside the exact same call stack as accumulateUniqueGridWeights's
        // own onProgress callback, so the abort is observed on the very next loop iteration: no reliance
        // on real timers or event-loop race timing.
        const fakeProcess = new EventEmitter() as unknown as NodeJS.Process;
        let cancelled = false;
        (console.error as jest.Mock).mockImplementation((message: unknown) => {
            if (!cancelled && typeof message === "string" && message.includes("progress")) {
                cancelled = true;
                fakeProcess.emit("SIGINT");
            }
        });

        const partialFile = path.join(workDir, "partial.json");
        const checkpointFile = path.join(workDir, "checkpoint.json");
        const cancelCommand = new OutcomeLibraryCommand(
            "1.3.0",
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            fakeProcess,
        );
        const cancelExit = await cancelCommand.run(["generate", packageRoot, "--out", partialFile, "--resume", checkpointFile, "--progress"]);

        expect(cancelExit).toBe(130);
        expect(cancelled).toBe(true);
        expect(fs.existsSync(partialFile)).toBe(false);
        expect(fs.existsSync(checkpointFile)).toBe(true);
        const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, "utf-8")) as {processedRawIndex: string; progressTotal: string};
        expect(checkpoint.progressTotal).toBe("8000");
        expect(Number(checkpoint.processedRawIndex)).toBeGreaterThanOrEqual(5000);
        expect(Number(checkpoint.processedRawIndex)).toBeLessThan(8000);

        // Resume, against a real (non-cancelling) process -- completes the remaining raw sweep, merges
        // it with the checkpoint's own already-accumulated grid weights, and produces the exact same
        // complete library the uninterrupted run above did.
        const resumeExit = await new OutcomeLibraryCommand("1.3.0").run(["generate", packageRoot, "--out", partialFile, "--resume", checkpointFile]);

        expect(resumeExit).toBe(0);
        expect(fs.existsSync(partialFile)).toBe(true);
        // The completed checkpoint is stale once the sweep it belonged to has actually finished -- never
        // left behind to be silently (and wrongly) reused by an unrelated later "generate" run.
        expect(fs.existsSync(checkpointFile)).toBe(false);

        const resumedLibrary = readLibrary(partialFile);
        expect(resumedLibrary.outcomes).toEqual(fullLibrary.outcomes);
    });
});
