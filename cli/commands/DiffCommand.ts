import {
    isSimulationReportSet,
    SimulationReport,
    SimulationReportDiff,
    SimulationReportDiffer,
    SimulationReportDiffing,
    SimulationReportMetricDiff,
    SimulationReportSet,
    SimulationReportSetDiff,
    SimulationReportSetDiffer,
} from "pokie";
import fs from "fs";
import {CliCommandHandling} from "../CliCommandHandling.js";

type DiffFormat = "summary" | "json";

type DiffOptions = {
    leftPath: string;
    rightPath: string;
    format: DiffFormat;
    out?: string;
};

const USAGE = "Usage: pokie diff <leftReportJson> <rightReportJson> [--format json] [--out <file>]";

export class DiffCommand implements CliCommandHandling {
    private readonly readFile: (file: string) => string;
    private readonly writeFile: (file: string, contents: string) => void;
    private readonly differ: SimulationReportDiffing;
    private readonly setDiffer: SimulationReportSetDiffer;

    constructor(
        readFile: (file: string) => string = (file) => fs.readFileSync(file, "utf-8"),
        writeFile: (file: string, contents: string) => void = (file, contents) => fs.writeFileSync(file, contents, "utf-8"),
        differ: SimulationReportDiffing = new SimulationReportDiffer(),
        setDiffer: SimulationReportSetDiffer = new SimulationReportSetDiffer(differ),
    ) {
        this.readFile = readFile;
        this.writeFile = writeFile;
        this.differ = differ;
        this.setDiffer = setDiffer;
    }

    public getName(): string {
        return "diff";
    }

    public getDescription(): string {
        return "Compare two pokie sim JSON reports (see pokie sim --out) and highlight what changed.";
    }

    public run(args: string[]): Promise<void> {
        try {
            const options = this.parseArgs(args);
            const left = this.readReportJson(options.leftPath);
            const right = this.readReportJson(options.rightPath);

            const leftIsSet = isSimulationReportSet(left);
            const rightIsSet = isSimulationReportSet(right);
            if (leftIsSet !== rightIsSet) {
                throw new Error(
                    "Cannot diff a single-mode pokie sim report against a multi-mode report set " +
                        '(see "pokie sim --mode all") -- compare like with like.',
                );
            }

            const json = leftIsSet
                ? this.buildSetDiffJsonAndPrint(left as SimulationReportSet, right as SimulationReportSet, options)
                : this.buildDiffJsonAndPrint(left as SimulationReport, right as SimulationReport, options);

            if (options.out) {
                this.writeFile(options.out, json);
                if (options.format !== "json") {
                    console.log(`\nDiff written to "${options.out}".`);
                }
            }

            return Promise.resolve();
        } catch (error) {
            return Promise.reject(error);
        }
    }

    private buildDiffJsonAndPrint(left: SimulationReport, right: SimulationReport, options: DiffOptions): string {
        const diff = this.differ.diff(left, right);
        const json = JSON.stringify(diff, null, 4);

        if (options.format === "json") {
            console.log(json);
        } else {
            this.printSummary(diff);
        }
        return json;
    }

    private buildSetDiffJsonAndPrint(left: SimulationReportSet, right: SimulationReportSet, options: DiffOptions): string {
        const setDiff = this.setDiffer.diff(left, right);
        const json = JSON.stringify(setDiff, null, 4);

        if (options.format === "json") {
            console.log(json);
        } else {
            this.printSetSummary(setDiff);
        }
        return json;
    }

    private parseArgs(args: string[]): DiffOptions {
        const [leftPath, rightPath, ...rest] = args;
        if (!leftPath || !rightPath) {
            throw new Error(USAGE);
        }

        let format: DiffFormat = "summary";
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

        return {leftPath, rightPath, format, out};
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

    private printSetSummary(setDiff: SimulationReportSetDiff): void {
        if (!setDiff.game.changed) {
            console.log(`Diff (all modes): ${setDiff.game.right.name} (id: "${setDiff.game.right.id}")`);
        } else {
            console.log(
                `Diff (all modes): ${setDiff.game.left.name} (id: "${setDiff.game.left.id}") -> ` +
                    `${setDiff.game.right.name} (id: "${setDiff.game.right.id}")`,
            );
        }
        if (setDiff.game.left.version !== setDiff.game.right.version) {
            console.log(`  version         ${setDiff.game.left.version} -> ${setDiff.game.right.version}`);
        }

        Object.entries(setDiff.perMode).forEach(([modeId, diff]) => {
            console.log(`\n=== Mode: ${modeId} ===`);
            this.printSummary(diff);
        });

        if (setDiff.onlyInLeft.length > 0) {
            console.log(`\nModes only in the left report: ${setDiff.onlyInLeft.join(", ")}`);
        }
        if (setDiff.onlyInRight.length > 0) {
            console.log(`Modes only in the right report: ${setDiff.onlyInRight.join(", ")}`);
        }
    }

    private printSummary(diff: SimulationReportDiff): void {
        if (!diff.game.changed) {
            console.log(`Diff: ${diff.game.right.name} (id: "${diff.game.right.id}")`);
        } else {
            console.log(`Diff: ${diff.game.left.name} (id: "${diff.game.left.id}") -> ${diff.game.right.name} (id: "${diff.game.right.id}")`);
        }
        if (diff.game.left.version !== diff.game.right.version) {
            console.log(`  version         ${diff.game.left.version} -> ${diff.game.right.version}`);
        }
        if (diff.seed.changed) {
            console.log(`  seed            ${diff.seed.left ?? "none"} -> ${diff.seed.right ?? "none"}`);
        }
        console.log(`  requested rounds ${this.formatMetric(diff.requestedRounds, 0)}`);
        console.log(`  rounds          ${this.formatMetric(diff.rounds, 0)}`);
        console.log(`  total bet       ${this.formatMetric(diff.totalBet, 2)}`);
        console.log(`  total win       ${this.formatMetric(diff.totalWin, 2)}`);
        console.log(`  rtp             ${this.formatPercentMetric(diff.rtp)}`);
        console.log(`  hit frequency   ${this.formatPercentMetric(diff.hitFrequency)}`);
        console.log(`  max win         ${this.formatMetric(diff.maxWin, 2)}`);
        console.log(`  duration        ${this.formatMetric(diff.durationMs, 0, "ms")}`);
        console.log(`  spins/s         ${this.formatMetric(diff.spinsPerSecond, 0)}`);

        if (diff.breakdown) {
            console.log("\nBreakdown:");
            Object.entries(diff.breakdown.components).forEach(([category, componentDiff]) => {
                console.log(`  ${category}`);
                console.log(`    rounds          ${this.formatMetric(componentDiff.rounds, 0)}`);
                console.log(`    total win       ${this.formatMetric(componentDiff.totalWin, 2)}`);
                console.log(`    rtp             ${this.formatPercentMetric(componentDiff.rtp)}`);
                console.log(`    contribution    ${this.formatPercentMetric(componentDiff.contribution)}`);
                console.log(`    hit frequency   ${this.formatPercentMetric(componentDiff.hitFrequency)}`);
            });
        }

        if (diff.warnings.length > 0) {
            console.log("\nWarnings:");
            for (const warning of diff.warnings) {
                console.log(`  - ${warning}`);
            }
        }
    }

    private formatMetric(metric: SimulationReportMetricDiff, decimals: number, unit = ""): string {
        const left = metric.left.toFixed(decimals);
        const right = metric.right.toFixed(decimals);
        const delta = this.formatSigned(metric.delta, decimals);
        const percent = metric.percentDelta === null ? "n/a" : `${this.formatSigned(metric.percentDelta, 2)}%`;
        return `${left}${unit} -> ${right}${unit} (${delta}${unit}, ${percent})`;
    }

    private formatPercentMetric(metric: SimulationReportMetricDiff): string {
        const left = (metric.left * 100).toFixed(2);
        const right = (metric.right * 100).toFixed(2);
        const deltaPp = this.formatSigned(metric.delta * 100, 2);
        const percent = metric.percentDelta === null ? "n/a" : `${this.formatSigned(metric.percentDelta, 2)}%`;
        return `${left}% -> ${right}% (${deltaPp} pp, ${percent})`;
    }

    private formatSigned(value: number, decimals: number): string {
        const rounded = value.toFixed(decimals);
        return value > 0 ? `+${rounded}` : rounded;
    }
}
