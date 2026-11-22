import {
    buildDefaultOptimizationRequest,
    describeTunablePath,
    formatTunableValues,
    optimizationDomainSize,
    parsePaytablePath,
    parseTunableValues,
    paytablePath,
    suggestedPaytableValues,
} from "../../../cli/studio-client/src/domain/optimizationRequest.js";
import type {GameModelProjection} from "../../../cli/studio-client/src/api/types.js";

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

describe("optimization request helpers", () => {
    it("escapes and round-trips paytable paths", () => {
        const path = paytablePath({symbolId: "A/B~C", matchCount: 3});
        expect(path).toBe("/paytable/A~1B~0C/3");
        expect(parsePaytablePath(path)).toEqual({symbolId: "A/B~C", matchCount: 3});
        expect(describeTunablePath("/paytable/A/3")).toBe("A × 3 payout");
        expect(describeTunablePath("/modes/base/outcomes/x/weight")).toBe("/modes/base/outcomes/x/weight");
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

    it("builds a default request around the first real paytable row", () => {
        const request = buildDefaultOptimizationRequest(model);
        expect(request.targets[0]).toMatchObject({metric: "rtp", unit: "ratio", value: 0.95});
        expect(request.policy.tunables).toEqual([{path: "/paytable/A/3", values: [6, 7, 8, 9, 10]}]);
        expect(request.policy.budget).toBe(5);
        expect(request.policy.mode).toBe("base");
        expect(optimizationDomainSize(request.policy)).toBe(5);
    });

    it("keeps a usable fallback when no model paytable is available", () => {
        const request = buildDefaultOptimizationRequest(undefined);
        expect(request.policy.tunables[0]).toEqual({path: "/paytable/A/3", values: [1, 2, 3]});
        expect(optimizationDomainSize(request.policy)).toBe(3);
    });
});
