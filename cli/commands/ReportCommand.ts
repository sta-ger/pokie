import {
    HtmlSimulationReportRenderer,
    isSimulationReportSet,
    MarkdownSimulationReportRenderer,
    SimulationReport,
    SimulationReportRendering,
    SimulationReportSet,
} from "pokie";
import fs from "fs";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";

type ReportFormat = "markdown" | "html";

const USAGE = "Usage: pokie report <simulationReportJson> [--format markdown|html] [--out <file>]";

export class ReportCommand implements CliCommandHandling {
    private readonly readFile: (file: string) => string;
    private readonly writeFile: (file: string, contents: string) => void;
    private readonly renderers: Record<ReportFormat, SimulationReportRendering>;

    constructor(
        readFile: (file: string) => string = (file) => fs.readFileSync(file, "utf-8"),
        writeFile: (file: string, contents: string) => void = (file, contents) => fs.writeFileSync(file, contents, "utf-8"),
        renderers: Record<ReportFormat, SimulationReportRendering> = {
            markdown: new MarkdownSimulationReportRenderer(),
            html: new HtmlSimulationReportRenderer(),
        },
    ) {
        this.readFile = readFile;
        this.writeFile = writeFile;
        this.renderers = renderers;
    }

    public getName(): string {
        return "report";
    }

    public getDescription(): string {
        return "Render a pokie sim JSON report (see pokie sim --out) as a human-readable Markdown or HTML document.";
    }

    public run(args: string[]): Promise<void> {
        try {
            const {reportPath, format, out} = this.parseArgs(args);
            const parsed = this.readReportJson(reportPath);
            const renderer = this.renderers[format];

            const rendered = isSimulationReportSet(parsed) ? this.renderSet(renderer, parsed) : renderer.render(parsed);
            console.log(rendered);

            if (out) {
                this.writeFile(out, rendered);
                console.log(`Report written to "${out}".`);
            }

            return Promise.resolve();
        } catch (error) {
            return Promise.reject(error);
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
