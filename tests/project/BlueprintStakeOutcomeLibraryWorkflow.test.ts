import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactBuilderRegistry,
    BlueprintStakeOutcomeLibraryWorkflow,
    loadGameBlueprint,
    ManagedOutcomeProjectService,
    PROJECT_TYPE_CAPABILITIES,
    type PokieProject,
} from "../../src/index.js";

describe("BlueprintStakeOutcomeLibraryWorkflow public export", () => {
    it("uses the registry-owned managed Outcome record as the Blueprint-to-Stake prerequisite", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-public-blueprint-stake-workflow-test-"));
        const blueprintPath = path.join(workDir, "game.blueprint.json");
        const outcomeDir = path.join(workDir, "outcome");
        const stakeDir = path.join(workDir, "stake");
        fs.writeFileSync(
            blueprintPath,
            JSON.stringify({
                manifest: {id: "public-workflow-slot", name: "Public Workflow Slot", version: "1.0.0"},
                reels: 3,
                rows: 1,
                symbols: ["A"],
                paytable: {A: {2: 1, 3: 2}},
                reelStrips: [["A"], ["A"], ["A"]],
                availableBets: [1],
            }),
        );
        const blueprintProject: PokieProject = {
            type: "blueprint",
            rootPath: blueprintPath,
            capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
            provenance: "test fixture",
        };
        const managedOutcomes = new ManagedOutcomeProjectService();
        // Importing from src/index.ts must expose the same shared lifecycle that the registry uses.
        const workflow = new BlueprintStakeOutcomeLibraryWorkflow("1.3.0", loadGameBlueprint, undefined, managedOutcomes);
        const registry = new ArtifactBuilderRegistry("1.3.0", undefined, managedOutcomes);

        try {
            const outcome = await workflow.resolveOrGenerate(blueprintProject, outcomeDir);
            const manifestBeforeStake = fs.readFileSync(path.join(outcomeDir, "manifest.json"), "utf-8");

            expect(outcome).toEqual({project: expect.objectContaining({type: "outcomeLibrary", rootPath: outcomeDir}), reused: false});

            const stake = await registry.build("stakeAdapter", blueprintProject, stakeDir);

            expect(stake).toMatchObject({
                outputPath: stakeDir,
                prerequisiteProjectRoots: [outcomeDir],
                managedProjectRoots: [outcomeDir],
            });
            expect(fs.existsSync(path.join(stakeDir, "index.json"))).toBe(true);
            expect(fs.readFileSync(path.join(outcomeDir, "manifest.json"), "utf-8")).toBe(manifestBeforeStake);
            expect(fs.existsSync(path.join(workDir, ".pokie", "outcome-libraries"))).toBe(false);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
});
