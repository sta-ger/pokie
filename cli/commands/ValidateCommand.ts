import {PokieGamePackageValidating, PokieGamePackageValidationReport, PokieGamePackageValidator} from "pokie";
import fs from "fs";
import {CliCommandHandling} from "../CliCommandHandling.js";

type ValidateFormat = "summary" | "json";

type ValidateOptions = {
    packageRoot: string;
    format: ValidateFormat;
    out?: string;
};

const USAGE = "Usage: pokie validate <packageRoot> [--format json] [--out <file>]";

export class ValidateCommand implements CliCommandHandling {
    private readonly validator: PokieGamePackageValidating;
    private readonly writeFile: (file: string, contents: string) => void;

    constructor(
        validator: PokieGamePackageValidating = new PokieGamePackageValidator(),
        writeFile: (file: string, contents: string) => void = (file, contents) => fs.writeFileSync(file, contents, "utf-8"),
    ) {
        this.validator = validator;
        this.writeFile = writeFile;
    }

    public getName(): string {
        return "validate";
    }

    public getDescription(): string {
        return "Validate a POKIE game package's contract (manifest, entry module) without playing it.";
    }

    public async run(args: string[]): Promise<number> {
        const options = this.parseArgs(args);
        const report = await this.validator.validate(options.packageRoot);

        if (options.out) {
            this.writeFile(options.out, JSON.stringify(report, null, 4));
        }

        if (options.format === "json") {
            console.log(JSON.stringify(report, null, 4));
        } else {
            this.printSummary(report);
            if (options.out) {
                console.log(`\nReport written to "${options.out}".`);
            }
        }

        return report.valid ? 0 : 1;
    }

    private parseArgs(args: string[]): ValidateOptions {
        const [packageRoot, ...rest] = args;
        if (!packageRoot) {
            throw new Error(USAGE);
        }

        let format: ValidateFormat = "summary";
        let out: string | undefined;

        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--format": {
                    if (value !== "json") {
                        throw new Error(`--format only supports "json". ${USAGE}`);
                    }
                    format = "json";
                    i++;
                    break;
                }
                case "--out": {
                    if (value === undefined) {
                        throw new Error(`--out requires a file path. ${USAGE}`);
                    }
                    out = value;
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${USAGE}`);
            }
        }

        return {packageRoot, format, out};
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
