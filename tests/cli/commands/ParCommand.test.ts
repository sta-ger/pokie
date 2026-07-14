import {GameBlueprint, ParSheetExporting, ParSheetImporting, ParSheetImportResult, ValidationIssue} from "pokie";
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
