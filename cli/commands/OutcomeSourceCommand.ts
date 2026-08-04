import {
    describeUnsupportedProjectOperation,
    OUTCOME_SOURCE_ANALYZE_OPERATION,
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
import {CliCommandHandling} from "../CliCommandHandling.js";
import {UnsupportedProjectOperationError} from "../materialize/UnsupportedProjectOperationError.js";
import {createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";
import {renderOutcomeSourceReport} from "./internal/renderOutcomeSourceReport.js";

const USAGE = "Usage: pokie outcomesource inspect <path>\n   or: pokie outcomesource sample <path> --mode <modeName> [--seed <string>]";
const INSPECT_USAGE = "Usage: pokie outcomesource inspect <path>";
const SAMPLE_USAGE = "Usage: pokie outcomesource sample <path> --mode <modeName> [--seed <string>]";

type SampleCliOptions = {mode?: string; seed?: string};

// Deliberately the non-generic (T = string) instantiation of sampleOutcomeSourceProject's own signature --
// this command only ever deals in plain string outcome ids (there is no CLI surface for a numeric-id
// library), so a caller-injected stub doesn't need to satisfy sampleOutcomeSourceProject's own generic
// signature for every possible T.
type SampleFn = (project: PokieProject, modeName: string, randomSource: WeightedOutcomeRandomSource) => Promise<OutcomeSourceSampleResult<string>>;

// Two verbs ("inspect"/"sample") sharing one command, the same way OutcomeLibraryCommand owns
// "generate"/"build"/"validate" -- both operate directly on a resolved "outcomeLibrary"/"stakeAdapter"
// PokieProject through its own canonical reader/selector (OutcomeSourceProjectAnalyzer/
// sampleOutcomeSourceProject), never loadPokieGame or a re-derived game-model calculation. "inspect" reads
// the source's own descriptor/limitations/exact analysis (same rendering "pokie report" falls back to when
// mistakenly pointed at one of these projects -- see renderOutcomeSourceReport); "sample" draws exactly one
// outcome via the same selector/session/server path PreGeneratedSpinCommandHandler/PreGeneratedRoundReplayer
// already use in production. Both verbs reuse describeUnsupportedProjectOperation's own capability
// diagnostic -- via sampleOutcomeSourceProject itself for "sample", via an explicit check here for
// "inspect" -- rather than a hand-rolled project-type check, so a Stake Engine export's own
// "outcomeSource.sample" gap (it has no draw contract -- see OUTCOME_SOURCE_SAMPLE_CAPABILITY's own doc
// comment) reports the exact same structured diagnostic every other unsupported-operation attempt does.
export class OutcomeSourceCommand implements CliCommandHandling {
    private readonly resolveProject: ProjectResolving;
    private readonly analyzer: OutcomeSourceProjectAnalyzing;
    private readonly sample: SampleFn;
    private readonly buildRandomSource: (seed?: string) => WeightedOutcomeRandomSource;

    constructor(
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        analyzer: OutcomeSourceProjectAnalyzing = new OutcomeSourceProjectAnalyzer(),
        sample: SampleFn = sampleOutcomeSourceProject,
        buildRandomSource: (seed?: string) => WeightedOutcomeRandomSource = (seed) =>
            seed !== undefined ? new SeededWeightedOutcomeRandomSource(seed) : new SecureWeightedOutcomeRandomSource(),
    ) {
        this.resolveProject = resolveProject;
        this.analyzer = analyzer;
        this.sample = sample;
        this.buildRandomSource = buildRandomSource;
    }

    public getName(): string {
        return "outcomesource";
    }

    public getDescription(): string {
        return (
            "Inspect a resolved outcome-library/Stake Engine outcome source through its own canonical reader, or " +
            "draw one outcome from a native outcome library through the same selector path live/pre-generated play " +
            'uses ("pokie outcomesource inspect <path>" / "pokie outcomesource sample <path> --mode <modeName>").'
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

    private printSelection(targetPath: string, selection: PreGeneratedOutcomeSelection): void {
        console.log(`Drew outcome "${selection.outcome.id}" from "${targetPath}" (library "${selection.libraryId}", hash "${selection.libraryHash}").`);
        console.log(`  weight            ${selection.outcome.weight} / ${selection.totalWeight}`);
        console.log(`  payout multiplier ${selection.outcome.artifact.payoutMultiplier}`);
        console.log(`  total win         ${selection.outcome.artifact.totalWin}`);
    }
}
