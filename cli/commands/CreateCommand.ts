import {
    computeGameBlueprintHash,
    GameBlueprintValidating,
    GameBlueprintValidator,
    GamePackageGenerating,
    GamePackageGenerator,
    RandomGameBlueprintGenerating,
    RandomGameBlueprintGenerator,
    RandomGameBlueprintVariantStrategy,
    SlotGameNameGenerator,
} from "pokie";
import {evaluateRandomBuildQualityGates} from "../build/evaluateRandomBuildQualityGates.js";
import {runSmokeSimulation, SmokeSimulationOutcome} from "../build/runSmokeSimulation.js";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {GamePackageCreating} from "../scaffold/GamePackageCreating.js";
import {GamePackageCreator} from "../scaffold/GamePackageCreator.js";
import {createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";

type RandomPreset = "default" | "variant";

const RANDOM_USAGE = "Usage: pokie create [name] --random [--seed <integer>] [--preset default|variant]";
const RANDOM_PRESETS: readonly RandomPreset[] = ["default", "variant"];

export class CreateCommand implements CliCommandHandling {
    private readonly creator: GamePackageCreating;
    private readonly randomBlueprintGenerator: RandomGameBlueprintGenerating;
    private readonly variantRandomBlueprintGenerator: RandomGameBlueprintGenerating;
    private readonly validator: GameBlueprintValidating;
    private readonly packageGenerator: GamePackageGenerating;
    private readonly runSmokeSimulation: (projectRoot: string, seed: number) => Promise<SmokeSimulationOutcome>;

    constructor(
        pokieVersion: string,
        creator: GamePackageCreating = new GamePackageCreator(pokieVersion),
        randomBlueprintGenerator: RandomGameBlueprintGenerating = new RandomGameBlueprintGenerator(),
        validator: GameBlueprintValidating = new GameBlueprintValidator(),
        packageGenerator: GamePackageGenerating = new GamePackageGenerator(pokieVersion),
        runSmoke: (projectRoot: string, seed: number) => Promise<SmokeSimulationOutcome> = runSmokeSimulation,
        variantRandomBlueprintGenerator: RandomGameBlueprintGenerating = new RandomGameBlueprintGenerator(
            new SlotGameNameGenerator(),
            new RandomGameBlueprintVariantStrategy(),
        ),
    ) {
        this.creator = creator;
        this.randomBlueprintGenerator = randomBlueprintGenerator;
        this.validator = validator;
        this.packageGenerator = packageGenerator;
        this.runSmokeSimulation = runSmoke;
        this.variantRandomBlueprintGenerator = variantRandomBlueprintGenerator;
    }

    public getName(): string {
        return "create";
    }

    public getDescription(): string {
        return (
            "Create a new POKIE-compatible game package in a new directory, or a random-but-valid " +
            "one (reels, symbols, paytable already filled in) via --random (--seed to reproduce it, " +
            "--preset default|variant to pick the generation strategy)."
        );
    }

    public run(args: string[]): Promise<void | number> {
        if (args.includes("--random")) {
            return this.runRandom(args);
        }

        const name = this.parseName(args);

        const result = this.creator.create(process.cwd(), name);

        for (const file of result.createdFiles) {
            console.log(`  created  ${file}`);
        }

        console.log(`\nGame package "${result.manifest.name}" (id: "${result.manifest.id}") created in "${result.projectRoot}".`);
        console.log(`Next: cd ${name} && npm install && npm run build`);
        console.log('Load it anywhere with: loadPokieGame("' + result.projectRoot + '") from "pokie".');

        return Promise.resolve();
    }

    // --random: a valid GameBlueprint (see RandomGameBlueprintGenerator) generated on the fly and run
    // through the same validate/generate/smoke-simulate pipeline "pokie build random" uses, rather
    // than the hand-editable scaffold the plain "pokie create <name>" path above writes -- there is no
    // random content to fill into that scaffold's empty VideoSlotConfig, so a data-driven GameBlueprint
    // build is what actually produces a playable random game here. "name", if given, is used verbatim
    // as both the output directory and the manifest name (matching "pokie create <name>"'s own
    // directory-equals-name convention) and always overrides the generator's own generated name;
    // omitted, a generated name/directory is picked instead. "--preset" selects the same
    // already-registered RandomGameBlueprintStrategy "pokie build random --preset" does (default-line-pay
    // vs the richer random-variant from RandomGameBlueprintVariantStrategy) -- same seed, same preset,
    // same name override always reproduces the same blueprint.
    private async runRandom(args: string[]): Promise<number> {
        const {name, seed, preset} = this.parseRandomArgs(args);
        const generator = preset === "variant" ? this.variantRandomBlueprintGenerator : this.randomBlueprintGenerator;
        const {blueprint, seed: usedSeed, provenance} = generator.generate({seed, overrides: name ? {name} : undefined});

        console.log(`Generated random game "${blueprint.manifest.name}" (id: "${blueprint.manifest.id}") from seed ${usedSeed}.`);
        console.log(
            `Reproduce this exact game with: pokie create ${name ?? ""}${name ? " " : ""}--random --seed ${usedSeed} --preset ${preset}`,
        );
        console.log(`Provenance: generator ${provenance.generatorVersion}, strategy "${provenance.strategy}".`);

        const issues = this.validator.validate(blueprint);
        const errors = issues.filter((issue) => issue.severity === "error");
        for (const issue of issues.filter((issue) => issue.severity !== "error")) {
            console.log(`  warning  ${issue.code}: ${issue.message}`);
        }
        if (errors.length > 0) {
            console.error(`Generated blueprint has ${errors.length} error(s):`);
            for (const issue of errors) {
                console.error(`  - ${issue.code}: ${issue.message}`);
            }
            return 1;
        }

        const result = this.packageGenerator.generate(blueprint, process.cwd(), name);

        for (const file of result.createdFiles) {
            console.log(`  created  ${file}`);
        }
        console.log(`  blueprint hash   ${computeGameBlueprintHash(blueprint)}`);

        console.log("\nRunning a short smoke simulation...");
        const smoke = await this.runSmokeSimulation(result.projectRoot, usedSeed);
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

        console.log(`\nGame package "${result.manifest.name}" (id: "${result.manifest.id}") created in "${result.projectRoot}".`);
        console.log(`Next: pokie sim ${result.projectRoot} --rounds 10000 --seed demo --out sim.json`);

        return 0;
    }

    // The plain "pokie create <name>" verb has no options of its own (see the fixture's own
    // {options: []} for it) -- the original never even looked past args[0], so a trailing
    // "[excess...]" plus allowUnknownOption() here reproduces that same "everything after the name is
    // silently ignored" behavior (including a stray "-"/"--"-looking token) rather than Commander's
    // own default of erroring on either.
    private parseName(args: string[]): string {
        let name: string | undefined;
        const command = createCommanderCliCommand("create")
            .allowUnknownOption()
            .argument("<name>")
            .argument("[excess...]")
            .action((parsedName: string) => {
                name = parsedName;
            });

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            throw translateCommanderError(error, {missingArgument: "Usage: pokie create <name>"});
        }
        return name!;
    }

    // "--random" itself is a flag-like verb selector (see run()'s own pre-Commander routing, mirroring
    // BuildCommand's "random"/"--random"), so it's declared here as an ordinary (ignored) boolean
    // option Commander accepts wherever it appears in argv, rather than something run() strips off by
    // position -- the original also scanned for it anywhere in args, not just at args[0]. "[name]" is
    // an optional leading-or-interspersed positional; a second bare positional token is the original's
    // own "Unexpected extra argument" case (distinct from an unrecognized "-"/"--" flag, which
    // Commander itself already classifies as commander.unknownOption).
    private parseRandomArgs(args: string[]): {name?: string; seed?: number; preset: RandomPreset} {
        let result: {name?: string; seed?: number; preset: RandomPreset} | undefined;
        const command = createCommanderCliCommand("create --random")
            .option("--random")
            .argument("[name]")
            .argument("[excess...]")
            .option("--seed <integer>", "", (value: string) => {
                if (!Number.isInteger(Number(value))) {
                    throw new Error(`--seed requires an integer value. ${RANDOM_USAGE}`);
                }
                return Number(value);
            })
            .option(
                "--preset <preset>",
                "",
                (value: string) => {
                    if (!RANDOM_PRESETS.includes(value as RandomPreset)) {
                        throw new Error(`--preset must be one of: ${RANDOM_PRESETS.join(", ")}. ${RANDOM_USAGE}`);
                    }
                    return value as RandomPreset;
                },
                "default" as RandomPreset,
            )
            .action((name: string | null, excess: string[], options: {seed?: number; preset: RandomPreset}) => {
                if (excess.length > 0) {
                    throw new Error(`Unexpected extra argument "${excess[0]}". ${RANDOM_USAGE}`);
                }
                result = {name: name ?? undefined, seed: options.seed, preset: options.preset};
            });

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            throw translateCommanderError(error, {
                unknownOption: (flag) => `Unknown option "${flag}". ${RANDOM_USAGE}`,
                optionMissingArgument: (flag) => {
                    if (flag === "--seed") {
                        return `--seed requires an integer value. ${RANDOM_USAGE}`;
                    }
                    if (flag === "--preset") {
                        return `--preset must be one of: ${RANDOM_PRESETS.join(", ")}. ${RANDOM_USAGE}`;
                    }
                    return `Unknown option "${flag}". ${RANDOM_USAGE}`;
                },
            });
        }
        return result!;
    }
}
