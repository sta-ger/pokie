import {OutcomeSourceProjectAnalyzer} from "./OutcomeSourceProjectAnalyzer.js";
import type {OutcomeSourceProjectAnalyzing} from "./OutcomeSourceProjectAnalyzing.js";
import type {OutcomeSourceProjectDiff, OutcomeSourceProjectMetricDiff, OutcomeSourceProjectModeDiff} from "./OutcomeSourceProjectDiff.js";
import type {OutcomeSourceProjectModeAnalysis, OutcomeSourceProjectReport} from "./OutcomeSourceProjectReport.js";
import {OUTCOME_SOURCE_DIFF_OPERATION} from "./PokieOperation.js";
import type {PokieProject} from "./PokieProject.js";
import type {UnsupportedProjectOperationDiagnostic} from "./UnsupportedProjectOperationDiagnostic.js";
import {describeUnsupportedProjectOperation} from "./describeUnsupportedProjectOperation.js";

export type OutcomeSourceDiffResult =
    | {readonly supported: true; readonly diff: OutcomeSourceProjectDiff}
    | {readonly supported: false; readonly diagnostic: UnsupportedProjectOperationDiagnostic};

// Compares two resolved "outcomeLibrary"/"stakeAdapter" projects' own canonical exact analyses --
// OutcomeSourceProjectAnalyzer.analyze() for each side, then a per-mode metric diff over exactly the core
// fields WeightedOutcomeLibraryAnalysis and StakeEngineStandaloneModeAnalysis both already share (see
// OutcomeSourceProjectModeAnalysis's own doc comment on why a caller can treat either reader family's own
// analysis uniformly) -- never re-derives or recomputes either side's own statistics, and never loadPokieGame.
// Left and right may be different source kinds (a native bundle vs. a Stake Engine export): diffing stays
// meaningful because both analyses are already expressed over the same normalized-ratio semantics (see
// WeightedOutcomeLibraryAnalysis's own doc comment on rtp/variance/standardDeviation), even though each
// kind's own "biggest win" field ("maxWin" vs. "maxPayoutMultiplier"/"maxRatio") differs in unit and is
// deliberately excluded from this diff -- see OutcomeSourceProjectModeDiff's own doc comment.
export async function diffOutcomeSourceProjects(
    left: PokieProject,
    right: PokieProject,
    analyzer: OutcomeSourceProjectAnalyzing = new OutcomeSourceProjectAnalyzer(),
): Promise<OutcomeSourceDiffResult> {
    const leftDiagnostic = describeUnsupportedProjectOperation(left, OUTCOME_SOURCE_DIFF_OPERATION);
    if (leftDiagnostic !== undefined) {
        return {supported: false, diagnostic: leftDiagnostic};
    }
    const rightDiagnostic = describeUnsupportedProjectOperation(right, OUTCOME_SOURCE_DIFF_OPERATION);
    if (rightDiagnostic !== undefined) {
        return {supported: false, diagnostic: rightDiagnostic};
    }

    const [leftReport, rightReport] = await Promise.all([analyzer.analyze(left), analyzer.analyze(right)]);

    return {supported: true, diff: buildDiff(leftReport, rightReport)};
}

function buildDiff(leftReport: OutcomeSourceProjectReport, rightReport: OutcomeSourceProjectReport): OutcomeSourceProjectDiff {
    const leftByMode = new Map(leftReport.modes.map((mode) => [mode.modeName, mode]));
    const rightByMode = new Map(rightReport.modes.map((mode) => [mode.modeName, mode]));

    const perMode: Record<string, OutcomeSourceProjectModeDiff> = {};
    for (const [modeName, leftMode] of leftByMode) {
        const rightMode = rightByMode.get(modeName);
        if (rightMode !== undefined) {
            perMode[modeName] = diffMode(modeName, leftMode, rightMode);
        }
    }

    return {
        left: {rootPath: leftReport.rootPath, kind: leftReport.descriptor.kind, issues: leftReport.issues},
        right: {rootPath: rightReport.rootPath, kind: rightReport.descriptor.kind, issues: rightReport.issues},
        perMode,
        onlyInLeft: [...leftByMode.keys()].filter((modeName) => !rightByMode.has(modeName)),
        onlyInRight: [...rightByMode.keys()].filter((modeName) => !leftByMode.has(modeName)),
    };
}

function diffMode(modeName: string, left: OutcomeSourceProjectModeAnalysis, right: OutcomeSourceProjectModeAnalysis): OutcomeSourceProjectModeDiff {
    return {
        modeName,
        rtp: metricDiff(left.analysis.rtp, right.analysis.rtp),
        hitFrequency: metricDiff(left.analysis.hitFrequency, right.analysis.hitFrequency),
        zeroWinFrequency: metricDiff(left.analysis.zeroWinFrequency, right.analysis.zeroWinFrequency),
        variance: metricDiff(left.analysis.variance, right.analysis.variance),
        standardDeviation: metricDiff(left.analysis.standardDeviation, right.analysis.standardDeviation),
        maxWinProbability: metricDiff(left.analysis.maxWinProbability, right.analysis.maxWinProbability),
    };
}

function metricDiff(left: number, right: number): OutcomeSourceProjectMetricDiff {
    const delta = right - left;
    const percentDelta = left !== 0 ? (delta / Math.abs(left)) * 100 : null;
    return {left, right, delta, percentDelta};
}
