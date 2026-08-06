import {
    buildGameBuildInfo,
    BUILD_OPERATION,
    computeGameBlueprintHash,
    describeUnsupportedProjectOperation,
    GameBlueprint,
    GameBlueprintValidating,
    GameBlueprintValidator,
    GamePackageGenerating,
    GamePackageGenerator,
    loadGameBlueprint,
    ProjectResolving,
    ProjectTargetResolver,
    RandomGameBlueprintGenerating,
    RandomGameBlueprintGenerator,
    RandomGameBlueprintVariantStrategy,
    resolveReelStripGeneration,
    SlotGameNameGenerator,
} from "pokie";
import {Command} from "commander";
import {evaluateRandomBuildQualityGates} from "../build/evaluateRandomBuildQualityGates.js";
import {runSmokeSimulation, SmokeSimulationOutcome} from "../build/runSmokeSimulation.js";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {UnsupportedProjectOperationError} from "../materialize/UnsupportedProjectOperationError.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

type RandomPreset = "default" | "variant";

type RandomBuildOptions = {
    seed?: number;
    outDir?: string;
    dryRun: boolean;
    preset: RandomPreset;
};

const USAGE = "Usage: pokie build <config.json> [--target <dir>] [--dry-run]";
const BLUEPRINT_HINT =
    "<config.json> is a GameBlueprint (manifest, reels, rows, symbols, paytable, ...) — see docs/cli.md#pokie-build-configjson for the format.";
const RANDOM_USAGE = "Usage: pokie build random [--seed <integer>] [--target <dir>] [--dry-run] [--preset default|variant]";
const RANDOM_PRESETS: readonly RandomPreset[] = ["default", "variant"];

export class BuildCommand implements CliCommandHandling {
    private readonly pokieVersion: string;
    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly validator: GameBlueprintValidating;
    private readonly generator: GamePackageGenerating;
    private readonly randomBlueprintGenerator: RandomGameBlueprintGenerating;
    private readonly variantRandomBlueprintGenerator: RandomGameBlueprintGenerating;
    private readonly runSmokeSimulation: (projectRoot: string, seed: number) => Promise<SmokeSimulationOutcome>;
    // Consulted once, only on the default "<config.json>" path (never random, which never takes an
    // existing target to resolve) -- see runDefault's own comment on why a resolved,
    // non-"blueprint" project produces an UnsupportedProjectOperationError instead of falling through to
    // this.loadBlueprint's own confusing "not valid JSON"/shape error. An unrecognized path (resolve()
    // returns undefined) is unaffected: it still reaches this.loadBlueprint exactly as before this
    // resolver existed.
    private readonly resolveProject: ProjectResolving;

    constructor(
        pokieVersion: string,
        loadBlueprint: (filePath: string) => unknown = loadGameBlueprint,
        validator: GameBlueprintValidating = new GameBlueprintValidator(),
        generator: GamePackageGenerating = new GamePackageGenerator(pokieVersion),
        randomBlueprintGenerator: RandomGameBlueprintGenerating = new RandomGameBlueprintGenerator(),
        runSmoke: (projectRoot: string, seed: number) => Promise<SmokeSimulationOutcome> = runSmokeSimulation,
        variantRandomBlueprintGenerator: RandomGameBlueprintGenerating = new RandomGameBlueprintGenerator(
            new SlotGameNameGenerator(),
            new RandomGameBlueprintVariantStrategy(),
        ),
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
    ) {
        this.pokieVersion = pokieVersion;
        this.loadBlueprint = loadBlueprint;
        this.validator = validator;
        this.generator = generator;
        this.randomBlueprintGenerator = randomBlueprintGenerator;
        this.resolveProject = resolveProject;
        this.runSmokeSimulation = runSmoke;
        this.variantRandomBlueprintGenerator = variantRandomBlueprintGenerator;
    }

    public getName(): string {
        return "build";
    }

    public getDescription(): string {
        return (
            "Generate a POKIE game package from a GameBlueprint JSON config (reels, symbols, paylines, paytable) " +
            '(for a ready-to-run package instead, see "pokie init"). "random"/--random generates a first-class ' +
            "random game instead (--seed to reproduce it, --preset default|variant to pick the generation " +
            "strategy). --dry-run validates and previews without writing anything."
        );
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    public run(args: string[]): Promise<number> {
        // "--random" is a pre-Commander alias for the real "random" subcommand -- Commander's own
        // subcommand matching only recognizes non-"-"-prefixed tokens, and has no concept of a second
        // spelling for the same subcommand -- so it's normalized here, before the real, unified
        // Commander tree (see buildCommand()) ever sees it. Everything else (positionals, options,
        // validation) is declared and validated by Commander alone.
        const normalizedArgs = args[0] === "--random" ? ["random", ...args.slice(1)] : args;
        const isRandom = normalizedArgs[0] === "random";

        const exitCodeRef = {value: 0};
        const command = this.buildCommand(exitCodeRef);

        return command
            .parseAsync(normalizedArgs, {from: "user"})
            .then(() => exitCodeRef.value)
            .catch((error: unknown) => {
                if (isCommanderHelpDisplay(error)) {
                    return 0;
                }
                if (isRandom) {
                    throw translateCommanderError(error, {
                        unknownOption: (flag) => `Unknown option "${flag}". ${RANDOM_USAGE}`,
                        optionMissingArgument: (flag) => {
                            if (flag === "--seed") return `--seed requires an integer value. ${RANDOM_USAGE}`;
                            if (flag === "--target") return `--target requires a directory path. ${RANDOM_USAGE}`;
                            if (flag === "--preset") return `--preset must be one of: ${RANDOM_PRESETS.join(", ")}. ${RANDOM_USAGE}`;
                            return `Unknown option "${flag}". ${RANDOM_USAGE}`;
                        },
                    });
                }
                throw translateCommanderError(error, {
                    missingArgument: `${USAGE}\n${BLUEPRINT_HINT}`,
                    unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                    optionMissingArgument: (flag) =>
                        flag === "--target" ? `--target requires a directory path. ${USAGE}` : `Unknown option "${flag}". ${USAGE}`,
                });
            });
    }

    // Builds the exact Commander tree run() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and run() (for real parsing) use, so the
    // two can never drift apart: the default "<config.json>" action lives on the parent itself, and
    // "random" is a genuine Commander subcommand (`.command("random")`), so "pokie build --help" lists
    // it and "pokie build random --help" answers its own help, with no second, hand-maintained tree.
    // "--random" (the flag spelling) is a pre-Commander alias, not a second subcommand -- Commander's
    // own subcommand matching only recognizes non-"-"-prefixed tokens -- normalized to "random" by
    // run() below before this tree ever sees it.
    private buildCommand(exitCodeRef: {value: number} = {value: 0}): Command {
        const parent = createCommanderCliCommand("build")
            // Positional options: once "random" (a subcommand name, not a value for <configPath>) is
            // seen, every option after it belongs to "random"'s own parser, not the parent's -- without
            // this, the parent's own parseOptions() greedily consumes any --target/--dry-run it
            // recognizes from the FULL remaining argv (regardless of position) before subcommand
            // dispatch ever runs, leaving "random"'s own action with none of them. See Commander's own
            // enablePositionalOptions() doc comment ("lets subcommands reuse the same option names").
            .enablePositionalOptions()
            .description(this.getDescription())
            .argument("<configPath>", "a GameBlueprint JSON config (see docs/cli.md#pokie-build-configjson)")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .option("--target <dir>", "output directory (default: the generator's own default output directory)")
            .option("--dry-run", "validate and preview without writing anything")
            .action(async (configPath: string, excess: string[], options: {target?: string; dryRun?: boolean}) => {
                // An empty-string positional ("pokie build ''") is present as far as Commander's own
                // required-argument check is concerned, but the pre-Commander behavior this preserves
                // treated it the same as an entirely missing one (`!configPath`) -- a truly empty argv
                // ("pokie build" with no args at all) is Commander's own "commander.missingArgument",
                // caught below and reported the same way.
                if (!configPath || excess.length > 0) {
                    throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : `${USAGE}\n${BLUEPRINT_HINT}`);
                }
                // Only ever rejects a *recognized*-but-wrong-type target (a tsPackage/outcomeLibrary/
                // stakeAdapter/parWorkbook/wasm path) with a capability diagnostic explaining exactly
                // why "build" can't run against it. An unrecognized path -- resolve() returns undefined,
                // e.g. an arbitrary or malformed file this resolver can't classify at all -- falls
                // straight through to loadBlueprint below exactly as it always has, so an ordinary
                // "not valid JSON"/schema error is unaffected.
                const project = await this.resolveProject.resolve(configPath);
                if (project !== undefined && project.type !== "blueprint") {
                    const diagnostic = describeUnsupportedProjectOperation(project, BUILD_OPERATION);
                    if (diagnostic !== undefined) {
                        throw new UnsupportedProjectOperationError(diagnostic);
                    }
                }
                const blueprint = this.loadBlueprint(configPath);
                exitCodeRef.value = await this.buildFromBlueprint(blueprint, options.target, configPath, options.dryRun ?? false);
            });

        // "random"/"--random": generates a fresh, always-valid GameBlueprint (see
        // RandomGameBlueprintGenerator's own doc comment for why it's guaranteed to pass validation) and
        // runs it through the exact same validate/resolve/generate pipeline as a real <config.json> --
        // "randomSeed" passed to buildFromBlueprint below is what additionally triggers the post-build
        // smoke simulation, which a hand-authored blueprint build never runs. "--preset" only selects
        // which already-registered RandomGameBlueprintStrategy generates the mechanics (default-line-pay
        // vs the richer random-variant from RandomGameBlueprintVariantStrategy) -- same seed, same preset
        // always reproduces the same blueprint (see RandomGameBlueprintGenerator.generate).
        parent
            .command("random")
            .description("Generate a first-class random game instead of loading a config file.")
            .argument("[excess...]", "rejected if present -- this verb takes no positionals")
            .option("--seed <integer>", "reproduce a specific random game", (value: string) => {
                if (!Number.isInteger(Number(value))) {
                    throw new Error(`--seed requires an integer value. ${RANDOM_USAGE}`);
                }
                return Number(value);
            })
            .option("--target <dir>", "output directory (default: the generator's own default output directory)")
            .option("--dry-run", "validate and preview without writing anything")
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
            .action(async (excess: string[], options: {seed?: number; target?: string; dryRun?: boolean; preset: RandomPreset}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${RANDOM_USAGE}`);
                }
                exitCodeRef.value = await this.executeRandom({seed: options.seed, outDir: options.target, dryRun: options.dryRun ?? false, preset: options.preset});
            });

        return parent;
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
    // GamePackageGenerator.generate() call, so there's no --target directory to reason about at all.
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
