import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactBuildCancelledError,
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
                // Studio's basic Bets & Modes editor can save this legacy declarative mode without
                // opting into runtime selection. Blueprint -> Outcome/Stake must still build it.
                betModes: [{id: "base", isDefault: true, targetRtp: 0.96}],
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
            expect(JSON.parse(manifestBeforeStake).modes).toEqual([expect.objectContaining({modeName: "base", betMode: "base"})]);

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

    it("uses deterministic bounded coverage by default when the registry builds a large Blueprint Outcome Library", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-managed-large-outcome-registry-test-"));
        const blueprintPath = path.join(workDir, "large.blueprint.json");
        const outcomeDir = path.join(workDir, "outcome");
        fs.writeFileSync(
            blueprintPath,
            JSON.stringify({
                manifest: {id: "large-registry-slot", name: "Large Registry Slot", version: "1.0.0"},
                reels: 5,
                rows: 1,
                symbols: ["A"],
                paytable: {A: {3: 1, 4: 2, 5: 3}},
                reelStrips: Array.from({length: 5}, () => Array.from({length: 10}, () => "A")),
                availableBets: [1],
            }),
        );
        const project: PokieProject = {
            type: "blueprint",
            rootPath: blueprintPath,
            capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
            provenance: "test fixture",
        };

        try {
            const result = await new ArtifactBuilderRegistry("1.3.0").build("outcomeLibrary", project, outcomeDir);
            const manifest = JSON.parse(fs.readFileSync(path.join(outcomeDir, "manifest.json"), "utf-8")) as {
                modes: Array<{generator: {strategy: string; totalOutcomeSpaceSize: number; sampledRawCount: number; seed?: string; compatibilityPolicyVersion?: string}}>;
            };

            expect(result).toMatchObject({outputPath: outcomeDir, managedProjectRoots: [outcomeDir]});
            expect(manifest.modes[0].generator).toEqual(expect.objectContaining({
                strategy: "bounded-coverage",
                totalOutcomeSpaceSize: 100_000,
                sampledRawCount: 5_000,
                seed: expect.stringMatching(/^pokie-managed-coverage:sha256:/),
                compatibilityPolicyVersion: "managed-v1",
            }));
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("preflights a large Outcome job, cancels during bundle publishing, and leaves neither bundle nor managed registration", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-cancelled-blueprint-outcome-"));
        const blueprintPath = path.join(workDir, "game.blueprint.json");
        const outcomeDir = path.join(workDir, "outcome");
        const controller = new AbortController();
        const progress: string[] = [];
        fs.writeFileSync(
            blueprintPath,
            JSON.stringify({
                manifest: {id: "large-workflow-slot", name: "Large Workflow Slot", version: "1.0.0"},
                reels: 5,
                rows: 1,
                symbols: ["A"],
                paytable: {A: {3: 1, 4: 2, 5: 3}},
                reelStrips: Array.from({length: 5}, () => Array.from({length: 7}, () => "A")),
                availableBets: [1],
            }),
        );
        const project: PokieProject = {
            type: "blueprint",
            rootPath: blueprintPath,
            capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
            provenance: "test fixture",
        };

        try {
            const workflow = new BlueprintStakeOutcomeLibraryWorkflow("1.3.0", loadGameBlueprint);
            await expect(
                workflow.resolveOrGenerate(project, outcomeDir, {
                    signal: controller.signal,
                    onProgress: (event) => {
                        progress.push(event.message ?? event.status);
                        if (event.status === "preflight") {
                            expect(event.preflight?.estimatedItemCount).toBe(BigInt(16_807));
                            expect(event.preflight?.estimatedBytes).toBeGreaterThan(BigInt(0));
                            expect(event.preflight?.complexityWarning).toMatch(/16[,.]?807/);
                        }
                        if (event.message?.startsWith("Writing Outcome mode")) controller.abort();
                    },
                }),
            ).rejects.toBeInstanceOf(ArtifactBuildCancelledError);
            expect(progress).toContain("preflight");
            expect(progress.some((message) => message.startsWith("Writing Outcome mode"))).toBe(true);
            expect(progress).toContain("cancelled");
            expect(fs.existsSync(outcomeDir)).toBe(false);
            expect(fs.existsSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"))).toBe(false);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
});
