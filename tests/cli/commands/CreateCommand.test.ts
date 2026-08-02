import {GameBlueprint, GameBlueprintValidating, RandomGameBlueprintGenerating, RandomGameBlueprintRequest, RandomGameBlueprintResult, ValidationIssue} from "pokie";
import {CreateCommand} from "../../../cli/commands/CreateCommand.js";

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

function createCommand(
    fileExists: jest.Mock = jest.fn().mockReturnValue(false),
    writeFile: jest.Mock = jest.fn(),
    validator = createStubValidator([]),
    randomGenerator: RandomGameBlueprintGenerating | undefined = undefined,
    variantRandomGenerator: RandomGameBlueprintGenerating | undefined = undefined,
) {
    const command = new CreateCommand(
        "1.3.0",
        () => starterBlueprint,
        () => blankBlueprint,
        validator,
        randomGenerator,
        fileExists,
        writeFile,
        variantRandomGenerator,
    );
    return {command, fileExists, writeFile, validator};
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

    it("writes the starter blueprint to the default path derived from its own manifest id, with no name given", async () => {
        const {command, writeFile} = createCommand();

        const exitCode = await command.run([]);

        expect(exitCode).toBe(0);
        expect(writeFile).toHaveBeenCalledWith("./starter-slot.blueprint.json", `${JSON.stringify(starterBlueprint, null, 4)}\n`);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('created at "./starter-slot.blueprint.json"');
        expect(printed).toContain('pokie init');
    });

    it("overrides the manifest id/name from a given name, and writes to <name>.blueprint.json", async () => {
        const {command, writeFile} = createCommand();

        await command.run(["sample-slot"]);

        const written = JSON.parse((writeFile.mock.calls[0] as [string, string])[1]) as GameBlueprint;
        expect(writeFile.mock.calls[0][0]).toBe("./sample-slot.blueprint.json");
        expect(written.manifest).toEqual({id: "sample-slot", name: "Sample Slot", version: "0.1.0"});
    });

    it("writes the blank blueprint instead of the starter one when --blank is given", async () => {
        const {command, writeFile} = createCommand();

        await command.run(["--blank"]);

        expect(writeFile).toHaveBeenCalledWith("./blank-slot.blueprint.json", `${JSON.stringify(blankBlueprint, null, 4)}\n`);
    });

    it("writes to the given --out path instead of the default", async () => {
        const {command, writeFile} = createCommand();

        await command.run(["--out", "custom/my-game.blueprint.json"]);

        expect(writeFile.mock.calls[0][0]).toBe("custom/my-game.blueprint.json");
    });

    // The non-"--random" path resolves synchronously (see CreateCommand.run()'s own doc comment on why
    // it isn't declared async) -- same as the old "pokie create <name>" scaffold path this replaces, a
    // parse/validation failure throws straight out of run() rather than rejecting the returned promise.
    it("throws a clear error instead of silently overwriting an existing file", () => {
        const {command} = createCommand(jest.fn().mockReturnValue(true));

        expect(() => command.run([])).toThrow(/"\.\/starter-slot\.blueprint\.json" already exists/);
    });

    it("throws a descriptive error for an invalid name", () => {
        const {command} = createCommand();

        expect(() => command.run(["../escape"])).toThrow(/is not a valid project name/);
    });

    it("throws a descriptive error for an unknown option", () => {
        const {command} = createCommand();

        expect(() => command.run(["--bogus"])).toThrow(/Unknown option "--bogus"/);
    });

    it("throws a descriptive error for an unexpected extra positional argument", () => {
        const {command} = createCommand();

        expect(() => command.run(["name-one", "name-two"])).toThrow(/Unexpected extra argument "name-two"/);
    });

    it("throws a descriptive error when --out is given no value", () => {
        const {command} = createCommand();

        expect(() => command.run(["--out"])).toThrow(/--out requires a file path/);
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
            writeFile: jest.Mock = jest.fn(),
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
