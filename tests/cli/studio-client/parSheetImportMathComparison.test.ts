import {describeParSheetImportMathComparison} from "../../../cli/studio-client/src/domain/parSheetImportMathComparison.js";
import type {StudioBlueprintMathPreviewView} from "../../../cli/studio-client/src/api/types.js";

function okView(overrides: {
    rtp: number;
    hitFrequency: number;
    standardDeviation: number;
    maxWin: number;
    outcomeCount?: number;
    stake?: number;
    freeGamesRtp?: unknown;
    featureEvents?: readonly unknown[];
}): StudioBlueprintMathPreviewView {
    return {
        status: "ok",
        outcomeCount: overrides.outcomeCount ?? 3125,
        totalWeight: 3125,
        stake: overrides.stake ?? 1,
        analysis: {
            rtp: overrides.rtp,
            hitFrequency: overrides.hitFrequency,
            standardDeviation: overrides.standardDeviation,
            maxWin: overrides.maxWin,
            payoutDistribution: [],
        },
        featureBreakdown: {featureEvents: overrides.featureEvents ?? []},
        freeGamesRtp: overrides.freeGamesRtp ?? {status: "unsupported", reason: "No feature events."},
        generatedAt: "2026-11-24T00:00:00.000Z",
        maxOutcomes: 10_000_000,
    } as unknown as StudioBlueprintMathPreviewView;
}

const freeGamesRtp = (baseRtp: number, featureRtp: number) => ({
    status: "available",
    baseRtp,
    featureRtp,
    totalRtp: baseRtp + featureRtp,
    triggerProbability: 0.216,
    expectedAward: 1,
    expectedFreeSpins: 1.2755,
    method: "additive-retrigger",
});

describe("describeParSheetImportMathComparison", () => {
    it("compares paid-spin math when neither draft has free games", () => {
        const result = describeParSheetImportMathComparison(
            okView({rtp: 0.96768, hitFrequency: 0.248, standardDeviation: 2.814917, maxWin: 38}),
            okView({rtp: 0.94848, hitFrequency: 0.248, standardDeviation: 2.7, maxWin: 38}),
        );
        expect(result.status).toBe("ok");
        if (result.status !== "ok") return;
        expect(result.rows.map((row) => row.key)).toEqual([
            "paidSpinRtp",
            "hitFrequency",
            "volatility",
            "maxWin",
            "outcomes",
        ]);
        expect(result.rows[0]).toMatchObject({
            label: "Paid-spin RTP",
            current: "96.7680%",
            imported: "94.8480%",
            changed: true,
        });
        expect(result.rows[1]).toMatchObject({
            label: "Hit frequency (paid spins)",
            current: "24.8000%",
            imported: "24.8000%",
            changed: false,
        });
        expect(result.rows[2].label).toBe("Volatility (std. deviation, bet units, paid spins)");
        expect(result.rows[3]).toMatchObject({
            label: "Max win (paid spins, × bet)",
            current: "38.0000",
            imported: "38.0000",
        });
        expect(result.rows[4]).toMatchObject({label: "Outcomes (paid spins)", current: "3,125", imported: "3,125"});
    });

    it("adds total and free-games RTP when both drafts have additive free games", () => {
        const result = describeParSheetImportMathComparison(
            okView({
                rtp: 0.63936,
                hitFrequency: 0.12,
                standardDeviation: 2.5475,
                maxWin: 32,
                freeGamesRtp: freeGamesRtp(0.63936, 0.17615),
            }),
            okView({
                rtp: 0.6,
                hitFrequency: 0.12,
                standardDeviation: 2.5,
                maxWin: 32,
                freeGamesRtp: freeGamesRtp(0.6, 0.18),
            }),
        );
        expect(result.status).toBe("ok");
        if (result.status !== "ok") return;
        expect(result.rows.map((row) => row.key)).toEqual([
            "paidSpinRtp",
            "totalRtp",
            "freeGamesRtp",
            "hitFrequency",
            "volatility",
            "maxWin",
            "outcomes",
        ]);
        expect(result.rows[1]).toMatchObject({
            label: "Total RTP (paid + free games)",
            current: "81.5510%",
            imported: "78.0000%",
            changed: true,
        });
        expect(result.rows[2]).toMatchObject({
            label: "Free-games RTP",
            current: "17.6150%",
            imported: "18.0000%",
            changed: true,
        });
    });

    it("compares total RTP when only one draft has free games", () => {
        const result = describeParSheetImportMathComparison(
            okView({rtp: 0.96768, hitFrequency: 0.248, standardDeviation: 2.814917, maxWin: 38}),
            okView({
                rtp: 0.73536,
                hitFrequency: 0.12,
                standardDeviation: 2.86,
                maxWin: 32,
                freeGamesRtp: freeGamesRtp(0.73536, 0.20259),
            }),
        );
        expect(result.status).toBe("ok");
        if (result.status !== "ok") return;
        expect(result.rows.map((row) => row.key)).toEqual([
            "paidSpinRtp",
            "totalRtp",
            "freeGamesRtp",
            "hitFrequency",
            "volatility",
            "maxWin",
            "outcomes",
        ]);
        expect(result.rows[0]).toMatchObject({
            label: "Paid-spin RTP",
            current: "96.7680%",
            imported: "73.5360%",
            changed: true,
        });
        expect(result.rows[1]).toMatchObject({
            label: "Total RTP (paid + free games)",
            current: "96.7680%",
            imported: "93.7950%",
            changed: true,
        });
        expect(result.rows[2]).toMatchObject({
            label: "Free-games RTP",
            current: "0.0000%",
            imported: "20.2590%",
            changed: true,
        });
    });

    it("does not relabel a paid-spin RTP as total RTP when another feature has no supported derivation", () => {
        const result = describeParSheetImportMathComparison(
            okView({
                rtp: 0.9,
                hitFrequency: 0.2,
                standardDeviation: 3,
                maxWin: 40,
                featureEvents: [{key: "weightedBonusTriggered", label: "Weighted bonus"}],
            }),
            okView({rtp: 0.96768, hitFrequency: 0.248, standardDeviation: 2.8, maxWin: 38}),
        );
        expect(result.status).toBe("ok");
        if (result.status !== "ok") return;
        expect(result.rows.map((row) => row.key)).toEqual([
            "paidSpinRtp",
            "hitFrequency",
            "volatility",
            "maxWin",
            "outcomes",
        ]);
    });

    it("warns before Apply when either draft's comparable RTP is above 100%", () => {
        const result = describeParSheetImportMathComparison(
            okView({rtp: 0.96768, hitFrequency: 0.248, standardDeviation: 2.8, maxWin: 38}),
            okView({rtp: 1.12128, hitFrequency: 0.248, standardDeviation: 2.9, maxWin: 38}),
        );
        expect(result.status).toBe("ok");
        if (result.status !== "ok") return;
        expect(result.rtpWarnings?.current).toBeUndefined();
        expect(result.rtpWarnings?.imported).toContain("RTP is above 100%");
    });

    it("does not add warnings for a comparable RTP under 100%", () => {
        const result = describeParSheetImportMathComparison(
            okView({rtp: 0.96768, hitFrequency: 0.248, standardDeviation: 2.8, maxWin: 38}),
            okView({rtp: 0.94848, hitFrequency: 0.248, standardDeviation: 2.7, maxWin: 38}),
        );
        expect(result.status).toBe("ok");
        if (result.status !== "ok") return;
        expect(result.rtpWarnings).toBeUndefined();
    });

    it("reports an honest unavailable state instead of inventing a comparison", () => {
        const result = describeParSheetImportMathComparison(
            {status: "unavailable", message: "Outcome space is too large."},
            okView({rtp: 0.96768, hitFrequency: 0.248, standardDeviation: 2.8, maxWin: 38}),
        );
        expect(result).toEqual({
            status: "unavailable",
            message: "The current draft cannot be enumerated exactly: Outcome space is too large.",
        });
    });
});
