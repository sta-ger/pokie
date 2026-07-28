import fs from "fs";
import path from "path";
import {
    OutcomeLibraryBundleModeInput,
    OutcomeLibraryBundleValidating,
    OutcomeLibraryBundleValidator,
    OutcomeLibraryBundleWriter,
    OutcomeLibraryBundleWriting,
    ValidationIssue,
    WeightedOutcomeInput,
    WeightedOutcomeLibrary,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {CommanderErrorMessages, createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";
import {streamJsonlOutcomes} from "./internal/streamJsonlOutcomes.js";

const USAGE = "Usage: pokie outcomelibrary build <config.json> [--out <dir>]\n   or: pokie outcomelibrary validate <bundleDir> [--deep]";
const BUILD_USAGE = "Usage: pokie outcomelibrary build <config.json> [--out <dir>]";
const VALIDATE_USAGE = "Usage: pokie outcomelibrary validate <bundleDir> [--deep]";
const CONFIG_HINT =
    '<config.json> lists one outcome source per mode, either a plain WeightedOutcomeLibrary JSON file — ' +
    '{"modes": [{"modeName": "base", "libraryPath": "./libraries/base.json"}, ...]} — which is fully loaded into ' +
    'memory, or a streaming JSONL file of outcomes (one canonical {"id","weight","artifact"} record per line, ' +
    'not wrapped in a library object) for a mode too large to hold in memory at once — {"modeName": "bonus", ' +
    '"outcomesPath": "./outcomes-bonus.jsonl", "libraryId": "bonus-lib"} ("libraryId" is required for this form, ' +
    'since there\'s no wrapping library object to read it from; "schemaVersion" is optional). Exactly one of ' +
    '"libraryPath"/"outcomesPath" is required per mode — see docs/outcome-library-bundle.md for the format.';

type BuildDescriptorModeEntry = {
    modeName: string;
    libraryPath?: string;
    outcomesPath?: string;
    libraryId?: string;
    schemaVersion?: number;
};
type BuildDescriptor = {modes: BuildDescriptorModeEntry[]};

// Two CLI verbs ("pokie outcomelibrary build"/"pokie outcomelibrary validate") sharing one command, the same
// way StakeEngineCommand owns both "stakeengine export"/"stakeengine import" — cli/pokie.ts dispatches by exact
// name match, so two separate classes could never both return getName() === "outcomelibrary".
export class OutcomeLibraryCommand implements CliCommandHandling {
    private readonly writer: OutcomeLibraryBundleWriting;
    private readonly validator: OutcomeLibraryBundleValidating;
    private readonly loadJson: (filePath: string) => unknown;
    private readonly streamOutcomes: (filePath: string) => AsyncGenerator<WeightedOutcomeInput>;

    constructor(
        pokieVersion: string,
        writer: OutcomeLibraryBundleWriting = new OutcomeLibraryBundleWriter(pokieVersion),
        validator: OutcomeLibraryBundleValidating = new OutcomeLibraryBundleValidator(),
        loadJson: (filePath: string) => unknown = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf-8")),
        streamOutcomes: (filePath: string) => AsyncGenerator<WeightedOutcomeInput> = streamJsonlOutcomes,
    ) {
        this.writer = writer;
        this.validator = validator;
        this.loadJson = loadJson;
        this.streamOutcomes = streamOutcomes;
    }

    public getName(): string {
        return "outcomelibrary";
    }

    public getDescription(): string {
        return (
            "Build a canonical POKIE outcome-library persistence bundle from WeightedOutcomeLibrary JSON files, or validate one " +
            '("pokie outcomelibrary build <config.json>" / "pokie outcomelibrary validate <bundleDir>").'
        );
    }

    // Two ordinary-word verbs ("build"/"validate") sharing one parent Commander instance — real nested
    // subcommands (see cli/commands/internal/CommanderCliAdapter.ts), so Commander itself both
    // dispatches by exact verb name and validates each verb's own args/options. The messages passed
    // to translateCommanderError are picked per-verb (from args[0], read before parsing) since a
    // structural error caught at the shared parent.parseAsync() call doesn't otherwise say which
    // subcommand it came from; an empty/unrecognized verb falls back to the combined USAGE+hint the
    // original hand-rolled switch's own `default` case threw.
    public run(args: string[]): Promise<number> {
        // An empty argv has no verb for Commander to dispatch on at all; rather than lean on
        // Commander's own incidental "commander.help" throw for this (still handled below via
        // noCommand, e.g. for "pokie outcomelibrary help"), reject it explicitly up front with the
        // same combined usage+hint text the original hand-rolled switch's own `default` case threw.
        if (args.length === 0) {
            return Promise.reject(new Error(`${USAGE}\n${CONFIG_HINT}`));
        }

        let exitCode = 0;
        const parent = createCommanderCliCommand("outcomelibrary");

        parent
            .command("build")
            .argument("<config.json>")
            .argument("[excess...]")
            .option("--out <dir>")
            .action(async (configPath: string, excess: string[], options: {out?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${BUILD_USAGE}`);
                }
                const outDir = options.out ?? path.join(path.dirname(configPath), "outcomelibrary");
                exitCode = await this.executeBuild(configPath, outDir);
            });

        parent
            .command("validate")
            .argument("<bundleDir>")
            .argument("[excess...]")
            .option("--deep")
            .action(async (bundleDir: string, excess: string[], options: {deep?: boolean}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${VALIDATE_USAGE}`);
                }
                exitCode = await this.executeValidate(bundleDir, options.deep ?? false);
            });

        const verb = args[0];
        let verbMessages: CommanderErrorMessages = {};
        if (verb === "build") {
            verbMessages = {
                missingArgument: `${BUILD_USAGE}\n${CONFIG_HINT}`,
                unknownOption: (flag) => `Unknown option "${flag}". ${BUILD_USAGE}`,
                optionMissingArgument: (flag) => (flag === "--out" ? `--out requires a directory path. ${BUILD_USAGE}` : `Unknown option "${flag}". ${BUILD_USAGE}`),
            };
        } else if (verb === "validate") {
            verbMessages = {
                missingArgument: VALIDATE_USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${VALIDATE_USAGE}`,
            };
        }

        return parent
            .parseAsync(args, {from: "user"})
            .then(() => exitCode)
            .catch((error: unknown) => {
                throw translateCommanderError(error, {
                    ...verbMessages,
                    unknownCommand: `${USAGE}\n${CONFIG_HINT}`,
                    noCommand: `${USAGE}\n${CONFIG_HINT}`,
                });
            });
    }

    private async executeBuild(configPath: string, outDir: string): Promise<number> {
        const descriptor = this.loadDescriptor(configPath);
        const configDir = path.dirname(configPath);

        const modes: OutcomeLibraryBundleModeInput[] = descriptor.modes.map((entry) => {
            if (entry.libraryPath !== undefined) {
                const library = this.loadJson(path.resolve(configDir, entry.libraryPath)) as WeightedOutcomeLibrary;
                return {modeName: entry.modeName, libraryId: library.libraryId, schemaVersion: library.schemaVersion, outcomes: library.outcomes};
            }
            return {
                modeName: entry.modeName,
                // Safe: loadDescriptor already requires libraryId whenever outcomesPath is present.
                libraryId: entry.libraryId as string,
                schemaVersion: entry.schemaVersion,
                outcomes: this.streamOutcomes(path.resolve(configDir, entry.outcomesPath as string)),
            };
        });

        const result = await this.writer.writeToDirectory(modes, outDir);
        const errors = result.issues.filter((issue) => issue.severity === "error");
        const warnings = result.issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            console.error(`Could not build an outcome library bundle from "${configPath}" to "${outDir}" (${errors.length} error(s)):`);
            this.printIssues(errors);
            return 1;
        }

        console.log(`Built an outcome library bundle from "${configPath}" to "${outDir}":`);
        for (const file of result.files) {
            console.log(`  wrote  ${file}`);
        }
        for (const issue of warnings) {
            console.log(`  warning  ${issue.code}: ${issue.message}`);
        }

        return 0;
    }

    private async executeValidate(bundleDir: string, deep: boolean): Promise<number> {
        const issues = await this.validator.validate(bundleDir, {deep});
        const errors = issues.filter((issue) => issue.severity === "error");
        const rest = issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            console.error(`"${bundleDir}" is not a valid outcome library bundle (${errors.length} error(s)):`);
            this.printIssues(errors);
            return 1;
        }

        console.log(`"${bundleDir}" is a valid outcome library bundle${deep ? " (deep check)" : ""}.`);
        for (const issue of rest) {
            console.log(`  ${issue.severity}  ${issue.code}: ${issue.message}`);
        }

        return 0;
    }

    private printIssues(issues: ValidationIssue[]): void {
        for (const issue of issues) {
            console.error(`  - ${issue.code}: ${issue.message}`);
        }
    }

    private loadDescriptor(configPath: string): BuildDescriptor {
        const parsed = this.loadJson(configPath);
        if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as {modes?: unknown}).modes)) {
            throw new Error(`"${configPath}" is not a valid outcome library bundle config. ${CONFIG_HINT}`);
        }

        const modes = (parsed as {modes: unknown[]}).modes.map((entry, position) => {
            if (typeof entry !== "object" || entry === null || typeof (entry as {modeName?: unknown}).modeName !== "string") {
                throw new Error(`"${configPath}": modes[${position}] must be an object with a string "modeName". ${CONFIG_HINT}`);
            }
            const e = entry as {modeName: string; libraryPath?: unknown; outcomesPath?: unknown; libraryId?: unknown; schemaVersion?: unknown};

            const hasLibraryPath = typeof e.libraryPath === "string";
            const hasOutcomesPath = typeof e.outcomesPath === "string";
            if (hasLibraryPath === hasOutcomesPath) {
                throw new Error(`"${configPath}": modes[${position}] must specify exactly one of "libraryPath" or "outcomesPath". ${CONFIG_HINT}`);
            }
            if (hasOutcomesPath && typeof e.libraryId !== "string") {
                throw new Error(`"${configPath}": modes[${position}] uses "outcomesPath" and so requires a string "libraryId". ${CONFIG_HINT}`);
            }
            if (e.schemaVersion !== undefined && typeof e.schemaVersion !== "number") {
                throw new Error(`"${configPath}": modes[${position}]'s "schemaVersion" must be a number when present. ${CONFIG_HINT}`);
            }

            return {
                modeName: e.modeName,
                ...(hasLibraryPath ? {libraryPath: e.libraryPath as string} : {outcomesPath: e.outcomesPath as string, libraryId: e.libraryId as string}),
                ...(e.schemaVersion !== undefined ? {schemaVersion: e.schemaVersion as number} : {}),
            };
        });

        return {modes};
    }

}
