import {Command} from "commander";
import {
    HtmlSimulationReportRenderer,
    isSimulationReportSet,
    MarkdownSimulationReportRenderer,
    OutcomeSourceProjectAnalyzer,
    OutcomeSourceProjectAnalyzing,
    OutcomeSourceProjectReport,
    PokieProject,
    PROJECT_TYPE_CAPABILITIES,
    describeProjectType,
    type ProjectType,
    ProjectResolving,
    ProjectTargetResolver,
    SimulationReport,
    SimulationReportRendering,
    SimulationReportSet,
} from "pokie";
import fs from "fs";
import path from "path";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";
import {renderOutcomeSourceHtml, renderOutcomeSourceMarkdown} from "./internal/renderOutcomeSourceReport.js";
import {writeOutputFileAtomically} from "./internal/writeOutputFile.js";

type SimulationReportFormat = "markdown" | "html";
type ReportFormat = SimulationReportFormat | "json";

type ReportPathAlternative = {readonly error: Error};

const USAGE = "Usage: pokie report <projectOrSimulationReportJson> [--format markdown|html|json] [--out <file>]";

export class ReportCommand implements CliCommandHandling {
    private readonly readFile: (file: string) => string;
    private readonly writeFile: (file: string, contents: string) => void;
    private readonly renderers: Record<SimulationReportFormat, SimulationReportRendering>;
    // Resolves project-shaped targets before attempting simulation-report JSON parsing. A resolved outcome
    // library or Stake adapter is reported through its canonical reader; all other targets retain the useful
    // simulation-report parsing diagnostic if they are not report JSON.
    private readonly resolveProject: ProjectResolving;
    // Routes a resolved "outcomeLibrary"/"stakeAdapter" project through its own canonical outcome-source
    // reader instead of ever telling its caller to "run pokie sim" first
    // -- neither project type ever gains RUNTIME_EXECUTE_CAPABILITY, so that advice would be permanently
    // wrong for them (see OutcomeSourceProjectAnalyzer's own doc comment).
    private readonly outcomeSourceAnalyzer: OutcomeSourceProjectAnalyzing;

    constructor(
        readFile: (file: string) => string = (file) => fs.readFileSync(file, "utf-8"),
        writeFile: (file: string, contents: string) => void = writeOutputFileAtomically,
        renderers: Record<SimulationReportFormat, SimulationReportRendering> = {
            markdown: new MarkdownSimulationReportRenderer(),
            html: new HtmlSimulationReportRenderer(),
        },
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        outcomeSourceAnalyzer: OutcomeSourceProjectAnalyzing = new OutcomeSourceProjectAnalyzer(),
    ) {
        this.readFile = readFile;
        this.writeFile = writeFile;
        this.renderers = renderers;
        this.resolveProject = resolveProject;
        this.outcomeSourceAnalyzer = outcomeSourceAnalyzer;
    }

    public getName(): string {
        return "report";
    }

    public getDescription(): string {
        return "Render a pokie sim report or a resolved outcome-library/Stake adapter analysis as JSON, Markdown, or HTML.";
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    public async run(args: string[]): Promise<void> {
        let parsedArgs: {reportPath: string; format: ReportFormat; out?: string};
        try {
            parsedArgs = this.parseArgs(args);
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                return;
            }
            throw error;
        }
        const {reportPath, format, out} = parsedArgs;

        const project = (await this.resolveProjectSafely(reportPath)) ?? this.recognizeStandaloneStakeOutcomeDirectory(reportPath);
        if (project?.type === "outcomeLibrary" || project?.type === "stakeAdapter") {
            let outcomeSourceReport: OutcomeSourceProjectReport;
            try {
                outcomeSourceReport = await this.outcomeSourceAnalyzer.analyze(project);
            } catch (error) {
                throw new Error(
                    `Could not analyze outcome source at "${reportPath}": ${error instanceof Error ? error.message : String(error)}. ` +
                    'Run "pokie report <path> --format json" for source diagnostics.',
                );
            }
            this.emit(this.renderOutcomeSource(format, reportPath, outcomeSourceReport), out, format === "json");
            return;
        }

        let parsed: SimulationReport | SimulationReportSet;
        try {
            parsed = this.readReportJson(reportPath);
        } catch (error) {
            const alternative = this.resolveReportPathAlternative(reportPath, error instanceof Error ? error : new Error(String(error)), project);
            throw alternative.error;
        }

        let rendered: string;
        if (format === "json") {
            rendered = JSON.stringify(parsed, null, 4);
        } else {
            const renderer = this.renderers[format];
            rendered = isSimulationReportSet(parsed) ? this.renderSet(renderer, parsed) : renderer.render(parsed);
        }
        this.emit(rendered, out, format === "json");
    }

    // Builds the exact Commander tree parseArgs() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and parseArgs() (for real parsing) use, so
    // the two can never drift apart. `resultRef` is written by the action; parseArgs() supplies its own
    // real box and reads it back once parsing resolves, while getCommanderCommand() never parses this
    // tree at all, so its own default box is never read.
    private buildCommand(resultRef: {reportPath?: string; format?: ReportFormat; out?: string} = {}): Command {
        return createCommanderCliCommand("report")
            .description(this.getDescription())
            .argument("<projectOrSimulationReportJson>", "a supported outcome project or pokie sim JSON report")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .option("--format <value>", '"markdown", "html", or "json" (default: "markdown")', (value: string) => {
                if (value !== "markdown" && value !== "html" && value !== "json") {
                    throw new Error(`--format must be "markdown", "html", or "json". ${USAGE}`);
                }
                return value as ReportFormat;
            })
            .option("--out <file>", "file path to write the rendered report to")
            .action((path: string, excess: string[], options: {format?: ReportFormat; out?: string}) => {
                // An empty-string positional is "present" as far as Commander's own required-argument
                // check is concerned, but the pre-Commander behavior this preserves treated it the same
                // as an entirely missing one.
                if (!path || excess.length > 0) {
                    throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : USAGE);
                }
                resultRef.reportPath = path;
                resultRef.format = options.format ?? "markdown";
                resultRef.out = options.out;
            });
    }

    private emit(rendered: string, out?: string, machineReadable = false): void {
        if (rendered.trim().length === 0) {
            throw new Error("Report rendering produced no output; try regenerating the simulation with \"pokie sim <packageRoot> --out <file>\".");
        }
        if (out) {
            try {
                this.writeFile(out, rendered);
            } catch (error) {
                throw new Error(
                    `Could not write report to "${out}": ${error instanceof Error ? error.message : String(error)}. ` +
                    "Choose an existing writable directory and try --out <file> again.",
                );
            }
        }
        console.log(rendered);
        if (out) {
            // Keep --format json stdout directly parseable even when an artifact was also requested.
            (machineReadable ? console.error : console.log)(`Report written to "${out}".`);
        }
    }

    private renderOutcomeSource(format: ReportFormat, targetPath: string, report: OutcomeSourceProjectReport): string {
        switch (format) {
            case "json":
                return JSON.stringify(report, null, 4);
            case "markdown":
                return renderOutcomeSourceMarkdown(targetPath, report);
            case "html":
                return renderOutcomeSourceHtml(targetPath, report);
            default:
                throw new Error(`Unsupported report format "${format}". ${USAGE}`);
        }
    }

    // A renderer that doesn't implement renderSet() (an optional, feature-detected capability -- see
    // SimulationReportRendering's own doc comment) can't render a "pokie sim --mode all" bundle at
    // all -- failing clearly here beats silently rendering only one mode or throwing a confusing
    // TypeError deep inside the renderer.
    private renderSet(renderer: SimulationReportRendering, reportSet: SimulationReportSet): string {
        if (!renderer.renderSet) {
            throw new Error("This renderer does not support multi-mode report sets (see \"pokie sim --mode all\").");
        }
        return renderer.renderSet(reportSet);
    }


    private parseArgs(args: string[]): {reportPath: string; format: ReportFormat; out?: string} {
        const resultRef: {reportPath?: string; format?: ReportFormat; out?: string} = {};
        const command = this.buildCommand(resultRef);

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                throw error;
            }
            throw translateCommanderError(error, {
                missingArgument: USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                optionMissingArgument: (flag) =>
                    flag === "--format" ? `--format must be "markdown", "html", or "json". ${USAGE}` : `--out requires a file path. ${USAGE}`,
            });
        }

        return {reportPath: resultRef.reportPath!, format: resultRef.format!, out: resultRef.out};
    }

    private readReportJson(reportPath: string): SimulationReport | SimulationReportSet {
        let contents: string;
        try {
            contents = this.readFile(reportPath);
        } catch (error) {
            throw new Error(`Could not read simulation report at "${reportPath}": ${error instanceof Error ? error.message : String(error)}`);
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(contents);
        } catch (error) {
            throw new Error(`"${reportPath}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
        }

        if (isSimulationReportSet(parsed) && Object.values(parsed.modes).every((report) => this.isSimulationReport(report))) {
            return parsed;
        }

        if (!this.isSimulationReport(parsed)) {
            throw new Error(
                `"${reportPath}" does not look like a pokie sim report (expected fields like "game", "rtp", "rounds"). ` +
                    `Generate one with "pokie sim <packageRoot> --out ${reportPath}".`,
            );
        }

        return parsed;
    }

    private async resolveProjectSafely(reportPath: string) {
        try {
            return await this.resolveProject.resolve(reportPath);
        } catch {
            return undefined;
        }
    }

    // ProjectTargetResolver intentionally recognizes only POKIE-produced Stake exports: its result feeds
    // reconstruction and other project operations that require pokie-manifest.json provenance. Reporting is
    // different: the standalone Stake reader is explicitly designed for a compatible foreign directory, so
    // recognize the minimal on-disk intent signal here and route it through that same canonical reader. Merely
    // finding index.json is deliberate -- malformed contents must reach the reader to produce its actionable
    // structural diagnostics rather than falling through to readReportJson() and exposing EISDIR.
    private recognizeStandaloneStakeOutcomeDirectory(reportPath: string): PokieProject | undefined {
        const rootPath = path.resolve(reportPath);
        try {
            if (!fs.statSync(rootPath).isDirectory() || !fs.statSync(path.join(rootPath, "index.json")).isFile()) {
                return undefined;
            }
        } catch {
            return undefined;
        }

        return {
            type: "stakeAdapter",
            rootPath,
            capabilities: PROJECT_TYPE_CAPABILITIES.stakeAdapter,
            provenance: 'recognized compatible Stake Engine outcome directory ("index.json"; no pokie-manifest.json required)',
        };
    }

    // A source's canonical analysis is attempted before JSON parsing in run(). If it failed, retain the
    // original parsing/read error rather than disguising the underlying source-reader failure as a result.
    // Other recognized project types still receive a precise wrong-target diagnostic.
    private resolveReportPathAlternative(reportPath: string, fallbackError: Error, project: Awaited<ReturnType<ProjectResolving["resolve"]>>): ReportPathAlternative {
        if (project === undefined || project.type === "outcomeLibrary" || project.type === "stakeAdapter") {
            return {error: fallbackError};
        }

        return {
            error: new Error(
                `"${reportPath}" is a ${describeProjectType(project.type)}, not a simulation report. ` +
                    `${this.describeSimulationReportRoute(project.type)} ` +
                    'Run "pokie inspect <path>" to see compatible next actions.',
            ),
        };
    }

    private describeSimulationReportRoute(projectType: ProjectType): string {
        switch (projectType) {
            case "blueprint":
                return 'To create a simulation report, first build a POKIE game package, then run "pokie sim <packagePath> --out <file>".';
            case "tsPackage":
                return 'To create a simulation report, run "pokie sim <packagePath> --out <file>".';
            case "parWorkbook":
                return 'To create a simulation report, first import the workbook into a Game Blueprint and build a POKIE game package, then run "pokie sim <packagePath> --out <file>".';
            case "wasm":
                return "POKIE cannot create a simulation report from a POKIE WASM component yet; use a POKIE game package instead.";
            case "outcomeLibrary":
            case "stakeAdapter":
                return "This outcome source should be analyzed directly by the report command.";
            default:
                return 'To create a simulation report, use a POKIE game package with "pokie sim <packagePath> --out <file>".';
        }
    }

    private isSimulationReport(value: unknown): value is SimulationReport {
        if (typeof value !== "object" || value === null) {
            return false;
        }

        const candidate = value as Partial<SimulationReport>;
        const game = candidate.game as Partial<SimulationReport["game"]> | undefined;

        return (
            typeof game === "object" &&
            game !== null &&
            typeof game.id === "string" &&
            typeof game.name === "string" &&
            typeof game.version === "string" &&
            typeof candidate.requestedRounds === "number" &&
            typeof candidate.rounds === "number" &&
            (candidate.seed === null || typeof candidate.seed === "string") &&
            typeof candidate.totalBet === "number" &&
            typeof candidate.totalWin === "number" &&
            typeof candidate.rtp === "number" &&
            typeof candidate.hitFrequency === "number" &&
            typeof candidate.maxWin === "number" &&
            typeof candidate.durationMs === "number" &&
            typeof candidate.spinsPerSecond === "number" &&
            this.hasStringList(candidate.warnings) &&
            this.hasStringList(candidate.recommendations) &&
            this.hasReproducibility(candidate.reproducibility) &&
            this.hasNumericOption(candidate.workers) &&
            this.hasStringOption(candidate.betMode) &&
            this.hasNumericOption(candidate.targetRtp) &&
            this.hasNumericOption(candidate.rtpDeviation) &&
            this.hasNumericOption(candidate.averageBet) &&
            this.hasNumericOption(candidate.averagePayout) &&
            this.hasNumericOption(candidate.volatility) &&
            this.hasNumericOption(candidate.maxWinFrequency) &&
            this.hasStringOption(candidate.stopReason) &&
            this.hasPayoutHistogram(candidate.payoutHistogram) &&
            this.hasBreakdown(candidate.breakdown) &&
            this.hasJackpot(candidate.jackpot) &&
            this.hasConvergence(candidate.convergence)
        );
    }

    private hasStringList(value: unknown): boolean {
        return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
    }

    private hasStringOption(value: unknown): boolean {
        return value === undefined || typeof value === "string";
    }

    private hasNumericOption(value: unknown): boolean {
        return value === undefined || typeof value === "number";
    }

    private hasReproducibility(value: unknown): boolean {
        if (value === undefined) {
            return true;
        }
        if (typeof value !== "object" || value === null) {
            return false;
        }
        const reproducibility = value as Partial<NonNullable<SimulationReport["reproducibility"]>>;
        const game = reproducibility.game;
        return (
            typeof game === "object" &&
            game !== null &&
            typeof game.id === "string" &&
            typeof game.name === "string" &&
            typeof game.version === "string" &&
            (reproducibility.seed === null || typeof reproducibility.seed === "string") &&
            typeof reproducibility.requestedRounds === "number" &&
            typeof reproducibility.actualRounds === "number" &&
            typeof reproducibility.command === "string" &&
            (reproducibility.workerSeedStrategy === undefined || typeof reproducibility.workerSeedStrategy === "string")
        );
    }

    private hasPayoutHistogram(value: unknown): boolean {
        return value === undefined || (typeof value === "object" && value !== null && Object.values(value).every((count) => typeof count === "number"));
    }

    private hasBreakdown(value: unknown): boolean {
        if (value === undefined) {
            return true;
        }
        if (typeof value !== "object" || value === null || typeof (value as {components?: unknown}).components !== "object" || (value as {components?: unknown}).components === null) {
            return false;
        }
        return Object.values((value as {components: Record<string, unknown>}).components).every((component) =>
            this.hasNumbers(component, ["rounds", "totalBet", "totalWin", "rtp", "contribution", "hitFrequency", "maxWin"]),
        );
    }

    private hasJackpot(value: unknown): boolean {
        if (value === undefined) {
            return true;
        }
        if (!this.hasNumbers(value, ["awardCount", "totalAwarded", "totalContributed", "contribution"])) {
            return false;
        }
        const pools = (value as {pools?: unknown}).pools;
        return typeof pools === "object" && pools !== null && Object.values(pools).every((pool) =>
            this.hasNumbers(pool, ["awardCount", "totalAwarded", "totalContributed", "contribution"]),
        );
    }

    private hasConvergence(value: unknown): boolean {
        return value === undefined || this.hasNumbers(value, ["minRounds", "rtpTolerance", "checkIntervalRounds", "stableChecks", "checksPerformed", "consecutiveStableChecks", "achievedRtpHalfWidth"]);
    }

    private hasNumbers(value: unknown, keys: string[]): boolean {
        return typeof value === "object" && value !== null && keys.every((key) => typeof (value as Record<string, unknown>)[key] === "number");
    }
}
