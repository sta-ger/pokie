import {analyzeBlueprintMath, DEFAULT_BLUEPRINT_MATH_OUTCOME_CAP} from "../weightedoutcome/BlueprintMathAnalysis.js";
import type {WeightedOutcomeLibraryAnalysis} from "../weightedoutcome/WeightedOutcomeLibraryAnalysis.js";
import {displayLineNumber, type WeightedOutcomeWinAnalysis} from "../weightedoutcome/WeightedOutcomeWinAnalysis.js";
import {PAR_SHEET_MATH_SHEET_NAMES} from "./ParSheetMathSheetNames.js";
import type {SheetGrid} from "./SheetGrid.js";

export type ParSheetMathAnalysis =
    | {
          readonly status: "ok";
          readonly analysis: WeightedOutcomeLibraryAnalysis;
          readonly wins: WeightedOutcomeWinAnalysis;
          readonly outcomeCount: number;
          readonly totalWeight: number;
          readonly stake: number;
          readonly generatedAt: string;
          readonly note?: string;
      }
    | {
          readonly status: "unavailable";
          readonly reason: string;
          readonly maxOutcomes: number;
      };

export type ParSheetMathSheet = {
    readonly name: string;
    readonly grid: SheetGrid;
};

/**
 * Computes the exact math section of a PAR workbook from the same materialized blueprint the workbook's
 * reels/paytable already describe. The caller decides whether to include it; Studio and the public
 * "pokie par export" path opt in. A space above the cap produces an explicit "not included" summary
 * sheet rather than silently omitting the section or turning a sampled estimate into a PAR number.
 */
export async function computeParSheetMathAnalysis(
    blueprint: unknown,
    pokieVersion: string,
    options: {readonly maxOutcomes?: number; readonly signal?: AbortSignal; readonly now?: () => Date} = {},
): Promise<ParSheetMathAnalysis> {
    const maxOutcomes = options.maxOutcomes ?? DEFAULT_BLUEPRINT_MATH_OUTCOME_CAP;
    const result = await analyzeBlueprintMath(blueprint, {
        pokieVersion,
        maxOutcomes,
        ...(options.signal === undefined ? {} : {signal: options.signal}),
        ...(options.now === undefined ? {} : {now: options.now}),
    });
    if (result.status === "unavailable") {
        return {status: "unavailable", reason: result.reason, maxOutcomes};
    }
    return {
        status: "ok",
        analysis: result.analysis,
        wins: result.wins,
        outcomeCount: result.outcomeCount,
        totalWeight: result.totalWeight,
        stake: result.stake,
        generatedAt: result.generatedAt,
        // The draft preview's note says "nothing was saved" because it deliberately writes no project.
        // This workbook, by contrast, is the saved artifact, so use a PAR-specific note instead.
        note: `Exact enumeration of ${result.outcomeCount.toLocaleString("en-US")} outcomes.`,
    };
}

export function buildParSheetMathSheets(math: ParSheetMathAnalysis): ParSheetMathSheet[] {
    if (math.status === "unavailable") {
        return [{
            name: PAR_SHEET_MATH_SHEET_NAMES[0],
            grid: [
                ["Status", "Value", "Notes"],
                ["Not included", "—", math.reason],
                ["Exact preview cap", math.maxOutcomes, "Reel-stop combinations"],
            ],
        }];
    }
    const {analysis, wins} = math;
    const summary: SheetGrid = [
        ["Metric", "Value", "Unit"],
        ["RTP", round(analysis.rtp * 100), "%"],
        ["Hit frequency", round(analysis.hitFrequency * 100), "%"],
        ["Volatility (std. dev.)", round(analysis.standardDeviation), ""],
        ["Max win", round(analysis.maxWin / math.stake), "× bet"],
        ["Outcome count", math.outcomeCount, ""],
        ["Total weight", math.totalWeight, ""],
        ["Stake", math.stake, ""],
        ["Strategy", "exact", ""],
        ["Generated at", math.generatedAt, ""],
        ...(math.note === undefined ? [] : [["Note", math.note, ""]]),
    ];
    const payoutDistribution: SheetGrid = [
        ["Payout (× bet)", "Probability (%)", "1 in"],
        ...analysis.payoutDistribution.map((bucket) => [
            round(bucket.payoutMultiplier),
            round(bucket.probability * 100),
            bucket.probability > 0 ? round(1 / bucket.probability) : "—",
        ]),
    ];
    const winEvents: SheetGrid = [
        ["Kind", "Event", "Win type", "Match count", "Probability (%)", "1 in", "RTP contribution (%)", "Outcomes"],
        ...wins.events.entries.map((event) => [
            event.kind,
            event.label,
            event.winType,
            event.matchCount ?? "—",
            round(event.probability * 100),
            event.probability > 0 ? round(1 / event.probability) : "—",
            round(event.rtpContribution * 100),
            event.outcomeCount,
        ]),
    ];
    const lineContributions: SheetGrid = [
        ["Line", "Label", "RTP contribution (%)", "Hit frequency (%)", "Outcomes"],
        ...wins.line.entries.map((entry) => [
            displayLineNumber(entry.key.split(":")[1] ?? entry.key),
            entry.label,
            round(entry.rtpContribution * 100),
            round(entry.hitFrequency * 100),
            entry.outcomeCount,
        ]),
    ];
    const symbolContributions: SheetGrid = [
        ["Symbol", "Label", "RTP contribution (%)", "Hit frequency (%)", "Outcomes"],
        ...wins.symbol.entries.map((entry) => [
            entry.symbolId ?? entry.key.replace(/^symbol:/, ""),
            entry.label,
            round(entry.rtpContribution * 100),
            round(entry.hitFrequency * 100),
            entry.outcomeCount,
        ]),
    ];
    return [
        {name: PAR_SHEET_MATH_SHEET_NAMES[0], grid: summary},
        {name: PAR_SHEET_MATH_SHEET_NAMES[1], grid: payoutDistribution},
        {name: PAR_SHEET_MATH_SHEET_NAMES[2], grid: winEvents},
        {name: PAR_SHEET_MATH_SHEET_NAMES[3], grid: lineContributions},
        {name: PAR_SHEET_MATH_SHEET_NAMES[4], grid: symbolContributions},
    ];
}

function round(value: number, digits = 6): number {
    return Number(value.toFixed(digits));
}
