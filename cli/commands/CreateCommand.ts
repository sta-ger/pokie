import {
    GameBlueprintValidating,
    GameBlueprintValidator,
    GamePackageGenerating,
    GamePackageGenerator,
    RandomGameBlueprintGenerating,
    RandomGameBlueprintGenerator,
} from "pokie";
import {runSmokeSimulation, SmokeSimulationOutcome} from "../build/runSmokeSimulation.js";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {GamePackageCreating} from "../scaffold/GamePackageCreating.js";
import {GamePackageCreator} from "../scaffold/GamePackageCreator.js";

const RANDOM_USAGE = "Usage: pokie create [name] --random [--seed <integer>]";

export class CreateCommand implements CliCommandHandling {
    private readonly creator: GamePackageCreating;
    private readonly randomBlueprintGenerator: RandomGameBlueprintGenerating;
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
    ) {
        this.creator = creator;
        this.randomBlueprintGenerator = randomBlueprintGenerator;
        this.validator = validator;
        this.packageGenerator = packageGenerator;
        this.runSmokeSimulation = runSmoke;
    }

    public getName(): string {
        return "create";
    }

    public getDescription(): string {
        return (
            "Create a new POKIE-compatible game package in a new directory, or a random-but-valid " +
            "one (reels, symbols, paytable already filled in) via --random."
        );
    }

    public run(args: string[]): Promise<void | number> {
        if (args.includes("--random")) {
            return this.runRandom(args);
        }

        const [name] = args;
        if (!name) {
            throw new Error("Usage: pokie create <name>");
        }

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
    // directory-equals-name convention); omitted, a generated name/directory is picked instead.
    private async runRandom(args: string[]): Promise<number> {
        const {name, seed} = this.parseRandomArgs(args);
        const {blueprint, seed: usedSeed} = this.randomBlueprintGenerator.generate(seed, name ? {name} : undefined);

        console.log(`Generated random game "${blueprint.manifest.name}" (id: "${blueprint.manifest.id}") from seed ${usedSeed}.`);
        console.log(`Reproduce this exact game with: pokie create ${name ?? ""}${name ? " " : ""}--random --seed ${usedSeed}`);

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

        console.log("\nRunning a short smoke simulation...");
        const smoke = await this.runSmokeSimulation(result.projectRoot, usedSeed);
        if (!smoke.ok) {
            console.error(`Smoke simulation failed: ${smoke.error}`);
            return 1;
        }
        console.log(
            `Smoke simulation OK: ${smoke.rounds} rounds, RTP ${(smoke.rtp * 100).toFixed(2)}%, hit frequency ${(smoke.hitFrequency * 100).toFixed(2)}%.`,
        );

        console.log(`\nGame package "${result.manifest.name}" (id: "${result.manifest.id}") created in "${result.projectRoot}".`);
        console.log(`Next: pokie sim ${result.projectRoot} --rounds 10000 --seed demo --out sim.json`);

        return 0;
    }

    private parseRandomArgs(args: string[]): {name?: string; seed?: number} {
        let name: string | undefined;
        let seed: number | undefined;

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg === "--random") {
                continue;
            }
            if (arg === "--seed") {
                const value = args[i + 1];
                if (value === undefined || !Number.isInteger(Number(value))) {
                    throw new Error(`--seed requires an integer value. ${RANDOM_USAGE}`);
                }
                seed = Number(value);
                i++;
                continue;
            }
            if (arg.startsWith("--")) {
                throw new Error(`Unknown option "${arg}". ${RANDOM_USAGE}`);
            }
            if (name !== undefined) {
                throw new Error(`Unexpected extra argument "${arg}". ${RANDOM_USAGE}`);
            }
            name = arg;
        }

        return {name, seed};
    }
}
