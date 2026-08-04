import fs from "fs";
import os from "os";
import path from "path";
import {OutcomeLibraryBundleWriter, PokieProject, ProjectTargetResolver, replayOutcomeSourceProject} from "pokie";
import {buildOutcomeLibraryBundleModeInput, buildOutcomeLibraryBundleTestLibrary} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

// Proves P3-POLISH-21's own replay boundary: a resolved "outcomeLibrary" project reproduces a (seed, round)
// draw through the existing outcome-source selector/session path (PreGeneratedRoundReplayer -- the same
// deterministic reconstruction PokieDevServer's own pre-generated session route agrees with, never a freshly
// regenerated game-model replay), while a "stakeAdapter" project -- which has no PreGeneratedOutcomeSourcing-
// style draw contract -- returns the ordinary capability diagnostic instead of throwing or reading a bundle.
describe("replayOutcomeSourceProject", () => {
    const resolver = new ProjectTargetResolver();
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcome-source-replay-test-"));
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("reproduces the (seed, round) draw from a resolved native outcome-library bundle via the existing replay path", async () => {
        const bundleDir = path.join(workDir, "bundle");
        const library = buildOutcomeLibraryBundleTestLibrary("base-lib");
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);

        const project = (await resolver.resolve(bundleDir)) as PokieProject;
        expect(project.type).toBe("outcomeLibrary");

        const result = await replayOutcomeSourceProject(project, "base", "replay-seed", 1);

        expect(result.supported).toBe(true);
        if (result.supported) {
            expect(result.replay.libraryId).toBe("base-lib");
            expect(result.replay.seed).toBe("replay-seed");
            expect(result.replay.round).toBe(1);
            const drawnIds = library.outcomes.map((outcome) => outcome.id);
            expect(drawnIds).toContain(result.replay.outcomeId);
        }
    });

    it("reproduces the identical outcome for the same (seed, round) across independent calls", async () => {
        const bundleDir = path.join(workDir, "bundle");
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
        const project = (await resolver.resolve(bundleDir)) as PokieProject;

        const first = await replayOutcomeSourceProject(project, "base", "reproducible-seed", 4);
        const second = await replayOutcomeSourceProject(project, "base", "reproducible-seed", 4);

        expect(first.supported).toBe(true);
        expect(second.supported).toBe(true);
        if (first.supported && second.supported) {
            expect(second.replay.outcomeId).toBe(first.replay.outcomeId);
            expect(second.replay.libraryHash).toBe(first.replay.libraryHash);
        }
    });

    it("returns the capability diagnostic, rather than throwing or reading a bundle, for a resolved Stake Engine project", async () => {
        const stakeDir = path.join(workDir, "stake");
        fs.mkdirSync(stakeDir, {recursive: true});
        fs.writeFileSync(path.join(stakeDir, "pokie-manifest.json"), JSON.stringify({generatedBy: "pokie stakeengine export", generatedAt: new Date(0).toISOString()}));

        const project = (await resolver.resolve(stakeDir)) as PokieProject;
        expect(project.type).toBe("stakeAdapter");

        const result = await replayOutcomeSourceProject(project, "base", "replay-seed", 1);

        expect(result.supported).toBe(false);
        if (!result.supported) {
            expect(result.diagnostic.detectedType).toBe("stakeAdapter");
            expect(result.diagnostic.operation).toBe("outcomeSource.replay");
            expect(result.diagnostic.missingCapability).toBe("outcomeSource.sample");
            expect(result.diagnostic.alternatives).toEqual(["outcomeLibrary"]);
        }
    });
});
