import fs from "fs";
import os from "os";
import path from "path";
import type {ArtifactBuilder} from "../../src/project/ArtifactBuilder.js";
import {ArtifactBuilderRegistry} from "../../src/project/ArtifactBuilderRegistry.js";
import type {ArtifactConversionPlan} from "../../src/project/ArtifactConversionPlanner.js";
import {ManagedOutcomeProjectService} from "../../src/project/ManagedOutcomeProjectService.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../src/project/ProjectCapabilities.js";
import {
    BLUEPRINT_BUILD_CAPABILITY,
    OUTCOME_LIBRARY_GENERATE_CAPABILITY,
    PAR_WORKBOOK_EXCHANGE_CAPABILITY,
    STAKE_ADAPTER_EXPORT_CAPABILITY,
} from "../../src/project/ProjectCapability.js";
import type {PokieProject} from "../../src/project/PokieProject.js";

describe("ArtifactBuilderRegistry", () => {
    const registry = new ArtifactBuilderRegistry();

    it("lists only matrix-advertised build targets", () => {
        expect(new Set(registry.listTargets())).toEqual(new Set(["tsPackage", "outcomeLibrary", "stakeAdapter", "parWorkbook"]));
    });

    it("reports the true required source capability and supported sources for a package build", () => {
        const descriptor = registry.describe("tsPackage");

        expect(descriptor.requiredSourceCapability).toBe(BLUEPRINT_BUILD_CAPABILITY);
        expect(descriptor.supportedSources).toEqual(["blueprint"]);
    });

    it("reports the true required source capability and supported sources for an outcome-library build", () => {
        const descriptor = registry.describe("outcomeLibrary");

        expect(descriptor.requiredSourceCapability).toBe(OUTCOME_LIBRARY_GENERATE_CAPABILITY);
        expect(descriptor.supportedSources).toEqual(["blueprint", "tsPackage", "outcomeLibrary"]);
    });

    it("reports the true required source capability and supported sources for a Stake artifact export", () => {
        const descriptor = registry.describe("stakeAdapter");

        expect(descriptor.requiredSourceCapability).toBe(STAKE_ADAPTER_EXPORT_CAPABILITY);
        expect(descriptor.supportedSources).toEqual(["blueprint", "tsPackage", "outcomeLibrary", "stakeAdapter"]);
    });

    it("describes Blueprint/package Outcome and Stake conversions without denying them in target notes", () => {
        const tsPackageNotes = registry.describe("tsPackage").unsupportedNotes.join(" ");
        const outcomeLibrary = registry.describe("outcomeLibrary");
        const stakeAdapter = registry.describe("stakeAdapter");

        expect(tsPackageNotes).not.toMatch(/cannot itself be converted|cannot.*other target/i);
        expect(outcomeLibrary.supportedSources).toEqual(expect.arrayContaining(["blueprint", "tsPackage"]));
        expect(stakeAdapter.supportedSources).toEqual(expect.arrayContaining(["blueprint", "tsPackage"]));
    });

    it("reports the true required source capability and supported sources for a PAR export", () => {
        const descriptor = registry.describe("parWorkbook");

        expect(descriptor.requiredSourceCapability).toBe(PAR_WORKBOOK_EXCHANGE_CAPABILITY);
        expect(descriptor.supportedSources).toEqual(["blueprint", "parWorkbook"]);
        expect(descriptor.unsupportedNotes.join(" ")).toMatch(/Game Blueprint.*PAR workbook snapshot/i);
        expect(descriptor.unsupportedNotes.join(" ")).toMatch(/republishes an existing PAR workbook/i);
        expect(descriptor.unsupportedNotes.join(" ")).not.toMatch(/does not derive.*blueprint/i);
    });

    it("never promises reversible model recovery from an outcome-based artifact", () => {
        const outcomeLibraryNotes = registry.describe("outcomeLibrary").unsupportedNotes.join(" ");
        const stakeAdapterNotes = registry.describe("stakeAdapter").unsupportedNotes.join(" ");

        expect(outcomeLibraryNotes).toMatch(/never recovers a game model/);
        expect(stakeAdapterNotes).toMatch(/never re-derives or recovers the game model/);
    });

    it("does not expose WASM as an ArtifactBuilderRegistry target", () => {
        const tsPackageNotes = registry.describe("tsPackage").unsupportedNotes.join(" ");

        expect(tsPackageNotes).toMatch(/never compiles or targets WASM/);
        expect(() => registry.describe("wasm" as never)).toThrow(/Build target "wasm" is unavailable.*Next: choose a target shown by `pokie build --help`/);
    });

    it("throws for a target it has no descriptor for", () => {
        expect(() => registry.describe("bogus" as never)).toThrow(/Build target "bogus" is unavailable.*Next: choose a target shown by `pokie build --help`/);
    });

    describe("supportsConversionFrom", () => {
        it("agrees with the descriptor's own supportedSources", () => {
            expect(registry.supportsConversionFrom("tsPackage", "blueprint")).toBe(true);
            expect(registry.supportsConversionFrom("tsPackage", "tsPackage")).toBe(false);
        });
    });

    describe("build", () => {
        function projectOf(type: "blueprint" | "tsPackage"): PokieProject {
            return {type, rootPath: `/projects/${type}`, capabilities: PROJECT_TYPE_CAPABILITIES[type], provenance: "test fixture"} as PokieProject;
        }

        function fakeBuilder(target: "tsPackage"): ArtifactBuilder & {calls: number} {
            const builder = {
                target,
                destinationKind: "directory" as const,
                calls: 0,
                build(source: PokieProject, destinationPath: string) {
                    builder.calls++;
                    return Promise.resolve({outputPath: destinationPath});
                },
            };
            return builder;
        }

        it("delegates to the registered builder for a supported conversion", async () => {
            const builder = fakeBuilder("tsPackage");
            const withBuilder = new ArtifactBuilderRegistry("1.3.0", new Map([["tsPackage", builder]]));

            const result = await withBuilder.build("tsPackage", projectOf("blueprint"), "/out/my-game");

            expect(result).toEqual({outputPath: "/out/my-game"});
            expect(builder.calls).toBe(1);
        });

        it("rejects a prepared plan when its source or destination identity drifts", async () => {
            const builder = fakeBuilder("tsPackage");
            const withBuilder = new ArtifactBuilderRegistry("1.3.0", new Map([["tsPackage", builder]]));
            const source = projectOf("blueprint");
            const plan = await withBuilder.preparePlan(source, "tsPackage", {destinationPath: "/out/prepared-game"});

            await expect(withBuilder.executePlan(plan, {...source, rootPath: "/projects/moved-blueprint"}, "/out/prepared-game")).rejects.toThrow(/source identity changed/);
            await expect(withBuilder.executePlan(plan, source, "/out/other-game")).rejects.toThrow(/destination changed/);
            expect(builder.calls).toBe(0);
        });

        it("rejects a fabricated graph even when its source and destination identities match", async () => {
            const builder = fakeBuilder("tsPackage");
            const withBuilder = new ArtifactBuilderRegistry("1.3.0", new Map([["tsPackage", builder]]));
            const source = projectOf("blueprint");
            const plan = await withBuilder.preparePlan(source, "tsPackage", {destinationPath: "/out/prepared-game"});
            const fabricated = {
                ...plan,
                steps: [],
            } as ArtifactConversionPlan;

            await expect(withBuilder.executePlan(fabricated, source, "/out/prepared-game")).rejects.toThrow(/graph is stale or invalid/);
            expect(builder.calls).toBe(0);
        });

        it("rejects validation against a different target than the prepared plan", async () => {
            const builder = fakeBuilder("tsPackage");
            const withBuilder = new ArtifactBuilderRegistry("1.3.0", new Map([["tsPackage", builder]]));
            const source = projectOf("blueprint");
            const plan = await withBuilder.preparePlan(source, "tsPackage");

            await expect(withBuilder.validate("outcomeLibrary", source, plan)).rejects.toThrow(/requested target does not match/);
        });

        it("rejects with the matrix diagnostic before invoking any builder", async () => {
            const builder = fakeBuilder("tsPackage");
            const withBuilder = new ArtifactBuilderRegistry("1.3.0", new Map([["tsPackage", builder]]));

            await expect(withBuilder.build("tsPackage", projectOf("tsPackage"), "/out/my-game")).rejects.toThrow(
                /Missing prerequisite: a Game Blueprint source\. Next: Open a Game Blueprint/,
            );
            expect(builder.calls).toBe(0);
        });

        it("does not advertise a target whose injected configuration cannot build it", async () => {
            const withoutBuilders = new ArtifactBuilderRegistry("1.3.0", new Map());

            // A custom registry can still be incomplete, but it must not retain a dead public target.
            // Production construction supplies every ArtifactTargetType builder.
            expect(withoutBuilders.listTargets()).toEqual([]);
            await expect(withoutBuilders.build("tsPackage", projectOf("blueprint"), "/out/my-game")).rejects.toThrow(
                /Build target "tsPackage" is unavailable.*Next: choose a target shown by `pokie build --help`/,
            );
            expect(() => withoutBuilders.describe("tsPackage")).toThrow(/Build target "tsPackage" is unavailable/);
        });

        it("resolves a Blueprint's registered Outcome Library prerequisite before exporting Stake, and reuses it deterministically", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-blueprint-stake-registry-test-"));
            const blueprintPath = path.join(workDir, "game.blueprint.json");
            const firstStakeDir = path.join(workDir, "stake-one");
            const secondStakeDir = path.join(workDir, "stake-two");
            fs.writeFileSync(
                blueprintPath,
                JSON.stringify({
                    manifest: {id: "registry-slot", name: "Registry Slot", version: "1.0.0"},
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
            } as PokieProject;

            try {
                await registry.build("stakeAdapter", blueprintProject, firstStakeDir);
                const managedRoot = path.join(workDir, ".pokie", "outcome-libraries");
                const [managedLibrary] = fs.readdirSync(managedRoot);
                const libraryDir = path.join(managedRoot, managedLibrary);
                const manifestBeforeReuse = fs.readFileSync(path.join(libraryDir, "manifest.json"), "utf-8");
                const managedRegistry = JSON.parse(fs.readFileSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"), "utf-8")) as {
                    projects: {rootPath: string; gameId: string; gameVersion: string; configHash: string}[];
                };

                expect(managedRegistry.projects).toEqual([
                    expect.objectContaining({rootPath: libraryDir, gameId: "registry-slot", gameVersion: "1.0.0", configHash: expect.any(String)}),
                ]);

                await registry.build("stakeAdapter", blueprintProject, secondStakeDir);

                expect(fs.existsSync(path.join(firstStakeDir, "index.json"))).toBe(true);
                expect(fs.existsSync(path.join(secondStakeDir, "index.json"))).toBe(true);
                expect(fs.readFileSync(path.join(libraryDir, "manifest.json"), "utf-8")).toBe(manifestBeforeReuse);
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });

        it("releases a newly materialized managed prerequisite when its planned Stake publication fails", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stake-prerequisite-rollback-test-"));
            const blueprintPath = path.join(workDir, "game.blueprint.json");
            const stakeDir = path.join(workDir, "stake");
            fs.writeFileSync(
                blueprintPath,
                JSON.stringify({
                    manifest: {id: "rollback-slot", name: "Rollback Slot", version: "1.0.0"},
                    reels: 3,
                    rows: 1,
                    symbols: ["A"],
                    paytable: {A: {2: 1, 3: 2}},
                    reelStrips: [["A"], ["A"], ["A"]],
                    availableBets: [1],
                }),
            );
            const source: PokieProject = {
                type: "blueprint",
                rootPath: blueprintPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            } as PokieProject;
            const failingStakeBuilder: ArtifactBuilder = {
                target: "stakeAdapter",
                destinationKind: "directory",
                build: () => Promise.reject(new Error("Stake publication failed")),
            };
            const registry = new ArtifactBuilderRegistry(
                "1.3.0",
                new Map([["stakeAdapter", failingStakeBuilder]]),
                new ManagedOutcomeProjectService(),
            );

            try {
                await expect(registry.build("stakeAdapter", source, stakeDir)).rejects.toThrow("Stake publication failed");
                expect(fs.existsSync(stakeDir)).toBe(false);
                const managedRoot = path.join(workDir, ".pokie", "outcome-libraries");
                expect(fs.existsSync(managedRoot) ? fs.readdirSync(managedRoot) : []).toEqual([]);
                expect(fs.existsSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"))).toBe(false);
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });

        it("registers and reopens a direct Blueprint Outcome Project before Stake reuses that exact record", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-blueprint-outcome-registry-test-"));
            const blueprintPath = path.join(workDir, "game.blueprint.json");
            const outcomeDir = path.join(workDir, "direct-outcome");
            const stakeDir = path.join(workDir, "stake");
            fs.writeFileSync(
                blueprintPath,
                JSON.stringify({
                    manifest: {id: "direct-outcome-slot", name: "Direct Outcome Slot", version: "1.0.0"},
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
            } as PokieProject;

            try {
                const outcome = await registry.build("outcomeLibrary", blueprintProject, outcomeDir);
                expect(outcome).toEqual({outputPath: outcomeDir, managedProjectRoots: [outcomeDir]});
                expect(fs.existsSync(path.join(outcomeDir, "manifest.json"))).toBe(true);

                const managedRegistry = JSON.parse(fs.readFileSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"), "utf-8")) as {
                    projects: {rootPath: string; gameId: string; gameVersion: string; configHash: string}[];
                };
                expect(managedRegistry.projects).toEqual([
                    expect.objectContaining({rootPath: outcomeDir, gameId: "direct-outcome-slot", gameVersion: "1.0.0", configHash: expect.any(String)}),
                ]);

                // A plan is a public JSON payload, not a process-local token.
                // Reopening this serialized selected reuse plan proves direct
                // execution does not depend on registry WeakMap state.
                const stakePlan = JSON.parse(JSON.stringify(await registry.preparePlan(blueprintProject, "stakeAdapter", {destinationPath: stakeDir}))) as ArtifactConversionPlan;
                expect(stakePlan.steps.map((step) => step.kind)).toEqual(["reuseManagedOutcomeLibrary", "publish"]);
                const stake = await registry.executePlan(stakePlan, blueprintProject, stakeDir);
                expect(stake.prerequisiteProjectRoots).toEqual([outcomeDir]);
                expect(stake.managedProjectRoots).toEqual([outcomeDir]);
                expect(fs.existsSync(path.join(stakeDir, "index.json"))).toBe(true);

                const secondOutcomeDir = path.join(workDir, "second-outcome");
                await expect(registry.build("outcomeLibrary", blueprintProject, secondOutcomeDir)).resolves.toMatchObject({
                    outputPath: secondOutcomeDir,
                    managedProjectRoots: [secondOutcomeDir],
                    reusedCompatibleProject: true,
                });
                expect(fs.existsSync(path.join(secondOutcomeDir, "manifest.json"))).toBe(true);
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });

        it("validates and executes an unchanged bounded-sample prepared plan", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-bounded-plan-registry-test-"));
            const blueprintPath = path.join(workDir, "game.blueprint.json");
            const outcomeDir = path.join(workDir, "outcome");
            fs.writeFileSync(
                blueprintPath,
                JSON.stringify({
                    manifest: {id: "bounded-plan-slot", name: "Bounded Plan Slot", version: "1.0.0"},
                    reels: 3,
                    rows: 1,
                    symbols: ["A", "B"],
                    paytable: {A: {2: 1, 3: 2}},
                    reelStrips: [["A", "B"], ["A", "B"], ["A", "B"]],
                    availableBets: [1],
                }),
            );
            const blueprintProject: PokieProject = {
                type: "blueprint",
                rootPath: blueprintPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            } as PokieProject;
            const outcomeLibraryGeneration = {sampled: {sampleSize: BigInt(4), seed: "bounded-plan-seed"}};

            try {
                const plan = await registry.preparePlan(blueprintProject, "outcomeLibrary", {destinationPath: outcomeDir, outcomeLibraryGeneration});

                expect(plan.source.configurationProvenance).toMatchObject({
                    generationSemantics: "boundedSample",
                    sampleCount: "4",
                    sampleSeed: "bounded-plan-seed",
                });
                await expect(registry.validate("outcomeLibrary", blueprintProject, plan)).resolves.toBeUndefined();
                await expect(registry.executePlan(plan, blueprintProject, outcomeDir)).resolves.toMatchObject({outputPath: outcomeDir});
                expect(fs.existsSync(path.join(outcomeDir, "manifest.json"))).toBe(true);
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });

        it("materializes a real tsPackage through the registry for Outcome and Stake, preserving all runtime modes", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-tspackage-outcome-registry-test-"));
            const blueprintPath = path.join(workDir, "game.blueprint.json");
            const packageDir = path.join(workDir, "package");
            const outcomeDir = path.join(workDir, "outcome");
            const stakeDir = path.join(workDir, "stake");
            fs.writeFileSync(
                blueprintPath,
                JSON.stringify({
                    manifest: {id: "package-outcome-slot", name: "Package Outcome Slot", version: "1.0.0"},
                    reels: 3,
                    rows: 1,
                    symbols: ["A"],
                    paytable: {A: {2: 1, 3: 2}},
                    reelStrips: [["A"], ["A"], ["A"]],
                    availableBets: [1],
                    betModes: [
                        {id: "base", runtimeType: "base", isDefault: true},
                        {id: "ante", runtimeType: "ante", costMultiplier: 2},
                    ],
                }),
            );
            const blueprintProject: PokieProject = {
                type: "blueprint",
                rootPath: blueprintPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            } as PokieProject;

            try {
                await registry.build("tsPackage", blueprintProject, packageDir);
                const packageProject = projectOf("tsPackage");
                const tsPackageProject = {...packageProject, rootPath: packageDir};

                // A package's managed Outcome sidecar is the one deliberate
                // descendant output.  Its prepared plan, dry-run validation,
                // and execution must all accept the exact same destination.
                const sidecarDir = path.join(packageDir, "outcomelibrary");
                const sidecarPlan = await registry.preparePlan(tsPackageProject, "outcomeLibrary", {destinationPath: sidecarDir});
                expect(sidecarPlan.status).toBe("planned");
                await expect(registry.validate("outcomeLibrary", tsPackageProject, sidecarPlan)).resolves.toBeUndefined();
                await expect(registry.executePlan(sidecarPlan, tsPackageProject, sidecarDir)).resolves.toMatchObject({outputPath: sidecarDir});
                expect(fs.existsSync(path.join(sidecarDir, "manifest.json"))).toBe(true);

                await expect(registry.build("outcomeLibrary", tsPackageProject, outcomeDir)).resolves.toMatchObject({outputPath: outcomeDir});
                expect(JSON.parse(fs.readFileSync(path.join(outcomeDir, "manifest.json"), "utf-8")).modes).toEqual([
                    expect.objectContaining({modeName: "base", betMode: "base", stake: 1}),
                    expect.objectContaining({modeName: "ante", betMode: "ante", stake: 2}),
                ]);

                await expect(registry.build("stakeAdapter", tsPackageProject, stakeDir)).resolves.toMatchObject({outputPath: stakeDir});
                expect(JSON.parse(fs.readFileSync(path.join(stakeDir, "pokie-manifest.json"), "utf-8")).modes).toEqual([
                    expect.objectContaining({name: "base", betMode: "base", stake: 1, cost: 1}),
                    expect.objectContaining({name: "ante", betMode: "ante", stake: 2, cost: 2}),
                ]);
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });

        it("returns a Game Model fix route for an invalid Blueprint and lets the same Stake request succeed after retry", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-blueprint-stake-retry-test-"));
            const blueprintPath = path.join(workDir, "game.blueprint.json");
            const stakeDir = path.join(workDir, "stake");
            const project = {
                type: "blueprint",
                rootPath: blueprintPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            } as PokieProject;
            const writeBlueprint = (reels: number) =>
                fs.writeFileSync(
                    blueprintPath,
                    JSON.stringify({
                        manifest: {id: "retry-slot", name: "Retry Slot", version: "1.0.0"},
                        reels,
                        rows: 1,
                        symbols: ["A"],
                        paytable: {A: {2: 1, 3: 2}},
                        reelStrips: [["A"], ["A"], ["A"]],
                        availableBets: [1],
                    }),
                );

            try {
                writeBlueprint(0);
                await expect(registry.build("stakeAdapter", project, stakeDir)).rejects.toThrow(/fix it in Game Model and retry/i);

                writeBlueprint(3);
                await expect(registry.build("stakeAdapter", project, stakeDir)).resolves.toMatchObject({outputPath: stakeDir, prerequisiteProjectRoots: [expect.any(String)]});
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });

        it("leaves no direct Outcome bundle behind for an invalid Blueprint and succeeds after Game Model retry", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-blueprint-outcome-retry-test-"));
            const blueprintPath = path.join(workDir, "game.blueprint.json");
            const outcomeDir = path.join(workDir, "outcome");
            const project = {
                type: "blueprint",
                rootPath: blueprintPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            } as PokieProject;
            const writeBlueprint = (reels: number) =>
                fs.writeFileSync(
                    blueprintPath,
                    JSON.stringify({
                        manifest: {id: "outcome-retry-slot", name: "Outcome Retry Slot", version: "1.0.0"},
                        reels,
                        rows: 1,
                        symbols: ["A"],
                        paytable: {A: {2: 1, 3: 2}},
                        reelStrips: [["A"], ["A"], ["A"]],
                        availableBets: [1],
                    }),
                );

            try {
                writeBlueprint(0);
                await expect(registry.build("outcomeLibrary", project, outcomeDir)).rejects.toThrow(/fix it in Game Model and retry/i);
                expect(fs.existsSync(outcomeDir)).toBe(false);

                writeBlueprint(3);
                await expect(registry.build("outcomeLibrary", project, outcomeDir)).resolves.toEqual({
                    outputPath: outcomeDir,
                    managedProjectRoots: [outcomeDir],
                });
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });
    });

    describe("checkDestination", () => {
        let dir: string;

        beforeEach(() => {
            dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-artifact-registry-checkdestination-test-"));
        });

        afterEach(() => {
            fs.rmSync(dir, {recursive: true, force: true});
        });

        it("reports a missing destination as available, without ever invoking the builder", () => {
            const destination = path.join(dir, "not-yet-there");

            expect(registry.checkDestination("tsPackage", destination)).toEqual({available: true});
            expect(fs.existsSync(destination)).toBe(false);
        });

        it("reports an existing, non-empty directory destination as unavailable, using the same conflict message build() itself would throw", () => {
            const destination = path.join(dir, "occupied");
            fs.mkdirSync(destination);
            fs.writeFileSync(path.join(destination, "unrelated.txt"), "pre-existing");

            const result = registry.checkDestination("tsPackage", destination);

            expect(result).toEqual({available: false, message: expect.stringMatching(/already exists and is not empty/)});
        });

        it("reports an empty existing directory as available (the same bar build() itself allows)", () => {
            const destination = path.join(dir, "empty-dir");
            fs.mkdirSync(destination);

            expect(registry.checkDestination("tsPackage", destination)).toEqual({available: true});
        });

        it("checks a 'file' target's destination as a file, not a directory -- an existing file is unavailable even though it's empty", () => {
            const destination = path.join(dir, "workbook.xlsx");
            fs.writeFileSync(destination, "");

            const result = registry.checkDestination("parWorkbook", destination);

            expect(result).toEqual({available: false, message: expect.stringMatching(/already exists/)});
        });

    });
});
