import {analyzeBlueprintMath, DEFAULT_BLUEPRINT_MATH_OUTCOME_CAP} from "../weightedoutcome/BlueprintMathAnalysis.js";
import type {WeightedOutcomeLibraryAnalysis} from "../weightedoutcome/WeightedOutcomeLibraryAnalysis.js";
import type {WeightedOutcomeLibraryFeatureBreakdown} from "../weightedoutcome/WeightedOutcomeLibraryFeatureBreakdown.js";
import type {FreeGamesExactRtp} from "../weightedoutcome/computeFreeGamesExactRtp.js";
import {displayLineNumber, type WeightedOutcomeWinAnalysis} from "../weightedoutcome/WeightedOutcomeWinAnalysis.js";
import {PAR_SHEET_MATH_SHEET_NAMES} from "./ParSheetMathSheetNames.js";
import type {SheetGrid} from "./SheetGrid.js";

export type ParSheetMathAnalysis =
    | {
          readonly status: "ok";
          readonly analysis: WeightedOutcomeLibraryAnalysis;
          readonly wins: WeightedOutcomeWinAnalysis;
          /** Feature events recorded by the enumerated paid-spin records. See BlueprintMathAnalysisResult. */
          readonly featureBreakdown: WeightedOutcomeLibraryFeatureBreakdown;
          /** Exact total RTP derived from additive free-game triggers, when available. */
          readonly freeGamesRtp: FreeGamesExactRtp;
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
    const featureEvents = result.featureBreakdown.featureEvents;
    const freeGamesRtp = result.freeGamesRtp;
    const freeGamesReason = freeGamesRtp.status === "available" ? "" : freeGamesRtp.reason;
    let featureNote = "";
    if (featureEvents.length > 0 && freeGamesRtp.status === "available") {
        featureNote = ` Total RTP includes additive free-game retriggers (paid-spin trigger distribution): ${(freeGamesRtp.totalRtp * 100).toFixed(4)}% total = ${(freeGamesRtp.baseRtp * 100).toFixed(4)}% paid + ${(freeGamesRtp.featureRtp * 100).toFixed(4)}% free games. Hit frequency, volatility, max win, payout distribution, win events and contributions are paid-spin figures; later free-game wins are not included in those tables. The Max win row is the paid-spin maximum. ${freeGamesRtp.maxFreeGames === undefined ? "Without a free-games cap, the theoretical whole-round maximum is unbounded even when expected RTP is finite." : `The whole-round maximum row is an upper bound: the paid-spin maximum plus the ${freeGamesRtp.maxFreeGames}-free-game cap, each at the paid-spin maximum.`} Free-games awards are exact scatter counts: a count that is not listed awards 0 free games.`;
    } else if (featureEvents.length > 0) {
        featureNote = ` Paid-spin only: feature payouts (${featureEvents.map((entry) => entry.key).join(", ")}) are not included in hit frequency, volatility, max win, payout distribution, win events or contributions; ${freeGamesReason}`;
    }
    return {
        status: "ok",
        analysis: result.analysis,
        wins: result.wins,
        featureBreakdown: result.featureBreakdown,
        freeGamesRtp,
        outcomeCount: result.outcomeCount,
        totalWeight: result.totalWeight,
        stake: result.stake,
        generatedAt: result.generatedAt,
        // The draft preview's note says "nothing was saved" because it deliberately writes no project.
        // This workbook, by contrast, is the saved artifact, so use a PAR-specific note instead.
        note: `Exact enumeration of ${result.outcomeCount.toLocaleString("en-US")} outcomes.${featureNote}`,
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
    const featureEvents = math.featureBreakdown.featureEvents;
    const featureScope = featureEvents.length > 0;
    const totalRtp = math.freeGamesRtp.status === "available" ? math.freeGamesRtp : undefined;
    let wholeRoundMaxRows: SheetGrid = [];
    if (totalRtp !== undefined) {
        if (totalRtp.maxFreeGames === undefined) {
            wholeRoundMaxRows = [["Max whole-round win", "Unbounded without a cap", "retriggers can chain indefinitely"]];
        } else {
            wholeRoundMaxRows = [[
                "Max whole-round win (upper bound, capped)",
                round((analysis.maxWin / math.stake) * (1 + totalRtp.maxFreeGames)),
                "× bet; paid-spin maximum plus the cap in free spins",
            ]];
        }
    }
    const summary: SheetGrid = [
        ["Metric", "Value", "Unit"],
        ["Scope", featureScope ? "Paid-spin metrics are labelled; Total RTP is the only whole-game figure" : "Whole game (no later feature payouts recorded)", ""],
        [featureScope ? "RTP (paid spins)" : "RTP", round(analysis.rtp * 100), "%"],
        ...(totalRtp === undefined ? [] : [
            ["Free-games RTP", round(totalRtp.featureRtp * 100), "%"],
            ["Total RTP (paid + free games)", round(totalRtp.totalRtp * 100), "%"],
            ["Free-games model", totalRtp.maxFreeGames === undefined ? "Additive retrigger" : "Additive retrigger, capped", `trigger ${round(totalRtp.triggerProbability * 100, 4)}%; award ${round(totalRtp.expectedAward, 4)}; ${round(totalRtp.expectedFreeSpins, 4)} free spins per trigger`],
            ...(totalRtp.maxFreeGames === undefined ? [] : [["Free-games cap", totalRtp.maxFreeGames, "total free games per feature (initial award + retriggers)"]]),
            ["Free-games award counts", "Exact scatter counts", "A scatter count that is not listed awards 0 free games"],
        ]),
        ...(featureScope && totalRtp === undefined ? [["Feature payouts", "Not included", featureEvents.map((entry) => entry.key).join(", ")]] : []),
        [featureScope ? "Hit frequency (paid spins)" : "Hit frequency", round(analysis.hitFrequency * 100), "%"],
        [featureScope ? "Volatility (std. deviation, bet units, paid spins)" : "Volatility (std. deviation, bet units)", round(analysis.standardDeviation), ""],
        [featureScope ? "Max win (paid spins)" : "Max win", round(analysis.maxWin / math.stake), "× bet"],
        ...wholeRoundMaxRows,
        [featureScope ? "Outcome count (paid spins)" : "Outcome count", math.outcomeCount, ""],
        ["Total weight", math.totalWeight, ""],
        ["Stake", math.stake, ""],
        ["Strategy", "exact", ""],
        ["Table order", "Win events: probability, highest first; contributions: RTP contribution, highest first; ties by line or symbol", ""],
        ["Contribution tables", "Line and symbol contributions overlap; do not add them together. Each table is its own view of the same wins.", ""],
        ["Generated at", math.generatedAt, ""],
        ...(math.note === undefined ? [] : [["Note", math.note, ""]]),
    ];
    const payoutDistribution: SheetGrid = [
        [featureScope ? "Payout (× bet; paid spins only)" : "Payout (× bet)", "Probability (%)", "1 in"],
        ...analysis.payoutDistribution.map((bucket) => [
            round(bucket.payoutMultiplier),
            round(bucket.probability * 100),
            bucket.probability > 0 ? round(1 / bucket.probability) : "—",
        ]),
    ];
    const winEvents: SheetGrid = [
        [featureScope ? "Kind (paid spins)" : "Kind", "Event", "Win type", "Match count", "Probability (%)", "1 in", "RTP contribution (%)", "Outcomes"],
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
        [featureScope ? "Line (paid spins)" : "Line", "Label", "RTP contribution (%)", "Hit frequency (%)", "Outcomes"],
        ...wins.line.entries.map((entry) => [
            displayLineNumber(entry.key.split(":")[1] ?? entry.key),
            entry.label,
            round(entry.rtpContribution * 100),
            round(entry.hitFrequency * 100),
            entry.outcomeCount,
        ]),
    ];
    const symbolContributions: SheetGrid = [
        [featureScope ? "Symbol (paid spins)" : "Symbol", "Label", "RTP contribution (%)", "Hit frequency (%)", "Outcomes"],
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
