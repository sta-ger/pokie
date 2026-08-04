import {buildGameModelProjection} from "../../src/project/buildGameModelProjection.js";
import type {GameBlueprint} from "../../src/generated/GameBlueprint.js";

const BASE_BLUEPRINT: GameBlueprint = {
    manifest: {id: "a", name: "A", version: "1.0.0"},
    reels: 3,
    rows: 3,
    symbols: ["A", "B", "S"],
    wilds: ["A"],
    scatters: ["S"],
    paytable: {A: {3: 5}, B: {3: 2}},
    availableBets: [1, 2],
};

describe("buildGameModelProjection", () => {
    it("derives every section as \"available\" from a full GameBlueprint, without a caller re-deriving any of it", () => {
        const projection = buildGameModelProjection(BASE_BLUEPRINT);

        expect(projection.basics).toEqual({status: "available", data: {id: "a", name: "A", version: "1.0.0"}});
        expect(projection.layout).toEqual({
            status: "available",
            data: {reels: 3, rows: 3, winModel: {type: "lines"}, paylineCount: 0},
        });
        expect(projection.symbols).toEqual({
            status: "available",
            data: [
                {id: "A", isWild: true, isScatter: false},
                {id: "B", isWild: false, isScatter: false},
                {id: "S", isWild: false, isScatter: true},
            ],
        });
        expect(projection.reels.status).toEqual("available");
        expect(projection.reels.status === "available" && projection.reels.data.generationMode).toEqual("default");
        expect(projection.paytable).toEqual({
            status: "available",
            data: [
                {symbolId: "A", matchCount: 3, payout: 5},
                {symbolId: "B", matchCount: 3, payout: 2},
            ],
        });
        expect(projection.betsAndModes).toEqual({status: "available", data: {availableBets: [1, 2], betModes: []}});
        expect(projection.mechanics).toEqual({status: "available", data: {freeGames: undefined}});
    });

    it("reports the reel generation mode from whichever of reelStrips/reelStripGeneration/symbolWeights is actually set", () => {
        // The reels section's own full Game window/Full strips/Analysis/sample content -- for every
        // generation mode -- is buildGameModelReels' own concern, exercised in depth by
        // tests/project/buildGameModelReels.test.ts; this just confirms buildGameModelProjection wires
        // its result straight through as `reels`, never re-deriving the generation mode itself.
        const reelStripsReels = buildGameModelProjection({...BASE_BLUEPRINT, reelStrips: [["A"], ["A"], ["A"]]}).reels;
        expect(reelStripsReels.status).toEqual("available");
        expect(reelStripsReels.status === "available" && reelStripsReels.data.generationMode).toEqual("reelStrips");

        const symbolWeightsReels = buildGameModelProjection({...BASE_BLUEPRINT, symbolWeights: {A: 1}}).reels;
        expect(symbolWeightsReels.status).toEqual("available");
        expect(symbolWeightsReels.status === "available" && symbolWeightsReels.data.generationMode).toEqual("symbolWeights");
    });

    it("omits paylineCount for a non-\"lines\" win model instead of reporting a possibly-misleading 0", () => {
        const projection = buildGameModelProjection({...BASE_BLUEPRINT, winModel: {type: "ways"}, paylines: [[0, 0, 0]]});
        expect(projection.layout).toEqual({status: "available", data: {reels: 3, rows: 3, winModel: {type: "ways"}, paylineCount: undefined}});
    });

    it("carries mechanics.freeGames straight through when configured", () => {
        const projection = buildGameModelProjection({
            ...BASE_BLUEPRINT,
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 10}}},
        });
        expect(projection.mechanics).toEqual({status: "available", data: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 10}}}});
    });

    it("maps every bet mode field through verbatim", () => {
        const projection = buildGameModelProjection({
            ...BASE_BLUEPRINT,
            betModes: [{id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100, targetRtp: 0.96}],
        });
        expect(projection.betsAndModes).toEqual({
            status: "available",
            data: {availableBets: [1, 2], betModes: [{id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100, targetRtp: 0.96}]},
        });
    });

    it("marks every section \"unavailable\" with the given reason, and basics too, when no blueprint and no fallback manifest is given", () => {
        const projection = buildGameModelProjection(undefined, {reason: "no tracked source recorded"});

        expect(projection.basics).toEqual({status: "unavailable", reason: "no tracked source recorded"});
        expect(projection.layout).toEqual({status: "unavailable", reason: "no tracked source recorded"});
        expect(projection.symbols).toEqual({status: "unavailable", reason: "no tracked source recorded"});
        expect(projection.reels).toEqual({status: "unavailable", reason: "no tracked source recorded"});
        expect(projection.paytable).toEqual({status: "unavailable", reason: "no tracked source recorded"});
        expect(projection.betsAndModes).toEqual({status: "unavailable", reason: "no tracked source recorded"});
        expect(projection.mechanics).toEqual({status: "unavailable", reason: "no tracked source recorded"});
    });

    it("still reports basics \"available\" from a fallback manifest even when the full blueprint isn't available", () => {
        const projection = buildGameModelProjection(undefined, {
            manifest: {id: "a", name: "A", version: "1.0.0"},
            reason: "no tracked source recorded",
        });

        expect(projection.basics).toEqual({status: "available", data: {id: "a", name: "A", version: "1.0.0"}});
        expect(projection.layout).toEqual({status: "unavailable", reason: "no tracked source recorded"});
    });
});
