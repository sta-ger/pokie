import fs from "fs";
import path from "path";
import {
    OutcomeLibraryBundleModeInput,
    OutcomeLibraryBundleValidating,
    OutcomeLibraryBundleValidator,
    OutcomeLibraryBundleWriter,
    OutcomeLibraryBundleWriting,
    ValidationIssue,
    WeightedOutcomeLibrary,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";

const USAGE = "Usage: pokie outcomelibrary build <config.json> [--out <dir>]\n   or: pokie outcomelibrary validate <bundleDir> [--deep]";
const BUILD_USAGE = "Usage: pokie outcomelibrary build <config.json> [--out <dir>]";
const VALIDATE_USAGE = "Usage: pokie outcomelibrary validate <bundleDir> [--deep]";
const CONFIG_HINT =
    '<config.json> lists one WeightedOutcomeLibrary JSON file per mode: ' +
    '{"modes": [{"modeName": "base", "libraryPath": "./libraries/base.json"}, ...]} — ' +
    "see docs/outcome-library-bundle.md for the format.";

type BuildOptions = {configPath: string; outDir: string};
type ValidateOptions = {bundleDir: string; deep: boolean};

type BuildDescriptorModeEntry = {modeName: string; libraryPath: string};
type BuildDescriptor = {modes: BuildDescriptorModeEntry[]};

// Two CLI verbs ("pokie outcomelibrary build"/"pokie outcomelibrary validate") sharing one command, the same
// way StakeEngineCommand owns both "stakeengine export"/"stakeengine import" — cli/pokie.ts dispatches by exact
// name match, so two separate classes could never both return getName() === "outcomelibrary".
export class OutcomeLibraryCommand implements CliCommandHandling {
    private readonly writer: OutcomeLibraryBundleWriting;
    private readonly validator: OutcomeLibraryBundleValidating;
    private readonly loadJson: (filePath: string) => unknown;

    constructor(
        pokieVersion: string,
        writer: OutcomeLibraryBundleWriting = new OutcomeLibraryBundleWriter(pokieVersion),
        validator: OutcomeLibraryBundleValidating = new OutcomeLibraryBundleValidator(),
        loadJson: (filePath: string) => unknown = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf-8")),
    ) {
        this.writer = writer;
        this.validator = validator;
        this.loadJson = loadJson;
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

    public run(args: string[]): Promise<number> {
        const [subcommand, ...rest] = args;
        switch (subcommand) {
            case "build":
                return this.runBuild(rest);
            case "validate":
                return this.runValidate(rest);
            default:
                return Promise.reject(new Error(`${USAGE}\n${CONFIG_HINT}`));
        }
    }

    private async runBuild(args: string[]): Promise<number> {
        const options = this.parseBuildArgs(args);
        const descriptor = this.loadDescriptor(options.configPath);
        const configDir = path.dirname(options.configPath);

        const modes: OutcomeLibraryBundleModeInput[] = descriptor.modes.map((entry) => ({
            modeName: entry.modeName,
            library: this.loadJson(path.resolve(configDir, entry.libraryPath)) as WeightedOutcomeLibrary,
        }));

        const result = await this.writer.writeToDirectory(modes, options.outDir);
        const errors = result.issues.filter((issue) => issue.severity === "error");
        const warnings = result.issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            console.error(`Could not build an outcome library bundle from "${options.configPath}" to "${options.outDir}" (${errors.length} error(s)):`);
            this.printIssues(errors);
            return 1;
        }

        console.log(`Built an outcome library bundle from "${options.configPath}" to "${options.outDir}":`);
        for (const file of result.files) {
            console.log(`  wrote  ${file}`);
        }
        for (const issue of warnings) {
            console.log(`  warning  ${issue.code}: ${issue.message}`);
        }

        return 0;
    }

    private async runValidate(args: string[]): Promise<number> {
        const options = this.parseValidateArgs(args);
        const issues = await this.validator.validate(options.bundleDir, {deep: options.deep});
        const errors = issues.filter((issue) => issue.severity === "error");
        const rest = issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            console.error(`"${options.bundleDir}" is not a valid outcome library bundle (${errors.length} error(s)):`);
            this.printIssues(errors);
            return 1;
        }

        console.log(`"${options.bundleDir}" is a valid outcome library bundle${options.deep ? " (deep check)" : ""}.`);
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
            if (
                typeof entry !== "object" ||
                entry === null ||
                typeof (entry as {modeName?: unknown}).modeName !== "string" ||
                typeof (entry as {libraryPath?: unknown}).libraryPath !== "string"
            ) {
                throw new Error(`"${configPath}": modes[${position}] must be {"modeName": string, "libraryPath": string}. ${CONFIG_HINT}`);
            }
            return entry as BuildDescriptorModeEntry;
        });

        return {modes};
    }

    private parseBuildArgs(args: string[]): BuildOptions {
        const [configPath, ...rest] = args;
        if (!configPath) {
            throw new Error(`${BUILD_USAGE}\n${CONFIG_HINT}`);
        }

        let outDir = path.join(path.dirname(configPath), "outcomelibrary");
        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--out": {
                    if (value === undefined) {
                        throw new Error(`--out requires a directory path. ${BUILD_USAGE}`);
                    }
                    outDir = value;
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${BUILD_USAGE}`);
            }
        }

        return {configPath, outDir};
    }

    private parseValidateArgs(args: string[]): ValidateOptions {
        const [bundleDir, ...rest] = args;
        if (!bundleDir) {
            throw new Error(VALIDATE_USAGE);
        }

        let deep = false;
        for (const flag of rest) {
            if (flag === "--deep") {
                deep = true;
                continue;
            }
            throw new Error(`Unknown option "${flag}". ${VALIDATE_USAGE}`);
        }

        return {bundleDir, deep};
    }
}
