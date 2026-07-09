import {HtmlSimulationReportRenderer, MarkdownSimulationReportRenderer, SimulationReport, SimulationReportRendering} from "pokie";
import fs from "fs";
import {CliCommandHandling} from "../CliCommandHandling.js";

type ReportFormat = "markdown" | "html";

type ReportOptions = {
    reportPath: string;
    format: ReportFormat;
    out?: string;
};

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
            const options = this.parseArgs(args);
            const report = this.readReport(options.reportPath);

            const rendered = this.renderers[options.format].render(report);
            console.log(rendered);

            if (options.out) {
                this.writeFile(options.out, rendered);
                console.log(`Report written to "${options.out}".`);
            }

            return Promise.resolve();
        } catch (error) {
            return Promise.reject(error);
        }
    }

    private parseArgs(args: string[]): ReportOptions {
        const [reportPath, ...rest] = args;
        if (!reportPath) {
            throw new Error(USAGE);
        }

        let format: ReportFormat = "markdown";
        let out: string | undefined;

        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--format": {
                    if (value !== "markdown" && value !== "html") {
                        throw new Error(`--format must be "markdown" or "html". ${USAGE}`);
                    }
                    format = value;
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

        return {reportPath, format, out};
    }

    private readReport(reportPath: string): SimulationReport {
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
