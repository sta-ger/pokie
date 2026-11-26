import {formatAnalysisNumber} from "../../../../src/internal/formatAnalysisNumber";
import {describeRtpSanityWarning} from "../../../../src/reporting/describeRtpSanityWarning";
import type {StudioBlueprintMathPreviewView} from "../api/types";

export type ParSheetImportMathComparisonRow = {
    readonly key: "paidSpinRtp" | "totalRtp" | "freeGamesRtp" | "hitFrequency" | "volatility" | "maxWin" | "outcomes";
    readonly label: string;
    readonly current: string;
    readonly imported: string;
    readonly changed: boolean;
};

export type ParSheetImportMathComparison =
    | {
          readonly status: "ok";
          readonly rows: readonly ParSheetImportMathComparisonRow[];
          readonly rtpWarnings?: {readonly current?: string; readonly imported?: string};
      }
    | {readonly status: "unavailable"; readonly message: string};

function percent(value: number): string {
    return `${formatAnalysisNumber(value * 100, 4)}%`;
}

function ratio(value: number): string {
    return formatAnalysisNumber(value, 4);
}

function count(value: number): string {
    return value.toLocaleString("en-US");
}

function changed(current: string, imported: string): boolean {
    return current !== imported;
}

function completeTotalRtp(view: Extract<StudioBlueprintMathPreviewView, {status: "ok"}>): number | undefined {
    if (view.freeGamesRtp.status === "available") return view.freeGamesRtp.totalRtp;
    if (view.featureBreakdown.featureEvents.length === 0) return view.analysis.rtp;
    return undefined;
}

function completeFreeGamesRtp(view: Extract<StudioBlueprintMathPreviewView, {status: "ok"}>): number | undefined {
    if (view.freeGamesRtp.status === "available") return view.freeGamesRtp.featureRtp;
    if (view.featureBreakdown.featureEvents.length === 0) return 0;
    return undefined;
}

/**
 * Side-by-side exact math for the PAR import preview. Both sides are computed from the drafts the user
 * is actually comparing, so the numbers are never copied from a workbook summary that may describe a
 * different model or POKIE version. Total RTP is shown when both drafts have a complete whole-round
 * total: either an additive free-games derivation, or no later-settling feature at all. A draft with
 * other feature payouts but no supported derivation has no honest total, so paid-spin RTP remains the
 * only comparable value rather than being mislabelled as total.
 */
export function describeParSheetImportMathComparison(
    current: StudioBlueprintMathPreviewView,
    imported: StudioBlueprintMathPreviewView,
): ParSheetImportMathComparison {
    if (current.status !== "ok") return {status: "unavailable", message: `The current draft cannot be enumerated exactly: ${current.message}`};
    if (imported.status !== "ok") return {
        status: "unavailable",
        message: `The imported PAR draft cannot be enumerated exactly: ${imported.message}`,
    };

    const currentPaidSpinRtp = percent(current.analysis.rtp);
    const importedPaidSpinRtp = percent(imported.analysis.rtp);
    const rows: ParSheetImportMathComparisonRow[] = [
        {
            key: "paidSpinRtp",
            label: "Paid-spin RTP",
            current: currentPaidSpinRtp,
            imported: importedPaidSpinRtp,
            changed: changed(currentPaidSpinRtp, importedPaidSpinRtp),
        },
    ];
    // A free-games derivation is a complete whole-round total. A draft with no later-settling feature
    // also has total RTP equal to paid-spin RTP. A draft with other feature events but no supported
    // derivation has no honest total; never relabel its paid-spin RTP as one.
    const currentTotalRtp = completeTotalRtp(current);
    const importedTotalRtp = completeTotalRtp(imported);
    const currentFreeRtp = completeFreeGamesRtp(current);
    const importedFreeRtp = completeFreeGamesRtp(imported);
    const hasFreeGamesScope =
        current.freeGamesRtp.status === "available" || imported.freeGamesRtp.status === "available";
    if (
        hasFreeGamesScope &&
        currentTotalRtp !== undefined &&
        importedTotalRtp !== undefined &&
        currentFreeRtp !== undefined &&
        importedFreeRtp !== undefined
    ) {
        const currentTotalText = percent(currentTotalRtp);
        const importedTotalText = percent(importedTotalRtp);
        const currentFreeText = percent(currentFreeRtp);
        const importedFreeText = percent(importedFreeRtp);
        rows.push(
            {
                key: "totalRtp",
                label: "Total RTP (paid + free games)",
                current: currentTotalText,
                imported: importedTotalText,
                changed: changed(currentTotalText, importedTotalText),
            },
            {
                key: "freeGamesRtp",
                label: "Free-games RTP",
                current: currentFreeText,
                imported: importedFreeText,
                changed: changed(currentFreeText, importedFreeText),
            },
        );
    }
    const currentHit = percent(current.analysis.hitFrequency);
    const importedHit = percent(imported.analysis.hitFrequency);
    const currentVolatility = ratio(current.analysis.standardDeviation);
    const importedVolatility = ratio(imported.analysis.standardDeviation);
    const currentMaxWin = ratio(current.analysis.maxWin / current.stake);
    const importedMaxWin = ratio(imported.analysis.maxWin / imported.stake);
    const currentOutcomes = count(current.outcomeCount);
    const importedOutcomes = count(imported.outcomeCount);
    rows.push(
        {
            key: "hitFrequency",
            label: "Hit frequency (paid spins)",
            current: currentHit,
            imported: importedHit,
            changed: changed(currentHit, importedHit),
        },
        {
            key: "volatility",
            label: "Volatility (std. deviation, bet units, paid spins)",
            current: currentVolatility,
            imported: importedVolatility,
            changed: changed(currentVolatility, importedVolatility),
        },
        {
            key: "maxWin",
            label: "Max win (paid spins, × bet)",
            current: currentMaxWin,
            imported: importedMaxWin,
            changed: changed(currentMaxWin, importedMaxWin),
        },
        {
            key: "outcomes",
            label: "Outcomes (paid spins)",
            current: currentOutcomes,
            imported: importedOutcomes,
            changed: changed(currentOutcomes, importedOutcomes),
        },
    );
    // Reuse the same sanity warning the exact-math card shows. The comparison is the last place to
    // catch a >100% sheet before an author presses Apply; making them compute exact math afterwards
    // is too late for a safe review.
    const currentComparableRtp = currentTotalRtp ?? current.analysis.rtp;
    const importedComparableRtp = importedTotalRtp ?? imported.analysis.rtp;
    const currentWarning = describeRtpSanityWarning(currentComparableRtp);
    const importedWarning = describeRtpSanityWarning(importedComparableRtp);
    return {
        status: "ok",
        rows,
        ...(currentWarning === undefined && importedWarning === undefined
            ? {}
            : {
                rtpWarnings: {
                    ...(currentWarning === undefined ? {} : {current: currentWarning}),
                    ...(importedWarning === undefined ? {} : {imported: importedWarning}),
                },
            }),
    };
}
