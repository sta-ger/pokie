import {
    describeUnsupportedProjectOperation,
    diffOutcomeSourceProjects,
    OUTCOME_SOURCE_ANALYZE_OPERATION,
    OutcomeSourceDiffResult,
    OutcomeSourceProjectAnalyzer,
    OutcomeSourceProjectAnalyzing,
    OutcomeSourceSampleResult,
    PokieProject,
    PreGeneratedOutcomeSelection,
    ProjectResolving,
    ProjectTargetResolver,
    sampleOutcomeSourceProject,
    SecureWeightedOutcomeRandomSource,
    SeededWeightedOutcomeRandomSource,
    WeightedOutcomeRandomSource,
} from "pokie";
import fs from "fs";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {UnsupportedProjectOperationError} from "../materialize/UnsupportedProjectOperationError.js";
import {createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";
import {renderOutcomeSourceProjectDiff} from "./internal/renderOutcomeSourceProjectDiff.js";
import {renderOutcomeSourceReport} from "./internal/renderOutcomeSourceReport.js";

const USAGE =
    "Usage: pokie outcomesource inspect <path>\n" +
    "   or: pokie outcomesource sample <path> --mode <modeName> [--seed <string>]\n" +
    "   or: pokie outcomesource diff <leftPath> <rightPath> [--format json] [--out <file>]";
const INSPECT_USAGE = "Usage: pokie outcomesource inspect <path>";
const SAMPLE_USAGE = "Usage: pokie outcomesource sample <path> --mode <modeName> [--seed <string>]";
const DIFF_USAGE = "Usage: pokie outcomesource diff <leftPath> <rightPath> [--format json] [--out <file>]";

type SampleCliOptions = {mode?: string; seed?: string};
type DiffFormat = "summary" | "json";
type DiffCliOptions = {format: DiffFormat; out?: string};

type DiffFn = (left: PokieProject, right: PokieProject) => Promise<OutcomeSourceDiffResult>;

// Deliberately the non-generic (T = string) instantiation of sampleOutcomeSourceProject's own signature --
// this command only ever deals in plain string outcome ids (there is no CLI surface for a numeric-id
// library), so a caller-injected stub doesn't need to satisfy sampleOutcomeSourceProject's own generic
// signature for every possible T.
type SampleFn = (project: PokieProject, modeName: string, randomSource: WeightedOutcomeRandomSource) => Promise<OutcomeSourceSampleResult<string>>;

// Three verbs ("inspect"/"sample"/"diff") sharing one command, the same way OutcomeLibraryCommand owns
// "generate"/"build"/"validate" -- all three operate directly on a resolved "outcomeLibrary"/"stakeAdapter"
// PokieProject through its own canonical reader/selector (OutcomeSourceProjectAnalyzer/
// sampleOutcomeSourceProject/diffOutcomeSourceProjects), never loadPokieGame or a re-derived game-model
// calculation. "inspect" reads the source's own descriptor/limitations/exact analysis (same rendering "pokie
// report" falls back to when mistakenly pointed at one of these projects -- see renderOutcomeSourceReport);
// "sample" draws exactly one outcome via the same selector/session/server path
// PreGeneratedSpinCommandHandler/PreGeneratedRoundReplayer already use in production; "diff" compares two
// resolved outcome sources' own exact analyses (see diffOutcomeSourceProjects). All three reuse
// describeUnsupportedProjectOperation's own capability diagnostic -- via sampleOutcomeSourceProject/
// diffOutcomeSourceProjects themselves for "sample"/"diff", via an explicit check here for "inspect" --
// rather than a hand-rolled project-type check, so a Stake Engine export's own "outcomeSource.sample" gap (it
// has no draw contract -- see OUTCOME_SOURCE_SAMPLE_CAPABILITY's own doc comment) reports the exact same
// structured diagnostic every other unsupported-operation attempt does.
export class OutcomeSourceCommand implements CliCommandHandling {
    private readonly resolveProject: ProjectResolving;
    private readonly analyzer: OutcomeSourceProjectAnalyzing;
    private readonly sample: SampleFn;
    private readonly diff: DiffFn;
    private readonly buildRandomSource: (seed?: string) => WeightedOutcomeRandomSource;
    private readonly writeFile: (file: string, contents: string) => void;

    constructor(
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        analyzer: OutcomeSourceProjectAnalyzing = new OutcomeSourceProjectAnalyzer(),
        sample: SampleFn = sampleOutcomeSourceProject,
        buildRandomSource: (seed?: string) => WeightedOutcomeRandomSource = (seed) =>
            seed !== undefined ? new SeededWeightedOutcomeRandomSource(seed) : new SecureWeightedOutcomeRandomSource(),
        diff: DiffFn = diffOutcomeSourceProjects,
        writeFile: (file: string, contents: string) => void = (file, contents) => fs.writeFileSync(file, contents, "utf-8"),
    ) {
        this.resolveProject = resolveProject;
        this.analyzer = analyzer;
        this.sample = sample;
        this.buildRandomSource = buildRandomSource;
        this.diff = diff;
        this.writeFile = writeFile;
    }

    public getName(): string {
        return "outcomesource";
    }

    public getDescription(): string {
        return (
            "Inspect a resolved outcome-library/Stake Engine outcome source through its own canonical reader, " +
            "draw one outcome from a native outcome library through the same selector path live/pre-generated play " +
            "uses, or diff two resolved outcome sources' own exact analyses " +
            '("pokie outcomesource inspect <path>" / "pokie outcomesource sample <path> --mode <modeName>" / ' +
            '"pokie outcomesource diff <leftPath> <rightPath>").'
        );
    }

    public run(args: string[]): Promise<number> {
        if (args.length === 0) {
            return Promise.reject(new Error(USAGE));
        }

        let exitCode = 0;
        const parent = createCommanderCliCommand("outcomesource");

        parent
            .command("inspect")
            .argument("<path>")
            .argument("[excess...]")
            .action(async (targetPath: string, excess: string[]) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${INSPECT_USAGE}`);
                }
                exitCode = await this.executeInspect(targetPath);
            });

        parent
            .command("sample")
            .argument("<path>")
            .argument("[excess...]")
            .option("--mode <modeName>")
            .option("--seed <value>")
            .action(async (targetPath: string, excess: string[], options: SampleCliOptions) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${SAMPLE_USAGE}`);
                }
                if (!options.mode) {
                    throw new Error(`--mode is required. ${SAMPLE_USAGE}`);
                }
                exitCode = await this.executeSample(targetPath, options.mode, options.seed);
            });

        parent
            .command("diff")
            .argument("<leftPath>")
            .argument("<rightPath>")
            .argument("[excess...]")
            .option("--format <format>", "", (value: string) => {
                if (value !== "json") {
                    throw new Error(`--format only supports "json". ${DIFF_USAGE}`);
                }
                return "json" as DiffFormat;
            })
            .option("--out <file>")
            .action(async (leftPath: string, rightPath: string, excess: string[], options: {format?: DiffFormat; out?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${DIFF_USAGE}`);
                }
                exitCode = await this.executeDiff(leftPath, rightPath, {format: options.format ?? "summary", out: options.out});
            });

        const verb = args[0];
        let verbMessages = {};
        if (verb === "inspect") {
            verbMessages = {missingArgument: INSPECT_USAGE, unknownOption: (flag: string) => `Unknown option "${flag}". ${INSPECT_USAGE}`};
        } else if (verb === "sample") {
            verbMessages = {
                missingArgument: SAMPLE_USAGE,
                unknownOption: (flag: string) => `Unknown option "${flag}". ${SAMPLE_USAGE}`,
                optionMissingArgument: (flag: string) =>
                    flag === "--mode" ? `--mode requires a mode name. ${SAMPLE_USAGE}` : `--seed requires a value. ${SAMPLE_USAGE}`,
            };
        } else if (verb === "diff") {
            verbMessages = {
                missingArgument: DIFF_USAGE,
                unknownOption: (flag: string) => `Unknown option "${flag}". ${DIFF_USAGE}`,
                optionMissingArgument: (flag: string) =>
                    flag === "--format" ? `--format only supports "json". ${DIFF_USAGE}` : `--out requires a file path. ${DIFF_USAGE}`,
            };
        }

        return parent
            .parseAsync(args, {from: "user"})
            .then(() => exitCode)
            .catch((error: unknown) => {
                throw translateCommanderError(error, {...verbMessages, unknownCommand: USAGE, noCommand: USAGE});
            });
    }

    private async executeInspect(targetPath: string): Promise<number> {
        const project = await this.resolveProject.resolve(targetPath);
        if (project === undefined) {
            throw new Error(`"${targetPath}" does not resolve to a recognized POKIE project.`);
        }

        const diagnostic = describeUnsupportedProjectOperation(project, OUTCOME_SOURCE_ANALYZE_OPERATION);
        if (diagnostic !== undefined) {
            throw new UnsupportedProjectOperationError(diagnostic);
        }

        const report = await this.analyzer.analyze(project);
        console.log(renderOutcomeSourceReport(targetPath, report));
        return report.issues.some((issue) => issue.severity === "error") ? 1 : 0;
    }

    private async executeSample(targetPath: string, mode: string, seed: string | undefined): Promise<number> {
        const project = await this.resolveProject.resolve(targetPath);
        if (project === undefined) {
            throw new Error(`"${targetPath}" does not resolve to a recognized POKIE project.`);
        }

        const result = await this.sample(project, mode, this.buildRandomSource(seed));
        if (!result.supported) {
            throw new UnsupportedProjectOperationError(result.diagnostic);
        }

        this.printSelection(targetPath, result.selection);
        return 0;
    }

    private async executeDiff(leftPath: string, rightPath: string, options: DiffCliOptions): Promise<number> {
        const leftProject = await this.resolveProject.resolve(leftPath);
        if (leftProject === undefined) {
            throw new Error(`"${leftPath}" does not resolve to a recognized POKIE project.`);
        }
        const rightProject = await this.resolveProject.resolve(rightPath);
        if (rightProject === undefined) {
            throw new Error(`"${rightPath}" does not resolve to a recognized POKIE project.`);
        }

        const result = await this.diff(leftProject, rightProject);
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

        const hasErrors = result.diff.left.issues.some((issue) => issue.severity === "error") || result.diff.right.issues.some((issue) => issue.severity === "error");
        return hasErrors ? 1 : 0;
    }

    private printSelection(targetPath: string, selection: PreGeneratedOutcomeSelection): void {
        console.log(`Drew outcome "${selection.outcome.id}" from "${targetPath}" (library "${selection.libraryId}", hash "${selection.libraryHash}").`);
        console.log(`  weight            ${selection.outcome.weight} / ${selection.totalWeight}`);
        console.log(`  payout multiplier ${selection.outcome.artifact.payoutMultiplier}`);
        console.log(`  total win         ${selection.outcome.artifact.totalWin}`);
    }
}
