import fs from "fs";
import os from "os";
import path from "path";
import {OutcomeLibraryBundleWriter, PokieProject, ProjectTargetResolver, SeededWeightedOutcomeRandomSource, sampleOutcomeSourceProject} from "pokie";
import {buildOutcomeLibraryBundleModeInput, buildOutcomeLibraryBundleTestLibrary} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

// Proves P3-POLISH-21's own sampling boundary: a resolved "outcomeLibrary" project draws through the existing
// selector/session/server path (OutcomeLibraryBundleOutcomeSource -- the same class
// PreGeneratedSpinCommandHandler already wires in production, never a freshly regenerated game-model draw),
// while a "stakeAdapter" project -- which has no PreGeneratedOutcomeSourcing-style draw contract -- returns the
// ordinary capability diagnostic instead of throwing.
describe("sampleOutcomeSourceProject", () => {
    const resolver = new ProjectTargetResolver();
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcome-source-sample-test-"));
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("draws an outcome from a resolved native outcome-library bundle via the existing selector path", async () => {
        const bundleDir = path.join(workDir, "bundle");
        const library = buildOutcomeLibraryBundleTestLibrary("base-lib");
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);

        const project = (await resolver.resolve(bundleDir)) as PokieProject;
        expect(project.type).toBe("outcomeLibrary");

        const result = await sampleOutcomeSourceProject(project, "base", new SeededWeightedOutcomeRandomSource("sample-seed"));

        expect(result.supported).toBe(true);
        if (result.supported) {
            expect(result.selection.libraryId).toBe("base-lib");
            const drawnIds = library.outcomes.map((outcome) => outcome.id);
            expect(drawnIds).toContain(result.selection.outcome.id);
        }
    });

    it("returns the capability diagnostic, rather than throwing, for a resolved Stake Engine project", async () => {
        const stakeDir = path.join(workDir, "stake");
        fs.mkdirSync(stakeDir, {recursive: true});
        fs.writeFileSync(path.join(stakeDir, "pokie-manifest.json"), JSON.stringify({generatedBy: "pokie stakeengine export", generatedAt: new Date(0).toISOString()}));

        const project = (await resolver.resolve(stakeDir)) as PokieProject;
        expect(project.type).toBe("stakeAdapter");

        const result = await sampleOutcomeSourceProject(project, "base", new SeededWeightedOutcomeRandomSource("sample-seed"));

        expect(result.supported).toBe(false);
        if (!result.supported) {
            expect(result.diagnostic.detectedType).toBe("stakeAdapter");
            expect(result.diagnostic.missingCapability).toBe("outcomeSource.sample");
            expect(result.diagnostic.alternatives).toEqual(["outcomeLibrary"]);
        }
    });
});
