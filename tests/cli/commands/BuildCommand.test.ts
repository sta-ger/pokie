import {
    computeGameBlueprintHash,
    GameBlueprint,
    GameBlueprintValidating,
    GameBuildInfoReelStripGeneration,
    GamePackageGenerating,
    GeneratedGamePackage,
    PokieProject,
    PROJECT_TYPE_CAPABILITIES,
    ProjectResolving,
    RandomGameBlueprintGenerating,
    RandomGameBlueprintRequest,
    RandomGameBlueprintResult,
    ValidationIssue,
} from "pokie";
import {BuildCommand} from "../../../cli/commands/BuildCommand.js";
import {SmokeSimulationOutcome} from "../../../cli/build/runSmokeSimulation.js";

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

function createStubGenerator(
    result: GeneratedGamePackage,
): GamePackageGenerating & {
    calledWith?: {
        blueprint: GameBlueprint;
        cwd: string;
        outDir?: string;
        reelStripGeneration?: GameBuildInfoReelStripGeneration;
    };
} {
    return {
        generate(blueprint: GameBlueprint, cwd: string, outDir?: string, reelStripGeneration?: GameBuildInfoReelStripGeneration) {
            this.calledWith = {blueprint, cwd, outDir, reelStripGeneration};
            return result;
        },
    };
}

const rawBlueprint = {manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}};
const fullBlueprint: GameBlueprint = {
    manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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
const generatedResult: GeneratedGamePackage = {
    projectRoot: "/tmp/sample-slot",
    manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
    createdFiles: ["package.json", "dist/index.js"],
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

    // The interactive wizard used to live here (run with no args at all) -- it now lives on "pokie
    // create" instead (see CreateCommand), so "pokie build" with no args is simply a missing
    // <config.json> the same way any other missing required argument is.
    it("reports the usage error, same as any other missing <config.json>, when run with no args at all", async () => {
        const command = new BuildCommand("1.3.0", () => rawBlueprint, createStubValidator([]), createStubGenerator(generatedResult));

        await expect(command.run([])).rejects.toThrow(/Usage: pokie build <config\.json>/);
    });

    it("throws a descriptive error for an unknown option", async () => {
        const command = new BuildCommand("1.3.0", () => rawBlueprint, createStubValidator([]), createStubGenerator(generatedResult));

        await expect(command.run(["config.json", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("throws a descriptive error when --target is given no value", async () => {
        const command = new BuildCommand("1.3.0", () => rawBlueprint, createStubValidator([]), createStubGenerator(generatedResult));

        await expect(command.run(["config.json", "--target"])).rejects.toThrow(/--target requires a directory path/);
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

    it("generates the package using the cwd and forwards --target", async () => {
        const generator = createStubGenerator(generatedResult);
        const command = new BuildCommand("1.3.0", () => rawBlueprint, createStubValidator([]), generator);

        await command.run(["config.json", "--target", "somewhere"]);

        expect(generator.calledWith).toEqual({
            blueprint: rawBlueprint,
            cwd: process.cwd(),
            outDir: "somewhere",
        });
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
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("dist/index.js"));
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('built in "/tmp/sample-slot"'));
    });

    it("prints a build summary with package root, game id/name/version, and blueprint hash", async () => {
        const command = new BuildCommand("1.3.0", () => rawBlueprint, createStubValidator([]), createStubGenerator(generatedResult));

        await command.run(["config.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("Build summary:");
        expect(printed).toContain("package root     /tmp/sample-slot");
        expect(printed).toContain('game             Sample Slot (id: "sample-slot", v0.1.0)');
        expect(printed).toContain(`blueprint hash   ${computeGameBlueprintHash(rawBlueprint)}`);
    });

    it("prints the source path in the build summary when built from a config file path", async () => {
        const command = new BuildCommand("1.3.0", () => rawBlueprint, createStubValidator([]), createStubGenerator(generatedResult));

        await command.run(["config.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("source           config.json");
    });

    it("omits the source line from the build summary when built with no source path (the random flow)", async () => {
        const randomBlueprint: GameBlueprint = {
            manifest: {id: "no-source-slot", name: "No Source Slot", version: "0.1.0"},
            reels: 3,
            rows: 3,
            symbols: ["A", "B"],
            paytable: {A: {3: 5}},
        };
        const randomGenerator = createStubRandomBlueprintGenerator({
            blueprint: randomBlueprint,
            seed: 1,
            provenance: {generatorVersion: "1.0.0", strategy: "default-line-pay", seed: 1},
        });
        const command = new BuildCommand(
            "1.3.0",
            () => rawBlueprint,
            createStubValidator([]),
            createStubGenerator(generatedResult),
            randomGenerator,
            jest.fn().mockResolvedValue({ok: true, rounds: 1, roundsRequested: 1, rtp: 1, hitFrequency: 1, maxWin: 1, averageBet: 1}),
        );

        await command.run(["random"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).not.toContain("source           ");
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
        expect(printed).toContain('game             Sample Slot (id: "sample-slot", v0.1.0)');
        expect(printed).toContain("reels x rows     5 x 3");
        expect(printed).toContain("symbols          4");
        expect(printed).toContain("paylines         2");
        expect(printed).toContain("bets             1, 2, 5");
        expect(printed).toContain("blueprint hash   sha256:");
        expect(printed).toContain("would generate   README.md, dist/index.js, package-lock.json, package.json, src/index.ts, tsconfig.json");
    });

    it("--dry-run reports default paylines/bets when the blueprint omits them", async () => {
        const minimalBlueprint: GameBlueprint = {
            manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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
        expect(printed).toContain("pokie inspect /tmp/sample-slot");
        expect(printed).toContain("pokie validate /tmp/sample-slot");
        expect(printed).toContain("pokie sim /tmp/sample-slot");
        expect(printed).toContain("pokie report sim.json");
        expect(printed).toContain("pokie replay /tmp/sample-slot");
        expect(printed).toContain("pokie dev /tmp/sample-slot");
    });

    describe("reelStripGeneration", () => {
        const blueprintWithGeneration: GameBlueprint = {
            manifest: {id: "generated-reels", name: "Generated Reels", version: "0.1.0"},
            reels: 2,
            rows: 3,
            symbols: ["A", "B"],
            paytable: {A: {3: 5}, B: {3: 2}},
            reelStripGeneration: [
                {type: "generated", length: 10, symbolCounts: {A: 6, B: 4}, seed: 1},
                {type: "literal", strip: ["A", "B"]},
            ],
        };

        it("resolves reelStripGeneration and forwards the AUTHORED blueprint (unmaterialized) + per-reel buildInfo to the generator", async () => {
            const validator = createStubValidator([]);
            const generator = createStubGenerator(generatedResult);
            const command = new BuildCommand("1.3.0", () => blueprintWithGeneration, validator, generator);

            const exitCode = await command.run(["config.json"]);

            expect(exitCode).toBe(0);
            const calledWith = generator.calledWith!;
            // The generator receives the blueprint exactly as authored -- materialization (and
            // reelStrips derivation) happens inside GamePackageGenerator itself, using
            // reelStripGeneration's per-reel results, not before this call.
            expect(calledWith.blueprint).toBe(blueprintWithGeneration);
            expect(calledWith.reelStripGeneration?.reels).toHaveLength(1); // only the 1 "generated" entry
            expect(calledWith.reelStripGeneration?.reels[0]).toMatchObject({reelIndex: 0, success: true});
            expect(calledWith.reelStripGeneration?.reels[0].strip).toHaveLength(10);
        });

        it("--dry-run does not call the generator, even with reelStripGeneration present", async () => {
            const generator = createStubGenerator(generatedResult);
            const command = new BuildCommand("1.3.0", () => blueprintWithGeneration, createStubValidator([]), generator);

            const exitCode = await command.run(["config.json", "--dry-run"]);

            expect(exitCode).toBe(0);
            expect(generator.calledWith).toBeUndefined();
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Dry run");
        });

        it("accepts a blueprint mixing literal and generated reels", async () => {
            const generator = createStubGenerator(generatedResult);
            const command = new BuildCommand("1.3.0", () => blueprintWithGeneration, createStubValidator([]), generator);

            const exitCode = await command.run(["config.json"]);

            expect(exitCode).toBe(0);
            expect(generator.calledWith).toBeDefined();
        });

        it("reports a clear per-reel failure and returns 1, without generating, when one reel's generation is unsatisfiable", async () => {
            const unsatisfiable: GameBlueprint = {
                ...blueprintWithGeneration,
                reelStripGeneration: [
                    {type: "literal", strip: ["A", "B"]},
                    {
                        type: "generated",
                        length: 4,
                        symbolCounts: {A: 2, B: 2},
                        seed: 5,
                        maxAttempts: 2,
                        constraints: [{type: "maximumCircularDistance", maximumDistance: 1, symbolIds: ["A"]}],
                    },
                ],
            };
            const generator = createStubGenerator(generatedResult);
            const command = new BuildCommand("1.3.0", () => unsatisfiable, createStubValidator([]), generator);

            const exitCode = await command.run(["config.json"]);

            expect(exitCode).toBe(1);
            expect(generator.calledWith).toBeUndefined();
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("could not generate its reel strips"));
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("reel 1"));
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("maximum-circular-distance"));
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("docs/cli.md#pokie-build-configjson"));
        });
    });

    describe("random", () => {
        const randomBlueprint: GameBlueprint = {
            manifest: {id: "blazing-riches-4821", name: "Blazing Riches", version: "0.1.0"},
            reels: 5,
            rows: 3,
            symbols: ["A", "K", "Q", "J", "10"],
            paytable: {A: {3: 5, 4: 10, 5: 15}, K: {3: 4, 4: 8, 5: 12}, Q: {3: 3, 4: 6, 5: 9}, J: {3: 2, 4: 4, 5: 6}, "10": {3: 1, 4: 2, 5: 3}},
            symbolWeights: {A: 1, K: 2, Q: 3, J: 4, "10": 5},
            availableBets: [1, 2, 5, 10],
        };
        const randomResult: RandomGameBlueprintResult = {
            blueprint: randomBlueprint,
            seed: 20260721,
            provenance: {generatorVersion: "1.0.0", strategy: "default-line-pay", seed: 20260721},
        };
        const okSmoke: SmokeSimulationOutcome = {
            ok: true,
            rounds: 200,
            roundsRequested: 200,
            rtp: 0.965,
            hitFrequency: 0.31,
            maxWin: 50,
            averageBet: 5,
        };

        function createCommand(
            randomGenerator = createStubRandomBlueprintGenerator(randomResult),
            runSmoke: jest.Mock = jest.fn().mockResolvedValue(okSmoke),
            generator = createStubGenerator(generatedResult),
            variantRandomGenerator = createStubRandomBlueprintGenerator({
                ...randomResult,
                provenance: {...randomResult.provenance, strategy: "random-variant"},
            }),
        ) {
            const command = new BuildCommand(
                "1.3.0",
                () => rawBlueprint,
                createStubValidator([]),
                generator,
                randomGenerator,
                runSmoke,
                variantRandomGenerator,
            );
            return {command, randomGenerator, runSmoke, generator, variantRandomGenerator};
        }

        it.each([["random"], ["--random"]])('generates, builds, and smoke-simulates a random game via "pokie build %s"', async (flag) => {
            const {command, randomGenerator, generator, runSmoke} = createCommand();

            const exitCode = await command.run([flag]);

            expect(exitCode).toBe(0);
            expect(randomGenerator.calledWith).toEqual({seed: undefined});
            expect(generator.calledWith?.blueprint).toBe(randomBlueprint);
            expect(runSmoke).toHaveBeenCalledWith(generatedResult.projectRoot, 20260721);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain('Generated random game "Blazing Riches" (id: "blazing-riches-4821") from seed 20260721');
            expect(printed).toContain("Reproduce this exact game with: pokie build random --seed 20260721");
            expect(printed).toContain('Provenance: generator 1.0.0, strategy "default-line-pay".');
            expect(printed).toContain("Smoke simulation OK: 200 rounds, RTP 96.50%, hit frequency 31.00%.");
        });

        it("prints the variant strategy's provenance when --preset variant is used", async () => {
            const {command} = createCommand();

            await command.run(["random", "--preset", "variant"]);

            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain('Provenance: generator 1.0.0, strategy "random-variant".');
        });

        it("prints a feature-termination warning when the smoke simulation stops before its requested round budget", async () => {
            const {command} = createCommand(undefined, jest.fn().mockResolvedValue({...okSmoke, rounds: 150}));

            await command.run(["random"]);

            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("warning  feature termination: only 150/200 smoke-simulation rounds completed");
        });

        it("prints a max-win sanity warning when the observed max win isn't a finite, non-negative amount", async () => {
            const {command} = createCommand(undefined, jest.fn().mockResolvedValue({...okSmoke, maxWin: NaN}));

            await command.run(["random"]);

            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("warning  max-win sanity: observed max win (NaN) is not a finite, non-negative amount.");
        });

        it("prints no quality-gate warnings for a clean smoke simulation", async () => {
            const {command} = createCommand();

            await command.run(["random"]);

            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).not.toContain("warning  feature termination");
            expect(printed).not.toContain("warning  max-win sanity");
        });

        it("forwards --seed to the random blueprint generator", async () => {
            const {command, randomGenerator} = createCommand();

            await command.run(["random", "--seed", "42"]);

            expect(randomGenerator.calledWith).toEqual({seed: 42});
        });

        it("throws a descriptive error for a non-integer --seed", async () => {
            const {command} = createCommand();

            await expect(command.run(["random", "--seed", "abc"])).rejects.toThrow(/--seed requires an integer value/);
        });

        it("forwards --target to the package generator", async () => {
            const {command, generator} = createCommand();

            await command.run(["random", "--target", "somewhere"]);

            expect(generator.calledWith).toMatchObject({outDir: "somewhere"});
        });

        it("--dry-run skips both the package generator and the smoke simulation", async () => {
            const {command, generator, runSmoke} = createCommand();

            const exitCode = await command.run(["random", "--dry-run"]);

            expect(exitCode).toBe(0);
            expect(generator.calledWith).toBeUndefined();
            expect(runSmoke).not.toHaveBeenCalled();
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Dry run");
        });

        it("returns 1 and reports the error when the smoke simulation fails", async () => {
            const {command} = createCommand(undefined, jest.fn().mockResolvedValue({ok: false, error: "boom"}));

            const exitCode = await command.run(["random"]);

            expect(exitCode).toBe(1);
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Smoke simulation failed: boom"));
        });

        it("throws a descriptive error for an unknown option", async () => {
            const {command} = createCommand();

            await expect(command.run(["random", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
        });

        it('uses the default random blueprint generator, not the variant one, when --preset is omitted', async () => {
            const {command, randomGenerator, variantRandomGenerator} = createCommand();

            await command.run(["random"]);

            expect(randomGenerator.calledWith).toEqual({seed: undefined});
            expect(variantRandomGenerator.calledWith).toBeUndefined();
        });

        it('forwards "--preset variant" to the variant random blueprint generator instead of the default one', async () => {
            const {command, randomGenerator, variantRandomGenerator, generator} = createCommand();

            const exitCode = await command.run(["random", "--seed", "42", "--preset", "variant"]);

            expect(exitCode).toBe(0);
            expect(variantRandomGenerator.calledWith).toEqual({seed: 42});
            expect(randomGenerator.calledWith).toBeUndefined();
            expect(generator.calledWith?.blueprint).toBe(randomBlueprint);
        });

        it('accepts "--preset default" explicitly', async () => {
            const {command, randomGenerator, variantRandomGenerator} = createCommand();

            await command.run(["random", "--preset", "default"]);

            expect(randomGenerator.calledWith).toEqual({seed: undefined});
            expect(variantRandomGenerator.calledWith).toBeUndefined();
        });

        it("throws a descriptive error for an invalid --preset value", async () => {
            const {command} = createCommand();

            await expect(command.run(["random", "--preset", "bogus"])).rejects.toThrow(/--preset must be one of: default, variant/);
        });

        it("throws a descriptive error when --preset is given no value", async () => {
            const {command} = createCommand();

            await expect(command.run(["random", "--preset"])).rejects.toThrow(/--preset must be one of: default, variant/);
        });
    });
});

// Proves the default "<config.json>" path resolves its target via ProjectResolving (see
// BuildCommand's own resolveProject field comment) before ever reaching this.loadBlueprint -- a
// recognized-but-wrong-type target reports a capability diagnostic instead of a confusing raw
// JSON/schema error, while an unresolved path is completely unaffected.
describe("BuildCommand resolved-project boundary", () => {
    function stubProjectResolver(project: PokieProject | undefined): ProjectResolving & {calls: string[]} {
        const calls: string[] = [];
        return {
            calls,
            resolve(targetPath: string) {
                calls.push(targetPath);
                return Promise.resolve(project);
            },
        };
    }

    it('reports a capability diagnostic, without ever calling loadBlueprint, for a resolved non-"blueprint" target', async () => {
        const loadBlueprint = jest.fn(() => rawBlueprint);
        const project = {
            type: "tsPackage",
            rootPath: "/some/existing/package",
            capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage,
            provenance: "test fixture",
        } as PokieProject;
        const resolveProject = stubProjectResolver(project);
        const command = new BuildCommand(
            "1.3.0",
            loadBlueprint,
            createStubValidator([]),
            createStubGenerator(generatedResult),
            undefined,
            undefined,
            undefined,
            resolveProject,
        );
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);

        await expect(command.run(["/some/existing/package"])).rejects.toThrow(
            /"build" is not supported for a "tsPackage" project \(missing the "blueprint\.build" capability\)/,
        );

        expect(resolveProject.calls).toEqual(["/some/existing/package"]);
        expect(loadBlueprint).not.toHaveBeenCalled();

        (console.log as jest.Mock).mockRestore();
        (console.error as jest.Mock).mockRestore();
    });

    it("still reaches loadBlueprint unchanged for a path ProjectResolving doesn't recognize", async () => {
        const loadBlueprint = jest.fn(() => rawBlueprint);
        const resolveProject = stubProjectResolver(undefined);
        const generator = createStubGenerator(generatedResult);
        const command = new BuildCommand(
            "1.3.0",
            loadBlueprint,
            createStubValidator([]),
            generator,
            undefined,
            undefined,
            undefined,
            resolveProject,
        );
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["config.json"]);

        expect(exitCode).toBe(0);
        expect(resolveProject.calls).toEqual(["config.json"]);
        expect(loadBlueprint).toHaveBeenCalledWith("config.json");

        (console.log as jest.Mock).mockRestore();
    });
});
