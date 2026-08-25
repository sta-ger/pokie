import {Command} from "commander";
import fs from "fs";
import path from "path";
import {buildPackageJsonPatch, PackageJsonLike, PokieGamePackageValidating, PokieGamePackageValidator} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {GamePackagePreparationError, GamePackagePreparationPhase} from "../prepare/GamePackagePreparationError.js";
import {extractNpmStderr, PackageCommandRunning, runPackageCommand} from "../prepare/PackageCommandRunner.js";
import {GamePackageMergeOverrides, GamePackageMerging} from "../scaffold/GamePackageMerging.js";
import {GamePackageMerger} from "../scaffold/GamePackageMerger.js";
import {ScaffoldResult} from "../scaffold/ScaffoldResult.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const USAGE =
    "Usage: pokie init [directory] [--package-name <name>] [--game-id <id>] [--game-name <name>] " +
    "[--version <version>] [--yes] [--no-install] [--no-prepare]";

type ParsedInitArgs = {
    directory: string;
    packageName?: string;
    gameId?: string;
    gameName?: string;
    version?: string;
    yes: boolean;
    install: boolean;
    prepare: boolean;
};

// True for a directory this command should refuse to touch without an explicit --yes: it already
// exists, already has *something* in it, and that something isn't recognizable as this tool's own
// earlier work (a package.json this command itself has already patched -- see isCompatiblePokiePackage).
// An empty or not-yet-existing directory, and a directory this command already merged into (a retry
// after a failed install/build, or simply running "pokie init" again), both return false -- neither
// ever needs --yes.
export function defaultDirectoryNeedsConfirmation(resolvedDir: string): boolean {
    if (!fs.existsSync(resolvedDir)) {
        return false;
    }
    if (fs.readdirSync(resolvedDir).length === 0) {
        return false;
    }

    const packageJsonPath = path.join(resolvedDir, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
        return true;
    }
    try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as PackageJsonLike;
        return !isCompatiblePokiePackage(pkg);
    } catch {
        return true;
    }
}

// Merely depending on "pokie" doesn't prove a package.json is this tool's own earlier work -- any npm
// project that uses pokie as a library would match that. "pokie.entry" is different: GamePackageMerger
// (buildPackageJsonPatch) always writes it, atomically alongside main/exports/scripts.build, to the
// exact same fixed path every time it patches package.json, and no other tool has a reason to write
// that specific field. So a package.json whose own "pokie.entry" already matches what a fresh merge
// would write there is unambiguously a package this command already merged into (or one authored to be
// resumable by it) -- safe to retry without --yes -- while one that merely lists "pokie" as a dependency
// is not.
function isCompatiblePokiePackage(pkg: PackageJsonLike): boolean {
    const requiredEntry = buildPackageJsonPatch({}, "0.0.0").pokie?.entry;
    return pkg.pokie?.entry !== undefined && pkg.pokie.entry === requiredEntry;
}

export class InitCommand implements CliCommandHandling {
    private readonly merger: GamePackageMerging;
    private readonly runCommand: PackageCommandRunning;
    private readonly validator: PokieGamePackageValidating;
    private readonly directoryNeedsConfirmation: (resolvedDir: string) => boolean;

    constructor(
        pokieVersion: string,
        merger: GamePackageMerging = new GamePackageMerger(pokieVersion),
        runCommand: PackageCommandRunning = runPackageCommand,
        validator: PokieGamePackageValidating = new PokieGamePackageValidator(),
        directoryNeedsConfirmation: (resolvedDir: string) => boolean = defaultDirectoryNeedsConfirmation,
    ) {
        this.merger = merger;
        this.runCommand = runCommand;
        this.validator = validator;
        this.directoryNeedsConfirmation = directoryNeedsConfirmation;
    }

    public getName(): string {
        return "init";
    }

    public getDescription(): string {
        return (
            "Turn the current or given [directory] into a prepared, immediately valid POKIE game package in " +
            "place, with no game-id subdirectory: merges/patches package.json, and writes tsconfig.json, " +
            "README.md and a real, hand-editable src/index.ts wherever they're missing, then (unless " +
            "--no-prepare) installs dependencies and builds and verifies dist/index.js -- entirely " +
            "non-interactively, with --package-name/--game-id/--game-name/--version to override its " +
            "directory-derived defaults. Never asks reel/paytable/mechanics questions; for those, design a " +
            'Blueprint Project with "pokie create" and build it with "pokie build" instead.'
        );
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    public run(args: string[]): Promise<number> {
        let parsed: ParsedInitArgs;
        try {
            parsed = this.parseArgs(args);
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                return Promise.resolve(0);
            }
            // Rethrown synchronously (never Promise.reject) -- parseArgs() itself always throws
            // synchronously, same as before --help existed, and this command's own contract (see
            // InitCommand.test.ts) expects run() to throw synchronously here too, not return a
            // rejected promise.
            throw error;
        }
        try {
            return this.runInit(parsed);
        } catch (error) {
            return Promise.reject(error);
        }
    }

    // Builds the exact Commander tree parseArgs() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and parseArgs() (for real parsing) use, so
    // the two can never drift apart. `resultRef` is written by the action; parseArgs() supplies its own
    // real box and reads it back once parsing resolves, while getCommanderCommand() never parses this
    // tree at all, so its own default box is never read.
    private buildCommand(resultRef: {value?: ParsedInitArgs} = {}): Command {
        return createCommanderCliCommand("init")
            .description(this.getDescription())
            .argument("[directory]", "directory to initialize in place (default: the current directory)")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .option("--package-name <name>", "override the package.json \"name\" (default: derived from the directory)")
            .option("--game-id <id>", "override the game manifest id (default: derived from the directory)")
            .option("--game-name <name>", "override the game manifest name (default: derived from the directory)")
            .option("--version <version>", "override the initial package/game version (default: \"0.1.0\")")
            .option("--yes", "confirm merging into a non-empty directory that doesn't look like a POKIE package yet")
            .option("--no-install", "skip \"npm install\" (still builds/verifies unless --no-prepare is also given)")
            .option("--no-prepare", "scaffold files only -- skip installing dependencies, building, and verifying")
            .action(
                (
                    directory: string | null,
                    excess: string[],
                    options: {
                        packageName?: string;
                        gameId?: string;
                        gameName?: string;
                        version?: string;
                        yes?: boolean;
                        install: boolean;
                        prepare: boolean;
                    },
                ) => {
                    if (excess.length > 0) {
                        throw new Error(`Unexpected extra argument "${excess[0]}". ${USAGE}`);
                    }
                    resultRef.value = {
                        directory: directory ?? ".",
                        packageName: options.packageName,
                        gameId: options.gameId,
                        gameName: options.gameName,
                        version: options.version,
                        yes: options.yes ?? false,
                        install: options.install,
                        prepare: options.prepare,
                    };
                },
            );
    }


    private parseArgs(args: string[]): ParsedInitArgs {
        const resultRef: {value?: ParsedInitArgs} = {};
        const command = this.buildCommand(resultRef);

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                throw error;
            }
            throw translateCommanderError(error, {
                unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                optionMissingArgument: (flag) => `Unknown option "${flag}". ${USAGE}`,
            });
        }
        return resultRef.value!;
    }

    private async runInit(parsed: ParsedInitArgs): Promise<number> {
        const projectRoot = path.resolve(parsed.directory);

        if (fs.existsSync(projectRoot) && !fs.statSync(projectRoot).isDirectory()) {
            console.error(`"${projectRoot}" is not a directory. Choose a directory to initialize.`);
            return 1;
        }

        if (this.directoryNeedsConfirmation(projectRoot) && !parsed.yes) {
            console.error(
                `"${projectRoot}" already has files in it and doesn't look like a POKIE package yet.\n` +
                    `Re-run with --yes to merge POKIE's package files into it -- existing files are only ever ` +
                    "added to, never overwritten.",
            );
            return 1;
        }

        const overrides: GamePackageMergeOverrides = {
            packageName: parsed.packageName,
            id: parsed.gameId,
            name: parsed.gameName,
            version: parsed.version,
        };
        const scaffold = this.merger.merge(projectRoot, overrides);

        for (const file of scaffold.createdFiles) {
            console.log(`  created  ${file}`);
        }
        for (const file of scaffold.updatedFiles) {
            console.log(`  updated  ${file}`);
        }
        for (const file of scaffold.skippedFiles) {
            console.log(`  skipped  ${file} (already exists)`);
        }

        if (!parsed.prepare) {
            console.log(`\nGame package "${scaffold.manifest.name}" (id: "${scaffold.manifest.id}") scaffolded in "${projectRoot}".`);
            console.log(`Next: run "npm install" then "npm run build" in "${projectRoot}" to finish preparing it.`);
            return 0;
        }

        if (parsed.install) {
            await this.runManagedCommand("dependencies", ["install"], projectRoot, extractNpmStderr);
        }
        await this.runManagedCommand("build", ["run", "build"], projectRoot);
        await this.runVerifyPhase(projectRoot);

        this.printPrepared(scaffold, projectRoot);
        return 0;
    }

    private async runManagedCommand(
        phase: GamePackagePreparationPhase,
        npmArgs: string[],
        projectRoot: string,
        extractDetails?: (error: unknown) => string | undefined,
    ): Promise<void> {
        const npmCommand = `npm ${npmArgs.join(" ")}`;
        try {
            await this.runCommand("npm", npmArgs, projectRoot);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new GamePackagePreparationError(
                phase,
                `"${npmCommand}" failed in "${projectRoot}": ${detail}\n` +
                    `Run "${npmCommand}" manually in "${projectRoot}" to see the full output, fix the underlying ` +
                    `issue, then re-run "pokie init ${projectRoot}" to retry.`,
                extractDetails?.(error),
            );
        }
    }

    private async runVerifyPhase(projectRoot: string): Promise<void> {
        const report = await this.validator.validate(projectRoot);
        if (report.valid) {
            return;
        }

        const details = report.errors.map((issue) => `  - ${issue.code}: ${issue.message}`).join("\n");
        throw new GamePackagePreparationError(
            "verify",
            `Prepared package "${projectRoot}" is not a valid POKIE game:\n${details}\n` +
                `If this is a missing/stale build, run "npm run build" in "${projectRoot}" so "dist/index.js" ` +
                `matches the current source, then re-run "pokie init ${projectRoot}".`,
        );
    }

    private printPrepared(scaffold: ScaffoldResult, projectRoot: string): void {
        console.log(`\nGame package "${scaffold.manifest.name}" (id: "${scaffold.manifest.id}") prepared and verified in "${projectRoot}".`);
        console.log(`Load it anywhere with: loadPokieGame("${projectRoot}") from "pokie".`);
        console.log(`\nNext:`);
        console.log(`  pokie validate ${projectRoot}`);
        console.log(`  pokie sim ${projectRoot} --rounds 10000 --seed demo --out sim.json`);
        console.log(`  pokie dev ${projectRoot}`);
        console.log(`  npm start`);
    }
}
