import {
    GameBlueprint,
    GameBlueprintValidating,
    GamePackageGenerating,
    GeneratedGamePackage,
    PokieGameManifest,
    RandomGameBlueprint,
    RandomGameBlueprintGenerating,
    ValidationIssue,
} from "pokie";
import {SmokeSimulationOutcome} from "../../../cli/build/runSmokeSimulation.js";
import {CreateCommand} from "../../../cli/commands/CreateCommand.js";
import {GamePackageCreating} from "../../../cli/scaffold/GamePackageCreating.js";
import {ScaffoldResult} from "../../../cli/scaffold/ScaffoldResult.js";

function createStubCreator(result: ScaffoldResult): GamePackageCreating & {calledWith?: {parentDir: string; name: string}} {
    return {
        create(parentDir: string, name: string) {
            this.calledWith = {parentDir, name};
            return result;
        },
    };
}

function createStubRandomBlueprintGenerator(
    result: RandomGameBlueprint,
): RandomGameBlueprintGenerating & {calledWith?: {seed?: number; overrides?: {name?: string}}} {
    return {
        generate(seed?: number, overrides?: {name?: string}) {
            this.calledWith = {seed, overrides};
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

function createStubPackageGenerator(
    result: GeneratedGamePackage,
): GamePackageGenerating & {calledWith?: {blueprint: GameBlueprint; cwd: string; outDir?: string}} {
    return {
        generate(blueprint: GameBlueprint, cwd: string, outDir?: string) {
            this.calledWith = {blueprint, cwd, outDir};
            return result;
        },
    };
}

describe("CreateCommand", () => {
    const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

    it("has the expected name and description", () => {
        const command = new CreateCommand(
            "1.2.1",
            createStubCreator({projectRoot: "/tmp/crazy-fruits", manifest, createdFiles: [], updatedFiles: [], skippedFiles: []}),
        );

        expect(command.getName()).toBe("create");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without a project name", () => {
        const command = new CreateCommand("1.2.1", createStubCreator({projectRoot: "", manifest, createdFiles: [], updatedFiles: [], skippedFiles: []}));

        expect(() => command.run([])).toThrow(/Usage: pokie create <name>/);
    });

    it("creates the project under the current working directory using the given name", async () => {
        const projectRoot = `${process.cwd()}/crazy-fruits`;
        const stub = createStubCreator({
            projectRoot,
            manifest,
            createdFiles: ["package.json", "tsconfig.json", "src/index.ts", "src/CrazyFruitsGame.ts", "src/CrazyFruitsSession.ts"],
            updatedFiles: [],
            skippedFiles: [],
        });
        const command = new CreateCommand("1.2.1", stub);

        await expect(command.run(["crazy-fruits"])).resolves.toBeUndefined();
        expect(stub.calledWith).toEqual({parentDir: process.cwd(), name: "crazy-fruits"});
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
        const randomResult: RandomGameBlueprint = {blueprint: randomBlueprint, seed: 20260721};
        const generatedResult = {
            projectRoot: "/tmp/blazing-riches-4821",
            manifest: randomBlueprint.manifest,
            createdFiles: ["package.json", "src/generated/index.js"],
            buildInfo: {
                schemaVersion: 1,
                generatedBy: "pokie create --random",
                pokieVersion: "1.3.0",
                generatedAt: "2026-01-01T00:00:00.000Z",
                blueprintHash: "sha256:abc123",
                game: randomBlueprint.manifest,
            },
            unchanged: false,
        };
        const okSmoke: SmokeSimulationOutcome = {ok: true, rounds: 200, rtp: 0.965, hitFrequency: 0.31};

        function createCommand(
            randomGenerator = createStubRandomBlueprintGenerator(randomResult),
            validator = createStubValidator([]),
            packageGenerator = createStubPackageGenerator(generatedResult),
            runSmoke: jest.Mock = jest.fn().mockResolvedValue(okSmoke),
        ) {
            const command = new CreateCommand(
                "1.3.0",
                createStubCreator({projectRoot: "", manifest, createdFiles: [], updatedFiles: [], skippedFiles: []}),
                randomGenerator,
                validator,
                packageGenerator,
                runSmoke,
            );
            return {command, randomGenerator, validator, packageGenerator, runSmoke};
        }

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

        it("generates, validates, builds, and smoke-simulates a random game with no name given", async () => {
            const {command, randomGenerator, packageGenerator, runSmoke} = createCommand();

            const exitCode = await command.run(["--random"]);

            expect(exitCode).toBe(0);
            expect(randomGenerator.calledWith).toEqual({seed: undefined, overrides: undefined});
            expect(packageGenerator.calledWith).toEqual({blueprint: randomBlueprint, cwd: process.cwd(), outDir: undefined});
            expect(runSmoke).toHaveBeenCalledWith(generatedResult.projectRoot, 20260721);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain('Generated random game "Blazing Riches" (id: "blazing-riches-4821") from seed 20260721');
            expect(printed).toContain("Smoke simulation OK: 200 rounds, RTP 96.50%, hit frequency 31.00%.");
            expect(printed).toContain('created in "/tmp/blazing-riches-4821"');
        });

        it("forwards a given name as both the manifest name override and the output directory", async () => {
            const {command, randomGenerator, packageGenerator} = createCommand();

            await command.run(["my-game", "--random"]);

            expect(randomGenerator.calledWith).toEqual({seed: undefined, overrides: {name: "my-game"}});
            expect(packageGenerator.calledWith?.outDir).toBe("my-game");
        });

        it("forwards --seed to the random blueprint generator", async () => {
            const {command, randomGenerator} = createCommand();

            await command.run(["--random", "--seed", "42"]);

            expect(randomGenerator.calledWith).toEqual({seed: 42, overrides: undefined});
        });

        it("throws a descriptive error for a non-integer --seed", async () => {
            const {command} = createCommand();

            await expect(command.run(["--random", "--seed", "abc"])).rejects.toThrow(/--seed requires an integer value/);
        });

        it("reports validation errors and returns 1 without generating a package", async () => {
            const issues: ValidationIssue[] = [{code: "blueprint-reels-invalid", severity: "error", message: "bad reels"}];
            const {command, packageGenerator} = createCommand(undefined, createStubValidator(issues));

            const exitCode = await command.run(["--random"]);

            expect(exitCode).toBe(1);
            expect(packageGenerator.calledWith).toBeUndefined();
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("1 error(s)"));
        });

        it("returns 1 and reports the error when the smoke simulation fails", async () => {
            const {command} = createCommand(undefined, undefined, undefined, jest.fn().mockResolvedValue({ok: false, error: "boom"}));

            const exitCode = await command.run(["--random"]);

            expect(exitCode).toBe(1);
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Smoke simulation failed: boom"));
        });

        it("throws a descriptive error for an unknown option", async () => {
            const {command} = createCommand();

            await expect(command.run(["--random", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
        });

        it("throws a descriptive error for an unexpected extra positional argument", async () => {
            const {command} = createCommand();

            await expect(command.run(["--random", "name-one", "name-two"])).rejects.toThrow(/Unexpected extra argument "name-two"/);
        });
    });
});
