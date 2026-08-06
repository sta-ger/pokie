import {PokieGamePackageValidating, PokieGamePackageValidationReport, PokieGamePackageValidator} from "pokie";
import fs from "fs";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../materialize/materializeRuntimePackage.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

type ValidateFormat = "summary" | "json";

const USAGE = "Usage: pokie validate <packageRoot> [--format json] [--out <file>]";

export class ValidateCommand implements CliCommandHandling {
    private readonly validator: PokieGamePackageValidating;
    private readonly writeFile: (file: string, contents: string) => void;
    // Crosses from "the packageRoot the caller gave us" to "a real, loadable runtime" before this.validator
    // ever touches it -- see materializeRuntimePackage.ts's own doc comment. Defaults to a no-op
    // passthrough so every existing caller/test keeps behaving exactly as before this boundary existed;
    // cli/pokie.ts wires the real, materializing one in.
    private readonly resolveRuntimePackageRoot: RuntimePackageResolving;

    constructor(
        validator: PokieGamePackageValidating = new PokieGamePackageValidator(),
        writeFile: (file: string, contents: string) => void = (file, contents) => fs.writeFileSync(file, contents, "utf-8"),
        resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
    ) {
        this.validator = validator;
        this.writeFile = writeFile;
        this.resolveRuntimePackageRoot = resolveRuntimePackageRoot;
    }

    public getName(): string {
        return "validate";
    }

    public getDescription(): string {
        return "Validate a POKIE game package's contract (manifest, entry module) without playing it.";
    }

    public async run(args: string[]): Promise<number> {
        let packageRoot!: string;
        let format!: ValidateFormat;
        let out: string | undefined;

        const command = createCommanderCliCommand("validate")
            .argument("<packageRoot>")
            .argument("[excess...]")
            .option("--format <value>", 'only "json" is supported', (value: string) => {
                if (value !== "json") {
                    throw new Error(`--format only supports "json". ${USAGE}`);
                }
                return "json" as ValidateFormat;
            })
            .option("--out <file>", "file path to write the report to")
            .action((root: string, excess: string[], options: {format?: ValidateFormat; out?: string}) => {
                // An empty-string positional is "present" as far as Commander's own required-argument
                // check is concerned, but the pre-Commander behavior this preserves treated it the same
                // as an entirely missing one.
                if (!root || excess.length > 0) {
                    throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : USAGE);
                }
                packageRoot = root;
                format = options.format ?? "summary";
                out = options.out;
            });

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
