import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactBuildCancelledError,
    ArtifactBuilderRegistry,
    BlueprintStakeOutcomeLibraryWorkflow,
    loadGameBlueprint,
    ManagedOutcomeProjectService,
    OutcomeLibraryBundleWriter,
    PROJECT_TYPE_CAPABILITIES,
    type PokieProject,
} from "../../src/index.js";

function runtimeSnapshotsForPackage(packageName: string): string[] {
    return fs.readdirSync(os.tmpdir())
        .filter((entry) => entry.startsWith("pokie-runtime-"))
        .map((entry) => path.join(os.tmpdir(), entry))
        .filter((root) => {
            try {
                return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")).name === packageName;
            } catch {
                return false;
            }
        });
}

describe("BlueprintStakeOutcomeLibraryWorkflow public export", () => {
    it("releases real package snapshots after repeated preflight and compatible-reuse operations", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-workflow-runtime-lease-"));
        const packageRoot = path.join(workDir, "game");
        const packageName = "workflow-runtime-lease-fixture";
        fs.cpSync(path.join(__dirname, "..", "cli", "fixtures", "playable-game-with-config-hash"), packageRoot, {recursive: true});
        fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({
            name: packageName,
            version: "1.0.0",
            pokie: {entry: "./index.js"},
        }));
        fs.writeFileSync(path.join(packageRoot, "index.js"), `
            const {SymbolsSequence, VideoSlotConfig, VideoSlotSession} = require("pokie");
            function config() {
                const value = new VideoSlotConfig();
                value.setReelsNumber(1);
                value.setReelsSymbolsNumber(1);
                value.setAvailableSymbols(["A"]);
                value.setAvailableBets([1]);
                value.setSymbolsSequences([new SymbolsSequence().fromArray(["A"])]);
                return value;
            }
            module.exports = {
                getManifest: () => ({id: "workflow-runtime-lease", name: "Workflow Runtime Lease", version: "1.0.0"}),
                getConfigHash: () => "sha256:workflow-runtime-lease",
                createSession: () => new VideoSlotSession(config()),
                createExactEnumerationSession: (generator) => new VideoSlotSession(config(), generator),
            };
        `);
        const project: PokieProject = {
            type: "tsPackage",
            rootPath: packageRoot,
            capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage,
            provenance: "test fixture",
        };
        const compatibleProject: PokieProject = {...project, rootPath: path.join(workDir, "existing-outcome"), type: "outcomeLibrary", capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary};
        const managedOutcomes = {
            findCompatible: () => Promise.resolve(compatibleProject),
            allocateRoot: () => path.join(workDir, "not-used"),
            registerAndOpen: () => Promise.reject(new Error("must not generate a compatible outcome library")),
            release: () => Promise.resolve(),
        };
        const workflow = new BlueprintStakeOutcomeLibraryWorkflow("1.3.0", loadGameBlueprint, undefined, managedOutcomes);

        try {
            expect(runtimeSnapshotsForPackage(packageName)).toEqual([]);
            await workflow.inspectGenerationPreflight(project);
            await workflow.inspectGenerationPreflight(project);
            await expect(workflow.resolveOrGenerate(project, path.join(workDir, "ignored"))).resolves.toMatchObject({reused: true});
            expect(runtimeSnapshotsForPackage(packageName)).toEqual([]);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

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
                modes: Array<{generator: {strategy: string; totalOutcomeSpaceSize: number; sampledRawCount: number; maxExactOutcomeSpaceSize: number; seed?: string; compatibilityPolicyVersion?: string}}>;
            };

            expect(result).toMatchObject({outputPath: outcomeDir, managedProjectRoots: [outcomeDir]});
            expect(manifest.modes[0].generator).toEqual(expect.objectContaining({
                strategy: "bounded-coverage",
                totalOutcomeSpaceSize: 100_000,
                sampledRawCount: 5_000,
                maxExactOutcomeSpaceSize: 50_000,
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

    it("registers and rolls back the prepared canonical destination rather than the caller spelling", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-bound-managed-outcome-destination-"));
        const blueprintPath = path.join(workDir, "game.blueprint.json");
        const outcomeDir = path.join(workDir, "outcome");
        // Deliberately retain a path spelling which resolves to outcomeDir.
        // A managed registry must record exactly the prepared destination the
        // writer used, and a failed registration must clean up that same path.
        const requestedDestination = `${workDir}${path.sep}not-created${path.sep}..${path.sep}outcome`;
        const registrations: string[] = [];
        fs.writeFileSync(
            blueprintPath,
            JSON.stringify({
                manifest: {id: "bound-managed-outcome-slot", name: "Bound Managed Outcome Slot", version: "1.0.0"},
                reels: 3,
                rows: 1,
                symbols: ["A"],
                paytable: {A: {2: 1, 3: 2}},
                reelStrips: [["A"], ["A"], ["A"]],
                availableBets: [1],
            }),
        );
        const project: PokieProject = {
            type: "blueprint",
            rootPath: blueprintPath,
            capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
            provenance: "test fixture",
        };
        const managedOutcomes = {
            findCompatible: () => Promise.resolve(undefined),
            allocateRoot: () => outcomeDir,
            registerAndOpen: (_sourceRootPath: string, rootPath: string) => {
                registrations.push(rootPath);
                return Promise.reject(new Error("injected registration failure"));
            },
            release: () => Promise.resolve(),
        };

        try {
            const workflow = new BlueprintStakeOutcomeLibraryWorkflow("1.3.0", loadGameBlueprint, undefined, managedOutcomes);
            await expect(workflow.resolveOrGenerate(project, requestedDestination)).rejects.toThrow("injected registration failure");

            expect(registrations).toEqual([outcomeDir]);
            expect(fs.existsSync(outcomeDir)).toBe(false);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("retains a pre-existing empty destination when managed registration fails", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-managed-outcome-owned-destination-"));
        const blueprintPath = path.join(workDir, "game.blueprint.json");
        const outcomeDir = path.join(workDir, "user-owned-empty-output");
        fs.mkdirSync(outcomeDir);
        fs.writeFileSync(blueprintPath, JSON.stringify({
            manifest: {id: "owned-empty-output-slot", name: "Owned Empty Output Slot", version: "1.0.0"},
            reels: 3, rows: 1, symbols: ["A"], paytable: {A: {2: 1, 3: 2}},
            reelStrips: [["A"], ["A"], ["A"]], availableBets: [1],
        }));
        const project: PokieProject = {type: "blueprint", rootPath: blueprintPath, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "test fixture"};
        const managedOutcomes = {
            findCompatible: () => Promise.resolve(undefined),
            allocateRoot: () => outcomeDir,
            registerAndOpen: () => Promise.reject(new Error("injected registration failure")),
            release: () => Promise.resolve(),
        };

        try {
            const workflow = new BlueprintStakeOutcomeLibraryWorkflow("1.3.0", loadGameBlueprint, undefined, managedOutcomes);
            await expect(workflow.resolveOrGenerate(project, outcomeDir)).rejects.toThrow("injected registration failure");

            expect(fs.existsSync(outcomeDir)).toBe(true);
            expect(fs.readdirSync(outcomeDir)).toEqual([]);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("keeps a destination claimed during the shared atomic publish unregistered and retries cleanly", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-managed-outcome-late-destination-"));
        const blueprintPath = path.join(workDir, "game.blueprint.json");
        const outcomeDir = path.join(workDir, "outcome");
        const lateFile = path.join(outcomeDir, "created-after-preflight.txt");
        fs.writeFileSync(blueprintPath, JSON.stringify({
            manifest: {id: "late-managed-output-slot", name: "Late Managed Output Slot", version: "1.0.0"},
            reels: 3, rows: 1, symbols: ["A"], paytable: {A: {2: 1, 3: 2}},
            reelStrips: [["A"], ["A"], ["A"]], availableBets: [1],
        }));
        const project: PokieProject = {type: "blueprint", rootPath: blueprintPath, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "test fixture"};
        let introducedLateDestination = false;

        try {
            const nativeWriter = new OutcomeLibraryBundleWriter("1.3.0");
            const workflow = new BlueprintStakeOutcomeLibraryWorkflow("1.3.0", loadGameBlueprint, undefined, undefined, {
                writeToDirectory: (modes, destination, options) => nativeWriter.writeToDirectory(modes, destination, {
                    ...options,
                    onProgress: (progress) => {
                        options?.onProgress?.(progress);
                        if (!introducedLateDestination && progress.message.startsWith("Publishing Outcome file")) {
                            // Replace the writer's reservation only after the
                            // final owner policy has succeeded and the atomic
                            // publisher is constructing its temp directory.
                            fs.rmSync(destination, {recursive: true, force: true});
                            fs.mkdirSync(destination, {recursive: true});
                            fs.writeFileSync(lateFile, "external destination owner");
                            introducedLateDestination = true;
                        }
                    },
                }),
            });
            await expect(workflow.resolveOrGenerate(project, outcomeDir)).rejects.toThrow(/claimed while publication was being prepared/i);

            expect(introducedLateDestination).toBe(true);
            expect(fs.readFileSync(lateFile, "utf-8")).toBe("external destination owner");
            expect(fs.existsSync(path.join(outcomeDir, "manifest.json"))).toBe(false);
            expect(fs.existsSync(path.join(workDir, ".pokie", "outcome-libraries"))).toBe(false);

            fs.rmSync(outcomeDir, {recursive: true, force: true});
            await expect(workflow.resolveOrGenerate(project, outcomeDir)).resolves.toMatchObject({reused: false});
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
});
