import {EventEmitter} from "events";
import {GameBlueprint, WeightedOutcomeLibrary, WeightedOutcomeLibraryAnalyzer, WeightedOutcomeLibraryValidator} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {OutcomeLibraryCommand} from "../../cli/commands/OutcomeLibraryCommand.js";
import {OutcomeSourceCommand} from "../../cli/commands/OutcomeSourceCommand.js";

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

    // 28^4 is the independently accepted 614,656-outcome exact workload.
    // Each stop has its own symbol. A visible grid retains a separate cell
    // for every reel, so four copies of this strip still produce 28^4 distinct
    // canonical grids (and hence real round artifacts), rather than merely
    // exercising the raw sweep while collapsing its output to a tiny library.
    function acceptedExactWorkloadBlueprint(id: string): GameBlueprint {
        const reel = Array.from({length: 28}, (_unused, stop) => `S${stop}`);
        return {
            manifest: {id, name: "Accepted Exact Workload Slot", version: "1.0.0"},
            reels: 4,
            rows: 1,
            symbols: reel,
            // A public Blueprint permits symbols without payouts. Keep one
            // reachable payout so this remains a real game workload, while
            // avoiding an unrelated 28-way paytable scan for each of the
            // 614,656 distinct outcome artifacts.
            paytable: {S0: {4: 1}},
            reelStrips: [reel, reel, reel, reel],
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

    // Builds a real package via the real "pokie build <config.json> --target tsPackage --out <dir>" CLI, exactly
    // as a user would run it -- the "package" step of "package -> generate -> validate -> analyze -> bundle".
    async function buildPackage(blueprint: GameBlueprint, dirName: string): Promise<string> {
        const blueprintPath = path.join(workDir, `${dirName}.blueprint.json`);
        fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));
        const outDir = path.join(workDir, dirName);
        const exitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--target", "tsPackage", "--out", outDir]);
        expect(exitCode).toBe(0);
        return outDir;
    }

    function readLibrary(filePath: string): WeightedOutcomeLibrary {
        return JSON.parse(fs.readFileSync(filePath, "utf-8")) as WeightedOutcomeLibrary;
    }

    function countRawOutcomes(filePath: string): number {
        const descriptor = fs.openSync(filePath, "r");
        const buffer = Buffer.allocUnsafe(64 * 1024);
        let carry = "";
        let count = 0;
        try {
            let bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
            while (bytesRead > 0) {
                const text = carry + buffer.subarray(0, bytesRead).toString("utf-8");
                const lastQuote = text.lastIndexOf('"id":"outcome-');
                const complete = lastQuote === -1 ? text : text.slice(0, lastQuote);
                count += complete.split('"id":"outcome-').length - 1;
                carry = lastQuote === -1 ? text : text.slice(lastQuote);
                bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
            }
            return count + (carry.split('"id":"outcome-').length - 1);
        } finally {
            fs.closeSync(descriptor);
        }
    }

    function readRawLibraryPrefix(filePath: string, length: number): string {
        const descriptor = fs.openSync(filePath, "r");
        const buffer = Buffer.allocUnsafe(length);
        try {
            const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
            return buffer.subarray(0, bytesRead).toString("utf-8");
        } finally {
            fs.closeSync(descriptor);
        }
    }

    it("streams 614,656 distinct canonical outcomes through public build and generate commands", async () => {
        const blueprint = acceptedExactWorkloadBlueprint("accepted-exact-workload-slot");
        const blueprintPath = path.join(workDir, "accepted-exact.blueprint.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));

        const bundleDir = path.join(workDir, "accepted-exact-bundle");
        expect(await new BuildCommand("1.3.0").run([blueprintPath, "--target", "outcomeLibrary", "--exact", "--out", bundleDir])).toBe(0);
        const manifest = JSON.parse(fs.readFileSync(path.join(bundleDir, "manifest.json"), "utf-8")) as {game: {id: string}; modes: Array<{outcomeCount: number; generator?: {strategy: string; totalOutcomeSpaceSize: number}}>};
        expect(manifest.game.id).toBe("accepted-exact-workload-slot");
        expect(manifest.modes[0]).toEqual(expect.objectContaining({outcomeCount: 614_656, totalWeight: 614_656, generator: expect.objectContaining({strategy: "exact", totalOutcomeSpaceSize: 614_656})}));
        // This reads the staged byte index back against every record; it is
        // intentionally the bundle reader's real integrity boundary, not an
        // in-memory manifest-only assertion.
        expect(await new OutcomeLibraryCommand("1.3.0").run(["validate", bundleDir, "--deep"])).toBe(0);

        const packageRoot = await buildPackage(blueprint, "accepted-exact-package");
        const rawLibrary = path.join(workDir, "accepted-exact.json");
        expect(await new OutcomeLibraryCommand("1.3.0").run(["generate", packageRoot, "--exact", "--out", rawLibrary])).toBe(0);
        // Count directly from the durable JSON stream. Do not JSON.parse this
        // 614,656-outcome library: the assertion is specifically a public
        // streaming-regression boundary, not an in-memory fallback.
        expect(countRawOutcomes(rawLibrary)).toBe(614_656);
        expect(readRawLibraryPrefix(rawLibrary, 1024)).toContain('"provenance":{"game":{"id":"accepted-exact-workload-slot"');
    }, 3_600_000);

    it("cancels raw publication without retaining an unreachable staging directory or partial destination", async () => {
        const packageRoot = await buildPackage(finiteBlueprint("raw-publication-cancel-slot"), "raw-publication-package");
        const rawLibrary = path.join(workDir, "cancelled-raw.json");
        const fakeProcess = new EventEmitter() as unknown as NodeJS.Process;
        const originalOpen = fs.openSync;
        let cancelled = false;
        const openSync = jest.spyOn(fs, "openSync").mockImplementation(((...args: Parameters<typeof fs.openSync>) => {
            const descriptor = originalOpen(...args);
            if (!cancelled && String(args[0]).includes(".cancelled-raw.json.pokie-")) {
                cancelled = true;
                fakeProcess.emit("SIGINT");
            }
            return descriptor;
        }) as typeof fs.openSync);
        try {
            const command = new OutcomeLibraryCommand(
                "1.3.0", undefined, undefined, undefined, undefined, undefined,
                undefined, undefined, undefined, undefined, undefined, fakeProcess,
            );
            expect(await command.run(["generate", packageRoot, "--exact", "--out", rawLibrary])).toBe(130);
            expect(cancelled).toBe(true);
            expect(fs.existsSync(rawLibrary)).toBe(false);
            expect(fs.readdirSync(workDir).some((entry) => entry.includes(".cancelled-raw.json.pokie-"))).toBe(false);

            // Cancellation has no durable checkpoint or hidden staging to
            // resume, so the public retry starts cleanly and owns the exact
            // destination it publishes.
            expect(await new OutcomeLibraryCommand("1.3.0").run(["generate", packageRoot, "--exact", "--out", rawLibrary])).toBe(0);
            expect(readLibrary(rawLibrary).outcomes).toHaveLength(4);
        } finally {
            openSync.mockRestore();
        }
    });

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

    it("enumerates a free-games package's finite paid-spin outcome space and preserves its trigger", async () => {
        const packageRoot = await buildPackage(freeGamesBlueprint("freegames-cli-slot"), "pkg");

        const libraryFile = path.join(workDir, "freegames.json");
        const exitCode = await new OutcomeLibraryCommand("1.3.0").run(["generate", packageRoot, "--out", libraryFile]);

        expect(exitCode).toBe(0);
        const library = readLibrary(libraryFile);
        expect(library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(27);
        expect(library.outcomes.some((outcome) => outcome.artifact.featureEvents?.some((event) => event.type === "freeGamesTriggered") ?? false)).toBe(true);
    });

    it("sample -> validate -> bundle: a large reel game performs only the requested deterministic draws", async () => {
        const packageRoot = await buildPackage(largeButBoundedBlueprint("sampled-cli-slot"), "sampled-pkg");
        const firstFile = path.join(workDir, "sampled-first.json");
        const repeatFile = path.join(workDir, "sampled-repeat.json");

        for (const filePath of [firstFile, repeatFile]) {
            expect(
                await new OutcomeLibraryCommand("1.3.0").run(["generate", packageRoot, "--sample", "37", "--seed", "sampled-cli-seed", "--out", filePath]),
            ).toBe(0);
        }

        const first = readLibrary(firstFile);
        expect(first.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(37);
        expect(readLibrary(repeatFile)).toEqual(first);
        expect(new WeightedOutcomeLibraryValidator().validate(first).filter((issue) => issue.severity === "error")).toEqual([]);

        const configPath = path.join(workDir, "sampled-bundle-config.json");
        fs.writeFileSync(configPath, JSON.stringify({modes: [{modeName: "base", libraryPath: "sampled-first.json"}]}));
        const bundleDir = path.join(workDir, "sampled-bundle");
        expect(await new OutcomeLibraryCommand("1.3.0").run(["build", configPath, "--out", bundleDir])).toBe(0);
        expect(await new OutcomeLibraryCommand("1.3.0").run(["validate", bundleDir, "--deep"])).toBe(0);
        expect(await new OutcomeSourceCommand().run(["sample", bundleDir, "--mode", "base", "--seed", "downstream-seed"])).toBe(0);
    });

    it("cancellation during streamed raw generation removes disposable staging and a clean retry produces the complete library", async () => {
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
        // Streamed exact publication partitions grids on disk. Those partitions
        // are deliberately disposable: no checkpoint can safely refer to them
        // after publication interrupts, so the public contract is retry rather
        // than a misleading/unreachable resume token.
        expect(fs.existsSync(checkpointFile)).toBe(false);

        // Retry, against a real (non-cancelling) process. It produces the
        // exact same complete library as an uninterrupted generation.
        const resumeExit = await new OutcomeLibraryCommand("1.3.0").run(["generate", packageRoot, "--out", partialFile, "--resume", checkpointFile]);

        expect(resumeExit).toBe(0);
        expect(fs.existsSync(partialFile)).toBe(true);
        // No stale checkpoint is left behind to be silently reused by an
        // unrelated later generation run.
        expect(fs.existsSync(checkpointFile)).toBe(false);

        const resumedLibrary = readLibrary(partialFile);
        expect(resumedLibrary.outcomes).toEqual(fullLibrary.outcomes);
    });

});
