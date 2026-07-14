import {GameBlueprint, GameBlueprintValidating, ParSheetExporting, ParSheetImporting, ParSheetImportResult, ValidationIssue} from "pokie";
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
): ParSheetExporting & {calledWith?: {blueprint: GameBlueprint; filePath: string; sourcePath?: string}} {
    return {
        exportToFile(blueprint: GameBlueprint, filePath: string, sourcePath?: string) {
            this.calledWith = {blueprint, filePath, sourcePath};
            return Promise.resolve(issues);
        },
    };
}

function createStubValidator(issues: ValidationIssue[]): GameBlueprintValidating & {calledWith?: unknown} {
    return {
        validate(blueprint: unknown) {
            this.calledWith = blueprint;
            return issues;
        },
    };
}

const rawBlueprint = {manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"}};
const fullBlueprint: GameBlueprint = {
    manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
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
            const command = new ParCommand("1.3.0", importer, createStubExporter([]), () => rawBlueprint, createStubValidator([]), writeFile);

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
                createStubValidator([]),
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
                createStubValidator([]),
                writeFile,
            );

            const exitCode = await command.run(["import", "game.xlsx"]);

            expect(exitCode).toBe(1);
            expect(writeFile).not.toHaveBeenCalled();
            expect(logSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("Errors (1)");
        });

        it("--format json prints the full {blueprint, issues} result and still writes the file", async () => {
            const writeFile = jest.fn();
            const command = new ParCommand(
                "1.3.0",
                createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []}),
                createStubExporter([]),
                () => rawBlueprint,
                createStubValidator([]),
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
    });

    describe("export", () => {
        it("validates, exports, and returns 0 when there are no issues", async () => {
            const exporter = createStubExporter([]);
            const validator = createStubValidator([]);
            const command = new ParCommand("1.3.0", createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []}), exporter, () => rawBlueprint, validator);

            const exitCode = await command.run(["export", "game.json"]);

            expect(exitCode).toBe(0);
            expect(validator.calledWith).toBe(rawBlueprint);
            expect(exporter.calledWith).toEqual({blueprint: rawBlueprint, filePath: "game.par.xlsx", sourcePath: "game.json"});
        });

        it("honors a custom --out path", async () => {
            const exporter = createStubExporter([]);
            const command = new ParCommand(
                "1.3.0",
                createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []}),
                exporter,
                () => rawBlueprint,
                createStubValidator([]),
            );

            await command.run(["export", "game.json", "--out", "custom.xlsx"]);

            expect(exporter.calledWith?.filePath).toBe("custom.xlsx");
        });

        it("does not call the exporter and returns 1 when validation reports errors", async () => {
            const exporter = createStubExporter([]);
            const validator = createStubValidator([{code: "blueprint-reels-invalid", severity: "error", message: "bad reels"}]);
            const command = new ParCommand("1.3.0", createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []}), exporter, () => rawBlueprint, validator);

            const exitCode = await command.run(["export", "game.json"]);

            expect(exitCode).toBe(1);
            expect(exporter.calledWith).toBeUndefined();
            expect(errorSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("1 error(s)");
        });

        it("still exports and returns 0 when validation reports only warnings", async () => {
            const exporter = createStubExporter([]);
            const validator = createStubValidator([{code: "blueprint-symbol-missing-payout", severity: "warning", message: "heads up"}]);
            const command = new ParCommand("1.3.0", createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []}), exporter, () => rawBlueprint, validator);

            const exitCode = await command.run(["export", "game.json"]);

            expect(exitCode).toBe(0);
            expect(exporter.calledWith).toBeDefined();
        });

        it("exports but returns 1 when the exporter itself reports an error (e.g. missing reelStrips)", async () => {
            const exporter = createStubExporter([{code: "parsheet-missing-reel-strips", severity: "error", message: "no reel strips"}]);
            const command = new ParCommand(
                "1.3.0",
                createStubImporter({blueprint: fullBlueprint, provenance: undefined, issues: []}),
                exporter,
                () => rawBlueprint,
                createStubValidator([]),
            );

            const exitCode = await command.run(["export", "game.json"]);

            expect(exitCode).toBe(1);
            expect(exporter.calledWith).toBeDefined();
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
