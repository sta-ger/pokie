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
import {GameBlueprintWizard} from "../wizard/GameBlueprintWizard.js";
import {GameBlueprintWizarding} from "../wizard/GameBlueprintWizarding.js";
import {PromptAdapting} from "../wizard/PromptAdapting.js";
import {ReadlinePromptAdapter} from "../wizard/ReadlinePromptAdapter.js";
import {createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";

type RandomPreset = "default" | "variant";

const USAGE = "Usage: pokie create [name] [--out <file>]";
const BLANK_USAGE = "Usage: pokie create [name] --blank [--out <file>]";
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

const GUIDANCE_NOT_INTERACTIVE =
    'pokie create needs an interactive terminal to run its Blueprint wizard, and this one is not connected to one. ' +
    "Re-run inside a terminal, or use a non-interactive shortcut instead: \"pokie create --blank\" (a bare-minimum " +
    'blueprint) or "pokie create --random" (an always-valid randomly generated one).';

export class CreateCommand implements CliCommandHandling {
    private readonly createStarterBlueprint: () => GameBlueprint;
    private readonly createBlankBlueprint: () => GameBlueprint;
    private readonly validator: GameBlueprintValidating;
    private readonly randomBlueprintGenerator: RandomGameBlueprintGenerating;
    private readonly variantRandomBlueprintGenerator: RandomGameBlueprintGenerating;
    private readonly fileExists: (filePath: string) => boolean;
    private readonly writeFile: (filePath: string, contents: string) => void;
    private readonly wizard: GameBlueprintWizarding;
    private readonly createPrompt: () => PromptAdapting;
    private readonly isInteractiveTerminal: () => boolean;

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
        // Defaults to a GameBlueprintWizard seeded with this same "createStarterBlueprint" -- so an
        // Enter-only interactive run offers exactly the caller's own configured starter template as
        // its defaults, the same way the non-interactive paths above already do.
        wizard: GameBlueprintWizarding = new GameBlueprintWizard(undefined, createStarterBlueprint),
        createPrompt: () => PromptAdapting = () => new ReadlinePromptAdapter(),
        // Real terminals only: both stdin (to actually read answers) and stdout (so the questions
        // themselves are visible) must be TTYs, matching ReadlinePromptAdapter's own real-terminal use.
        isInteractiveTerminal: () => boolean = () => Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY),
    ) {
        this.createStarterBlueprint = createStarterBlueprint;
        this.createBlankBlueprint = createBlankBlueprint;
        this.validator = validator;
        this.randomBlueprintGenerator = randomBlueprintGenerator;
        this.fileExists = fileExists;
        this.writeFile = writeFile;
        this.variantRandomBlueprintGenerator = variantRandomBlueprintGenerator;
        this.wizard = wizard;
        this.createPrompt = createPrompt;
        this.isInteractiveTerminal = isInteractiveTerminal;
    }

    public getName(): string {
        return "create";
    }

    public getDescription(): string {
        return (
            "Design an editable Blueprint Project -- a hand-editable GameBlueprint JSON file (reels, symbols, " +
            "paytable, reel weighting) -- through an interactive wizard when run in a terminal with no --blank/" +
            "--random (\"pokie create <name>\" pre-fills the name), or write one straight from the filled-in " +
            "starter template non-interactively via --blank for a bare-minimum one, or --random for an " +
            "always-valid randomly generated one, with its reel weighting already expressed as valid per-reel " +
            "generation (--seed to reproduce it, --preset default|variant to pick the generation strategy). For " +
            'a prepared, immediately valid package instead, use "pokie init".'
        );
    }

    // "--random" (runRandom) and "--blank" (runBlank) are both plain synchronous file I/O -- neither
    // ever prompts or builds/smoke-simulates a package -- and each still throws straight out of this
    // call on a usage error (a synchronous failure), same as before. The bare/named path now always
    // goes through the interactive wizard (or, without a real terminal to run it in, a quick guidance
    // message) -- see runDefault()'s own doc comment -- so only its own argument PARSING stays
    // synchronous; running it is necessarily asynchronous.
    public run(args: string[]): Promise<number> {
        if (args.includes("--random")) {
            try {
                return Promise.resolve(this.runRandom(args));
            } catch (error) {
                return Promise.reject(error);
            }
        }
        if (args.includes("--blank")) {
            return Promise.resolve(this.runBlank(args));
        }

        const parsed = this.parseDefaultArgs(args);
        return this.runDefault(parsed);
    }

    private runBlank(args: string[]): number {
        let exitCode = 0;
        const command = createCommanderCliCommand("create")
            .argument("[name]")
            .argument("[excess...]")
            .option("--blank")
            .option("--out <file>")
            .action((name: string | null, excess: string[], options: {out?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unexpected extra argument "${excess[0]}". ${BLANK_USAGE}`);
                }

                const blueprint = applyBlueprintNameOverride(this.createBlankBlueprint(), name ?? undefined);
                const filePath = options.out ?? this.defaultBlueprintPath(blueprint.manifest.id);

                this.writeBlueprintFile(filePath, blueprint);
                this.printCreated(blueprint, filePath);
                exitCode = 0;
            });

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            throw translateCommanderError(error, {
                unknownOption: (flag) => `Unknown option "${flag}". ${BLANK_USAGE}`,
                optionMissingArgument: (flag) => (flag === "--out" ? `--out requires a file path. ${BLANK_USAGE}` : `Unknown option "${flag}". ${BLANK_USAGE}`),
            });
        }
        return exitCode;
    }

    // Parses (and validates the shape of) the bare/named path's own argv -- synchronously, so a usage
    // error ("--bogus", two positionals, an invalid "<name>") still throws straight out of run() the
    // same way it always has, before runDefault() ever has a chance to decide whether a real terminal
    // is even available to run the wizard in.
    private parseDefaultArgs(args: string[]): {name?: string; out?: string} {
        let result: {name?: string; out?: string} | undefined;
        const command = createCommanderCliCommand("create")
            .argument("[name]")
            .argument("[excess...]")
            .option("--out <file>")
            .action((name: string | null, excess: string[], options: {out?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unexpected extra argument "${excess[0]}". ${USAGE}`);
                }
                const normalizedName = name ?? undefined;
                if (normalizedName !== undefined) {
                    this.assertValidName(normalizedName);
                }
                result = {name: normalizedName, out: options.out};
            });

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            throw translateCommanderError(error, {
                unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                optionMissingArgument: (flag) => (flag === "--out" ? `--out requires a file path. ${USAGE}` : `Unknown option "${flag}". ${USAGE}`),
            });
        }
        return result!;
    }

    private assertValidName(name: string): void {
        if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
            throw new Error(`"${name}" is not a valid project name. Use a plain name, e.g. "sample-slot".`);
        }
    }

    // The restored interactive wizard: without a real terminal to run it in, there is nowhere to read
    // answers from, so this exits immediately with guidance toward the two non-interactive shortcuts
    // instead of ever touching stdin (see ReadlinePromptAdapter's own doc comment on how it behaves
    // against a non-interactive stream -- this check exists so that behavior, an immediate silent
    // cancellation, is never what a scripted/CI "pokie create" actually sees). With a terminal, the
    // wizard designs the same GameBlueprint fields ("pokie init"'s own wizard, and Studio's guided
    // Design Game editor, both use the exact same canonical model/validation), previews the result,
    // and only writes it once the user confirms -- a destination conflict, Ctrl+C, EOF, or "n" at the
    // confirmation all leave no file behind, since writeBlueprintFile() is the only thing that ever
    // touches the filesystem here, and it only runs after every one of those has already passed.
    private async runDefault(parsed: {name?: string; out?: string}): Promise<number> {
        if (!this.isInteractiveTerminal()) {
            console.error(GUIDANCE_NOT_INTERACTIVE);
            return 1;
        }

        const prompt = this.createPrompt();
        try {
            const result = await this.wizard.run(prompt, {
                presetName: parsed.name,
                destination: {
                    label: "Blueprint file",
                    defaultPathFor: (id) => parsed.out ?? this.defaultBlueprintPath(id),
                },
            });
            if (result === null) {
                console.log("\nCreate cancelled.");
                return 1;
            }

            const {blueprint} = result;
            const filePath = result.outDir as string; // always concrete -- see GameBlueprintWizardOptions.destination

            const issues = this.validator.validate(blueprint);
            const errors = issues.filter((issue) => issue.severity === "error");
            for (const issue of issues.filter((issue) => issue.severity !== "error")) {
                console.log(`  warning  ${issue.code}: ${issue.message}`);
            }
            if (errors.length > 0) {
                console.error(`Blueprint has ${errors.length} error(s):`);
                for (const issue of errors) {
                    console.error(`  - ${issue.code}: ${issue.message}`);
                }
                return 1;
            }
            if (this.fileExists(filePath)) {
                console.error(`"${filePath}" already exists. Choose a different path, or remove/edit the existing file first.`);
                return 1;
            }

            this.printPreview(blueprint, filePath);
            const confirmed = await this.confirmSave(prompt);
            if (!confirmed) {
                console.log("\nCreate cancelled.");
                return 1;
            }

            this.writeBlueprintFile(filePath, blueprint);
            this.printCreated(blueprint, filePath);
            return 0;
        } finally {
            prompt.close();
        }
    }

    private printPreview(blueprint: GameBlueprint, filePath: string): void {
        const roles: string[] = [];
        if (blueprint.wilds && blueprint.wilds.length > 0) {
            roles.push(`wild: ${blueprint.wilds.join(", ")}`);
        }
        if (blueprint.scatters && blueprint.scatters.length > 0) {
            roles.push(`scatter: ${blueprint.scatters.join(", ")}`);
        }

        console.log("\nPreview:");
        console.log(`  Game:        ${blueprint.manifest.name} (id: "${blueprint.manifest.id}", v${blueprint.manifest.version})`);
        console.log(`  Layout:      ${blueprint.reels} reels x ${blueprint.rows} rows`);
        console.log(`  Symbols:     ${blueprint.symbols.join(", ")}${roles.length > 0 ? ` (${roles.join("; ")})` : ""}`);
        console.log(`  Paytable:    ${Object.keys(blueprint.paytable).length} symbol(s) with payouts`);
        console.log(`  Bets:        ${blueprint.availableBets && blueprint.availableBets.length > 0 ? blueprint.availableBets.join(", ") : "(engine default)"}`);
        console.log(`  Mechanics:   ${blueprint.mechanics?.freeGames ? `free games via "${blueprint.mechanics.freeGames.scatterSymbol}"` : "(none)"}`);
        console.log(`  Destination: ${filePath}`);
        console.log("");
    }

    private async confirmSave(prompt: PromptAdapting): Promise<boolean> {
        for (;;) {
            const raw = await prompt.ask("Save this blueprint? [Y/n]: ");
            if (raw === null) {
                return false;
            }
            const answer = raw.trim().toLowerCase();
            if (answer === "" || answer === "y" || answer === "yes") {
                return true;
            }
            if (answer === "n" || answer === "no") {
                return false;
            }
            console.log('  Enter "y" or "n".');
        }
    }

    private printCreated(blueprint: GameBlueprint, filePath: string): void {
        console.log(`  created  ${filePath}`);
        console.log(`\nGame blueprint "${blueprint.manifest.name}" (id: "${blueprint.manifest.id}") created at "${filePath}".`);
        console.log(`\nEdit it by hand, then run:`);
        console.log(`  pokie build ${filePath} --dry-run`);
        console.log(`  pokie build ${filePath} --out <dir>`);
        console.log(MIGRATION_NOTE);
    }

    // --random: a data-driven GameBlueprint (see RandomGameBlueprintGenerator) generated on the fly,
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
        this.printCreated(blueprint, filePath);

        return 0;
    }

    // Bakes the seeded generator's flat symbolWeights ratio into an equivalent per-reel
    // reelStripGeneration array instead -- see buildRandomReelStripGeneration.ts. A blueprint that
    // already carries its own reelStrips/reelStripGeneration is left untouched: there is no flat
    // symbolWeights ratio to convert, and it already expresses its reel content per-reel (or literally)
    // on its own. In practice this now only ever fires for "--preset variant", when it happens to pick
    // symbolWeights -- "--preset default" (DefaultRandomGameBlueprintStrategy) already generates its
    // reel weighting as reelStripGeneration by itself.
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
