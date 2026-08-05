import {GameBlueprint, GameBlueprintValidating, RandomGameBlueprintGenerating, RandomGameBlueprintRequest, RandomGameBlueprintResult, ValidationIssue} from "pokie";
import {CreateCommand} from "../../../cli/commands/CreateCommand.js";
import {GameBlueprintWizarding, GameBlueprintWizardOptions} from "../../../cli/wizard/GameBlueprintWizarding.js";
import {PromptAdapting} from "../../../cli/wizard/PromptAdapting.js";
import {WizardResult} from "../../../cli/wizard/WizardResult.js";

function createStubRandomBlueprintGenerator(
    result: RandomGameBlueprintResult,
): RandomGameBlueprintGenerating & {calledWith?: RandomGameBlueprintRequest} {
    return {
        generate(request: RandomGameBlueprintRequest = {}) {
            this.calledWith = request;
            return result;
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

// A canned-answer test double for GameBlueprintWizarding: mirrors InitCommand.test.ts's own
// createStubWizard, plus captures the GameBlueprintWizardOptions CreateCommand passed it (presetName/
// destination), so a test can assert those were threaded through correctly without exercising the real
// wizard's own prompt-driven question flow (already covered by GameBlueprintWizard.test.ts).
function createStubWizard(result: WizardResult | null | Error): GameBlueprintWizarding & {calledWith?: GameBlueprintWizardOptions} {
    return {
        run(_prompt: PromptAdapting, options?: GameBlueprintWizardOptions) {
            this.calledWith = options;
            return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
        },
    };
}

// A controllable PromptAdapting stand-in for the post-wizard "Save this blueprint? [Y/n]" question --
// every ask() (there is ever at most one, for that confirmation) resolves with the same canned answer,
// or null to simulate Ctrl+C/EOF at that specific question.
function createControllablePrompt(confirmAnswer: string | null): PromptAdapting & {closed: boolean; askCalls: string[]} {
    return {
        closed: false,
        askCalls: [],
        ask(question: string) {
            this.askCalls.push(question);
            return Promise.resolve(confirmAnswer);
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

const blankBlueprint: GameBlueprint = {
    manifest: {id: "blank-slot", name: "Blank Slot", version: "0.1.0"},
    reels: 3,
    rows: 3,
    symbols: ["A", "B", "C"],
    paytable: {A: {3: 5}},
};

const wizardBlueprint: GameBlueprint = {
    manifest: {id: "wiz-slot", name: "Wiz Slot", version: "0.1.0"},
    reels: 3,
    rows: 3,
    symbols: ["A", "B"],
    paytable: {A: {3: 5}},
};

// CreateCommand's own write seam never takes a plain "write these bytes" callback -- it commits via an
// atomic, create-only abstraction (see writeBlueprintFileAtomically.ts) that reports whether the commit
// actually landed or lost a race against an existing destination, instead of silently overwriting one.
// Defaulting to "ok" here mirrors that abstraction's own default (no destination in the way).
function createOkWriteResult() {
    return {status: "ok" as const};
}

function createConflictWriteResult() {
    return {status: "conflict" as const};
}

function createCommand(
    fileExists: jest.Mock = jest.fn().mockReturnValue(false),
    writeBlueprintFileAtomically: jest.Mock = jest.fn().mockReturnValue(createOkWriteResult()),
    validator = createStubValidator([]),
    randomGenerator: RandomGameBlueprintGenerating | undefined = undefined,
    variantRandomGenerator: RandomGameBlueprintGenerating | undefined = undefined,
    wizard: GameBlueprintWizarding | undefined = undefined,
    createPrompt: (() => PromptAdapting) | undefined = undefined,
    isInteractiveTerminal: (() => boolean) | undefined = undefined,
) {
    const command = new CreateCommand(
        "1.3.0",
        () => starterBlueprint,
        () => blankBlueprint,
        validator,
        randomGenerator,
        fileExists,
        writeBlueprintFileAtomically,
        variantRandomGenerator,
        wizard,
        createPrompt,
        isInteractiveTerminal,
    );
    return {command, fileExists, writeFile: writeBlueprintFileAtomically, validator};
}

describe("CreateCommand", () => {
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

        expect(command.getName()).toBe("create");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    describe("bare/named (the interactive wizard)", () => {
        it("prints guidance and exits 1 without ever touching the wizard when not run in an interactive terminal", async () => {
            let wizardCalled = false;
            const wizard: GameBlueprintWizarding = {
                run: () => {
                    wizardCalled = true;
                    return Promise.resolve(null);
                },
            };
            const {command, writeFile} = createCommand(undefined, undefined, undefined, undefined, undefined, wizard, undefined, () => false);

            const exitCode = await command.run([]);

            expect(exitCode).toBe(1);
            expect(wizardCalled).toBe(false);
            expect(writeFile).not.toHaveBeenCalled();
            expect(errorSpy).toHaveBeenCalledTimes(1);
            expect(errorSpy.mock.calls[0][0]).toContain("--blank");
            expect(errorSpy.mock.calls[0][0]).toContain("--random");
        });

        it("runs the interactive wizard, shows a preview, and writes the confirmed blueprint", async () => {
            const wizard = createStubWizard({blueprint: wizardBlueprint, outDir: "./wiz-slot.blueprint.json"});
            const prompt = createControllablePrompt("y");
            const {command, writeFile} = createCommand(undefined, undefined, undefined, undefined, undefined, wizard, () => prompt, () => true);

            const exitCode = await command.run([]);

            expect(exitCode).toBe(0);
            expect(writeFile).toHaveBeenCalledWith("./wiz-slot.blueprint.json", `${JSON.stringify(wizardBlueprint, null, 4)}\n`);
            expect(prompt.closed).toBe(true);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Preview:");
            expect(printed).toContain('Destination: ./wiz-slot.blueprint.json');
            expect(printed).toContain('created at "./wiz-slot.blueprint.json"');
        });

        it("accepts a blank Enter at the confirmation as yes", async () => {
            const wizard = createStubWizard({blueprint: wizardBlueprint, outDir: "./wiz-slot.blueprint.json"});
            const prompt = createControllablePrompt("");
            const {command, writeFile} = createCommand(undefined, undefined, undefined, undefined, undefined, wizard, () => prompt, () => true);

            const exitCode = await command.run([]);

            expect(exitCode).toBe(0);
            expect(writeFile).toHaveBeenCalled();
        });

        it("pre-fills the wizard's own presetName from a given name", async () => {
            const wizard = createStubWizard({blueprint: wizardBlueprint, outDir: "./wiz-slot.blueprint.json"});
            const prompt = createControllablePrompt("y");
            const {command} = createCommand(undefined, undefined, undefined, undefined, undefined, wizard, () => prompt, () => true);

            await command.run(["sample-slot"]);

            expect(wizard.calledWith?.presetName).toBe("sample-slot");
        });

        it("threads --out into the wizard's own destination default, wired to the final chosen id", async () => {
            const wizard = createStubWizard({blueprint: wizardBlueprint, outDir: "./wiz-slot.blueprint.json"});
            const prompt = createControllablePrompt("y");
            const {command} = createCommand(undefined, undefined, undefined, undefined, undefined, wizard, () => prompt, () => true);

            await command.run(["--out", "custom/dest.blueprint.json"]);

            expect(wizard.calledWith?.destination?.defaultPathFor("wiz-slot")).toBe("custom/dest.blueprint.json");
        });

        it("falls back to the default blueprint path when --out was not given", async () => {
            const wizard = createStubWizard({blueprint: wizardBlueprint, outDir: "./wiz-slot.blueprint.json"});
            const prompt = createControllablePrompt("y");
            const {command} = createCommand(undefined, undefined, undefined, undefined, undefined, wizard, () => prompt, () => true);

            await command.run([]);

            expect(wizard.calledWith?.destination?.defaultPathFor("wiz-slot")).toBe("./wiz-slot.blueprint.json");
        });

        it("writes nothing and reports cancellation when the wizard itself is cancelled (Ctrl+C/EOF mid-flow)", async () => {
            const wizard = createStubWizard(null);
            const prompt = createControllablePrompt("y");
            const {command, writeFile} = createCommand(undefined, undefined, undefined, undefined, undefined, wizard, () => prompt, () => true);

            const exitCode = await command.run([]);

            expect(exitCode).toBe(1);
            expect(writeFile).not.toHaveBeenCalled();
            expect(prompt.closed).toBe(true);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Create cancelled.");
        });

        it('writes nothing when the user declines the "Save this blueprint?" confirmation', async () => {
            const wizard = createStubWizard({blueprint: wizardBlueprint, outDir: "./wiz-slot.blueprint.json"});
            const prompt = createControllablePrompt("n");
            const {command, writeFile} = createCommand(undefined, undefined, undefined, undefined, undefined, wizard, () => prompt, () => true);

            const exitCode = await command.run([]);

            expect(exitCode).toBe(1);
            expect(writeFile).not.toHaveBeenCalled();
            expect(prompt.closed).toBe(true);
        });

        it("writes nothing when the user cancels (Ctrl+C/EOF) at the confirmation itself", async () => {
            const wizard = createStubWizard({blueprint: wizardBlueprint, outDir: "./wiz-slot.blueprint.json"});
            const prompt = createControllablePrompt(null);
            const {command, writeFile} = createCommand(undefined, undefined, undefined, undefined, undefined, wizard, () => prompt, () => true);

            const exitCode = await command.run([]);

            expect(exitCode).toBe(1);
            expect(writeFile).not.toHaveBeenCalled();
        });

        it("writes nothing and reports errors when the resulting blueprint fails validation", async () => {
            const issues: ValidationIssue[] = [{code: "blueprint-reels-invalid", severity: "error", message: "bad reels"}];
            const wizard = createStubWizard({blueprint: wizardBlueprint, outDir: "./wiz-slot.blueprint.json"});
            const prompt = createControllablePrompt("y");
            const {command, writeFile} = createCommand(
                undefined,
                undefined,
                createStubValidator(issues),
                undefined,
                undefined,
                wizard,
                () => prompt,
                () => true,
            );

            const exitCode = await command.run([]);

            expect(exitCode).toBe(1);
            expect(writeFile).not.toHaveBeenCalled();
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("1 error(s)"));
        });

        it("writes nothing, and never even asks to confirm, when the destination already exists", async () => {
            const wizard = createStubWizard({blueprint: wizardBlueprint, outDir: "./wiz-slot.blueprint.json"});
            const prompt = createControllablePrompt("y");
            const {command, writeFile} = createCommand(
                jest.fn().mockReturnValue(true),
                undefined,
                undefined,
                undefined,
                undefined,
                wizard,
                () => prompt,
                () => true,
            );

            const exitCode = await command.run([]);

            expect(exitCode).toBe(1);
            expect(writeFile).not.toHaveBeenCalled();
            expect(prompt.askCalls).toHaveLength(0);
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"./wiz-slot.blueprint.json" already exists'));
        });

        // The fileExists() check above is only a best-effort head start (skip prompting for a save that's
        // already doomed) -- it can still race against something else creating the destination in the
        // window between that check and the actual commit. commitBlueprintFile()'s own atomic, create-only
        // write (writeBlueprintFileAtomically.ts) is the authoritative guard: even when fileExists() said
        // "no conflict" and the user already confirmed, a "conflict" reported at that final commit must
        // still stop the save cold -- reporting the same error, never claiming success over a destination
        // this call never actually verified it was safe to write.
        it("reports a conflict and writes nothing when the destination is created between the early check and the final atomic commit", async () => {
            const wizard = createStubWizard({blueprint: wizardBlueprint, outDir: "./wiz-slot.blueprint.json"});
            const prompt = createControllablePrompt("y");
            const writeBlueprintFileAtomically = jest.fn().mockReturnValue(createConflictWriteResult());
            const {command} = createCommand(
                jest.fn().mockReturnValue(false),
                writeBlueprintFileAtomically,
                undefined,
                undefined,
                undefined,
                wizard,
                () => prompt,
                () => true,
            );

            const exitCode = await command.run([]);

            expect(exitCode).toBe(1);
            expect(writeBlueprintFileAtomically).toHaveBeenCalledWith("./wiz-slot.blueprint.json", `${JSON.stringify(wizardBlueprint, null, 4)}\n`);
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"./wiz-slot.blueprint.json" already exists'));
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).not.toContain('created at "./wiz-slot.blueprint.json"');
        });

        it("closes the prompt even if the wizard rejects", async () => {
            const wizard = createStubWizard(new Error("boom"));
            const prompt = createControllablePrompt("y");
            const {command} = createCommand(undefined, undefined, undefined, undefined, undefined, wizard, () => prompt, () => true);

            await expect(command.run([])).rejects.toThrow("boom");
            expect(prompt.closed).toBe(true);
        });

        it("writes to a destination path containing spaces unmodified", async () => {
            const spacedPath = "./my games/space slot.blueprint.json";
            const wizard = createStubWizard({blueprint: wizardBlueprint, outDir: spacedPath});
            const prompt = createControllablePrompt("y");
            const {command, writeFile} = createCommand(undefined, undefined, undefined, undefined, undefined, wizard, () => prompt, () => true);

            const exitCode = await command.run([]);

            expect(exitCode).toBe(0);
            expect(writeFile).toHaveBeenCalledWith(spacedPath, expect.any(String));
        });

        it("throws a descriptive error for an invalid name", () => {
            const {command} = createCommand(undefined, undefined, undefined, undefined, undefined, undefined, undefined, () => true);

            expect(() => command.run(["../escape"])).toThrow(/is not a valid project name/);
        });

        it("throws a descriptive error for an unknown option", () => {
            const {command} = createCommand(undefined, undefined, undefined, undefined, undefined, undefined, undefined, () => true);

            expect(() => command.run(["--bogus"])).toThrow(/Unknown option "--bogus"/);
        });

        it("throws a descriptive error for an unexpected extra positional argument", () => {
            const {command} = createCommand(undefined, undefined, undefined, undefined, undefined, undefined, undefined, () => true);

            expect(() => command.run(["name-one", "name-two"])).toThrow(/Unexpected extra argument "name-two"/);
        });

        it("throws a descriptive error when --out is given no value", () => {
            const {command} = createCommand(undefined, undefined, undefined, undefined, undefined, undefined, undefined, () => true);

            expect(() => command.run(["--out"])).toThrow(/--out requires a file path/);
        });
    });

    describe("--blank", () => {
        it("writes the blank blueprint to the default path derived from its own manifest id", async () => {
            const {command, writeFile} = createCommand();

            const exitCode = await command.run(["--blank"]);

            expect(exitCode).toBe(0);
            expect(writeFile).toHaveBeenCalledWith("./blank-slot.blueprint.json", `${JSON.stringify(blankBlueprint, null, 4)}\n`);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain('created at "./blank-slot.blueprint.json"');
        });

        it("overrides the manifest id/name from a given name, and writes to <name>.blueprint.json", async () => {
            const {command, writeFile} = createCommand();

            await command.run(["sample-slot", "--blank"]);

            const written = JSON.parse((writeFile.mock.calls[0] as [string, string])[1]) as GameBlueprint;
            expect(writeFile.mock.calls[0][0]).toBe("./sample-slot.blueprint.json");
            expect(written.manifest).toEqual({id: "sample-slot", name: "Sample Slot", version: "0.1.0"});
        });

        it("writes to the given --out path instead of the default", async () => {
            const {command, writeFile} = createCommand();

            await command.run(["--blank", "--out", "custom/my-game.blueprint.json"]);

            expect(writeFile.mock.calls[0][0]).toBe("custom/my-game.blueprint.json");
        });

        it("never touches the wizard", async () => {
            let wizardCalled = false;
            const wizard: GameBlueprintWizarding = {
                run: () => {
                    wizardCalled = true;
                    return Promise.resolve(null);
                },
            };
            const {command} = createCommand(undefined, undefined, undefined, undefined, undefined, wizard);

            await command.run(["--blank"]);

            expect(wizardCalled).toBe(false);
        });

        // The blank path resolves synchronously (see CreateCommand.run()'s own doc comment) -- a
        // parse/validation failure throws straight out of run() rather than rejecting the returned
        // promise. --blank never pre-checks fileExists() itself -- it routes straight through the same
        // atomic, create-only commit the interactive wizard's own final write uses (see
        // writeBlueprintFileAtomically.ts), so a "conflict" result from that commit is what surfaces here.
        it("throws a clear error instead of silently overwriting an existing file", () => {
            const {command} = createCommand(undefined, jest.fn().mockReturnValue(createConflictWriteResult()));

            expect(() => command.run(["--blank"])).toThrow(/"\.\/blank-slot\.blueprint\.json" already exists/);
        });

        it("throws a descriptive error for an invalid name", () => {
            const {command} = createCommand();

            expect(() => command.run(["../escape", "--blank"])).toThrow(/is not a valid project name/);
        });

        it("throws a descriptive error for an unknown option", () => {
            const {command} = createCommand();

            expect(() => command.run(["--blank", "--bogus"])).toThrow(/Unknown option "--bogus"/);
        });

        it("throws a descriptive error for an unexpected extra positional argument", () => {
            const {command} = createCommand();

            expect(() => command.run(["--blank", "name-one", "name-two"])).toThrow(/Unexpected extra argument "name-two"/);
        });

        it("throws a descriptive error when --out is given no value", () => {
            const {command} = createCommand();

            expect(() => command.run(["--blank", "--out"])).toThrow(/--out requires a file path/);
        });
    });

    describe("--random", () => {
        const randomBlueprint: GameBlueprint = {
            manifest: {id: "blazing-riches-4821", name: "Blazing Riches", version: "0.1.0"},
            reels: 5,
            rows: 3,
            symbols: ["A", "K", "Q", "J", "10"],
            paytable: {A: {3: 5}, K: {3: 4}, Q: {3: 3}, J: {3: 2}, "10": {3: 1}},
            symbolWeights: {A: 1, K: 2, Q: 3, J: 4, "10": 5},
            availableBets: [1, 2, 5, 10],
        };
        const randomResult: RandomGameBlueprintResult = {
            blueprint: randomBlueprint,
            seed: 20260721,
            provenance: {generatorVersion: "1.0.0", strategy: "default-line-pay", seed: 20260721},
        };

        function createRandomCommand(
            fileExists: jest.Mock = jest.fn().mockReturnValue(false),
            writeFile: jest.Mock = jest.fn().mockReturnValue(createOkWriteResult()),
            validator = createStubValidator([]),
            randomGenerator = createStubRandomBlueprintGenerator(randomResult),
            variantRandomGenerator = createStubRandomBlueprintGenerator({
                ...randomResult,
                provenance: {...randomResult.provenance, strategy: "random-variant"},
            }),
        ) {
            const {command} = createCommand(fileExists, writeFile, validator, randomGenerator, variantRandomGenerator);
            return {command, fileExists, writeFile, validator, randomGenerator, variantRandomGenerator};
        }

        it("generates a random blueprint, converts its weighting to valid per-reel generation, and writes it out", async () => {
            const {command, writeFile, randomGenerator} = createRandomCommand();

            const exitCode = await command.run(["--random"]);

            expect(exitCode).toBe(0);
            expect(randomGenerator.calledWith).toEqual({seed: undefined, overrides: undefined});
            expect(writeFile.mock.calls[0][0]).toBe("./blazing-riches-4821.blueprint.json");

            const written = JSON.parse((writeFile.mock.calls[0] as [string, string])[1]) as GameBlueprint;
            expect(written.symbolWeights).toBeUndefined();
            expect(written.reelStripGeneration).toHaveLength(5);
            for (const entry of written.reelStripGeneration ?? []) {
                expect(entry).toMatchObject({type: "generated", symbolWeights: randomBlueprint.symbolWeights});
            }

            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain('Generated random game "Blazing Riches" (id: "blazing-riches-4821") from seed 20260721');
            expect(printed).toContain('Provenance: generator 1.0.0, strategy "default-line-pay".');
            expect(printed).toContain('created at "./blazing-riches-4821.blueprint.json"');
        });

        it("leaves a blueprint that already has reelStrips or reelStripGeneration untouched", async () => {
            const withStrips: GameBlueprint = {...randomBlueprint, reelStrips: [["A", "K"]]};
            Reflect.deleteProperty(withStrips, "symbolWeights");
            const {command, writeFile} = createRandomCommand(
                undefined,
                undefined,
                undefined,
                createStubRandomBlueprintGenerator({...randomResult, blueprint: withStrips}),
            );

            await command.run(["--random"]);

            const written = JSON.parse((writeFile.mock.calls[0] as [string, string])[1]) as GameBlueprint;
            expect(written.reelStrips).toEqual([["A", "K"]]);
            expect(written.reelStripGeneration).toBeUndefined();
        });

        it("forwards a given name as both the manifest name override and the default file basename", async () => {
            const {command, randomGenerator, writeFile} = createRandomCommand();

            await command.run(["my-game", "--random"]);

            expect(randomGenerator.calledWith).toEqual({seed: undefined, overrides: {name: "my-game"}});
            expect(writeFile.mock.calls[0][0]).toBe("./blazing-riches-4821.blueprint.json");
        });

        it("forwards --seed to the random blueprint generator", async () => {
            const {command, randomGenerator} = createRandomCommand();

            await command.run(["--random", "--seed", "42"]);

            expect(randomGenerator.calledWith).toEqual({seed: 42, overrides: undefined});
        });

        it("throws a descriptive error for a non-integer --seed", async () => {
            const {command} = createRandomCommand();

            await expect(command.run(["--random", "--seed", "abc"])).rejects.toThrow(/--seed requires an integer value/);
        });

        it("writes to the given --out path instead of the default", async () => {
            const {command, writeFile} = createRandomCommand();

            await command.run(["--random", "--out", "custom/random-game.blueprint.json"]);

            expect(writeFile.mock.calls[0][0]).toBe("custom/random-game.blueprint.json");
        });

        it("throws a descriptive error when --out is given no value", async () => {
            const {command} = createRandomCommand();

            await expect(command.run(["--random", "--out"])).rejects.toThrow(/--out requires a file path/);
        });

        it("reports validation errors and returns 1 without writing a file", async () => {
            const issues: ValidationIssue[] = [{code: "blueprint-reels-invalid", severity: "error", message: "bad reels"}];
            const {command, writeFile} = createRandomCommand(undefined, undefined, createStubValidator(issues));

            const exitCode = await command.run(["--random"]);

            expect(exitCode).toBe(1);
            expect(writeFile).not.toHaveBeenCalled();
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("1 error(s)"));
        });

        // --random routes through the exact same atomic, create-only commit --blank and the interactive
        // wizard's own confirmed save use (see writeBlueprintFileAtomically.ts) -- it never overwrites an
        // existing destination, surfacing a commit-time conflict as a thrown error the same way --blank's
        // own synchronous save does.
        it("throws a clear error instead of silently overwriting an existing file", async () => {
            const {command} = createRandomCommand(undefined, jest.fn().mockReturnValue(createConflictWriteResult()));

            await expect(command.run(["--random"])).rejects.toThrow(/"\.\/blazing-riches-4821\.blueprint\.json" already exists/);
        });

        it("throws a descriptive error for an unknown option", async () => {
            const {command} = createRandomCommand();

            await expect(command.run(["--random", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
        });

        it("throws a descriptive error for an unexpected extra positional argument", async () => {
            const {command} = createRandomCommand();

            await expect(command.run(["--random", "name-one", "name-two"])).rejects.toThrow(/Unexpected extra argument "name-two"/);
        });

        it("uses the default random blueprint generator, not the variant one, when --preset is omitted", async () => {
            const {command, randomGenerator, variantRandomGenerator} = createRandomCommand();

            await command.run(["--random"]);

            expect(randomGenerator.calledWith).toEqual({seed: undefined, overrides: undefined});
            expect(variantRandomGenerator.calledWith).toBeUndefined();
        });

        it('forwards "--preset variant" to the variant random blueprint generator instead of the default one', async () => {
            const {command, randomGenerator, variantRandomGenerator} = createRandomCommand();

            const exitCode = await command.run(["--random", "--seed", "42", "--preset", "variant"]);

            expect(exitCode).toBe(0);
            expect(variantRandomGenerator.calledWith).toEqual({seed: 42, overrides: undefined});
            expect(randomGenerator.calledWith).toBeUndefined();
        });

        it("throws a descriptive error for an invalid --preset value", async () => {
            const {command} = createRandomCommand();

            await expect(command.run(["--random", "--preset", "bogus"])).rejects.toThrow(/--preset must be one of: default, variant/);
        });
    });
});
