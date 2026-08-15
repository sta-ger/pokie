import {Command} from "commander";
import {
    OutcomeLibraryBundleValidating,
    OutcomeLibraryBundleValidator,
    PokieGamePackageValidating,
    PokieGamePackageValidationReport,
    PokieGamePackageValidator,
    ProjectResolving,
    ProjectTargetResolver,
} from "pokie";
import fs from "fs";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../materialize/materializeRuntimePackage.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

type ValidateFormat = "summary" | "json";

const USAGE = "Usage: pokie validate <project> [--deep] [--format json] [--out <file>]";

export class ValidateCommand implements CliCommandHandling {
    private readonly validator: PokieGamePackageValidating;
    private readonly writeFile: (file: string, contents: string) => void;
    // Crosses from "the packageRoot the caller gave us" to "a real, loadable runtime" before this.validator
    // ever touches it -- see materializeRuntimePackage.ts's own doc comment. Defaults to a no-op
    // passthrough so every existing caller/test keeps behaving exactly as before this boundary existed;
    // cli/pokie.ts wires the real, materializing one in.
    private readonly resolveRuntimePackageRoot: RuntimePackageResolving;
    private readonly resolveProject: ProjectResolving;
    private readonly outcomeLibraryValidator: OutcomeLibraryBundleValidating;

    constructor(
        validator: PokieGamePackageValidating = new PokieGamePackageValidator(),
        writeFile: (file: string, contents: string) => void = (file, contents) => fs.writeFileSync(file, contents, "utf-8"),
        resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        outcomeLibraryValidator: OutcomeLibraryBundleValidating = new OutcomeLibraryBundleValidator(),
    ) {
        this.validator = validator;
        this.writeFile = writeFile;
        this.resolveRuntimePackageRoot = resolveRuntimePackageRoot;
        this.resolveProject = resolveProject;
        this.outcomeLibraryValidator = outcomeLibraryValidator;
    }

    public getName(): string {
        return "validate";
    }

    public getDescription(): string {
        return "Validate a resolved POKIE project's supported contract without running it.";
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    public async run(args: string[]): Promise<number> {
        const resultRef: {packageRoot?: string; format?: ValidateFormat; out?: string; deep?: boolean} = {};
        const command = this.buildCommand(resultRef);

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                return 0;
            }
            throw translateCommanderError(error, {
                missingArgument: USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                optionMissingArgument: (flag) =>
                    flag === "--format" ? `--format only supports "json". ${USAGE}` : `--out requires a file path. ${USAGE}`,
            });
        }

        const packageRoot = resultRef.packageRoot!;
        const format = resultRef.format!;
        const out = resultRef.out;
        const project = await this.resolveProject.resolve(packageRoot);
        if (project?.type === "outcomeLibrary") {
            return this.validateOutcomeLibrary(packageRoot, format, out, resultRef.deep ?? false);
        }
        const resolution = await this.resolveRuntimePackageRoot(packageRoot);
        let report: PokieGamePackageValidationReport;
        try {
            report = await this.validator.validate(resolution.runtimePath);
        } finally {
            await resolution.release();
        }

        if (out) {
            this.writeFile(out, JSON.stringify(report, null, 4));
        }

        if (format === "json") {
            console.log(JSON.stringify(report, null, 4));
        } else {
            this.printSummary(report);
            if (out) {
                console.log(`\nReport written to "${out}".`);
            }
        }

        return report.valid ? 0 : 1;
    }

    // Builds the exact Commander tree run() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and run() (for real parsing) use, so the
    // two can never drift apart. `resultRef` is written by the action; run() supplies its own real box
    // and reads it back once parsing resolves, while getCommanderCommand() never parses this tree at
    // all, so its own default box is never read.
    private buildCommand(resultRef: {packageRoot?: string; format?: ValidateFormat; out?: string; deep?: boolean} = {}): Command {
        return createCommanderCliCommand("validate")
            .description(this.getDescription())
            .argument("<project>", "an existing POKIE project")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .option("--format <value>", 'only "json" is supported (default: a human-readable summary)', (value: string) => {
                if (value !== "json") {
                    throw new Error(`--format only supports "json". ${USAGE}`);
                }
                return "json" as ValidateFormat;
            })
            .option("--out <file>", "file path to write the report to")
            .option("--deep", "also validate every outcome in an outcome-library project")
            .action((root: string, excess: string[], options: {format?: ValidateFormat; out?: string; deep?: boolean}) => {
                // An empty-string positional is "present" as far as Commander's own required-argument
                // check is concerned, but the pre-Commander behavior this preserves treated it the same
                // as an entirely missing one.
                if (!root || excess.length > 0) {
                    throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : USAGE);
                }
                resultRef.packageRoot = root;
                resultRef.format = options.format ?? "summary";
                resultRef.out = options.out;
                resultRef.deep = options.deep ?? false;
            });
    }

    private async validateOutcomeLibrary(bundleDir: string, format: ValidateFormat, out: string | undefined, deep: boolean): Promise<number> {
        const issues = await this.outcomeLibraryValidator.validate(bundleDir, {deep});
        const errors = issues.filter((issue) => issue.severity === "error");
        const json = JSON.stringify({project: bundleDir, valid: errors.length === 0, issues}, null, 4);
        if (out) {
            this.writeFile(out, json);
        }
        if (format === "json") {
            console.log(json);
        } else if (errors.length > 0) {
            console.error(`"${bundleDir}" has ${errors.length} validation error(s):`);
            for (const issue of issues) {
                console.error(`  - ${issue.code}: ${issue.message}`);
            }
        } else {
            console.log(`"${bundleDir}" is valid${deep ? " (deep check)" : ""}.`);
            for (const issue of issues) {
                console.log(`  ${issue.severity}  ${issue.code}: ${issue.message}`);
            }
            if (out) {
                console.log(`\nReport written to "${out}".`);
            }
        }
        return errors.length === 0 ? 0 : 1;
    }

    private printSummary(report: PokieGamePackageValidationReport): void {
        if (report.game) {
            console.log(`Validating "${report.game.name}" (id: "${report.game.id}", v${report.game.version}) at "${report.packageRoot}"`);
        } else {
            console.log(`Validating package at "${report.packageRoot}"`);
        }
        console.log(`  valid           ${report.valid ? "yes" : "no"}`);

        if (report.errors.length > 0) {
            console.log(`\nErrors (${report.errors.length}):`);
            for (const issue of report.errors) {
                console.log(`  - ${issue.code}: ${issue.message}`);
            }
        }

        if (report.warnings.length > 0) {
            console.log(`\nWarnings (${report.warnings.length}):`);
            for (const issue of report.warnings) {
                console.log(`  - ${issue.code}: ${issue.message}`);
            }
        }

        if (report.suggestions.length > 0) {
            console.log("\nSuggestions:");
            for (const suggestion of report.suggestions) {
                console.log(`  - ${suggestion}`);
            }
        }

        if (report.valid && report.warnings.length === 0) {
            console.log("\nNo issues found.");
        }
    }
}
