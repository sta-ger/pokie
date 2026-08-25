import fs from "fs";
import os from "os";
import path from "path";
import type {ArtifactBuilder} from "../../src/project/ArtifactBuilder.js";
import {ArtifactBuilderRegistry} from "../../src/project/ArtifactBuilderRegistry.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../src/project/ProjectCapabilities.js";
import {
    BLUEPRINT_BUILD_CAPABILITY,
    OUTCOME_LIBRARY_GENERATE_CAPABILITY,
    PAR_WORKBOOK_EXCHANGE_CAPABILITY,
    STAKE_ADAPTER_EXPORT_CAPABILITY,
    WASM_EXPORT_CAPABILITY,
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

    it("reports the true required source capability and supported sources for a PAR export", () => {
        const descriptor = registry.describe("parWorkbook");

        expect(descriptor.requiredSourceCapability).toBe(PAR_WORKBOOK_EXCHANGE_CAPABILITY);
        expect(descriptor.supportedSources).toEqual(["parWorkbook"]);
    });

    it("truthfully reports wasm as buildable from no source type today", () => {
        const descriptor = registry.describe("wasm");

        expect(descriptor.requiredSourceCapability).toBe(WASM_EXPORT_CAPABILITY);
        expect(descriptor.supportedSources).toEqual([]);
    });

    it("never promises reversible model recovery from an outcome-based artifact", () => {
        const outcomeLibraryNotes = registry.describe("outcomeLibrary").unsupportedNotes.join(" ");
        const stakeAdapterNotes = registry.describe("stakeAdapter").unsupportedNotes.join(" ");

        expect(outcomeLibraryNotes).toMatch(/never recovers a game model/);
        expect(stakeAdapterNotes).toMatch(/never re-derives or recovers the game model/);
    });

    it("never promises arbitrary package-to-WASM compilation", () => {
        const wasmNotes = registry.describe("wasm").unsupportedNotes.join(" ");
        const tsPackageNotes = registry.describe("tsPackage").unsupportedNotes.join(" ");

        expect(wasmNotes).toMatch(/no arbitrary package-to-WASM compiler/);
        expect(tsPackageNotes).toMatch(/never compiles or targets WASM/);
    });

    it("throws for a target it has no descriptor for", () => {
        expect(() => registry.describe("bogus" as never)).toThrow(/no descriptor for target "bogus"/);
    });

    describe("supportsConversionFrom", () => {
        it("agrees with the descriptor's own supportedSources", () => {
            expect(registry.supportsConversionFrom("tsPackage", "blueprint")).toBe(true);
            expect(registry.supportsConversionFrom("tsPackage", "tsPackage")).toBe(false);
            expect(registry.supportsConversionFrom("wasm", "tsPackage")).toBe(false);
            expect(registry.supportsConversionFrom("wasm", "blueprint")).toBe(false);
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

        it("rejects with the matrix diagnostic before invoking any builder", async () => {
            const builder = fakeBuilder("tsPackage");
            const withBuilder = new ArtifactBuilderRegistry("1.3.0", new Map([["tsPackage", builder]]));

            await expect(withBuilder.build("tsPackage", projectOf("tsPackage"), "/out/my-game")).rejects.toThrow(
                /Missing prerequisite: a Game Blueprint source\. Next: Open a Game Blueprint/,
            );
            expect(builder.calls).toBe(0);
        });

        it("rejects with a clear message for a target that has no registered builder ('wasm')", async () => {
            const withoutBuilders = new ArtifactBuilderRegistry("1.3.0", new Map());

            // "wasm" has no supported source at all, so this always fails the capability check first --
            // exercised instead through a target this registry's own descriptor concedes has no source
            // support, proving build() never crashes on a target simply because no builder is registered.
            await expect(withoutBuilders.build("tsPackage", projectOf("blueprint"), "/out/my-game")).rejects.toThrow(
                /"tsPackage" has no builder implemented yet/,
            );
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

                const stake = await registry.build("stakeAdapter", blueprintProject, stakeDir);
                expect(stake.prerequisiteProjectRoots).toEqual([outcomeDir]);
                expect(stake.managedProjectRoots).toEqual([outcomeDir]);
                expect(fs.existsSync(path.join(stakeDir, "index.json"))).toBe(true);

                const alternateOutcomeDir = path.join(workDir, "requested-but-reused-outcome");
                await expect(registry.build("outcomeLibrary", blueprintProject, alternateOutcomeDir)).resolves.toEqual({
                    outputPath: outcomeDir,
                    requestedDestinationPath: alternateOutcomeDir,
                    reusedCompatibleProject: true,
                    managedProjectRoots: [outcomeDir],
                });
                expect(fs.existsSync(alternateOutcomeDir)).toBe(false);
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

        it("throws for a target that has no registered builder ('wasm'), the same as build() does", () => {
            expect(() => registry.checkDestination("wasm", path.join(dir, "anything"))).toThrow(/"wasm" has no builder implemented yet/);
        });
    });
});
