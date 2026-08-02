import fs from "fs";
import {
    buildGameBuildInfo,
    computeGameBlueprintHash,
    GameBlueprint,
    GameBlueprintValidating,
    GameBlueprintValidator,
    GamePackageGenerating,
    GamePackageGenerator,
    loadGameBlueprint,
    RandomGameBlueprintGenerating,
    RandomGameBlueprintGenerator,
    RandomGameBlueprintVariantStrategy,
    resolveReelStripGeneration,
    SlotGameNameGenerator,
} from "pokie";
import {createStarterGameBlueprint} from "../build/createStarterGameBlueprint.js";
import {evaluateRandomBuildQualityGates} from "../build/evaluateRandomBuildQualityGates.js";
import {runSmokeSimulation, SmokeSimulationOutcome} from "../build/runSmokeSimulation.js";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";

type RandomPreset = "default" | "variant";

type RandomBuildOptions = {
    seed?: number;
    outDir?: string;
    dryRun: boolean;
    preset: RandomPreset;
};

const USAGE = "Usage: pokie build <config.json> [--out <dir>] [--dry-run]";
const BLUEPRINT_HINT =
    "<config.json> is a GameBlueprint (manifest, reels, rows, symbols, paytable, ...) — see docs/cli.md#pokie-build-configjson for the format.";
const INIT_BLUEPRINT_USAGE = "Usage: pokie build --init-blueprint <file>";
const RANDOM_USAGE = "Usage: pokie build random [--seed <integer>] [--out <dir>] [--dry-run] [--preset default|variant]";
const RANDOM_PRESETS: readonly RandomPreset[] = ["default", "variant"];

export class BuildCommand implements CliCommandHandling {
    private readonly pokieVersion: string;
    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly validator: GameBlueprintValidating;
    private readonly generator: GamePackageGenerating;
    private readonly createStarterBlueprint: () => GameBlueprint;
    private readonly fileExists: (filePath: string) => boolean;
    private readonly writeFile: (filePath: string, contents: string) => void;
    private readonly randomBlueprintGenerator: RandomGameBlueprintGenerating;
    private readonly variantRandomBlueprintGenerator: RandomGameBlueprintGenerating;
    private readonly runSmokeSimulation: (projectRoot: string, seed: number) => Promise<SmokeSimulationOutcome>;

    constructor(
        pokieVersion: string,
        loadBlueprint: (filePath: string) => unknown = loadGameBlueprint,
        validator: GameBlueprintValidating = new GameBlueprintValidator(),
        generator: GamePackageGenerating = new GamePackageGenerator(pokieVersion),
        createStarterBlueprint: () => GameBlueprint = createStarterGameBlueprint,
        fileExists: (filePath: string) => boolean = (filePath) => fs.existsSync(filePath),
        writeFile: (filePath: string, contents: string) => void = (filePath, contents) => fs.writeFileSync(filePath, contents, "utf-8"),
        randomBlueprintGenerator: RandomGameBlueprintGenerating = new RandomGameBlueprintGenerator(),
        runSmoke: (projectRoot: string, seed: number) => Promise<SmokeSimulationOutcome> = runSmokeSimulation,
        variantRandomBlueprintGenerator: RandomGameBlueprintGenerating = new RandomGameBlueprintGenerator(
            new SlotGameNameGenerator(),
            new RandomGameBlueprintVariantStrategy(),
        ),
    ) {
        this.pokieVersion = pokieVersion;
        this.loadBlueprint = loadBlueprint;
        this.validator = validator;
        this.generator = generator;
        this.createStarterBlueprint = createStarterBlueprint;
        this.fileExists = fileExists;
        this.writeFile = writeFile;
        this.randomBlueprintGenerator = randomBlueprintGenerator;
        this.runSmokeSimulation = runSmoke;
        this.variantRandomBlueprintGenerator = variantRandomBlueprintGenerator;
    }

    public getName(): string {
        return "build";
    }

    public getDescription(): string {
        return (
            "Generate a POKIE game package from a GameBlueprint JSON config (reels, symbols, paylines, paytable), " +
            "or write an editable starter blueprint via --init-blueprint <file> (for interactive, wizard-driven " +
            'creation instead, see "pokie init"). "random"/--random generates a first-class random game instead ' +
            "(--seed to reproduce it, --preset default|variant to pick the generation strategy). --dry-run " +
            "validates and previews without writing anything."
        );
    }

    // "--init-blueprint <file>" and "random"/"--random" are both flag-like verb selectors rather than
    // ordinary positional command names, so Commander (whose subcommand matching only recognizes
    // non-"-"-prefixed tokens, and has no concept of a second spelling for the same subcommand) can't
    // itself pick between them; this is the same kind of pre-Commander routing cli/dispatch.ts's own
    // resolveCliInvocation() already does one level up to pick a command by name. Once a verb is
    // selected, its own args/options/aliases are declared and validated by Commander alone — see
    // runInitBlueprint/runRandom/runDefault, none of which hand-parses a flag or coerces a value.
    public run(args: string[]): Promise<number> {
        try {
            if (args[0] === "--init-blueprint") {
                return Promise.resolve(this.runInitBlueprint(args.slice(1)));
            }

            if (args[0] === "random" || args[0] === "--random") {
                return this.runRandom(args.slice(1));
            }

            return this.runDefault(args);
        } catch (error) {
            return Promise.reject(error);
        }
    }

    // Writes a small-but-complete, hand-editable GameBlueprint JSON template to `<file>` — no wizard
    // prompts, no GamePackageGenerator call, nothing else touched. Point "pokie build <file> --out
    // <dir>" at the edited result once it looks right; see createStarterGameBlueprint.ts for what the
    // template contains and why it's guaranteed to pass GameBlueprintValidator as-is.
    private runInitBlueprint(rest: string[]): number {
        let exitCode = 0;
        const command = createCommanderCliCommand("build --init-blueprint")
            .argument("<file>")
            .argument("[excess...]")
            .action((file: string, excess: string[]) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${INIT_BLUEPRINT_USAGE}`);
                }
                if (this.fileExists(file)) {
                    throw new Error(`"${file}" already exists. Choose a different path, or remove/edit the existing file first.`);
                }

                const blueprint = this.createStarterBlueprint();
                this.writeFile(file, `${JSON.stringify(blueprint, null, 4)}\n`);

                console.log(`Created starter blueprint "${file}".`);
                console.log(`\nEdit it by hand, then run:`);
                console.log(`  pokie build ${file} --dry-run`);
                console.log(`  pokie build ${file} --out <dir>`);
                exitCode = 0;
            });

        try {
            command.parse(rest, {from: "user"});
        } catch (error) {
            throw translateCommanderError(error, {
                missingArgument: INIT_BLUEPRINT_USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${INIT_BLUEPRINT_USAGE}`,
            });
        }
        return exitCode;
    }

    private runDefault(args: string[]): Promise<number> {
        let exitCode = 0;
        const command = createCommanderCliCommand("build")
            .argument("<configPath>")
            .argument("[excess...]")
            .option("--out <dir>")
            .option("--dry-run")
            .action(async (configPath: string, excess: string[], options: {out?: string; dryRun?: boolean}) => {
                // An empty-string positional ("pokie build ''") is present as far as Commander's own
                // required-argument check is concerned, but the pre-Commander behavior this preserves
                // treated it the same as an entirely missing one (`!configPath`) -- a truly empty argv
                // ("pokie build" with no args at all) is Commander's own "commander.missingArgument",
                // caught below and reported the same way.
                if (!configPath || excess.length > 0) {
                    throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : `${USAGE}\n${BLUEPRINT_HINT}`);
                }
                const blueprint = this.loadBlueprint(configPath);
                exitCode = await this.buildFromBlueprint(blueprint, options.out, configPath, options.dryRun ?? false);
            });

        return command
            .parseAsync(args, {from: "user"})
            .then(() => exitCode)
            .catch((error: unknown) => {
                throw translateCommanderError(error, {
                    missingArgument: `${USAGE}\n${BLUEPRINT_HINT}`,
                    unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                    optionMissingArgument: (flag) => (flag === "--out" ? `--out requires a directory path. ${USAGE}` : `Unknown option "${flag}". ${USAGE}`),
                });
            });
    }

    // "random"/"--random": generates a fresh, always-valid GameBlueprint (see
    // RandomGameBlueprintGenerator's own doc comment for why it's guaranteed to pass validation) and
    // runs it through the exact same validate/resolve/generate pipeline as a real <config.json> --
    // "randomSeed" passed to buildFromBlueprint below is what additionally triggers the post-build
    // smoke simulation, which a hand-authored blueprint build never runs. "--preset" only selects which
    // already-registered RandomGameBlueprintStrategy generates the mechanics (default-line-pay vs the
    // richer random-variant from RandomGameBlueprintVariantStrategy) -- same seed, same preset always
    // reproduces the same blueprint (see RandomGameBlueprintGenerator.generate).
    private runRandom(args: string[]): Promise<number> {
        let exitCode = 0;
        const command = createCommanderCliCommand("build random")
            .argument("[excess...]")
            .option("--seed <integer>", "reproduce a specific random game", (value: string) => {
                if (!Number.isInteger(Number(value))) {
                    throw new Error(`--seed requires an integer value. ${RANDOM_USAGE}`);
                }
                return Number(value);
            })
            .option("--out <dir>")
            .option("--dry-run")
            .option(
                "--preset <preset>",
                "which generation strategy to use",
                (value: string) => {
                    if (!RANDOM_PRESETS.includes(value as RandomPreset)) {
                        throw new Error(`--preset must be one of: ${RANDOM_PRESETS.join(", ")}. ${RANDOM_USAGE}`);
                    }
                    return value as RandomPreset;
                },
                "default" as RandomPreset,
            )
            .action(async (excess: string[], options: {seed?: number; out?: string; dryRun?: boolean; preset: RandomPreset}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${RANDOM_USAGE}`);
                }
                exitCode = await this.executeRandom({seed: options.seed, outDir: options.out, dryRun: options.dryRun ?? false, preset: options.preset});
            });

        return command
            .parseAsync(args, {from: "user"})
            .then(() => exitCode)
            .catch((error: unknown) => {
                throw translateCommanderError(error, {
                    unknownOption: (flag) => `Unknown option "${flag}". ${RANDOM_USAGE}`,
                    optionMissingArgument: (flag) => {
                        if (flag === "--seed") return `--seed requires an integer value. ${RANDOM_USAGE}`;
                        if (flag === "--out") return `--out requires a directory path. ${RANDOM_USAGE}`;
                        if (flag === "--preset") return `--preset must be one of: ${RANDOM_PRESETS.join(", ")}. ${RANDOM_USAGE}`;
                        return `Unknown option "${flag}". ${RANDOM_USAGE}`;
                    },
                });
            });
    }

    // "random"/"--random": generates a fresh, always-valid GameBlueprint (see
    // RandomGameBlueprintGenerator's own doc comment for why it's guaranteed to pass validation) and
    // runs it through the exact same validate/resolve/generate pipeline as a real <config.json> --
    // "randomSeed" passed to buildFromBlueprint below is what additionally triggers the post-build
    // smoke simulation, which a hand-authored blueprint build never runs. "--preset" only selects which
    // already-registered RandomGameBlueprintStrategy generates the mechanics (default-line-pay vs the
    // richer random-variant from RandomGameBlueprintVariantStrategy) -- same seed, same preset always
    // reproduces the same blueprint (see RandomGameBlueprintGenerator.generate).
    private executeRandom(options: RandomBuildOptions): Promise<number> {
        const generator = options.preset === "variant" ? this.variantRandomBlueprintGenerator : this.randomBlueprintGenerator;
        const {blueprint, seed, provenance} = generator.generate({seed: options.seed});

        console.log(`Generated random game "${blueprint.manifest.name}" (id: "${blueprint.manifest.id}") from seed ${seed}.`);
        console.log(`Reproduce this exact game with: pokie build random --seed ${seed} --preset ${options.preset}`);
        console.log(`Provenance: generator ${provenance.generatorVersion}, strategy "${provenance.strategy}".`);

        return this.buildFromBlueprint(blueprint, options.outDir, undefined, options.dryRun, seed);
    }

    private async buildFromBlueprint(
        blueprint: unknown,
        outDir: string | undefined,
        sourcePath: string | undefined,
        dryRun: boolean,
        randomSeed?: number,
    ): Promise<number> {
        const issues = this.validator.validate(blueprint);
        const errors = issues.filter((issue) => issue.severity === "error");
        const warnings = issues.filter((issue) => issue.severity !== "error");

        for (const issue of warnings) {
            console.log(`  warning  ${issue.code}: ${issue.message}`);
        }

        if (errors.length > 0) {
            console.error(`Blueprint${sourcePath ? ` "${sourcePath}"` : ""} has ${errors.length} error(s):`);
            for (const issue of errors) {
                console.error(`  - ${issue.code}: ${issue.message}`);
            }
            console.error(`\n${BLUEPRINT_HINT}`);
            return 1;
        }

        // Runs every "generated" reel of reelStripGeneration (if the blueprint has one) through the
        // real ReelStripGenerator — validate() above only checked its shape, not whether each reel's
        // constraints are satisfiable. A literal-reelStrips (or neither) blueprint is unaffected.
        const resolution = resolveReelStripGeneration(blueprint as GameBlueprint);
        if (!resolution.success) {
            console.error(`Blueprint${sourcePath ? ` "${sourcePath}"` : ""} could not generate its reel strips:`);
            for (const reel of resolution.reels.filter((candidate) => !candidate.success)) {
                console.error(`  - reel ${reel.reelIndex} (seed ${reel.seed}): failed after ${reel.attemptsUsed} attempt(s)`);
                const lastDiagnostic = reel.diagnostics[reel.diagnostics.length - 1];
                for (const violation of lastDiagnostic?.violations ?? []) {
                    console.error(`      ${violation.constraintId}: ${violation.message}`);
                }
            }
            console.error(`\n${BLUEPRINT_HINT}`);
            return 1;
        }

        if (dryRun) {
            this.printDryRunSummary(blueprint as GameBlueprint, sourcePath);
            return 0;
        }

        const result = this.generator.generate(blueprint as GameBlueprint, process.cwd(), outDir, resolution.reelStripGeneration);

        // Computed purely for this console summary — never persisted into the built package itself
        // (see GamePackageGenerator's own doc comment for why a built package tracks nothing about
        // where it came from).
        const blueprintHash = computeGameBlueprintHash(blueprint);

        console.log("Build summary:");
        for (const file of result.createdFiles) {
            console.log(`  created          ${file}`);
        }
        console.log(`  package root     ${result.projectRoot}`);
        console.log(`  game             ${result.manifest.name} (id: "${result.manifest.id}", v${result.manifest.version})`);
        console.log(`  blueprint hash   ${blueprintHash}`);
        if (sourcePath) {
            console.log(`  source           ${sourcePath}`);
        }

        if (randomSeed !== undefined) {
            console.log("\nRunning a short smoke simulation...");
            const smoke = await this.runSmokeSimulation(result.projectRoot, randomSeed);
            if (!smoke.ok) {
                console.error(`Smoke simulation failed: ${smoke.error}`);
                return 1;
            }
            console.log(
                `Smoke simulation OK: ${smoke.rounds} rounds, RTP ${(smoke.rtp * 100).toFixed(2)}%, hit frequency ${(smoke.hitFrequency * 100).toFixed(2)}%.`,
            );
            for (const warning of evaluateRandomBuildQualityGates(smoke)) {
                console.log(`  warning  ${warning}`);
            }
        }

        console.log(`\nGame package "${result.manifest.name}" (id: "${result.manifest.id}") built in "${result.projectRoot}".`);
        console.log(`\nNext:`);
        console.log(`  cd ${result.projectRoot} && npm install`);
        console.log(`  pokie inspect ${result.projectRoot}`);
        console.log(`  pokie validate ${result.projectRoot}`);
        console.log(`  pokie sim ${result.projectRoot} --rounds 10000 --seed demo --out sim.json`);
        console.log(`  pokie report sim.json`);
        console.log(`  pokie replay ${result.projectRoot} --seed demo --round 1`);
        console.log(`  pokie dev ${result.projectRoot}`);

        return 0;
    }

    // Previews what "pokie build" would generate without touching the filesystem: same validation,
    // same blueprintHash computation (buildGameBuildInfo is a pure function — no file I/O), just no
    // GamePackageGenerator.generate() call, so there's no --out directory to reason about at all.
    private printDryRunSummary(blueprint: GameBlueprint, sourcePath: string | undefined): void {
        const buildInfo = buildGameBuildInfo(blueprint, this.pokieVersion, sourcePath);
        const paylines = blueprint.paylines ? String(blueprint.paylines.length) : "default (one horizontal line per row)";
        const bets = blueprint.availableBets ? blueprint.availableBets.join(", ") : "default";

        console.log("Dry run — blueprint is valid, no files written.\n");
        console.log("Blueprint summary:");
        console.log(`  game             ${blueprint.manifest.name} (id: "${blueprint.manifest.id}", v${blueprint.manifest.version})`);
        console.log(`  reels x rows     ${blueprint.reels} x ${blueprint.rows}`);
        console.log(`  symbols          ${blueprint.symbols.length}`);
        console.log(`  paylines         ${paylines}`);
        console.log(`  bets             ${bets}`);
        console.log(`  blueprint hash   ${buildInfo.blueprintHash}`);
        console.log(`  would generate   ${buildInfo.files!.join(", ")}`);
    }

}
