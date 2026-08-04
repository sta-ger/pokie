import {
    HtmlSimulationReportRenderer,
    isSimulationReportSet,
    MarkdownSimulationReportRenderer,
    OutcomeSourceProjectAnalyzer,
    OutcomeSourceProjectAnalyzing,
    OutcomeSourceProjectReport,
    ProjectResolving,
    ProjectTargetResolver,
    SimulationReport,
    SimulationReportRendering,
    SimulationReportSet,
} from "pokie";
import fs from "fs";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";

type ReportFormat = "markdown" | "html";

type ReportPathAlternative = {readonly error: Error} | {readonly rendered: string};

const USAGE = "Usage: pokie report <simulationReportJson> [--format markdown|html] [--out <file>]";

export class ReportCommand implements CliCommandHandling {
    private readonly readFile: (file: string) => string;
    private readonly writeFile: (file: string, contents: string) => void;
    private readonly renderers: Record<ReportFormat, SimulationReportRendering>;
    // Consulted only once reading/parsing/shape-checking `reportPath` as a plain JSON report has already
    // failed -- see resolveReportPathAlternative's own comment on why a resolved PokieProject (someone
    // pointed "pokie report" at a game package/blueprint/outcome source/etc instead of a sim report)
    // upgrades that failure into either a canonical-reader-backed analysis or a message naming what POKIE
    // actually detected, rather than a bare "not valid JSON"/shape mismatch. Best-effort: resolve() failing
    // too (or resolving to nothing) simply falls back to the original, unresolved error, exactly as before
    // this existed.
    private readonly resolveProject: ProjectResolving;
    // Routes a resolved "outcomeLibrary"/"stakeAdapter" project (see resolveReportPathAlternative) through
    // its own canonical outcome-source reader instead of ever telling its caller to "run pokie sim" first
    // -- neither project type ever gains RUNTIME_EXECUTE_CAPABILITY, so that advice would be permanently
    // wrong for them (see OutcomeSourceProjectAnalyzer's own doc comment).
    private readonly outcomeSourceAnalyzer: OutcomeSourceProjectAnalyzing;

    constructor(
        readFile: (file: string) => string = (file) => fs.readFileSync(file, "utf-8"),
        writeFile: (file: string, contents: string) => void = (file, contents) => fs.writeFileSync(file, contents, "utf-8"),
        renderers: Record<ReportFormat, SimulationReportRendering> = {
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
        return "Render a pokie sim JSON report (see pokie sim --out) as a human-readable Markdown or HTML document.";
    }

    public async run(args: string[]): Promise<void> {
        const {reportPath, format, out} = this.parseArgs(args);

        let parsed: SimulationReport | SimulationReportSet;
        try {
            parsed = this.readReportJson(reportPath);
        } catch (error) {
            const alternative = await this.resolveReportPathAlternative(reportPath, error instanceof Error ? error : new Error(String(error)));
            if ("rendered" in alternative) {
                this.emit(alternative.rendered, out);
                return;
            }
            throw alternative.error;
        }

        const renderer = this.renderers[format];
        const rendered = isSimulationReportSet(parsed) ? this.renderSet(renderer, parsed) : renderer.render(parsed);
        this.emit(rendered, out);
    }

    private emit(rendered: string, out?: string): void {
        console.log(rendered);
        if (out) {
            this.writeFile(out, rendered);
            console.log(`Report written to "${out}".`);
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
        let reportPath!: string;
        let format!: ReportFormat;
        let out: string | undefined;

        const command = createCommanderCliCommand("report")
            .argument("<simulationReportJson>")
            .argument("[excess...]")
            .option("--format <value>", '"markdown" or "html"', (value: string) => {
                if (value !== "markdown" && value !== "html") {
                    throw new Error(`--format must be "markdown" or "html". ${USAGE}`);
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
                reportPath = path;
                format = options.format ?? "markdown";
                out = options.out;
            });

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            throw translateCommanderError(error, {
                missingArgument: USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                optionMissingArgument: (flag) =>
                    flag === "--format" ? `--format must be "markdown" or "html". ${USAGE}` : `--out requires a file path. ${USAGE}`,
            });
        }

        return {reportPath, format, out};
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

        if (isSimulationReportSet(parsed)) {
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

    // Upgrades a raw report-parsing failure into a project-aware one when `reportPath` turns out to
    // actually resolve to a recognized PokieProject (a game package, blueprint, outcome library, ...) --
    // see this.resolveProject's own field comment. A resolved "outcomeLibrary"/"stakeAdapter" project is
    // routed straight through its own canonical outcome-source reader (this.outcomeSourceAnalyzer) and
    // rendered directly -- telling its caller to "run pokie sim" first would be permanently wrong for
    // either type, since neither ever gains RUNTIME_EXECUTE_CAPABILITY. Every other resolved type keeps the
    // plain "wrong project type" message. Best-effort throughout: any resolver error, no resolved project at
    // all, or a failure while analyzing an outcome-source project, falls back to `fallbackError` untouched,
    // so an ordinary unrelated/malformed path still reports exactly the error it always has.
    private async resolveReportPathAlternative(reportPath: string, fallbackError: Error): Promise<ReportPathAlternative> {
        let project;
        try {
            project = await this.resolveProject.resolve(reportPath);
        } catch {
            return {error: fallbackError};
        }
        if (project === undefined) {
            return {error: fallbackError};
        }

        if (project.type === "outcomeLibrary" || project.type === "stakeAdapter") {
            try {
                const report = await this.outcomeSourceAnalyzer.analyze(project);
                return {rendered: this.renderOutcomeSourceReport(reportPath, report)};
            } catch {
                return {error: fallbackError};
            }
        }

        return {
            error: new Error(
                `"${reportPath}" is a "${project.type}" project, not a pokie sim report. ` +
                    `"pokie report" only reads a JSON report produced by "pokie sim <packageRoot> --out <file>" -- ` +
                    `run that against this project first, then point "pokie report" at its output.`,
            ),
        };
    }

    // A native/Stake outcome source has no SimulationReport to hand to this.renderers -- its own descriptor
    // (kind/streaming/limitations) and per-mode exact analysis are printed directly instead. "issues" wins
    // over "modes" whenever this.outcomeSourceAnalyzer found a structural problem (see
    // OutcomeSourceProjectReport's own doc comment): "modes" is always empty in that case, so there is never
    // an exact analysis to print alongside a malformed source's own diagnostics.
    private renderOutcomeSourceReport(reportPath: string, report: OutcomeSourceProjectReport): string {
        const lines: string[] = [
            `"${reportPath}" is a "${report.descriptor.kind}" canonical outcome source (streaming: ${report.descriptor.streaming}).`,
            ...report.descriptor.limitations.map((limitation) => `  limitation: ${limitation}`),
        ];

        if (report.issues.length > 0) {
            lines.push("", `${report.issues.length} issue(s) found while reading it:`);
            for (const issue of report.issues) {
                lines.push(`  ${issue.severity}  ${issue.code}: ${issue.message}`);
            }
        }

        if (report.modes.length === 0) {
            return lines.join("\n");
        }

        lines.push("", "Exact analysis (no simulation -- every outcome's own weight, enumerated exactly):");
        for (const mode of report.modes) {
            lines.push(
                `  mode "${mode.modeName}": rtp ${(mode.analysis.rtp * 100).toFixed(2)}%, ` +
                    `hit frequency ${(mode.analysis.hitFrequency * 100).toFixed(2)}%, ` +
                    `standard deviation ${mode.analysis.standardDeviation.toFixed(4)}`,
            );
        }

        return lines.join("\n");
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
            typeof candidate.spinsPerSecond === "number"
        );
    }
}
