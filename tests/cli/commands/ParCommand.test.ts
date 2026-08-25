import fs from "fs";
import os from "os";
import path from "path";
import {
    GameBlueprint,
    ParSheetExporting,
    ParSheetImporting,
    ParSheetImportResult,
    ParSheetImporter,
    PokieProject,
    ProjectResolving,
    PROJECT_TYPE_CAPABILITIES,
    ValidationIssue,
} from "pokie";
import {ParCommand} from "../../../cli/commands/ParCommand.js";

function createStubImporter(result: ParSheetImportResult | Error): ParSheetImporting & {calledWith?: string} {
    return {
        importFromFile(filePath: string) {
            this.calledWith = filePath;
            return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
        },
    };
}

function createStubExporter(
    issues: ValidationIssue[],
): ParSheetExporting & {calledWith?: {blueprint: unknown; filePath: string; sourcePath?: string}} {
    return {
        exportToFile(blueprint: unknown, filePath: string, sourcePath?: string) {
            this.calledWith = {blueprint, filePath, sourcePath};
            return Promise.resolve(issues);
        },
    };
}

const rawBlueprint = {manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}};
const fullBlueprint: GameBlueprint = {
    manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
    reels: 3,
    rows: 3,
    symbols: ["A", "K"],
    paytable: {A: {"3": 5}},
};

describe("ParCommand", () => {
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
        const command = new ParCommand("1.3.0", createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []}), createStubExporter([]));

        expect(command.getName()).toBe("par");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("rejects when run with no subcommand", async () => {
        const command = new ParCommand("1.3.0");

        await expect(command.run([])).rejects.toThrow(/Usage: pokie par/);
    });

    it("rejects on an unknown subcommand", async () => {
        const command = new ParCommand("1.3.0");

        await expect(command.run(["bogus"])).rejects.toThrow(/Usage: pokie par/);
    });

    describe("import", () => {
        it("imports, writes the blueprint JSON to the default --out path, and returns 0", async () => {
            const importer = createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []});
            const writeFile = jest.fn();
            const command = new ParCommand("1.3.0", importer, createStubExporter([]), () => rawBlueprint, writeFile);

            const exitCode = await command.run(["import", "game.xlsx"]);

            expect(exitCode).toBe(0);
            expect(importer.calledWith).toBe("game.xlsx");
            expect(writeFile).toHaveBeenCalledWith("game.blueprint.json", `${JSON.stringify(fullBlueprint, null, 4)}\n`);
        });

        it("honors a custom --out path", async () => {
            const writeFile = jest.fn();
            const command = new ParCommand(
                "1.3.0",
                createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []}),
                createStubExporter([]),
                () => rawBlueprint,
                writeFile,
            );

            await command.run(["import", "game.xlsx", "--out", "custom.json"]);

            expect(writeFile).toHaveBeenCalledWith("custom.json", expect.any(String));
        });

        it("does not write a file and returns 1 when there are error-level issues", async () => {
            const writeFile = jest.fn();
            const issues: ValidationIssue[] = [{code: "parsheet-missing-sheet", severity: "error", message: "bad"}];
            const command = new ParCommand(
                "1.3.0",
                createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues}),
                createStubExporter([]),
                () => rawBlueprint,
                writeFile,
            );

            const exitCode = await command.run(["import", "game.xlsx"]);

            expect(exitCode).toBe(1);
            expect(writeFile).not.toHaveBeenCalled();
            expect(logSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("Errors (1)");
        });

        it("--format json prints the full {blueprint, provenance, issues} result and still writes the file", async () => {
            const writeFile = jest.fn();
            const command = new ParCommand(
                "1.3.0",
                createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []}),
                createStubExporter([]),
                () => rawBlueprint,
                writeFile,
            );

            await command.run(["import", "game.xlsx", "--format", "json"]);

            expect(writeFile).toHaveBeenCalled();
            expect(logSpy).toHaveBeenCalledTimes(1);
            const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
            expect(parsed).toEqual({blueprint: fullBlueprint, issues: []});
        });

        it("throws a descriptive error when no input path is given", async () => {
            const command = new ParCommand("1.3.0");

            await expect(command.run(["import"])).rejects.toThrow(/Usage: pokie par import/);
        });

        it("throws on --out with no value", async () => {
            const command = new ParCommand("1.3.0");

            await expect(command.run(["import", "game.xlsx", "--out"])).rejects.toThrow(/--out requires a file path/);
        });

        it('throws on an unrecognized --format value', async () => {
            const command = new ParCommand("1.3.0");

            await expect(command.run(["import", "game.xlsx", "--format", "xml"])).rejects.toThrow(/--format only supports "json"/);
        });

        it("throws on an unknown option", async () => {
            const command = new ParCommand("1.3.0");

            await expect(command.run(["import", "game.xlsx", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
        });

        // Same real finding as the "export" describe block below: an issue's suggestion must survive to
        // stdout, on the import path too, not just the export path.
        it("prints an issue's suggestion beneath it when the importer reports an error with one", async () => {
            const issues: ValidationIssue[] = [{code: "parsheet-missing-sheet", severity: "error", message: "bad", suggestion: "add the Meta sheet"}];
            const command = new ParCommand("1.3.0", createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues}), createStubExporter([]));

            await command.run(["import", "game.xlsx"]);

            expect(logSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("suggestion: add the Meta sheet");
        });
    });

    describe("export", () => {
        it("loads the blueprint and hands it straight to the exporter (no CLI-side validation) — returns 0 when there are no issues", async () => {
            const exporter = createStubExporter([]);
            const command = new ParCommand("1.3.0", createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []}), exporter, () => rawBlueprint);

            const exitCode = await command.run(["export", "game.json"]);

            expect(exitCode).toBe(0);
            expect(exporter.calledWith).toEqual({blueprint: rawBlueprint, filePath: "game.par.xlsx", sourcePath: "game.json"});
        });

        it("honors a custom --out path", async () => {
            const exporter = createStubExporter([]);
            const command = new ParCommand("1.3.0", createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []}), exporter, () => rawBlueprint);

            await command.run(["export", "game.json", "--out", "custom.xlsx"]);

            expect(exporter.calledWith?.filePath).toBe("custom.xlsx");
        });

        it("prints an error summary (no success line) and returns 1 when the exporter reports error-level issues", async () => {
            const exporter = createStubExporter([{code: "blueprint-reels-invalid", severity: "error", message: "bad reels"}]);
            const command = new ParCommand("1.3.0", createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []}), exporter, () => rawBlueprint);

            const exitCode = await command.run(["export", "game.json"]);

            expect(exitCode).toBe(1);
            expect(errorSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("1 error(s)");
            expect(logSpy.mock.calls.map((call) => call[0]).join("\n")).not.toContain("Exported");
        });

        it("prints a success line and any warnings, returning 0, when the exporter reports only warnings", async () => {
            const exporter = createStubExporter([{code: "blueprint-symbol-missing-payout", severity: "warning", message: "heads up"}]);
            const command = new ParCommand("1.3.0", createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []}), exporter, () => rawBlueprint);

            const exitCode = await command.run(["export", "game.json"]);

            expect(exitCode).toBe(0);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Exported");
            expect(printed).toContain("heads up");
        });

        it("exports canonical generated and weighted Blueprints as literal snapshots, preserves their sources, and leaves no file on a generated-reel failure", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-par-command-export-test-"));
            const generatedBlueprint: GameBlueprint = {
                manifest: {id: "generated-par", name: "Generated PAR", version: "1.0.0"},
                reels: 2,
                rows: 1,
                symbols: ["A", "B"],
                paytable: {A: {2: 1}},
                reelStripGeneration: [
                    {type: "generated", length: 4, symbolCounts: {A: 2, B: 2}, seed: 11},
                    {type: "generated", length: 4, symbolCounts: {A: 2, B: 2}, seed: 12},
                ],
            };
            const weightedBlueprint: GameBlueprint = {
                manifest: {id: "weighted-par", name: "Weighted PAR", version: "1.0.0"},
                reels: 2,
                rows: 1,
                symbols: ["A", "B"],
                paytable: {A: {2: 1}},
                symbolWeights: {A: 3, B: 1},
            };

            try {
                const command = new ParCommand("1.3.0");
                for (const [name, blueprint] of [["generated", generatedBlueprint], ["weighted", weightedBlueprint]] as const) {
                    const sourcePath = path.join(workDir, `${name}.blueprint.json`);
                    const workbookPath = path.join(workDir, `${name}.par.xlsx`);
                    const sourceContents = JSON.stringify(blueprint, null, 4);
                    fs.writeFileSync(sourcePath, sourceContents);

                    expect(await command.run(["export", sourcePath, "--out", workbookPath])).toBe(0);
                    expect(fs.existsSync(workbookPath)).toBe(true);
                    expect(fs.readFileSync(sourcePath, "utf-8")).toBe(sourceContents);

                    const imported = await new ParSheetImporter().importFromFile(workbookPath);
                    expect(imported.issues.filter((issue) => issue.severity === "error")).toEqual([]);
                    expect(imported.blueprint).toMatchObject({
                        manifest: blueprint.manifest,
                        symbols: blueprint.symbols,
                        paytable: blueprint.paytable,
                    });
                    expect(imported.blueprint.reelStrips).toHaveLength(blueprint.reels);
                    expect(imported.blueprint.reelStripGeneration).toBeUndefined();
                    expect(imported.blueprint.symbolWeights).toBeUndefined();
                }

                const unmaterializable: GameBlueprint = {
                    ...generatedBlueprint,
                    manifest: {id: "unmaterializable-par", name: "Unmaterializable PAR", version: "1.0.0"},
                    reelStripGeneration: [
                        {type: "literal", strip: ["A", "B"]},
                        {
                            type: "generated",
                            length: 4,
                            symbolCounts: {A: 2, B: 2},
                            seed: 13,
                            maxAttempts: 2,
                            constraints: [{type: "maximumCircularDistance", maximumDistance: 1, symbolIds: ["A"]}],
                        },
                    ],
                };
                const failedSourcePath = path.join(workDir, "unmaterializable.blueprint.json");
                const failedWorkbookPath = path.join(workDir, "unmaterializable.par.xlsx");
                const failedSourceContents = JSON.stringify(unmaterializable, null, 4);
                const sentinel = "existing PAR workbook must be preserved";
                fs.writeFileSync(failedSourcePath, failedSourceContents);
                fs.writeFileSync(failedWorkbookPath, sentinel);

                expect(await command.run(["export", failedSourcePath, "--out", failedWorkbookPath])).toBe(1);
                expect(errorSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("parsheet-reel-generation-failed");
                expect(errorSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("reelStripGeneration[1]");
                expect(errorSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("suggestion: Adjust the named reelStripGeneration entry");
                expect(fs.readFileSync(failedSourcePath, "utf-8")).toBe(failedSourceContents);
                expect(fs.readFileSync(failedWorkbookPath, "utf-8")).toBe(sentinel);
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });

        it("prints a warning's suggestion beneath it when the exporter reports one", async () => {
            const exporter = createStubExporter([
                {code: "blueprint-symbol-missing-payout", severity: "warning", message: "heads up", suggestion: "add a payout for it"},
            ]);
            const command = new ParCommand("1.3.0", createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []}), exporter, () => rawBlueprint);

            await command.run(["export", "game.json"]);

            expect(logSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("suggestion: add a payout for it");
        });

        it("throws a descriptive error when no blueprint path is given", async () => {
            const command = new ParCommand("1.3.0");

            await expect(command.run(["export"])).rejects.toThrow(/Usage: pokie par export/);
        });

        it("throws on an unknown option", async () => {
            const command = new ParCommand("1.3.0");

            await expect(command.run(["export", "game.json", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
        });
    });
});

// Proves "pokie par import" resolves its input via ProjectResolving (see ParCommand's own
// resolveProject field comment / checkImportTarget doc comment) before ever reaching the real
// ParSheetImporting -- a recognized-but-wrong-type target reports a capability diagnostic instead of
// a confusing raw ExcelJS/workbook error, while an unresolved path is completely unaffected.
describe("ParCommand import resolved-project boundary", () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

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

    it('reports a capability diagnostic, without ever calling the importer, for a resolved non-"parWorkbook" target', async () => {
        const importer = createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []});
        const project = {
            type: "tsPackage",
            rootPath: "/some/existing/package",
            capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage,
            provenance: "test fixture",
        } as PokieProject;
        const resolveProject = stubProjectResolver(project);
        const command = new ParCommand("1.3.0", importer, createStubExporter([]), () => rawBlueprint, undefined, resolveProject);

        await expect(command.run(["import", "/some/existing/package"])).rejects.toThrow(
            /This POKIE game package cannot import a PAR workbook/,
        );

        expect(resolveProject.calls).toEqual(["/some/existing/package"]);
        expect(importer.calledWith).toBeUndefined();
    });

    it("still reaches the real importer unchanged for a path ProjectResolving doesn't recognize", async () => {
        const importer = createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []});
        const writeFile = jest.fn();
        const resolveProject = stubProjectResolver(undefined);
        const command = new ParCommand("1.3.0", importer, createStubExporter([]), () => rawBlueprint, writeFile, resolveProject);

        const exitCode = await command.run(["import", "game.xlsx"]);

        expect(exitCode).toBe(0);
        expect(resolveProject.calls).toEqual(["game.xlsx"]);
        expect(importer.calledWith).toBe("game.xlsx");
    });

    it('reaches the real importer unchanged for a resolved "parWorkbook" target', async () => {
        const importer = createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []});
        const project = {
            type: "parWorkbook",
            rootPath: "/some/game.par.xlsx",
            capabilities: PROJECT_TYPE_CAPABILITIES.parWorkbook,
            provenance: "test fixture",
        } as PokieProject;
        const resolveProject = stubProjectResolver(project);
        const command = new ParCommand("1.3.0", importer, createStubExporter([]), () => rawBlueprint, jest.fn(), resolveProject);

        const exitCode = await command.run(["import", "/some/game.par.xlsx"]);

        expect(exitCode).toBe(0);
        expect(importer.calledWith).toBe("/some/game.par.xlsx");
    });
});
