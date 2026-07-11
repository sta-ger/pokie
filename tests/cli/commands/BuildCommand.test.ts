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
const fullBlueprint: GameBlueprint = {
    manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
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
    buildInfo: {
        schemaVersion: 1,
        generatedBy: "pokie build",
        pokieVersion: "1.3.0",
        generatedAt: "2026-01-01T00:00:00.000Z",
        blueprintHash: "sha256:abc123",
        game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    },
    unchanged: false,
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

    describe("--init-blueprint", () => {
        const starterBlueprint: GameBlueprint = {
            manifest: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"},
            reels: 5,
            rows: 3,
            symbols: ["A", "K", "Q", "J"],
            paytable: {A: {3: 5}},
        };

        function createCommand(fileExists: boolean, writeFile: jest.Mock, wizard?: GameBlueprintWizarding) {
            return new BuildCommand(
                "1.3.0",
                () => rawBlueprint,
                createStubValidator([]),
                createStubGenerator(generatedResult),
                wizard ?? createStubWizard(new Error("the wizard must not run for --init-blueprint")),
                () => createStubPrompt(),
                () => starterBlueprint,
                () => fileExists,
                writeFile,
            );
        }

        it("writes the starter blueprint and prints the next-step hint, without running the wizard or generating a package", async () => {
            const generator = createStubGenerator(generatedResult);
            const writeFile = jest.fn();
            const command = new BuildCommand(
                "1.3.0",
                () => rawBlueprint,
                createStubValidator([]),
                generator,
                createStubWizard(new Error("the wizard must not run for --init-blueprint")),
                () => createStubPrompt(),
                () => starterBlueprint,
                () => false,
                writeFile,
            );

            const exitCode = await command.run(["--init-blueprint", "my-blueprint.json"]);

            expect(exitCode).toBe(0);
            expect(writeFile).toHaveBeenCalledWith("my-blueprint.json", `${JSON.stringify(starterBlueprint, null, 4)}\n`);
            expect(generator.calledWith).toBeUndefined();

            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain('Created starter blueprint "my-blueprint.json"');
            expect(printed).toContain("pokie build my-blueprint.json --out <dir>");
        });

        it("throws a clear error instead of silently overwriting an existing file", async () => {
            const writeFile = jest.fn();
            const command = createCommand(true, writeFile);

            await expect(command.run(["--init-blueprint", "my-blueprint.json"])).rejects.toThrow(
                /"my-blueprint\.json" already exists/,
            );
            expect(writeFile).not.toHaveBeenCalled();
        });

        it("throws a usage error when no file path is given", async () => {
            const command = createCommand(false, jest.fn());

            await expect(command.run(["--init-blueprint"])).rejects.toThrow(/Usage: pokie build --init-blueprint <file>/);
        });

        it("throws a usage error on an unexpected extra argument", async () => {
            const command = createCommand(false, jest.fn());

            await expect(command.run(["--init-blueprint", "my-blueprint.json", "extra"])).rejects.toThrow(/Unknown option "extra"/);
        });
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

    it("prints a build summary with package root, game id/name/version, and blueprint hash", async () => {
        const command = new BuildCommand("1.3.0", () => rawBlueprint, createStubValidator([]), createStubGenerator(generatedResult));

        await command.run(["config.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("Build summary:");
        expect(printed).toContain("package root     /tmp/crazy-fruits");
        expect(printed).toContain('game             Crazy Fruits (id: "crazy-fruits", v0.1.0)');
        expect(printed).toContain("blueprint hash   sha256:abc123");
        expect(printed).toContain("status           generated");
    });

    it("prints the source path in the build summary when the blueprint has one", async () => {
        const generator = createStubGenerator({
            ...generatedResult,
            buildInfo: {...generatedResult.buildInfo, source: "config.json"},
        });
        const command = new BuildCommand("1.3.0", () => rawBlueprint, createStubValidator([]), generator);

        await command.run(["config.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("source           config.json");
    });

    it("omits the source line from the build summary when the blueprint has no source path", async () => {
        const command = new BuildCommand("1.3.0", () => rawBlueprint, createStubValidator([]), createStubGenerator(generatedResult));

        await command.run(["config.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).not.toContain("source           ");
    });

    it("prints an explicit unchanged/deterministic-rebuild status when the generator reports a no-op rebuild", async () => {
        const generator = createStubGenerator({...generatedResult, unchanged: true});
        const command = new BuildCommand("1.3.0", () => rawBlueprint, createStubValidator([]), generator);

        await command.run(["config.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("status           unchanged — deterministic rebuild");
    });

    it("--dry-run validates without calling the generator or writing anything", async () => {
        const validator = createStubValidator([]);
        const generator = createStubGenerator(generatedResult);
        const command = new BuildCommand("1.3.0", () => fullBlueprint, validator, generator);

        const exitCode = await command.run(["config.json", "--dry-run"]);

        expect(exitCode).toBe(0);
        expect(validator.calledWith).toBe(fullBlueprint);
        expect(generator.calledWith).toBeUndefined();
    });

    it("--dry-run prints a blueprint summary: game, reels x rows, symbols, paylines, bets, hash, and expected files", async () => {
        const command = new BuildCommand("1.3.0", () => fullBlueprint, createStubValidator([]), createStubGenerator(generatedResult));

        await command.run(["config.json", "--dry-run"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("Dry run");
        expect(printed).toContain('game             Crazy Fruits (id: "crazy-fruits", v0.1.0)');
        expect(printed).toContain("reels x rows     5 x 3");
        expect(printed).toContain("symbols          4");
        expect(printed).toContain("paylines         2");
        expect(printed).toContain("bets             1, 2, 5");
        expect(printed).toContain("blueprint hash   sha256:");
        expect(printed).toContain("would generate   README.md, package.json, src/generated/build-info.json, src/generated/index.js");
    });

    it("--dry-run reports default paylines/bets when the blueprint omits them", async () => {
        const minimalBlueprint: GameBlueprint = {
            manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            reels: 3,
            rows: 3,
            symbols: ["A", "B"],
            paytable: {A: {3: 5}},
        };
        const command = new BuildCommand("1.3.0", () => minimalBlueprint, createStubValidator([]), createStubGenerator(generatedResult));

        await command.run(["config.json", "--dry-run"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("paylines         default");
        expect(printed).toContain("bets             default");
    });

    it("--dry-run still prints warnings and exits 0 when validation reports only warnings", async () => {
        const validator = createStubValidator([{code: "blueprint-paytable-wild-symbol", severity: "warning", message: "heads up"}]);
        const generator = createStubGenerator(generatedResult);
        const command = new BuildCommand("1.3.0", () => fullBlueprint, validator, generator);

        const exitCode = await command.run(["config.json", "--dry-run"]);

        expect(exitCode).toBe(0);
        expect(generator.calledWith).toBeUndefined();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("heads up"));
        expect(logSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("Dry run");
    });

    it("--dry-run returns 1 and does not print a dry-run summary when validation reports errors", async () => {
        const validator = createStubValidator([{code: "blueprint-reels-invalid", severity: "error", message: "bad reels"}]);
        const generator = createStubGenerator(generatedResult);
        const command = new BuildCommand("1.3.0", () => fullBlueprint, validator, generator);

        const exitCode = await command.run(["config.json", "--dry-run"]);

        expect(exitCode).toBe(1);
        expect(generator.calledWith).toBeUndefined();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("1 error(s)"));
        expect(logSpy.mock.calls.map((call) => call[0]).join("\n")).not.toContain("Dry run");
    });

    it("prints the full build -> inspect -> validate -> sim -> report -> replay -> dev workflow as next steps", async () => {
        const command = new BuildCommand(
            "1.3.0",
            () => rawBlueprint,
            createStubValidator([]),
            createStubGenerator(generatedResult),
        );

        await command.run(["config.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("pokie inspect /tmp/crazy-fruits");
        expect(printed).toContain("pokie validate /tmp/crazy-fruits");
        expect(printed).toContain("pokie sim /tmp/crazy-fruits");
        expect(printed).toContain("pokie report sim.json");
        expect(printed).toContain("pokie replay /tmp/crazy-fruits");
        expect(printed).toContain("pokie dev /tmp/crazy-fruits");
    });
});
