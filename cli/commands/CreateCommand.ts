import {Command} from "commander";
import fs from "fs";
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
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";
import {BlueprintFileWriteResult, writeBlueprintFileAtomically as writeBlueprintFileAtomicallyDefault} from "./internal/writeBlueprintFileAtomically.js";

type RandomPreset = "default" | "variant";

const USAGE = "Usage: pokie create [name] [--out <file>]";
const BLANK_USAGE = "Usage: pokie create [name] --blank [--out <file>]";
const RANDOM_USAGE = "Usage: pokie create [name] --random [--seed <integer>] [--preset default|variant] [--out <file>]";
const RANDOM_PRESETS: readonly RandomPreset[] = ["default", "variant"];

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
    private readonly writeBlueprintFileAtomically: (filePath: string, contents: string) => BlueprintFileWriteResult;
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
        // Atomic and create-only by default (see writeBlueprintFileAtomically's own doc): every save
        // path below (the confirmed interactive wizard, --blank, --random) routes through this same
        // abstraction, so none of them can ever leave a partial destination behind, or silently clobber
        // a destination that was created by something else after an earlier fileExists() check ran.
        writeBlueprintFileAtomically: (filePath: string, contents: string) => BlueprintFileWriteResult = writeBlueprintFileAtomicallyDefault,
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
        this.writeBlueprintFileAtomically = writeBlueprintFileAtomically;
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
            "Design a Blueprint Project -- a standalone GameBlueprint JSON file (reels, symbols, paytable, reel " +
            "weighting) that feeds into \"pokie build\" -- through an interactive wizard when run in a terminal " +
            "with no --blank/--random (\"pokie create <name>\" pre-fills the name), or write one straight from " +
            "the filled-in starter template non-interactively via --blank for a bare-minimum one, or --random " +
            "for an always-valid randomly generated one, with its reel weighting already expressed as valid " +
            "per-reel generation (--seed to reproduce it, --preset default|variant to pick the generation " +
            'strategy). For a prepared, immediately valid package instead, use "pokie init".'
        );
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    public run(args: string[]): Promise<number> {
        const resultRef: {value?: number} = {};
        const command = this.buildCommand(resultRef);

        // Which usage string a PARSE-time failure (an unrecognized option, a missing option value) gets
        // reported against -- picked the same way the action itself resolves --random/--blank precedence,
        // but from the raw argv rather than Commander's own parsed options, since a parse failure can
        // happen before the action ever runs.
        let usage = USAGE;
        if (args.includes("--random")) {
            usage = RANDOM_USAGE;
        } else if (args.includes("--blank")) {
            usage = BLANK_USAGE;
        }

        return command
            .parseAsync(args, {from: "user"})
            .then(() => resultRef.value!)
            .catch((error: unknown) => {
                if (isCommanderHelpDisplay(error)) {
                    return 0;
                }
                throw translateCommanderError(error, {
                    unknownOption: (flag) => `Unknown option "${flag}". ${usage}`,
                    optionMissingArgument: (flag) => {
                        if (flag === "--seed") return `--seed requires an integer value. ${RANDOM_USAGE}`;
                        if (flag === "--preset") return `--preset must be one of: ${RANDOM_PRESETS.join(", ")}. ${RANDOM_USAGE}`;
                        if (flag === "--out") return `--out requires a file path. ${usage}`;
                        return `Unknown option "${flag}". ${usage}`;
                    },
                });
            });
    }

    // One real Commander command owns every option/argument this class recognizes at all -- --blank and
    // --random are ordinary boolean options here (not subcommands: Commander subcommands are positional
    // words, but these are genuinely flags that may appear anywhere alongside an optional [name], the
    // same grammar every other option on this command already has), so "pokie create --help" (with
    // neither given) renders the COMPLETE grammar -- --blank, --random, --seed, --preset, --out -- not
    // just whichever subset the bare/named path happens to declare. `resultRef` is written by the
    // action; run() supplies its own real box and reads it back once parsing resolves, while
    // getCommanderCommand() never parses this tree at all, so its own default box is never read.
    // --random takes precedence over --blank when both are given (matching this class's own historical
    // precedence, from when each was parsed by a separate, hand-picked Command instance); --seed/
    // --preset are only meaningful together with --random, but are declared unconditionally rather than
    // behind a second parse, so Commander's own --help renders them in the one place a caller would
    // look for them.
    private buildCommand(resultRef: {value?: number} = {}): Command {
        return createCommanderCliCommand("create")
            .description(this.getDescription())
            .argument("[name]", "optional preset name -- pre-fills the wizard, or names the --blank/--random output")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .option("--blank", "write a bare-minimum blueprint straight from the starter template, no wizard")
            .option("--random", "write an always-valid, randomly generated blueprint directly, no wizard")
            .option("--seed <integer>", "reproduce a specific random blueprint (only meaningful with --random)", (value: string) => {
                if (!Number.isInteger(Number(value))) {
                    throw new Error(`--seed requires an integer value. ${RANDOM_USAGE}`);
                }
                return Number(value);
            })
            .option(
                "--preset <preset>",
                "which random generation strategy to use (only meaningful with --random)",
                (value: string) => {
                    if (!RANDOM_PRESETS.includes(value as RandomPreset)) {
                        throw new Error(`--preset must be one of: ${RANDOM_PRESETS.join(", ")}. ${RANDOM_USAGE}`);
                    }
                    return value as RandomPreset;
                },
                "default" as RandomPreset,
            )
            .option("--out <file>", "output path (default: derived from the written blueprint's own manifest id)")
            .action(
                async (
                    name: string | null,
                    excess: string[],
                    options: {blank?: boolean; random?: boolean; seed?: number; preset: RandomPreset; out?: string},
                ) => {
                    const normalizedName = name ?? undefined;
                    if (options.random) {
                        if (excess.length > 0) {
                            throw new Error(`Unexpected extra argument "${excess[0]}". ${RANDOM_USAGE}`);
                        }
                        resultRef.value = this.executeRandom(normalizedName, options.seed, options.preset, options.out);
                    } else if (options.blank) {
                        if (excess.length > 0) {
                            throw new Error(`Unexpected extra argument "${excess[0]}". ${BLANK_USAGE}`);
                        }
                        resultRef.value = this.executeBlank(normalizedName, options.out);
                    } else {
                        if (excess.length > 0) {
                            throw new Error(`Unexpected extra argument "${excess[0]}". ${USAGE}`);
                        }
                        if (normalizedName !== undefined) {
                            this.assertValidName(normalizedName);
                        }
                        resultRef.value = await this.executeDefault(normalizedName, options.out);
                    }
                },
            );
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
    // confirmation all leave no file behind, since commitBlueprintFile() is the only thing that ever
    // writes into the filesystem here, and it only runs after every one of those has already passed (and
    // is itself the atomic, create-only commit -- see writeBlueprintFileAtomically's own doc comment).
    private async executeDefault(name: string | undefined, out: string | undefined): Promise<number> {
        if (!this.isInteractiveTerminal()) {
            console.error(GUIDANCE_NOT_INTERACTIVE);
            return 1;
        }

        const prompt = this.createPrompt();
        try {
            const result = await this.wizard.run(prompt, {
                presetName: name,
                destination: {
                    label: "Blueprint file",
                    defaultPathFor: (id) => out ?? this.defaultBlueprintPath(id),
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
                console.error(this.alreadyExistsMessage(filePath));
                return 1;
            }

            this.printPreview(blueprint, filePath);
            const confirmed = await this.confirmSave(prompt);
            if (!confirmed) {
                console.log("\nCreate cancelled.");
                return 1;
            }

            // The fileExists() check above is only a best-effort "don't bother asking to confirm a save
            // that's already doomed" -- it can still race against something else creating filePath in the
            // window between that check and this commit (or between confirmation and this commit, while
            // waiting on the user). commitBlueprintFile() is the authoritative check: it never overwrites
            // an existing destination, however/whenever it appeared.
            if (this.commitBlueprintFile(filePath, blueprint).status === "conflict") {
                console.error(this.alreadyExistsMessage(filePath));
                return 1;
            }
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
        console.log(`\nBuild it:`);
        console.log(`  pokie build ${filePath} --target tsPackage --out <dir> --dry-run`);
        console.log(`  pokie build ${filePath} --target tsPackage --out <dir>`);
    }

    // --blank: writes the filled-in starter template directly, no wizard.
    private executeBlank(name: string | undefined, out: string | undefined): number {
        const blueprint = applyBlueprintNameOverride(this.createBlankBlueprint(), name);
        const filePath = out ?? this.defaultBlueprintPath(blueprint.manifest.id);

        this.writeBlueprintFile(filePath, blueprint);
        this.printCreated(blueprint, filePath);
        return 0;
    }

    // --random: a data-driven GameBlueprint (see RandomGameBlueprintGenerator) generated on the fly and
    // written straight to disk -- never builds or smoke-simulates a package itself; "pokie build
    // <file> --target tsPackage" is the one place any written blueprint (random or hand-authored)
    // becomes a real package. Its reel weighting is expressed as a
    // per-reel reelStripGeneration array (see buildRandomReelStripGeneration.ts) rather than a single
    // flat symbolWeights map, so the file already demonstrates "valid per-reel generation" -- every reel
    // has its own independent, reproducible generation config -- instead of leaving all of them to share
    // one implicit engine-wide weighting.
    private executeRandom(name: string | undefined, seed: number | undefined, preset: RandomPreset, out: string | undefined): number {
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

    // --blank/--random's own synchronous save: same atomic, create-only commit executeDefault's
    // confirmed wizard save uses (see commitBlueprintFile), just thrown as an Error instead of a
    // console.error + exit code -- matching how a usage error on either of these two paths has always
    // surfaced.
    private writeBlueprintFile(filePath: string, blueprint: GameBlueprint): void {
        if (this.commitBlueprintFile(filePath, blueprint).status === "conflict") {
            throw new Error(this.alreadyExistsMessage(filePath));
        }
    }

    private commitBlueprintFile(filePath: string, blueprint: GameBlueprint): BlueprintFileWriteResult {
        return this.writeBlueprintFileAtomically(filePath, `${JSON.stringify(blueprint, null, 4)}\n`);
    }

    private alreadyExistsMessage(filePath: string): string {
        return `"${filePath}" already exists. Choose a different path, or remove/edit the existing file first.`;
    }
}
