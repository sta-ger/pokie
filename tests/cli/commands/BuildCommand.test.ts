import {GameBlueprint, GameBlueprintValidating, GamePackageGenerating, GeneratedGamePackage, ValidationIssue} from "pokie";
import {BuildCommand} from "../../../cli/commands/BuildCommand.js";

function createStubValidator(issues: ValidationIssue[]): GameBlueprintValidating & {calledWith?: unknown} {
    return {
        validate(blueprint: unknown) {
            this.calledWith = blueprint;
            return issues;
        },
    };
}

function createStubGenerator(
    result: GeneratedGamePackage,
): GamePackageGenerating & {calledWith?: {blueprint: GameBlueprint; cwd: string; outDir?: string}} {
    return {
        generate(blueprint: GameBlueprint, cwd: string, outDir?: string) {
            this.calledWith = {blueprint, cwd, outDir};
            return result;
        },
    };
}

const rawBlueprint = {manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"}};
const generatedResult: GeneratedGamePackage = {
    projectRoot: "/tmp/crazy-fruits",
    manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    createdFiles: ["package.json", "src/generated/index.js"],
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
        const command = new BuildCommand("1.3.0", () => rawBlueprint, createStubValidator([]), createStubGenerator(generatedResult));

        expect(command.getName()).toBe("build");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without a config path", async () => {
        const command = new BuildCommand("1.3.0");

        await expect(command.run([])).rejects.toThrow(/Usage: pokie build <config.json>/);
        await expect(command.run([])).rejects.toThrow(/GameBlueprint/);
    });

    it("throws a descriptive error for an unknown option", async () => {
        const command = new BuildCommand("1.3.0", () => rawBlueprint, createStubValidator([]), createStubGenerator(generatedResult));

        await expect(command.run(["config.json", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("throws a descriptive error when --out is given no value", async () => {
        const command = new BuildCommand("1.3.0", () => rawBlueprint, createStubValidator([]), createStubGenerator(generatedResult));

        await expect(command.run(["config.json", "--out"])).rejects.toThrow(/--out requires a directory path/);
    });

    it("loads the blueprint from the given config path and validates it", async () => {
        const loadBlueprint = jest.fn().mockReturnValue(rawBlueprint);
        const validator = createStubValidator([]);
        const command = new BuildCommand("1.3.0", loadBlueprint, validator, createStubGenerator(generatedResult));

        await command.run(["config.json"]);

        expect(loadBlueprint).toHaveBeenCalledWith("config.json");
        expect(validator.calledWith).toBe(rawBlueprint);
    });

    it("returns 1 and does not generate when validation reports errors", async () => {
        const validator = createStubValidator([{code: "blueprint-reels-invalid", severity: "error", message: "bad reels"}]);
        const generator = createStubGenerator(generatedResult);
        const command = new BuildCommand("1.3.0", () => rawBlueprint, validator, generator);

        const exitCode = await command.run(["config.json"]);

        expect(exitCode).toBe(1);
        expect(generator.calledWith).toBeUndefined();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("1 error(s)"));
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("docs/cli.md#pokie-build-configjson"));
    });

    it("still generates when validation reports only warnings", async () => {
        const validator = createStubValidator([{code: "blueprint-paytable-wild-symbol", severity: "warning", message: "heads up"}]);
        const generator = createStubGenerator(generatedResult);
        const command = new BuildCommand("1.3.0", () => rawBlueprint, validator, generator);

        const exitCode = await command.run(["config.json"]);

        expect(exitCode).toBe(0);
        expect(generator.calledWith).toBeDefined();
    });

    it("generates the package using the cwd and forwards --out", async () => {
        const generator = createStubGenerator(generatedResult);
        const command = new BuildCommand("1.3.0", () => rawBlueprint, createStubValidator([]), generator);

        await command.run(["config.json", "--out", "somewhere"]);

        expect(generator.calledWith).toEqual({blueprint: rawBlueprint, cwd: process.cwd(), outDir: "somewhere"});
    });

    it("prints the created files and a success summary, returning 0", async () => {
        const command = new BuildCommand(
            "1.3.0",
            () => rawBlueprint,
            createStubValidator([]),
            createStubGenerator(generatedResult),
        );

        const exitCode = await command.run(["config.json"]);

        expect(exitCode).toBe(0);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("package.json"));
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("src/generated/index.js"));
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('built in "/tmp/crazy-fruits"'));
    });

    it("prints the full build -> validate -> sim -> report -> replay -> dev workflow as next steps", async () => {
        const command = new BuildCommand(
            "1.3.0",
            () => rawBlueprint,
            createStubValidator([]),
            createStubGenerator(generatedResult),
        );

        await command.run(["config.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("pokie validate /tmp/crazy-fruits");
        expect(printed).toContain("pokie sim /tmp/crazy-fruits");
        expect(printed).toContain("pokie report sim.json");
        expect(printed).toContain("pokie replay /tmp/crazy-fruits");
        expect(printed).toContain("pokie dev /tmp/crazy-fruits");
    });
});
