import {Command} from "commander";
import {
    OutcomeLibraryBundleValidating,
    OutcomeLibraryBundleValidator,
    GameBlueprintValidator,
    PokieGamePackageValidating,
    PokieGamePackageValidationReport,
    PokieGamePackageValidator,
    ProjectTargetMalformedError,
    ProjectResolving,
    ProjectTargetUnsupportedError,
    ProjectTargetResolver,
    StakeEngineImporter,
    StakeEngineImporting,
    ValidationIssue,
    describeWasmRecovery,
    describeWasmUnsupportedOperation,
} from "pokie";
import fs from "fs";
import path from "path";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../materialize/materializeRuntimePackage.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

type ValidateFormat = "summary" | "json";
type ValidateProjectKind = "blueprint" | "outcome-library" | "stake-engine" | "package" | "wasm" | "unknown";
type ValidateDiagnostic = Required<Pick<ValidationIssue, "code" | "severity" | "message" | "path" | "suggestion">> &
    Pick<ValidationIssue, "details">;

type ValidateReport = {
    schemaVersion: 1;
    project: {path: string; kind: ValidateProjectKind};
    deep: boolean;
    valid: boolean;
    errors: ValidateDiagnostic[];
    warnings: ValidateDiagnostic[];
    suggestions: string[];
    packageRoot?: string;
    game?: PokieGamePackageValidationReport["game"];
    issues?: ValidateDiagnostic[];
};

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
    private readonly stakeEngineImporter: StakeEngineImporting;

    constructor(
        validator: PokieGamePackageValidating = new PokieGamePackageValidator(),
        writeFile: (file: string, contents: string) => void = (file, contents) => fs.writeFileSync(file, contents, "utf-8"),
        resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        outcomeLibraryValidator: OutcomeLibraryBundleValidating = new OutcomeLibraryBundleValidator(),
        stakeEngineImporter: StakeEngineImporting = new StakeEngineImporter(),
    ) {
        this.validator = validator;
        this.writeFile = writeFile;
        this.resolveRuntimePackageRoot = resolveRuntimePackageRoot;
        this.resolveProject = resolveProject;
        this.outcomeLibraryValidator = outcomeLibraryValidator;
        this.stakeEngineImporter = stakeEngineImporter;
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
        let report: ValidateReport;
        try {
            report = await this.validateProject(packageRoot, resultRef.deep ?? false);
        } catch {
            report = this.failedReport(
                packageRoot,
                "unknown",
                "validate-project-unavailable",
                `POKIE could not inspect "${packageRoot}" as a supported project.`,
                "Check that the path exists and points to a POKIE package, Blueprint JSON file, or outcome-library bundle, then run validate again.",
            );
        }
        this.writeAndPrint(report, format, out);
        return report.valid ? 0 : 1;
    }

    private async validateProject(packageRoot: string, deep: boolean): Promise<ValidateReport> {
        if (this.isBlueprintFile(packageRoot)) {
            return this.validateBlueprint(packageRoot);
        }
        if (this.isPackageDirectory(packageRoot)) {
            return this.validatePackage(packageRoot);
        }
        if (this.isDirectory(packageRoot)) {
            let project;
            try {
                project = await this.resolveProject.resolve(packageRoot);
            } catch {
                // An incomplete or malformed Outcome Library still receives its validator's actionable
                // artifact diagnostics instead of a resolver implementation error.
                return this.validateOutcomeLibrary(packageRoot, deep);
            }
            if (project?.type === "stakeAdapter") {
                return this.validateStakeEngineExport(packageRoot);
            }
            if (project?.type === "outcomeLibrary") {
                return this.validateOutcomeLibrary(packageRoot, deep);
            }
            // A directory without package.json is an outcome-library candidate, including an incomplete
            // bundle. Let its validator report the canonical missing-manifest diagnostic rather than
            // misclassifying it as an unloadable package.
            return this.validateOutcomeLibrary(packageRoot, deep);
        }

        let project;
        try {
            project = await this.resolveProject.resolve(packageRoot);
        } catch (error) {
            if (this.isWasmPath(packageRoot) && this.isWasmResolutionFailure(error)) {
                return this.wasmValidationFailure(packageRoot, error.message);
            }
            throw error;
        }
        if (project?.type === "wasm") {
            return this.wasmValidationFailure(packageRoot, describeWasmUnsupportedOperation("validate WASM game logic"));
        }
        if (project?.type === "outcomeLibrary") {
            return this.validateOutcomeLibrary(packageRoot, deep);
        }
        if (project?.type === "blueprint") {
            return this.validateBlueprint(packageRoot);
        }
        return this.validatePackage(packageRoot);
    }

    private isWasmPath(projectPath: string): boolean {
        return path.extname(projectPath).toLowerCase() === ".wasm";
    }

    private isWasmResolutionFailure(error: unknown): error is ProjectTargetMalformedError | ProjectTargetUnsupportedError {
        return (error instanceof ProjectTargetMalformedError || error instanceof ProjectTargetUnsupportedError) && error.targetType === "wasm";
    }

    private wasmValidationFailure(wasmPath: string, message: string): ValidateReport {
        return this.failedReport(
            wasmPath,
            "wasm",
            "wasm-component-validation-unavailable",
            message,
            describeWasmRecovery(),
        );
    }

    private isBlueprintFile(projectPath: string): boolean {
        return fs.existsSync(projectPath) && fs.statSync(projectPath).isFile() && path.extname(projectPath).toLowerCase() === ".json";
    }

    private isDirectory(projectPath: string): boolean {
        return fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory();
    }

    private isPackageDirectory(projectPath: string): boolean {
        return fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory() && fs.existsSync(path.join(projectPath, "package.json"));
    }

    private validateBlueprint(blueprintPath: string): ValidateReport {
        let source: unknown;
        try {
            source = JSON.parse(fs.readFileSync(blueprintPath, "utf-8"));
        } catch {
            return this.failedReport(
                blueprintPath,
                "blueprint",
                "blueprint-file-malformed",
                `The Blueprint JSON at "${blueprintPath}" could not be read as JSON.`,
                "Fix the JSON syntax and save a JSON object describing the Blueprint, then run validate again.",
                blueprintPath,
            );
        }

        return this.reportFromIssues(blueprintPath, "blueprint", new GameBlueprintValidator().validate(source));
    }

    private async validatePackage(packageRoot: string): Promise<ValidateReport> {
        let resolution: {runtimePath: string; release(): Promise<void>} | undefined;
        try {
            resolution = await this.resolveRuntimePackageRoot(packageRoot);
            const report = await this.validator.validate(resolution.runtimePath);
            return this.packageReport(packageRoot, report);
        } catch {
            return this.failedReport(
                packageRoot,
                "package",
                "pokie-package-unavailable",
                `The POKIE package at "${packageRoot}" could not be loaded for validation.`,
                'Check package.json and its "pokie.entry" setting, install its dependencies, then run validate again.',
                "package.json",
            );
        } finally {
            await resolution?.release();
        }
    }

    private packageReport(packageRoot: string, report: PokieGamePackageValidationReport): ValidateReport {
        const issues = [...report.errors, ...report.warnings].map((issue) =>
            issue.code === "pokie-package-load-failed"
                ? {
                    ...issue,
                    message: 'The package entry selected by "package.json#pokie.entry" could not be loaded.',
                    path: "package.json#pokie.entry",
                    suggestion: 'Check "pokie.entry", its target file, and installed dependencies, then run validate again.',
                }
                : issue,
        );
        // Package-validator suggestions are copied from its raw diagnostics. Rebuild this public list from
        // the normalized issues below so implementation-facing suggestion text cannot cross the CLI boundary.
        return this.reportFromIssues(packageRoot, "package", issues, report.game);
    }

    private async validateOutcomeLibrary(bundleDir: string, deep: boolean): Promise<ValidateReport> {
        const issues = await this.outcomeLibraryValidator.validate(bundleDir, {deep});
        return {...this.reportFromIssues(bundleDir, "outcome-library", issues), deep};
    }

    private async validateStakeEngineExport(stakeDir: string): Promise<ValidateReport> {
        try {
            const result = await this.stakeEngineImporter.importFromDirectory(stakeDir);
            return this.reportFromIssues(stakeDir, "stake-engine", result.issues);
        } catch {
            return this.failedReport(
                stakeDir,
                "stake-engine",
                "stakeengine-export-unavailable",
                `The Stake Engine export at "${stakeDir}" could not be read for validation.`,
                "Check its index.json, pokie-manifest.json, and mode files, then run validate again.",
            );
        }
    }

    private failedReport(
        projectPath: string,
        kind: ValidateProjectKind,
        code: string,
        message: string,
        suggestion: string,
        diagnosticPath = projectPath,
    ): ValidateReport {
        return this.reportFromIssues(projectPath, kind, [{code, severity: "error", message, path: diagnosticPath, suggestion}]);
    }

    private reportFromIssues(
        projectPath: string,
        kind: ValidateProjectKind,
        issues: readonly ValidationIssue[],
        game?: PokieGamePackageValidationReport["game"],
        inheritedSuggestions: readonly string[] = [],
    ): ValidateReport {
        const diagnostics = issues.map((issue) => this.describeIssue(issue, projectPath));
        const errors = diagnostics.filter((issue) => issue.severity === "error");
        const warnings = diagnostics.filter((issue) => issue.severity !== "error");
        const suggestions = [...new Set([...inheritedSuggestions, ...diagnostics.map((issue) => issue.suggestion)])];
        return {
            schemaVersion: 1,
            project: {path: projectPath, kind},
            deep: false,
            valid: errors.length === 0,
            errors,
            warnings,
            suggestions,
            ...(kind === "package" ? {packageRoot: projectPath} : {}),
            ...(game !== undefined ? {game} : {}),
            ...(kind === "outcome-library" ? {issues: diagnostics} : {}),
        };
    }

    private describeIssue(issue: ValidationIssue, projectPath: string): ValidateDiagnostic {
        const safeIssue = this.safeIssue(issue);
        return {
            ...safeIssue,
            path: safeIssue.path ?? projectPath,
            suggestion: safeIssue.suggestion ?? "Fix this issue at the indicated location, then run `pokie validate <path>` again.",
        };
    }

    private safeIssue(issue: ValidationIssue): ValidationIssue {
        if (issue.code.startsWith("outcome-library-bundle-")) {
            return this.safeOutcomeLibraryIssue(issue);
        }
        const packageIssue = this.safePackageIssue(issue);
        if (packageIssue !== undefined) {
            return packageIssue;
        }
        return issue;
    }

    private safePackageIssue(issue: ValidationIssue): ValidationIssue | undefined {
        const entryPath = "package.json#pokie.entry";
        if (issue.code === "pokie-game-missing-contract-methods") {
            return {
                ...issue,
                message: "The package entry does not export a usable POKIE game.",
                path: entryPath,
                suggestion: 'Update "package.json#pokie.entry" so it identifies the module that exports your POKIE game, then run validate again.',
            };
        }
        if (issue.code === "pokie-game-manifest-threw") {
            return {
                ...issue,
                message: "The game manifest provided by this package could not be read.",
                path: `${entryPath}#manifest`,
                suggestion: "Ensure the package entry provides a manifest with non-empty id, name, and version, then run validate again.",
            };
        }
        if (issue.code === "pokie-game-manifest-missing") {
            return {
                ...issue,
                message: "The package entry does not provide a game manifest.",
                path: `${entryPath}#manifest`,
                suggestion: "Add a game manifest with non-empty id, name, and version to the package entry, then run validate again.",
            };
        }

        const manifestField = (/^pokie-game-manifest-invalid-(id|name|version)$/).exec(issue.code)?.[1];
        if (manifestField !== undefined) {
            return {
                ...issue,
                message: `The game manifest field "${manifestField}" must be a non-empty string.`,
                path: `${entryPath}#manifest.${manifestField}`,
                suggestion: `Set the game manifest field "${manifestField}" to a non-empty string, then run validate again.`,
            };
        }
        return undefined;
    }

    // The bundle validator intentionally retains low-level causes for library authors. The CLI is a public
    // boundary, though: never expose parser, filesystem, or implementation text from any of its diagnostics.
    private safeOutcomeLibraryIssue(issue: ValidationIssue): ValidationIssue {
        const location = this.outcomeLibraryLocation(issue);
        const code = issue.code;
        let problem = "contains inconsistent outcome-library data.";

        if (code.includes("-missing")) {
            problem = "is missing.";
        } else if (code.includes("-unreadable")) {
            problem = "could not be read.";
        } else if (code.includes("-invalid-json")) {
            problem = "is not valid JSON.";
        } else if (code.includes("-unsafe")) {
            problem = "contains an unsafe file reference.";
        } else if (code.includes("-schema-version-unsupported")) {
            problem = "uses an unsupported schema version.";
        } else if (code.includes("-malformed") || code.includes("-invalid")) {
            problem = "does not match the required outcome-library format.";
        } else if (code.includes("-mismatch")) {
            problem = "does not match the related outcome-library data.";
        } else if (code.includes("-duplicate")) {
            problem = "contains a duplicate value where values must be unique.";
        } else if (code.includes("-not-sorted")) {
            problem = "is not in the required canonical order.";
        } else if (code.includes("byte-range") || code.includes("newline-terminated") || code.includes("too-small") || code.includes("trailing-bytes")) {
            problem = "does not have the byte layout recorded by its index.";
        }

        return {
            code: issue.code,
            severity: issue.severity,
            message: `The outcome-library artifact at "${location}" ${problem}`,
            path: location,
            suggestion: `Repair ${location} to match the outcome-library bundle format, then run validate again.`,
        };
    }

    private outcomeLibraryLocation(issue: ValidationIssue): string {
        const modeName = typeof issue.details?.modeName === "string" && (/^[A-Za-z0-9_-]+$/).test(issue.details.modeName)
            ? issue.details.modeName
            : undefined;

        if (issue.code.includes("-manifest-")) {
            return "manifest.json";
        }
        if (issue.code.includes("-mode-index-")) {
            return modeName === undefined ? "manifest.json" : `index_${modeName}.json`;
        }
        if (issue.code.includes("-outcomes-") || issue.code.endsWith("-hash-mismatch") || issue.code.endsWith("-analysis-mismatch")) {
            return modeName === undefined ? "manifest.json" : `outcomes_${modeName}.jsonl`;
        }
        return "manifest.json";
    }

    private writeAndPrint(report: ValidateReport, format: ValidateFormat, out: string | undefined): void {
        const json = JSON.stringify(report, null, 4);
        if (out) {
            try {
                this.writeFile(out, json);
            } catch {
                throw new Error(`Could not write the validation report to "${out}". Check the path and write permissions, then run validate again.`);
            }
        }
        if (format === "json") {
            console.log(json);
            return;
        }
        this.printSummary(report);
        if (out) {
            console.log(`\nReport written to "${out}".`);
        }
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

    private printSummary(report: ValidateReport): void {
        if (report.game) {
            console.log(`Validating "${report.game.name}" (id: "${report.game.id}", v${report.game.version}) at "${report.project.path}"`);
        } else {
            console.log(`Validating ${report.project.kind}${report.deep ? " (deep check)" : ""} at "${report.project.path}"`);
        }
        console.log(`  valid           ${report.valid ? "yes" : "no"}`);

        if (report.errors.length > 0) {
            console.log(`\nErrors (${report.errors.length}):`);
            for (const issue of report.errors) {
                this.printIssue(issue);
            }
        }

        if (report.warnings.length > 0) {
            console.log(`\nWarnings (${report.warnings.length}):`);
            for (const issue of report.warnings) {
                this.printIssue(issue);
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

    private printIssue(issue: ValidateDiagnostic): void {
        console.log(`  - [${issue.path}] ${issue.code}: ${issue.message}`);
        console.log(`    Next: ${issue.suggestion}`);
    }
}
