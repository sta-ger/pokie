import {StakeEngineOutcomeSourceReader} from "../stakeengine/standalone/StakeEngineOutcomeSourceReader.js";
import type {StakeEngineOutcomeSourceReading} from "../stakeengine/standalone/StakeEngineOutcomeSourceReading.js";
import {StakeEngineStandaloneAnalyzer} from "../stakeengine/standalone/StakeEngineStandaloneAnalyzer.js";
import {describeStakeEngineOutcomeSource} from "../stakeengine/standalone/describeStakeEngineOutcomeSource.js";
import {OutcomeLibraryFolderReader} from "../weightedoutcome/folder/OutcomeLibraryFolderReader.js";
import type {OutcomeLibraryFolderReading} from "../weightedoutcome/folder/OutcomeLibraryFolderReading.js";
import {OutcomeLibraryFolderValidator} from "../weightedoutcome/folder/OutcomeLibraryFolderValidator.js";
import type {OutcomeLibraryFolderValidating} from "../weightedoutcome/folder/OutcomeLibraryFolderValidating.js";
import {describeOutcomeLibraryFolderSource} from "../weightedoutcome/folder/describeOutcomeLibraryFolderSource.js";
import type {OutcomeSourceProjectAnalyzing} from "./OutcomeSourceProjectAnalyzing.js";
import type {OutcomeSourceProjectReport} from "./OutcomeSourceProjectReport.js";
import type {PokieProject} from "./PokieProject.js";

// Dispatches a resolved "outcomeLibrary"/"stakeAdapter" PokieProject to its own canonical outcome-source
// reader -- never loadPokieGame, never a re-derived/regenerated game-model calculation (see
// CanonicalOutcomeSourceDescriptor's own doc comment). A native bundle's exact per-mode analysis is read
// straight off its own index.json (embedded there at build time -- see
// OutcomeLibraryFolderIndexModeEntry.analysis), never recomputed and never requiring a full outcomes-file
// read, which is what keeps this analyzer honoring OutcomeLibraryFolderReading's own documented streaming
// behavior even against a very large bundle. A Stake Engine outcome directory carries no such precomputed
// analysis, so StakeEngineStandaloneAnalyzer must read every mode's own CSV/books first -- matching that
// source's own "streaming: false" descriptor. Either source's own malformed/invalid content surfaces as this
// report's own `issues` (see OutcomeLibraryFolderValidating/StakeEngineOutcomeSourceReading -- neither ever
// throws for a structurally malformed input), never a raw package-runtime error.
//
// WeightedOutcomeLibraryAnalysis and StakeEngineStandaloneModeAnalysis deliberately share the same core field
// names (rtp/hitFrequency/zeroWinFrequency/variance/standardDeviation/...) -- see each type's own doc comment
// -- so a caller (ReportCommand's own rendering) can treat OutcomeSourceProjectReport.modes[].analysis
// uniformly regardless of which reader family produced it, without a per-kind branch of its own.
export class OutcomeSourceProjectAnalyzer implements OutcomeSourceProjectAnalyzing {
    private readonly outcomeLibraryValidator: OutcomeLibraryFolderValidating;
    private readonly outcomeLibraryReader: OutcomeLibraryFolderReading;
    private readonly stakeEngineReader: StakeEngineOutcomeSourceReading;
    private readonly stakeEngineAnalyzer: StakeEngineStandaloneAnalyzer;

    constructor(
        outcomeLibraryValidator: OutcomeLibraryFolderValidating = new OutcomeLibraryFolderValidator(),
        outcomeLibraryReader: OutcomeLibraryFolderReading = new OutcomeLibraryFolderReader(),
        stakeEngineReader: StakeEngineOutcomeSourceReading = new StakeEngineOutcomeSourceReader(),
        stakeEngineAnalyzer: StakeEngineStandaloneAnalyzer = new StakeEngineStandaloneAnalyzer(),
    ) {
        this.outcomeLibraryValidator = outcomeLibraryValidator;
        this.outcomeLibraryReader = outcomeLibraryReader;
        this.stakeEngineReader = stakeEngineReader;
        this.stakeEngineAnalyzer = stakeEngineAnalyzer;
    }

    public analyze(project: PokieProject): Promise<OutcomeSourceProjectReport> {
        if (project.type === "outcomeLibrary") {
            return this.analyzeOutcomeLibrary(project.rootPath);
        }
        if (project.type === "stakeAdapter") {
            return this.analyzeStakeEngine(project.rootPath);
        }
        return Promise.reject(
            new Error(
                `"${project.rootPath}" is a "${project.type}" project -- outcome-source analysis only supports ` +
                    '"outcomeLibrary"/"stakeAdapter" projects.',
            ),
        );
    }

    private async analyzeOutcomeLibrary(libraryDir: string): Promise<OutcomeSourceProjectReport> {
        const descriptor = describeOutcomeLibraryFolderSource();
        const issues = await this.outcomeLibraryValidator.validate(libraryDir);
        if (issues.some((issue) => issue.severity === "error")) {
            return {rootPath: libraryDir, descriptor, issues, modes: []};
        }

        const manifest = await this.outcomeLibraryReader.readManifest(libraryDir);
        return {
            rootPath: libraryDir,
            descriptor,
            issues,
            modes: manifest.modes.map((mode) => ({modeName: mode.modeName, analysis: mode.analysis})),
        };
    }

    private async analyzeStakeEngine(stakeDir: string): Promise<OutcomeSourceProjectReport> {
        const descriptor = describeStakeEngineOutcomeSource();
        const result = await this.stakeEngineReader.readFromDirectory(stakeDir);
        if (result.issues.some((issue) => issue.severity === "error")) {
            return {rootPath: stakeDir, descriptor, issues: result.issues, modes: []};
        }

        const analysis = this.stakeEngineAnalyzer.analyze(result);
        return {
            rootPath: stakeDir,
            descriptor,
            issues: result.issues,
            modes: analysis.modes.map((mode) => ({modeName: mode.modeName, analysis: mode})),
        };
    }
}
