import {Command} from "commander";
import {
    diffOutcomeSourceProjects,
    isSimulationReportSet,
    OutcomeSourceDiffResult,
    PokieProject,
    ProjectResolving,
    ProjectTargetResolver,
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
import {UnsupportedProjectOperationError} from "../materialize/UnsupportedProjectOperationError.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";
import {renderOutcomeSourceProjectDiff} from "./internal/renderOutcomeSourceProjectDiff.js";

type DiffFormat = "summary" | "json";

type DiffOptions = {
    leftPath: string;
    rightPath: string;
    format: DiffFormat;
    out?: string;
};

type OutcomeSourceDiffing = (left: PokieProject, right: PokieProject) => Promise<OutcomeSourceDiffResult>;

const USAGE = "Usage: pokie diff <leftProjectOrReportJson> <rightProjectOrReportJson> [--format json] [--out <file>]";

export class DiffCommand implements CliCommandHandling {
    private readonly readFile: (file: string) => string;
    private readonly writeFile: (file: string, contents: string) => void;
    private readonly differ: SimulationReportDiffing;
    private readonly setDiffer: SimulationReportSetDiffer;
    private readonly resolveProject: ProjectResolving;
    private readonly diffOutcomeSources: OutcomeSourceDiffing;

    constructor(
        readFile: (file: string) => string = (file) => fs.readFileSync(file, "utf-8"),
        writeFile: (file: string, contents: string) => void = (file, contents) => fs.writeFileSync(file, contents, "utf-8"),
        differ: SimulationReportDiffing = new SimulationReportDiffer(),
        setDiffer: SimulationReportSetDiffer = new SimulationReportSetDiffer(differ),
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        diffOutcomeSources: OutcomeSourceDiffing = diffOutcomeSourceProjects,
    ) {
        this.readFile = readFile;
        this.writeFile = writeFile;
        this.differ = differ;
        this.setDiffer = setDiffer;
        this.resolveProject = resolveProject;
        this.diffOutcomeSources = diffOutcomeSources;
    }

    public getName(): string {
        return "diff";
    }

    public getDescription(): string {
        return "Compare two simulation reports or two resolved precomputed-outcome projects and highlight what changed.";
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    public async run(args: string[]): Promise<void> {
        try {
            const options = this.parseArgs(args);
            if (await this.tryDiffOutcomeSourceProjects(options)) {
                return;
            }
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

        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                return;
            }
            throw error;
        }
    }

    // Builds the exact Commander tree parseArgs() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and parseArgs() (for real parsing) use, so
    // the two can never drift apart. `resultRef` is written by the action; parseArgs() supplies its own
    // real box and reads it back once parsing resolves, while getCommanderCommand() never parses this
    // tree at all, so its own default box is never read. Commander declares/validates
    // <leftReportJson> <rightReportJson>, --format (a custom parser that only accepts the literal
    // "json", same as the original), and --out (unvalidated). A trailing "[excess...]" catches any
    // stray bare positional (the original loop's default case treated any unmatched token as an
    // "Unknown option", including a non-flag one). --format's structurally *missing* value (flag given
    // with nothing after it) maps to the same message as an invalid provided value, matching the
    // original's single "value !== 'json'" check (undefined !== "json").
    private buildCommand(resultRef: {value?: DiffOptions} = {}): Command {
        return createCommanderCliCommand("diff")
            .description(this.getDescription())
            .argument("<leftProjectOrReportJson>", "a pokie sim JSON report or Outcome Library/Stake Engine export")
            .argument("<rightProjectOrReportJson>", "a pokie sim JSON report or Outcome Library/Stake Engine export")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .option("--format <format>", "only \"json\" is supported (default: a human-readable summary)", (value: string) => {
                if (value !== "json") {
                    throw new Error(`--format only supports "json". ${USAGE}`);
                }
                return "json" as DiffFormat;
            })
            .option("--out <file>", "write the diff JSON to this path")
            .action((leftPath: string, rightPath: string, excess: string[], options: {format?: DiffFormat; out?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${USAGE}`);
                }
                resultRef.value = {leftPath, rightPath, format: options.format ?? "summary", out: options.out};
            });
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

    // Project-aware comparison is tried before treating either input as report JSON. Both sides must
    // be the same broad input family: two resolved projects use their canonical readers, while two
    // JSON files use the simulation-report path. A project/report mix is a user mistake, not a
    // filesystem failure (for example, an opaque EISDIR from trying to read a bundle as JSON).
    private async tryDiffOutcomeSourceProjects(options: DiffOptions): Promise<boolean> {
        const [left, right] = await Promise.all([this.resolveProject.resolve(options.leftPath), this.resolveProject.resolve(options.rightPath)]);
        if (left === undefined || right === undefined) {
            if (left !== undefined || right !== undefined) {
                throw new Error(
                    "Cannot compare a simulation report with an outcome source. Compare two simulation reports, " +
                        "or two Outcome Library bundles / Stake Engine exports.",
                );
            }
            return false;
        }

        const result = await this.diffOutcomeSources(left, right);
        if (!result.supported) {
            throw new UnsupportedProjectOperationError(result.diagnostic);
        }

        const json = JSON.stringify(result.diff, null, 4);
        if (options.out) {
            this.writeFile(options.out, json);
        }
        if (options.format === "json") {
            console.log(json);
        } else {
            console.log(renderOutcomeSourceProjectDiff(result.diff));
            if (options.out) {
                console.log(`\nDiff written to "${options.out}".`);
            }
        }
        return true;
    }


    private parseArgs(args: string[]): DiffOptions {
        const resultRef: {value?: DiffOptions} = {};
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
                optionMissingArgument: (flag) => {
                    if (flag === "--format") {
                        return `--format only supports "json". ${USAGE}`;
                    }
                    if (flag === "--out") {
                        return `--out requires a file path. ${USAGE}`;
                    }
                    return `Unknown option "${flag}". ${USAGE}`;
                },
            });
        }
        return resultRef.value!;
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
        if (!setDiff.changed) {
            console.log("  No changes detected.");
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
        if (!diff.changed) {
            console.log("  No changes detected.");
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
