import {PokieGamePackageValidating, PokieGamePackageValidationReport, PokieGamePackageValidator} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {ValidateCommand} from "../../../cli/commands/ValidateCommand";

function createStubValidator(report: PokieGamePackageValidationReport): PokieGamePackageValidating & {calledWith?: string} {
    return {
        validate(packageRoot: string) {
            this.calledWith = packageRoot;
            return Promise.resolve(report);
        },
    };
}

const validReport: PokieGamePackageValidationReport = {
    packageRoot: "./crazy-fruits",
    valid: true,
    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    errors: [],
    warnings: [],
    suggestions: [],
};

const invalidReport: PokieGamePackageValidationReport = {
    packageRoot: "./broken-game",
    valid: false,
    game: null,
    errors: [{code: "pokie-game-missing-contract-methods", severity: "error", message: "does not implement PokieGame"}],
    warnings: [{code: "some-warning", severity: "warning", message: "a warning"}],
    suggestions: ["Export an object implementing PokieGame as the entry module's default export."],
};

describe("ValidateCommand", () => {
    it("has the expected name and description", () => {
        const command = new ValidateCommand();

        expect(command.getName()).toBe("validate");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without a packageRoot", async () => {
        const command = new ValidateCommand();

        await expect(command.run([])).rejects.toThrow(/Usage: pokie validate <packageRoot>/);
    });

    it("throws a descriptive error for an unknown option", async () => {
        const command = new ValidateCommand(createStubValidator(validReport));

        await expect(command.run(["./game", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("throws a descriptive error when --format is not json", async () => {
        const command = new ValidateCommand(createStubValidator(validReport));

        await expect(command.run(["./game", "--format", "xml"])).rejects.toThrow(/--format only supports "json"/);
    });

    it("throws a descriptive error when --out has no value", async () => {
        const command = new ValidateCommand(createStubValidator(validReport));

        await expect(command.run(["./game", "--out"])).rejects.toThrow(/--out requires a file path/);
    });

    it("prints a human-readable summary and returns exit code 0 for a valid package", async () => {
        const validator = createStubValidator(validReport);
        const command = new ValidateCommand(validator);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["./crazy-fruits"]);

        expect(validator.calledWith).toBe("./crazy-fruits");
        expect(exitCode).toBe(0);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Validating "Crazy Fruits"');
        expect(printed).toContain("valid           yes");
        expect(printed).toContain("No issues found.");

        logSpy.mockRestore();
    });

    it("prints errors, warnings, and suggestions, and returns exit code 1 for an invalid package", async () => {
        const command = new ValidateCommand(createStubValidator(invalidReport));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["./broken-game"]);

        expect(exitCode).toBe(1);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("Validating package at");
        expect(printed).toContain("valid           no");
        expect(printed).toContain("Errors (1):");
        expect(printed).toContain("pokie-game-missing-contract-methods: does not implement PokieGame");
        expect(printed).toContain("Warnings (1):");
        expect(printed).toContain("some-warning: a warning");
        expect(printed).toContain("Suggestions:");
        expect(printed).toContain("Export an object implementing PokieGame as the entry module's default export.");

        logSpy.mockRestore();
    });

    it("prints the JSON report to stdout instead of the summary when --format json is given", async () => {
        const command = new ValidateCommand(createStubValidator(validReport));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["./crazy-fruits", "--format", "json"]);

        expect(exitCode).toBe(0);
        expect(logSpy).toHaveBeenCalledTimes(1);
        const report = JSON.parse(logSpy.mock.calls[0][0]) as PokieGamePackageValidationReport;
        expect(report).toEqual(validReport);

        logSpy.mockRestore();
    });

    it("writes the JSON report to --out and still returns the right exit code", async () => {
        const writeFile = jest.fn();
        const command = new ValidateCommand(createStubValidator(invalidReport), writeFile);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["./broken-game", "--out", "report.json"]);

        expect(exitCode).toBe(1);
        expect(writeFile).toHaveBeenCalledTimes(1);
        const [file, contents] = writeFile.mock.calls[0];
        expect(file).toBe("report.json");
        expect(JSON.parse(contents)).toEqual(invalidReport);

        (console.log as jest.Mock).mockRestore();
    });
});

describe("ValidateCommand (integration, real PokieGamePackageValidator + fixture packages)", () => {
    const gamepackageFixturesRoot = path.join(__dirname, "..", "..", "gamepackage", "fixtures");
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-validate-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("passes a valid scaffolded-style package and returns exit code 0", async () => {
        const command = new ValidateCommand(new PokieGamePackageValidator());

        const exitCode = await command.run([path.join(gamepackageFixturesRoot, "valid-game")]);

        expect(exitCode).toBe(0);
    });

    it("fails with a clear error for a missing/invalid pokie.entry and returns exit code 1", async () => {
        const command = new ValidateCommand(new PokieGamePackageValidator());
        const outFile = path.join(outDir, "report.json");

        const exitCode = await command.run([path.join(gamepackageFixturesRoot, "missing-entry-game"), "--out", outFile]);

        expect(exitCode).toBe(1);
        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as PokieGamePackageValidationReport;
        expect(report.valid).toBe(false);
        expect(report.game).toBeNull();
        expect(report.errors[0].message).toContain("pokie.entry");
    });

    it("fails for an entry module that does not export a valid PokieGame and returns exit code 1", async () => {
        const command = new ValidateCommand(new PokieGamePackageValidator());

        const exitCode = await command.run([path.join(gamepackageFixturesRoot, "invalid-export-game"), "--format", "json"]);

        expect(exitCode).toBe(1);
        const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
        const report = JSON.parse(printed) as PokieGamePackageValidationReport;
        expect(report.valid).toBe(false);
        expect(report.errors[0].code).toBe("pokie-game-missing-contract-methods");
    });
});
