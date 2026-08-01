import {
    buildRoundArtifact,
    buildWeightedOutcomeLibrary,
    GameBlueprint,
    OutcomeLibraryBundleWriter,
    ValueWinComponent,
    WinEvaluationResult,
    WinningValue,
} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {StudioOutcomeLibraryGenerateService} from "../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.js";
import {StudioStakeEngineExportService} from "../../cli/studio/stakeengine/StudioStakeEngineExportService.js";

const POKIE_VERSION = "1.3.0";

// End-to-end happy path for the Stake Engine Export tab's own registry integration: package (a real
// "pokie build" output) -> a canonical outcome-library bundle generated for it and written into that
// package's own conventional bundle directory (the same layout StudioOutcomeLibraryGenerateService.generate()
// itself produces via OutcomeLibraryBundleWriter) -> discover it as "compatible" from the registry (the
// same StudioOutcomeLibraryGenerateService.registry() StakeEngineExportTab's own Configure step calls) ->
// feed that discovered bundle selector straight into StudioStakeEngineExportService.export() -- never a
// hand-typed flat libraryPath -- and confirm a real manifest/files come out the other end.
//
// The bundle here is hand-built (via buildWeightedOutcomeLibrary/OutcomeLibraryBundleWriter, not the exact
// reel-enumeration generator) because generateExactWeightedOutcomeLibrary's own outcome ids are always
// content-addressed hashes (see outcomeIdForGrid), and Stake Engine's own format permanently requires
// plain non-negative integer ids (stakeengine-outcome-id-not-integer) -- an orthogonal, pre-existing
// constraint this test isn't exercising. What this test proves is the registry hand-off itself: a bundle
// discovered as "compatible" against a real built package resolves straight through to a real Stake
// export. Before that hand-off existed, the only way to point a Stake Engine export mode at a generated
// library was to type its on-disk path by hand; a path that didn't match the bundle's own layout failed
// with a raw filesystem error (see StudioStakeEngineExportService.test.ts's own "outside the project
// root"/"doesn't exist" load-error cases). Driving the same chain through the registry instead proves that
// failure mode is now structurally avoided: nowhere in this successful run does a raw "ENOENT" (or any
// other bare Node.js error string) ever surface.
describe("Stake Engine Export: package -> generate library -> registry discovery -> Stake Engine export (integration)", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-export-registry-e2e-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
        (console.error as jest.Mock).mockRestore();
    });

    function finiteBlueprint(id: string): GameBlueprint {
        return {
            manifest: {id, name: "Stake Export Registry E2E Slot", version: "1.0.0"},
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

    async function buildPackage(blueprint: GameBlueprint, dirName: string): Promise<string> {
        const blueprintPath = path.join(workDir, `${dirName}.blueprint.json`);
        fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));
        const outDir = path.join(workDir, dirName);
        const exitCode = await new BuildCommand(POKIE_VERSION).run([blueprintPath, "--out", outDir]);
        expect(exitCode).toBe(0);
        return outDir;
    }

    it("exports a mode resolved from a registry-discovered bundle, with real manifest/files and no raw ENOENT anywhere", async () => {
        const blueprint = finiteBlueprint("stake-export-registry-e2e");
        const packageRoot = await buildPackage(blueprint, "pkg");

        // "generate library": write a canonical outcome-library bundle into the built package's own
        // conventional bundle directory, provenance-matched to this exact package/pokie release -- the
        // same on-disk shape StudioOutcomeLibraryGenerateService.generate() itself produces.
        const provenance = {game: blueprint.manifest, pokieVersion: POKIE_VERSION};
        const winOf = (totalWin: number): WinEvaluationResult<string> =>
            totalWin === 0 ? new WinEvaluationResult<string>() : new WinEvaluationResult<string>({valueWins: [new ValueWinComponent<string>(new WinningValue<string>("A", [[0, 0]], totalWin))]});
        const library = buildWeightedOutcomeLibrary({
            libraryId: "stake-export-registry-e2e-base",
            outcomes: [
                {
                    id: "0",
                    weight: 4,
                    artifact: buildRoundArtifact({roundId: "round-0", provenance, betMode: "base", stake: 1, steps: [{screen: [["B"]], winEvaluationResult: winOf(0)}]}),
                },
                {
                    id: "1",
                    weight: 2,
                    artifact: buildRoundArtifact({roundId: "round-1", provenance, betMode: "base", stake: 1, steps: [{screen: [["A"]], winEvaluationResult: winOf(5)}]}),
                },
            ],
        });
        const bundleDir = path.join(packageRoot, StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR);
        const writeResult = await new OutcomeLibraryBundleWriter(POKIE_VERSION).writeToDirectory(
            [{modeName: "base", libraryId: library.libraryId, schemaVersion: library.schemaVersion, outcomes: library.outcomes}],
            bundleDir,
        );
        expect(writeResult.issues.filter((issue) => issue.severity === "error")).toEqual([]);

        // registry: proves the bundle just written is discoverable and classified "compatible" against
        // this same build -- exactly what StakeEngineExportTab's own Configure step badges as "Found".
        const generateService = new StudioOutcomeLibraryGenerateService(POKIE_VERSION);
        const registryView = await generateService.registry(packageRoot);
        if (registryView.status !== "ok" || registryView.buildStatus === "missing") {
            throw new Error(`expected a compatible registry entry, got ${JSON.stringify(registryView)}`);
        }
        const discoveredMode = registryView.modes.find((mode) => mode.modeName === "base");
        expect(discoveredMode).toMatchObject({modeName: "base", buildStatus: "compatible", bundleDir: StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR});
        if (discoveredMode === undefined) {
            throw new Error("expected a discovered mode entry");
        }

        // Stake export: the discovered bundle selector, never a hand-typed flat libraryPath.
        const exportService = new StudioStakeEngineExportService(POKIE_VERSION);
        const exportView = await exportService.export(
            packageRoot,
            [{modeName: "base", librarySelector: {kind: "bundle", bundleDir: discoveredMode.bundleDir, modeName: discoveredMode.modeName}, cost: 1}],
            "stakeengine",
            false,
        );

        expect(exportView.status).toBe("ok");
        if (exportView.status !== "ok") throw new Error(`expected export ok, got ${JSON.stringify(exportView)}`);
        expect(exportView.manifest.modes).toHaveLength(1);
        expect(exportView.manifest.modes[0].name).toBe("base");
        expect(exportView.manifest.modes[0].outcomeCount).toBe(2);
        expect(exportView.files.length).toBeGreaterThan(0);
        expect(fs.existsSync(path.join(packageRoot, "stakeengine", "index.json"))).toBe(true);
        expect(fs.existsSync(path.join(packageRoot, "stakeengine", "pokie-manifest.json"))).toBe(true);

        // validate manifest/files -- and, per this test's own doc comment, confirm no raw filesystem error
        // (ENOENT or otherwise) ever leaked into the successful result.
        const serialized = JSON.stringify(exportView);
        expect(serialized).not.toContain("ENOENT");
        expect(serialized).not.toContain("Error:");
    });
});
