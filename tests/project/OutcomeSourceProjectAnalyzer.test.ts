import fs from "fs";
import os from "os";
import path from "path";
import {
    OutcomeLibraryBundleWriter,
    OutcomeSourceProjectAnalyzer,
    PokieProject,
    ProjectTargetResolver,
    StakeEngineExportModeInput,
    StakeEngineExporter,
} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";
import {buildStakeEngineTestLibrary} from "../stakeengine/StakeEngineTestFixtures.js";

// Proves P3-POLISH-21's own routing: a resolved "outcomeLibrary"/"stakeAdapter" PokieProject reaches its own
// canonical outcome-source reader (never loadPokieGame, never a re-derived game-model calculation), a
// malformed shard/source surfaces as structured issues rather than a raw throw, and a native bundle's own
// exact analysis is read off its manifest.json alone (never touching its outcomes files -- see
// OutcomeLibraryBundleReader.test.ts for the writer/reader round trip this leans on).
describe("OutcomeSourceProjectAnalyzer", () => {
    const resolver = new ProjectTargetResolver();
    const analyzer = new OutcomeSourceProjectAnalyzer();
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcome-source-analyzer-test-"));
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("analyzes a resolved native outcome-library bundle straight off its manifest -- no outcomes file ever read", async () => {
        const bundleDir = path.join(workDir, "bundle");
        const readSpy = jest.spyOn(fs.promises, "readFile");
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
        readSpy.mockClear();

        const project = (await resolver.resolve(bundleDir)) as PokieProject;
        expect(project.type).toBe("outcomeLibrary");

        const report = await analyzer.analyze(project);

        expect(report.descriptor.kind).toBe("native");
        expect(report.descriptor.streaming).toBe(true);
        expect(report.descriptor.limitations.length).toBeGreaterThan(0);
        expect(report.issues).toEqual([]);
        expect(report.modes).toHaveLength(1);
        expect(report.modes[0].modeName).toBe("base");
        expect(report.modes[0].analysis.rtp).toBeCloseTo(2.75);
        expect(report.modes[0].analysis.hitFrequency).toBeCloseTo(0.5);

        // Never opened any of the mode's own outcomes_*.jsonl file -- only manifest.json (validator +
        // readManifest), preserving OutcomeLibraryBundleReading's own documented streaming behavior.
        const readFiles = readSpy.mock.calls.map((call) => String(call[0]));
        expect(readFiles.some((file) => file.includes("outcomes_"))).toBe(false);
        readSpy.mockRestore();
    });

    it("reports structural issues, never throws, for a native bundle whose manifest.json is malformed", async () => {
        const bundleDir = path.join(workDir, "broken-bundle");
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
        fs.writeFileSync(path.join(bundleDir, "manifest.json"), "{not valid json");

        // ProjectTargetResolver itself already refuses a malformed manifest.json (ProjectTargetMalformedError)
        // -- build the project object by hand instead, the same shape a successful resolve() would have
        // produced, to exercise the analyzer's own malformed-shard handling in isolation from the resolver's.
        const project: PokieProject = {
            type: "outcomeLibrary",
            rootPath: bundleDir,
            capabilities: ["outcomeLibrary.read", "outcomeSource.read", "outcomeSource.sample"],
            provenance: "test fixture",
        };

        const report = await analyzer.analyze(project);

        expect(report.issues.some((issue) => issue.severity === "error")).toBe(true);
        expect(report.modes).toEqual([]);
    });

    it("analyzes a resolved Stake Engine outcome directory via its own standalone reader/analyzer", async () => {
        const stakeDir = path.join(workDir, "stake");
        const modes: StakeEngineExportModeInput[] = [{modeName: "base", cost: 1, library: buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1})}];
        await new StakeEngineExporter("1.3.0").exportToDirectory(modes, stakeDir);

        const project = (await resolver.resolve(stakeDir)) as PokieProject;
        expect(project.type).toBe("stakeAdapter");

        const report = await analyzer.analyze(project);

        expect(report.descriptor.kind).toBe("stakeEngine");
        expect(report.descriptor.streaming).toBe(false);
        expect(report.descriptor.limitations.length).toBeGreaterThan(0);
        expect(report.issues.some((issue) => issue.severity === "error")).toBe(false);
        expect(report.modes).toHaveLength(1);
        expect(report.modes[0].modeName).toBe("base");
        expect(typeof report.modes[0].analysis.rtp).toBe("number");
        expect(typeof report.modes[0].analysis.hitFrequency).toBe("number");
    });

    it("reports structural issues, never rejects, for a Stake Engine directory missing its index.json", async () => {
        const stakeDir = path.join(workDir, "broken-stake");
        fs.mkdirSync(stakeDir, {recursive: true});
        fs.writeFileSync(path.join(stakeDir, "pokie-manifest.json"), JSON.stringify({generatedBy: "pokie stakeengine export", generatedAt: new Date(0).toISOString()}));

        const project = (await resolver.resolve(stakeDir)) as PokieProject;
        expect(project.type).toBe("stakeAdapter");

        const report = await analyzer.analyze(project);

        expect(report.issues.some((issue) => issue.severity === "error")).toBe(true);
        expect(report.modes).toEqual([]);
    });

    it("reader parity: both native and Stake reports expose the same shared analysis field names", async () => {
        const bundleDir = path.join(workDir, "parity-bundle");
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
        const nativeProject = (await resolver.resolve(bundleDir)) as PokieProject;
        const nativeReport = await analyzer.analyze(nativeProject);

        const stakeDir = path.join(workDir, "parity-stake");
        const modes: StakeEngineExportModeInput[] = [{modeName: "base", cost: 1, library: buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1})}];
        await new StakeEngineExporter("1.3.0").exportToDirectory(modes, stakeDir);
        const stakeProject = (await resolver.resolve(stakeDir)) as PokieProject;
        const stakeReport = await analyzer.analyze(stakeProject);

        for (const sharedField of ["rtp", "hitFrequency", "zeroWinFrequency", "variance", "standardDeviation", "maxWinProbability"] as const) {
            expect(typeof nativeReport.modes[0].analysis[sharedField]).toBe("number");
            expect(typeof stakeReport.modes[0].analysis[sharedField]).toBe("number");
        }
    });

    it("throws a descriptive error for a project type it doesn't support", async () => {
        const project: PokieProject = {
            type: "blueprint",
            rootPath: "/blueprints/game.json",
            capabilities: ["blueprint.build"],
            provenance: "test fixture",
        };

        await expect(analyzer.analyze(project)).rejects.toThrow(/"blueprint" project -- outcome-source analysis only supports/);
    });
});
