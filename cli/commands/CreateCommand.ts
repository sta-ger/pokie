import fs from "fs";
import path from "path";
import {
    GameBlueprint,
    GameBlueprintValidating,
    GameBlueprintValidator,
    RandomGameBlueprintGenerating,
    RandomGameBlueprintGenerator,
    RandomGameBlueprintVariantStrategy,
    SlotGameNameGenerator,
} from "pokie";
import {applyBlueprintNameOverride} from "../build/applyBlueprintNameOverride.js";
import {buildRandomReelStripGeneration} from "../build/buildRandomReelStripGeneration.js";
import {createBlankGameBlueprint} from "../build/createBlankGameBlueprint.js";
import {createStarterGameBlueprint} from "../build/createStarterGameBlueprint.js";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";

type RandomPreset = "default" | "variant";

const USAGE = "Usage: pokie create [name] [--blank] [--out <file>]";
const RANDOM_USAGE = "Usage: pokie create [name] --random [--seed <integer>] [--preset default|variant] [--out <file>]";
const RANDOM_PRESETS: readonly RandomPreset[] = ["default", "variant"];

// Printed after every successful "pokie create" — this command used to write a hand-editable npm
// package directly (see GamePackageCreator), the same "programmer-first" role "pokie init" now owns
// (see InitCommand). A silent switch would leave anyone still expecting that old package output
// (package.json, src/index.ts, "npm install && npm run build") staring at a lone JSON file with no
// explanation; this line is that explanation, on every run, not just a doc update someone has to go
// looking for.
const MIGRATION_NOTE =
    '\nNote: "pokie create" now writes an editable Blueprint Project (a GameBlueprint JSON file) -- it no ' +
    "longer writes a ready-to-run package. For a prepared, immediately valid package instead, run: pokie init [name]";

export class CreateCommand implements CliCommandHandling {
    private readonly createStarterBlueprint: () => GameBlueprint;
    private readonly createBlankBlueprint: () => GameBlueprint;
    private readonly validator: GameBlueprintValidating;
    private readonly randomBlueprintGenerator: RandomGameBlueprintGenerating;
    private readonly variantRandomBlueprintGenerator: RandomGameBlueprintGenerating;
    private readonly fileExists: (filePath: string) => boolean;
    private readonly writeFile: (filePath: string, contents: string) => void;

    constructor(
        _pokieVersion: string,
        createStarterBlueprint: () => GameBlueprint = createStarterGameBlueprint,
        createBlankBlueprint: () => GameBlueprint = createBlankGameBlueprint,
        validator: GameBlueprintValidating = new GameBlueprintValidator(),
        randomBlueprintGenerator: RandomGameBlueprintGenerating = new RandomGameBlueprintGenerator(),
        fileExists: (filePath: string) => boolean = (filePath) => fs.existsSync(filePath),
        writeFile: (filePath: string, contents: string) => void = (filePath, contents) => fs.writeFileSync(filePath, contents, "utf-8"),
        variantRandomBlueprintGenerator: RandomGameBlueprintGenerating = new RandomGameBlueprintGenerator(
            new SlotGameNameGenerator(),
            new RandomGameBlueprintVariantStrategy(),
        ),
    ) {
        this.createStarterBlueprint = createStarterBlueprint;
        this.createBlankBlueprint = createBlankBlueprint;
        this.validator = validator;
        this.randomBlueprintGenerator = randomBlueprintGenerator;
        this.fileExists = fileExists;
        this.writeFile = writeFile;
        this.variantRandomBlueprintGenerator = variantRandomBlueprintGenerator;
    }

    public getName(): string {
        return "create";
    }

    public getDescription(): string {
        return (
            "Write an editable Blueprint Project -- a hand-editable GameBlueprint JSON file (reels, symbols, " +
            "paytable, reel weighting) -- from the filled-in starter template, --blank for a bare-minimum one, " +
            "or --random for an always-valid randomly generated one, with its reel weighting already expressed " +
            "as valid per-reel generation (--seed to reproduce it, --preset default|variant to pick the " +
            'generation strategy). For a prepared, immediately valid package instead, use "pokie init".'
        );
    }

    // Both "--random" (runRandom) and the plain path (runBlueprint) are now plain synchronous file I/O
    // -- neither ever builds or smoke-simulates a package -- but this method's own return type (and
    // this file's own tests) still distinguish them: the non-random path throws straight out of this
    // call (a synchronous failure, same as before), while "--random"'s own failures are caught here and
    // turned into a rejected promise instead, preserving its previous (once-async) rejection behavior.
    public run(args: string[]): Promise<number> {
        if (args.includes("--random")) {
            try {
                return Promise.resolve(this.runRandom(args));
            } catch (error) {
                return Promise.reject(error);
            }
        }

        return Promise.resolve(this.runBlueprint(args));
    }

    private runBlueprint(args: string[]): number {
        let exitCode = 0;
        const command = createCommanderCliCommand("create")
            .argument("[name]")
            .argument("[excess...]")
            .option("--blank")
            .option("--out <file>")
            .action((name: string | null, excess: string[], options: {blank?: boolean; out?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unexpected extra argument "${excess[0]}". ${USAGE}`);
                }

                const template = options.blank ? this.createBlankBlueprint() : this.createStarterBlueprint();
                const blueprint = applyBlueprintNameOverride(template, name ?? undefined);
                const filePath = options.out ?? this.defaultBlueprintPath(blueprint.manifest.id);

                this.writeBlueprintFile(filePath, blueprint);

                console.log(`  created  ${filePath}`);
                console.log(`\nGame blueprint "${blueprint.manifest.name}" (id: "${blueprint.manifest.id}") created at "${filePath}".`);
                console.log(`\nEdit it by hand, then run:`);
                console.log(`  pokie build ${filePath} --dry-run`);
                console.log(`  pokie build ${filePath} --out <dir>`);
                console.log(MIGRATION_NOTE);
                exitCode = 0;
            });

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            throw translateCommanderError(error, {
                unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                optionMissingArgument: (flag) => (flag === "--out" ? `--out requires a file path. ${USAGE}` : `Unknown option "${flag}". ${USAGE}`),
            });
        }
        return exitCode;
    }

    // "--random": a data-driven GameBlueprint (see RandomGameBlueprintGenerator) generated on the fly,
    // the same generator "pokie build random" uses -- but unlike that command, this one never builds or
    // smoke-simulates a package, it only writes the blueprint out. Its reel weighting is expressed as a
    // per-reel reelStripGeneration array (see buildRandomReelStripGeneration.ts) rather than a single
    // flat symbolWeights map, so the file already demonstrates "valid per-reel generation" -- every reel
    // has its own independent, reproducible generation config -- instead of leaving all of them to share
    // one implicit engine-wide weighting.
    private runRandom(args: string[]): number {
        const {name, seed, preset, out} = this.parseRandomArgs(args);
        const generator = preset === "variant" ? this.variantRandomBlueprintGenerator : this.randomBlueprintGenerator;
        const {blueprint, seed: usedSeed, provenance} = generator.generate({seed, overrides: name ? {name} : undefined});

        console.log(`Generated random game "${blueprint.manifest.name}" (id: "${blueprint.manifest.id}") from seed ${usedSeed}.`);
        console.log(
            `Reproduce this exact game with: pokie create ${name ?? ""}${name ? " " : ""}--random --seed ${usedSeed} --preset ${preset}`,
        );
        console.log(`Provenance: generator ${provenance.generatorVersion}, strategy "${provenance.strategy}".`);

        const perReelBlueprint = this.applyPerReelGeneration(blueprint, usedSeed);

        const issues = this.validator.validate(perReelBlueprint);
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

        const filePath = out ?? this.defaultBlueprintPath(blueprint.manifest.id);
        this.writeBlueprintFile(filePath, perReelBlueprint);

        console.log(`  created  ${filePath}`);
        console.log(`\nGame blueprint "${blueprint.manifest.name}" (id: "${blueprint.manifest.id}") created at "${filePath}".`);
        console.log(`\nEdit it by hand, then run:`);
        console.log(`  pokie build ${filePath} --dry-run`);
        console.log(`  pokie build ${filePath} --out <dir>`);
        console.log(MIGRATION_NOTE);

        return 0;
    }

    // Bakes the seeded generator's flat symbolWeights ratio into an equivalent per-reel
    // reelStripGeneration array instead -- see buildRandomReelStripGeneration.ts. A blueprint that
    // already carries its own reelStrips/reelStripGeneration (the richer "--preset variant" strategy
    // sometimes produces) is left untouched: there is no flat symbolWeights ratio to convert, and it
    // already expresses its reel content per-reel (or literally) on its own.
    private applyPerReelGeneration(blueprint: GameBlueprint, seed: number): GameBlueprint {
        if (blueprint.symbolWeights === undefined || blueprint.reelStrips !== undefined || blueprint.reelStripGeneration !== undefined) {
            return blueprint;
        }

        const reelStripGeneration = buildRandomReelStripGeneration(blueprint.symbolWeights, blueprint.reels, seed);
        const materialized = {...blueprint, reelStripGeneration};
        Reflect.deleteProperty(materialized, "symbolWeights");
        return materialized;
    }

    private defaultBlueprintPath(id: string): string {
        return `./${id}.blueprint.json`;
    }

    private writeBlueprintFile(filePath: string, blueprint: GameBlueprint): void {
        if (this.fileExists(filePath)) {
            throw new Error(`"${filePath}" already exists. Choose a different path, or remove/edit the existing file first.`);
        }
        const dir = path.dirname(filePath);
        if (dir && dir !== ".") {
            fs.mkdirSync(dir, {recursive: true});
        }
        this.writeFile(filePath, `${JSON.stringify(blueprint, null, 4)}\n`);
    }

    private parseRandomArgs(args: string[]): {name?: string; seed?: number; preset: RandomPreset; out?: string} {
        let result: {name?: string; seed?: number; preset: RandomPreset; out?: string} | undefined;
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
            .option("--out <file>")
            .action((name: string | null, excess: string[], options: {seed?: number; preset: RandomPreset; out?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unexpected extra argument "${excess[0]}". ${RANDOM_USAGE}`);
                }
                result = {name: name ?? undefined, seed: options.seed, preset: options.preset, out: options.out};
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
                    if (flag === "--out") {
                        return `--out requires a file path. ${RANDOM_USAGE}`;
                    }
                    return `Unknown option "${flag}". ${RANDOM_USAGE}`;
                },
            });
        }
        return result!;
    }
}
