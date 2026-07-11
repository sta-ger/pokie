import {GameBlueprint, GameBlueprintValidating, GamePackageGenerating, GeneratedGamePackage, ValidationIssue} from "pokie";
import {BuildCommand} from "../../../cli/commands/BuildCommand.js";
import {GameBlueprintWizarding} from "../../../cli/wizard/GameBlueprintWizarding.js";
import {PromptAdapting} from "../../../cli/wizard/PromptAdapting.js";
import {WizardResult} from "../../../cli/wizard/WizardResult.js";

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

function createStubWizard(result: WizardResult | null | Error): GameBlueprintWizarding {
    return {
        run() {
            return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
        },
    };
}

function createStubPrompt(): PromptAdapting & {closed: boolean} {
    return {
        closed: false,
        ask() {
            return Promise.resolve(null);
        },
        close() {
            this.closed = true;
        },
    };
}

const rawBlueprint = {manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"}};
const wizardBlueprint: GameBlueprint = {
    manifest: {id: "wiz-game", name: "Wiz Game", version: "0.1.0"},
    reels: 5,
    rows: 3,
    symbols: ["A", "K"],
    paytable: {A: {3: 5}},
};
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

    it("launches the wizard when run without a config path, validating and generating from its result", async () => {
        const wizard = createStubWizard({blueprint: wizardBlueprint, outDir: "custom-out"});
        const prompt = createStubPrompt();
        const validator = createStubValidator([]);
        const generator = createStubGenerator(generatedResult);
        const command = new BuildCommand("1.3.0", () => rawBlueprint, validator, generator, wizard, () => prompt);

        const exitCode = await command.run([]);

        expect(exitCode).toBe(0);
        expect(validator.calledWith).toBe(wizardBlueprint);
        expect(generator.calledWith).toEqual({blueprint: wizardBlueprint, cwd: process.cwd(), outDir: "custom-out"});
        expect(prompt.closed).toBe(true);
    });

    it("prints a cancellation message and returns 1 without generating when the wizard is cancelled", async () => {
        const wizard = createStubWizard(null);
        const prompt = createStubPrompt();
        const generator = createStubGenerator(generatedResult);
        const command = new BuildCommand("1.3.0", () => rawBlueprint, createStubValidator([]), generator, wizard, () => prompt);

        const exitCode = await command.run([]);

        expect(exitCode).toBe(1);
        expect(generator.calledWith).toBeUndefined();
        expect(prompt.closed).toBe(true);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("cancelled"));
    });

    it("still reports blueprint errors from a wizard result, without generating", async () => {
        const wizard = createStubWizard({blueprint: wizardBlueprint});
        const prompt = createStubPrompt();
        const validator = createStubValidator([{code: "blueprint-reels-invalid", severity: "error", message: "bad reels"}]);
        const generator = createStubGenerator(generatedResult);
        const command = new BuildCommand("1.3.0", () => rawBlueprint, validator, generator, wizard, () => prompt);

        const exitCode = await command.run([]);

        expect(exitCode).toBe(1);
        expect(generator.calledWith).toBeUndefined();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("1 error(s)"));
    });

    it("closes the prompt even if the wizard rejects", async () => {
        const wizard = createStubWizard(new Error("boom"));
        const prompt = createStubPrompt();
        const command = new BuildCommand(
            "1.3.0",
            () => rawBlueprint,
            createStubValidator([]),
            createStubGenerator(generatedResult),
            wizard,
            () => prompt,
        );

        await expect(command.run([])).rejects.toThrow("boom");
        expect(prompt.closed).toBe(true);
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
