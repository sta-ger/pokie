import {
    buildDefaultOptimizationRequest,
    describeTunablePath,
    formatOptimizationDistance,
    formatOptimizationMetricValue,
    formatOptimizationTolerance,
    formatTunableValues,
    freeGamesAwardPath,
    hasFreeGames,
    nearestOptimizationCandidate,
    optimizationDomainSize,
    optimizationScopeLabel,
    optimizationTargetLabel,
    optimizationTunablePaths,
    parseFreeGamesAwardPath,
    parsePaytablePath,
    parseTunableValues,
    paytablePath,
    recommendsWholeRoundScope,
    suggestedPaytableValues,
    tunableCurrentValue,
} from "../../../cli/studio-client/src/domain/optimizationRequest.js";
import type {GameModelProjection, StudioExactMathView} from "../../../cli/studio-client/src/api/types.js";

const model: GameModelProjection = {
    basics: {status: "available", data: {id: "game", name: "Game", version: "1.0.0"}},
    layout: {status: "unavailable", reason: "not needed"},
    symbols: {status: "unavailable", reason: "not needed"},
    reels: {status: "unavailable", reason: "not needed"},
    paytable: {
        status: "available",
        data: [
            {symbolId: "A", matchCount: 3, payout: 8},
            {symbolId: "A", matchCount: 4, payout: 16},
            {symbolId: "K", matchCount: 3, payout: 6},
        ],
    },
    betsAndModes: {status: "available", data: {availableBets: [1, 2], betModes: [{id: "base", isDefault: true}]}},
    mechanics: {status: "unavailable", reason: "not needed"},
    limits: {status: "unavailable", reason: "not needed"},
};

const freeGamesModel: GameModelProjection = {
    ...model,
    mechanics: {
        status: "available",
        data: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 10, 4: 15}}},
    },
};

describe("optimization request helpers", () => {
    it("escapes and round-trips paytable paths", () => {
        const path = paytablePath({symbolId: "A/B~C", matchCount: 3});
        expect(path).toBe("/paytable/A~1B~0C/3");
        expect(parsePaytablePath(path)).toEqual({symbolId: "A/B~C", matchCount: 3});
        expect(describeTunablePath("/paytable/A/3")).toBe("A, 3 symbols payout");
        expect(describeTunablePath("/modes/base/outcomes/x/weight")).toBe("/modes/base/outcomes/x/weight");
    });

    it("exposes free-game awards as ordinary named fields, not JSON pointers", () => {
        const path = freeGamesAwardPath(3);
        expect(path).toBe("/mechanics/freeGames/awardsByCount/3");
        expect(parseFreeGamesAwardPath(path)).toBe("3");
        expect(describeTunablePath(path)).toBe("3 scatters → free games");
        expect(hasFreeGames(freeGamesModel)).toBe(true);
        expect(optimizationTunablePaths(freeGamesModel)).toContain(path);
        expect(tunableCurrentValue(path, freeGamesModel)).toBe(10);
    });

    it("labels paid-spin and whole-round RTP as different populations", () => {
        const target = {metric: "rtp" as const, unit: "ratio" as const, value: 0.96, tolerance: {kind: "absolute" as const, value: 0.001}};
        expect(optimizationTargetLabel(target, "paid-entry")).toBe("Paid-spin RTP");
        expect(optimizationTargetLabel(target, "logical-round")).toBe("Total RTP (paid + free games)");
        expect(optimizationTargetLabel(target, "native-outcomes")).toBe("RTP (native outcomes)");
        expect(optimizationScopeLabel("logical-round")).toBe("Whole paid round (incl. free games)");
    });

    it("suggests nearby values and keeps decimal payouts at a finer step", () => {
        expect(suggestedPaytableValues(8)).toEqual([6, 7, 8, 9, 10]);
        expect(suggestedPaytableValues(0)).toEqual([0, 1, 2]);
        expect(suggestedPaytableValues(0.5)).toEqual([0, 0.5, 1, 1.5]);
    });

    it("parses only finite unique numbers", () => {
        expect(parseTunableValues("6, 7 8,8")).toEqual({values: [6, 7, 8]});
        expect(parseTunableValues("")).toEqual({error: "Enter at least one candidate value."});
        expect(parseTunableValues("1, nope")).toEqual({error: "\"nope\" is not a finite number."});
        expect(formatTunableValues([6, 7, 8])).toBe("6, 7, 8");
    });

    it("formats ratios in their display unit and finds the nearest evaluated candidate", () => {
        const rtpTarget = {metric: "rtp" as const, unit: "ratio" as const, value: 0.96, tolerance: {kind: "absolute" as const, value: 0.001}};
        expect(formatOptimizationMetricValue(rtpTarget, 0.96768)).toBe("96.7680%");
        expect(formatOptimizationTolerance(rtpTarget, 0.001)).toBe("0.1000pp");
        expect(formatOptimizationMetricValue({metric: "maxWin", unit: "betMultiple", value: 38}, 38)).toBe("38.0000× bet");
        const nearest = nearestOptimizationCandidate(rtpTarget, [
            {measured: [0.85248], parameters: {"/paytable/A/3": 2}},
            {measured: [0.96768], parameters: {"/paytable/A/3": 8}},
            {measured: [0.98688], parameters: {"/paytable/A/3": 9}},
        ]);
        expect(nearest).toMatchObject({index: 1, measured: 0.96768});
        expect(nearest?.distance).toBeCloseTo(0.00768, 12);
        expect(formatOptimizationDistance(rtpTarget, 4.885e-13)).toBe("0.0000%");
        expect(formatOptimizationDistance(rtpTarget, 0.00768)).toBe("0.7680%");
    });

    it("builds a default request around the highest authored award", () => {
        const request = buildDefaultOptimizationRequest(model);
        expect(request.targets[0]).toMatchObject({metric: "rtp", unit: "ratio", value: 0.95});
        expect(request.policy.tunables).toEqual([{path: "/paytable/A/4", values: [14, 15, 16, 17, 18]}]);
        expect(request.policy.budget).toBe(5);
        expect(request.policy.mode).toBe("base");
        expect(request.policy.scope).toBe("paid-entry");
        expect(optimizationDomainSize(request.policy)).toBe(5);
    });

    it("re-seeds the default around the largest exact RTP contributor when evidence is available", () => {
        const exact = {
            status: "ok",
            events: {
                entries: [
                    {kind: "line", key: "K3", label: "K × 3", winType: "line", winId: "K3", symbolId: "K", matchCount: 3, probability: 0.1, rtpContribution: 0.2, outcomeCount: 1},
                    {kind: "line", key: "A4", label: "A × 4", winType: "line", winId: "A4", symbolId: "A", matchCount: 4, probability: 0.05, rtpContribution: 0.5, outcomeCount: 1},
                ],
                truncated: false,
            },
        } as unknown as StudioExactMathView;
        const request = buildDefaultOptimizationRequest(model, exact);
        expect(request.policy.tunables[0]).toEqual({path: "/paytable/A/4", values: [14, 15, 16, 17, 18]});
    });

    it("defaults a free-games game to the whole paid round, where total RTP lives", () => {
        const request = buildDefaultOptimizationRequest(freeGamesModel);
        expect(request.policy.scope).toBe("logical-round");
        expect(request.policy.tunables[0]).toEqual({path: "/paytable/A/4", values: [14, 15, 16, 17, 18]});
    });

    it("recommends whole-round RTP when features exist but a request still targets paid spins", () => {
        expect(recommendsWholeRoundScope("paid-entry", true)).toBe(true);
        expect(recommendsWholeRoundScope("logical-round", true)).toBe(false);
        expect(recommendsWholeRoundScope("paid-entry", false)).toBe(false);
        expect(recommendsWholeRoundScope("native-outcomes", true)).toBe(false);
    });

    it("keeps a usable fallback when no model paytable is available", () => {
        const request = buildDefaultOptimizationRequest(undefined);
        expect(request.policy.tunables[0]).toEqual({path: "/paytable/A/3", values: [1, 2, 3]});
        expect(optimizationDomainSize(request.policy)).toBe(3);
    });
});
