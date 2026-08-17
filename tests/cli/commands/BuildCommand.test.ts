import {
    ArtifactBuilder,
    ArtifactBuilderRegistry,
    ArtifactBuildResult,
    computeGameBlueprintHash,
    GameBlueprint,
    GameBlueprintValidating,
    PokieProject,
    PROJECT_TYPE_CAPABILITIES,
    ProjectResolving,
    ValidationIssue,
} from "pokie";
import {BuildCommand} from "../../../cli/commands/BuildCommand.js";

function createStubValidator(issues: ValidationIssue[]): GameBlueprintValidating & {calledWith?: unknown} {
    return {
        validate(blueprint: unknown) {
            this.calledWith = blueprint;
            return issues;
        },
    };
}

function stubProjectResolver(project: PokieProject | undefined): ProjectResolving & {calls: string[]} {
    const calls: string[] = [];
    return {
        calls,
        resolve(targetPath: string) {
            calls.push(targetPath);
            return Promise.resolve(project);
        },
    };
}

function blueprintProject(rootPath = "config.json"): PokieProject {
    return {
        type: "blueprint",
        rootPath,
        capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
        provenance: "test fixture",
    } as PokieProject;
}

function stubBuilder(
    target: string,
    result: ArtifactBuildResult | (() => ArtifactBuildResult),
): ArtifactBuilder & {calledWith?: {source: PokieProject; destinationPath: string}} {
    const builder = {
        target,
        calledWith: undefined as {source: PokieProject; destinationPath: string} | undefined,
        build(source: PokieProject, destinationPath: string) {
            builder.calledWith = {source, destinationPath};
            return Promise.resolve(typeof result === "function" ? result() : result);
        },
    };
    return builder as ArtifactBuilder & {calledWith?: {source: PokieProject; destinationPath: string}};
}

function registryWithBuilders(...builders: ArtifactBuilder[]): ArtifactBuilderRegistry {
    return new ArtifactBuilderRegistry("1.3.0", new Map(builders.map((builder) => [builder.target, builder])));
}

const rawBlueprint = {manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}};
const fullBlueprint: GameBlueprint = {
    manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
    reels: 5,
    rows: 3,
    symbols: ["A", "K", "Q", "J"],
    paytable: {A: {3: 5, 4: 10, 5: 20}},
    paylines: [
        [0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1],
    ],
    availableBets: [1, 2, 5],
};

describe("BuildCommand", () => {
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it("has the expected name and description", () => {
        const command = new BuildCommand("1.3.0");

        expect(command.getName()).toBe("build");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("reports the usage error for a missing/empty <project> positional", async () => {
        const command = new BuildCommand("1.3.0");

        await expect(command.run([""])).rejects.toThrow(/Usage: pokie build <project> --target <artifact> \[--out <path>\] \[--dry-run\]/);
    });

    it("throws a descriptive error for an unknown option", async () => {
        const command = new BuildCommand("1.3.0");

        await expect(command.run(["config.json", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("throws a descriptive error when --target is given no value", async () => {
        const command = new BuildCommand("1.3.0");

        await expect(command.run(["config.json", "--target"])).rejects.toThrow(/--target requires a value/);
    });

    it("throws a descriptive error for an unrecognized --target value", async () => {
        const command = new BuildCommand("1.3.0");

        await expect(command.run(["config.json", "--target", "bogus"])).rejects.toThrow(/Unknown --target "bogus"/);
    });

    it("throws a descriptive error when --out is given no value", async () => {
        const command = new BuildCommand("1.3.0");

        await expect(command.run(["config.json", "--target", "tsPackage", "--out"])).rejects.toThrow(/--out requires a path/);
    });

    it("requires --target before ever resolving the project", async () => {
        const resolveProject = stubProjectResolver(undefined);
        const command = new BuildCommand("1.3.0", undefined, undefined, resolveProject);

        await expect(command.run(["/does/not/exist.json"])).rejects.toThrow(/--target is required/);
        expect(resolveProject.calls).toEqual([]);
    });

    it("resolves the project even when --out is omitted -- --out is optional, unlike --target", async () => {
        const resolveProject = stubProjectResolver(undefined);
        const command = new BuildCommand("1.3.0", undefined, undefined, resolveProject);

        await expect(command.run(["/does/not/exist.json", "--target", "tsPackage"])).rejects.toThrow(
            /"\/does\/not\/exist\.json" was not recognized as a POKIE project/,
        );
        expect(resolveProject.calls).toEqual(["/does/not/exist.json"]);
    });

    it("throws a clear error when the project path isn't recognized as any POKIE project", async () => {
        const resolveProject = stubProjectResolver(undefined);
        const command = new BuildCommand("1.3.0", undefined, undefined, resolveProject);

        await expect(command.run(["mystery.txt", "--target", "tsPackage", "--out", "out"])).rejects.toThrow(
            /"mystery\.txt" was not recognized as a POKIE project/,
        );
        expect(resolveProject.calls).toEqual(["mystery.txt"]);
    });

    it("throws a capability diagnostic when the resolved project doesn't support the requested target", async () => {
        const project = {
            type: "tsPackage",
            rootPath: "/some/existing/package",
            capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage,
            provenance: "test fixture",
        } as PokieProject;
        const resolveProject = stubProjectResolver(project);
        const command = new BuildCommand("1.3.0", undefined, undefined, resolveProject);

        await expect(command.run(["/some/existing/package", "--target", "tsPackage", "--out", "out"])).rejects.toThrow(
            /"tsPackage" cannot be built from a "tsPackage" project\. Supported sources: blueprint\./,
        );
    });

    describe("tsPackage from a blueprint source", () => {
        it("leaves validation to the registry builder, reading the blueprint only for its success summary", async () => {
            const loadBlueprint = jest.fn().mockReturnValue(rawBlueprint);
            const validator = createStubValidator([]);
            const builder = stubBuilder("tsPackage", {outputPath: "/fake/out"});
            const command = new BuildCommand(
                "1.3.0",
                loadBlueprint,
                validator,
                stubProjectResolver(blueprintProject("config.json")),
                registryWithBuilders(builder),
            );

            await command.run(["config.json", "--target", "tsPackage", "--out", "out-dir"]);

            expect(loadBlueprint).toHaveBeenCalledWith("config.json");
            expect(validator.calledWith).toBeUndefined();
        });

        it("does not use its preview validator to block the registry build", async () => {
            const validator = createStubValidator([{code: "blueprint-reels-invalid", severity: "error", message: "bad reels"}]);
            const builder = stubBuilder("tsPackage", {outputPath: "/fake/out"});
            const command = new BuildCommand(
                "1.3.0",
                () => rawBlueprint,
                validator,
                stubProjectResolver(blueprintProject()),
                registryWithBuilders(builder),
            );

            const exitCode = await command.run(["config.json", "--target", "tsPackage", "--out", "out-dir"]);

            expect(exitCode).toBe(0);
            expect(builder.calledWith).toEqual({source: blueprintProject(), destinationPath: "out-dir"});
            expect(errorSpy).not.toHaveBeenCalled();
        });

        it("still builds when validation reports only warnings", async () => {
            const validator = createStubValidator([{code: "blueprint-paytable-wild-symbol", severity: "warning", message: "heads up"}]);
            const builder = stubBuilder("tsPackage", {outputPath: "/fake/out"});
            const command = new BuildCommand(
                "1.3.0",
                () => rawBlueprint,
                validator,
                stubProjectResolver(blueprintProject()),
                registryWithBuilders(builder),
            );

            const exitCode = await command.run(["config.json", "--target", "tsPackage", "--out", "out-dir"]);

            expect(exitCode).toBe(0);
            expect(builder.calledWith).toBeDefined();
        });

        it("forwards the resolved project and --out to the registry, and prints a success summary", async () => {
            const builder = stubBuilder("tsPackage", {outputPath: "/fake/sample-slot"});
            const project = blueprintProject("config.json");
            const command = new BuildCommand(
                "1.3.0",
                () => rawBlueprint,
                createStubValidator([]),
                stubProjectResolver(project),
                registryWithBuilders(builder),
            );

            const exitCode = await command.run(["config.json", "--target", "tsPackage", "--out", "out-dir"]);

            expect(exitCode).toBe(0);
            expect(builder.calledWith).toEqual({source: project, destinationPath: "out-dir"});
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Build summary:");
            expect(printed).toContain("package root     /fake/sample-slot");
            expect(printed).toContain('game             Sample Slot (id: "sample-slot", v0.1.0)');
            expect(printed).toContain(`blueprint hash   ${computeGameBlueprintHash(rawBlueprint)}`);
            expect(printed).toContain("source           config.json");
            expect(printed).toContain('built in "/fake/sample-slot"');
        });

        it("resolves a <target>-named sibling of <project> as the default destination when --out is omitted", async () => {
            const builder = stubBuilder("tsPackage", {outputPath: "/fake/sample-slot"});
            const project = blueprintProject("blueprints/config.json");
            const command = new BuildCommand(
                "1.3.0",
                () => rawBlueprint,
                createStubValidator([]),
                stubProjectResolver(project),
                registryWithBuilders(builder),
            );

            const exitCode = await command.run(["blueprints/config.json", "--target", "tsPackage"]);

            expect(exitCode).toBe(0);
            expect(builder.calledWith).toEqual({source: project, destinationPath: "blueprints/tsPackage"});
        });

        it("prints the full build -> inspect -> validate -> sim -> report -> replay -> dev workflow as next steps", async () => {
            const builder = stubBuilder("tsPackage", {outputPath: "/fake/sample-slot"});
            const command = new BuildCommand(
                "1.3.0",
                () => rawBlueprint,
                createStubValidator([]),
                stubProjectResolver(blueprintProject()),
                registryWithBuilders(builder),
            );

            await command.run(["config.json", "--target", "tsPackage", "--out", "out-dir"]);

            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("pokie inspect /fake/sample-slot");
            expect(printed).toContain("pokie validate /fake/sample-slot");
            expect(printed).toContain("pokie sim /fake/sample-slot");
            expect(printed).toContain("pokie report sim.json");
            expect(printed).toContain("pokie replay /fake/sample-slot");
            expect(printed).toContain("pokie dev /fake/sample-slot");
        });

        it("--dry-run validates without calling the registry or writing anything", async () => {
            const validator = createStubValidator([]);
            const builder = stubBuilder("tsPackage", () => {
                throw new Error("must not be called during --dry-run");
            });
            const command = new BuildCommand(
                "1.3.0",
                () => fullBlueprint,
                validator,
                stubProjectResolver(blueprintProject()),
                registryWithBuilders(builder),
            );

            const exitCode = await command.run(["config.json", "--target", "tsPackage", "--out", "out-dir", "--dry-run"]);

            expect(exitCode).toBe(0);
            expect(validator.calledWith).toBe(fullBlueprint);
        });

        it("--dry-run prints a blueprint summary: game, reels x rows, symbols, paylines, bets, hash, and expected files", async () => {
            const command = new BuildCommand(
                "1.3.0",
                () => fullBlueprint,
                createStubValidator([]),
                stubProjectResolver(blueprintProject()),
                registryWithBuilders(stubBuilder("tsPackage", {outputPath: "/fake/out"})),
            );

            await command.run(["config.json", "--target", "tsPackage", "--out", "out-dir", "--dry-run"]);

            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Dry run");
            expect(printed).toContain('game             Sample Slot (id: "sample-slot", v0.1.0)');
            expect(printed).toContain("reels x rows     5 x 3");
            expect(printed).toContain("symbols          4");
            expect(printed).toContain("paylines         2");
            expect(printed).toContain("bets             1, 2, 5");
            expect(printed).toContain("blueprint hash   sha256:");
            expect(printed).toContain("would generate   README.md, dist/index.js, package-lock.json, package.json, src/index.ts, tsconfig.json");
            expect(printed).toContain("destination      out-dir");
        });

        it("--dry-run previews the resolved default destination when --out is omitted -- the same one a real build would use", async () => {
            const command = new BuildCommand(
                "1.3.0",
                () => fullBlueprint,
                createStubValidator([]),
                stubProjectResolver(blueprintProject("blueprints/config.json")),
                registryWithBuilders(stubBuilder("tsPackage", {outputPath: "/fake/out"})),
            );

            const exitCode = await command.run(["blueprints/config.json", "--target", "tsPackage", "--dry-run"]);

            expect(exitCode).toBe(0);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("destination      blueprints/tsPackage");
        });

        it("--dry-run reports default paylines/bets when the blueprint omits them", async () => {
            const minimalBlueprint: GameBlueprint = {
                manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                reels: 3,
                rows: 3,
                symbols: ["A", "B"],
                paytable: {A: {3: 5}},
            };
            const command = new BuildCommand(
                "1.3.0",
                () => minimalBlueprint,
                createStubValidator([]),
                stubProjectResolver(blueprintProject()),
                registryWithBuilders(stubBuilder("tsPackage", {outputPath: "/fake/out"})),
            );

            await command.run(["config.json", "--target", "tsPackage", "--out", "out-dir", "--dry-run"]);

            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("paylines         default");
            expect(printed).toContain("bets             default");
        });

        it("--dry-run still prints warnings and exits 0 when validation reports only warnings", async () => {
            const validator = createStubValidator([{code: "blueprint-paytable-wild-symbol", severity: "warning", message: "heads up"}]);
            const command = new BuildCommand(
                "1.3.0",
                () => fullBlueprint,
                validator,
                stubProjectResolver(blueprintProject()),
                registryWithBuilders(stubBuilder("tsPackage", {outputPath: "/fake/out"})),
            );

            const exitCode = await command.run(["config.json", "--target", "tsPackage", "--out", "out-dir", "--dry-run"]);

            expect(exitCode).toBe(0);
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("heads up"));
            expect(logSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("Dry run");
        });

        it("--dry-run returns 1 and does not print a dry-run summary when validation reports errors", async () => {
            const validator = createStubValidator([{code: "blueprint-reels-invalid", severity: "error", message: "bad reels"}]);
            const command = new BuildCommand(
                "1.3.0",
                () => fullBlueprint,
                validator,
                stubProjectResolver(blueprintProject()),
                registryWithBuilders(stubBuilder("tsPackage", {outputPath: "/fake/out"})),
            );

            const exitCode = await command.run(["config.json", "--target", "tsPackage", "--out", "out-dir", "--dry-run"]);

            expect(exitCode).toBe(1);
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("1 error(s)"));
            expect(logSpy.mock.calls.map((call) => call[0]).join("\n")).not.toContain("Dry run");
        });

        describe("reelStripGeneration", () => {
            const blueprintWithGeneration: GameBlueprint = {
                manifest: {id: "generated-reels", name: "Generated Reels", version: "0.1.0"},
                reels: 2,
                rows: 3,
                symbols: ["A", "B"],
                paytable: {A: {3: 5}, B: {3: 2}},
                reelStripGeneration: [
                    {type: "generated", length: 10, symbolCounts: {A: 6, B: 4}, seed: 1},
                    {type: "literal", strip: ["A", "B"]},
                ],
            };

            it("resolves reelStripGeneration and forwards the AUTHORED blueprint (unmaterialized) to the registry's build()", async () => {
                const builder = stubBuilder("tsPackage", {outputPath: "/fake/out"});
                const command = new BuildCommand(
                    "1.3.0",
                    () => blueprintWithGeneration,
                    createStubValidator([]),
                    stubProjectResolver(blueprintProject()),
                    registryWithBuilders(builder),
                );

                const exitCode = await command.run(["config.json", "--target", "tsPackage", "--out", "out-dir"]);

                expect(exitCode).toBe(0);
                expect(builder.calledWith).toBeDefined();
            });

            it("--dry-run does not call the registry, even with reelStripGeneration present", async () => {
                const builder = stubBuilder("tsPackage", () => {
                    throw new Error("must not be called during --dry-run");
                });
                const command = new BuildCommand(
                    "1.3.0",
                    () => blueprintWithGeneration,
                    createStubValidator([]),
                    stubProjectResolver(blueprintProject()),
                    registryWithBuilders(builder),
                );

                const exitCode = await command.run(["config.json", "--target", "tsPackage", "--out", "out-dir", "--dry-run"]);

                expect(exitCode).toBe(0);
                const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
                expect(printed).toContain("Dry run");
            });

        });
    });

    describe("republishing an already-built artifact (outcomeLibrary/stakeAdapter/parWorkbook)", () => {
        function outcomeLibraryProject(rootPath = "bundleDir"): PokieProject {
            return {
                type: "outcomeLibrary",
                rootPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
                provenance: "test fixture",
            } as PokieProject;
        }

        it("forwards the resolved project and --out to the registry, and prints a success summary", async () => {
            const builder = stubBuilder("outcomeLibrary", {outputPath: "/fake/republished-bundle"});
            const project = outcomeLibraryProject("bundleDir");
            const command = new BuildCommand("1.3.0", undefined, undefined, stubProjectResolver(project), registryWithBuilders(builder));

            const exitCode = await command.run(["bundleDir", "--target", "outcomeLibrary", "--out", "new-bundle-dir"]);

            expect(exitCode).toBe(0);
            expect(builder.calledWith).toEqual({source: project, destinationPath: "new-bundle-dir"});
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Build summary:");
            expect(printed).toContain("artifact root    /fake/republished-bundle");
            expect(printed).toContain("target           outcomeLibrary");
            expect(printed).toContain("source           bundleDir");
            expect(printed).toContain('built in "/fake/republished-bundle"');
        });

        it("--dry-run does not call the registry", async () => {
            const builder = stubBuilder("outcomeLibrary", () => {
                throw new Error("must not be called during --dry-run");
            });
            const command = new BuildCommand(
                "1.3.0",
                undefined,
                undefined,
                stubProjectResolver(outcomeLibraryProject()),
                registryWithBuilders(builder),
            );

            const exitCode = await command.run(["bundleDir", "--target", "outcomeLibrary", "--out", "new-bundle-dir", "--dry-run"]);

            expect(exitCode).toBe(0);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Dry run");
            expect(printed).toContain('"outcomeLibrary"');
            expect(printed).toContain("No files written");
        });

        it("resolves a <target>-named sibling directory of <project> as the default destination when --out is omitted", async () => {
            const builder = stubBuilder("outcomeLibrary", {outputPath: "/fake/republished-bundle"});
            const project = outcomeLibraryProject("bundles/bundleDir");
            const command = new BuildCommand("1.3.0", undefined, undefined, stubProjectResolver(project), registryWithBuilders(builder));

            const exitCode = await command.run(["bundles/bundleDir", "--target", "outcomeLibrary"]);

            expect(exitCode).toBe(0);
            expect(builder.calledWith).toEqual({source: project, destinationPath: "bundles/outcomeLibrary"});
        });

        it("previews the resolved default destination during --dry-run when --out is omitted", async () => {
            const builder = stubBuilder("outcomeLibrary", () => {
                throw new Error("must not be called during --dry-run");
            });
            const project = outcomeLibraryProject("bundles/bundleDir");
            const command = new BuildCommand("1.3.0", undefined, undefined, stubProjectResolver(project), registryWithBuilders(builder));

            const exitCode = await command.run(["bundles/bundleDir", "--target", "outcomeLibrary", "--dry-run"]);

            expect(exitCode).toBe(0);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain('to "bundles/outcomeLibrary"');
        });

        it("defaults a parWorkbook destination to a sibling file with a .xlsx extension, not a bare directory name", async () => {
            const builder = stubBuilder("parWorkbook", {outputPath: "/fake/republished.par.xlsx"});
            const project: PokieProject = {
                type: "parWorkbook",
                rootPath: "sheets/starter.par.xlsx",
                capabilities: PROJECT_TYPE_CAPABILITIES.parWorkbook,
                provenance: "test fixture",
            } as PokieProject;
            const command = new BuildCommand("1.3.0", undefined, undefined, stubProjectResolver(project), registryWithBuilders(builder));

            const exitCode = await command.run(["sheets/starter.par.xlsx", "--target", "parWorkbook"]);

            expect(exitCode).toBe(0);
            expect(builder.calledWith).toEqual({source: project, destinationPath: "sheets/parWorkbook.xlsx"});
        });
    });
});
