import {
    GameBlueprint,
    GameBlueprintValidating,
    GamePackageGenerating,
    GeneratedGamePackage,
    PokieGameManifest,
    PokieGamePackageValidating,
    PokieGamePackageValidationReport,
    ValidationIssue,
} from "pokie";
import {InitCommand} from "../../../cli/commands/InitCommand.js";
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

function createStubPackageValidator(report: PokieGamePackageValidationReport): PokieGamePackageValidating & {calledWith?: string} {
    return {
        validate(packageRoot: string) {
            this.calledWith = packageRoot;
            return Promise.resolve(report);
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

const starterBlueprint: GameBlueprint = {
    manifest: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"},
    reels: 5,
    rows: 3,
    symbols: ["A", "K", "Q", "J"],
    paytable: {A: {3: 5}},
};

const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
const generatedResult: GeneratedGamePackage = {
    projectRoot: "/tmp/sample-slot",
    manifest,
    createdFiles: ["package.json", "tsconfig.json", "README.md", "src/index.ts", "dist/index.js"],
};
const validReport: PokieGamePackageValidationReport = {
    packageRoot: generatedResult.projectRoot,
    valid: true,
    game: manifest,
    errors: [],
    warnings: [],
    suggestions: [],
};

function createCommand(
    validator = createStubValidator([]),
    generator = createStubGenerator(generatedResult),
    packageValidator = createStubPackageValidator(validReport),
    wizard: GameBlueprintWizarding | undefined = undefined,
    createPrompt: (() => PromptAdapting) | undefined = undefined,
) {
    const command = new InitCommand("1.3.0", () => starterBlueprint, validator, generator, packageValidator, wizard, createPrompt);
    return {command, validator, generator, packageValidator};
}

describe("InitCommand", () => {
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
        const {command} = createCommand();

        expect(command.getName()).toBe("init");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    describe("with a name", () => {
        it("generates, verifies, and reports a prepared package from the starter blueprint named after <name>", async () => {
            const {command, generator, packageValidator} = createCommand();

            const exitCode = await command.run(["sample-slot"]);

            expect(exitCode).toBe(0);
            expect(generator.calledWith?.blueprint.manifest).toEqual({id: "sample-slot", name: "Sample Slot", version: "0.1.0"});
            expect(generator.calledWith).toMatchObject({cwd: process.cwd(), outDir: "sample-slot"});
            expect(packageValidator.calledWith).toBe(generatedResult.projectRoot);

            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("created  package.json");
            expect(printed).toContain(`prepared and verified in "${generatedResult.projectRoot}"`);
            expect(printed).toContain(`loadPokieGame("${generatedResult.projectRoot}")`);
        });

        it("reports validation errors and returns 1 without generating a package", async () => {
            const issues: ValidationIssue[] = [{code: "blueprint-reels-invalid", severity: "error", message: "bad reels"}];
            const {command, generator} = createCommand(createStubValidator(issues));

            const exitCode = await command.run(["sample-slot"]);

            expect(exitCode).toBe(1);
            expect(generator.calledWith).toBeUndefined();
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("1 error(s)"));
        });

        it("reports the package as not prepared and returns 1 when verification fails", async () => {
            const invalidReport: PokieGamePackageValidationReport = {
                ...validReport,
                valid: false,
                errors: [{code: "package-not-loadable", severity: "error", message: "dist/index.js is missing"}],
            };
            const {command} = createCommand(undefined, undefined, createStubPackageValidator(invalidReport));

            const exitCode = await command.run(["sample-slot"]);

            expect(exitCode).toBe(1);
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not a valid POKIE game"));
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("dist/index.js is missing"));
        });

        it("throws a descriptive error for an invalid name", async () => {
            const {command} = createCommand();

            await expect(command.run(["../escape"])).rejects.toThrow(/is not a valid project name/);
        });

        it("throws a descriptive error for an unknown option", () => {
            const {command} = createCommand();

            expect(() => command.run(["sample-slot", "--bogus"])).toThrow(/Unknown option "--bogus"/);
        });

        it("throws a descriptive error for an unexpected extra positional argument", () => {
            const {command} = createCommand();

            expect(() => command.run(["name-one", "name-two"])).toThrow(/Unexpected extra argument "name-two"/);
        });
    });

    describe("with no name (the interactive wizard)", () => {
        it("builds, verifies, and reports a prepared package from the wizard's answers", async () => {
            const wizardBlueprint: GameBlueprint = {...starterBlueprint, manifest: {id: "wiz-game", name: "Wiz Game", version: "0.1.0"}};
            const wizard = createStubWizard({blueprint: wizardBlueprint, outDir: "custom-out"});
            const prompt = createStubPrompt();
            const {command, validator, generator} = createCommand(undefined, undefined, undefined, wizard, () => prompt);

            const exitCode = await command.run([]);

            expect(exitCode).toBe(0);
            expect(validator.calledWith).toBe(wizardBlueprint);
            expect(generator.calledWith).toEqual({blueprint: wizardBlueprint, cwd: process.cwd(), outDir: "custom-out"});
            expect(prompt.closed).toBe(true);
        });

        it("prints a cancellation message and returns 1 without generating when the wizard is cancelled", async () => {
            const wizard = createStubWizard(null);
            const prompt = createStubPrompt();
            const {command, generator} = createCommand(undefined, undefined, undefined, wizard, () => prompt);

            const exitCode = await command.run([]);

            expect(exitCode).toBe(1);
            expect(generator.calledWith).toBeUndefined();
            expect(prompt.closed).toBe(true);
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("cancelled"));
        });

        it("closes the prompt even if the wizard rejects", async () => {
            const wizard = createStubWizard(new Error("boom"));
            const prompt = createStubPrompt();
            const {command} = createCommand(undefined, undefined, undefined, wizard, () => prompt);

            await expect(command.run([])).rejects.toThrow("boom");
            expect(prompt.closed).toBe(true);
        });
    });
});
