import type {GameBlueprint} from "../../src/generated/GameBlueprint.js";
import {AdvancedModelSourceValidator} from "../../src/validation/AdvancedModelSourceValidator.js";

function freeGamesBlueprint(maxFreeGames?: number): GameBlueprint {
    return {
        info: {id: "cap-validation", name: "Cap Validation", version: "0.1.0"},
        reels: 3,
        rows: 1,
        symbols: ["S", "A"],
        scatters: ["S"],
        paytable: {A: {3: 1}},
        reelStrips: [["S"], ["S"], ["S"]],
        paylines: [[0, 0, 0]],
        availableBets: [1],
        mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 3}, ...(maxFreeGames === undefined ? {} : {maxFreeGames})}},
    };
}

describe("advanced free-games termination", () => {
    it("still reports an uncapped additive retrigger as a termination violation", async () => {
        const report = await new AdvancedModelSourceValidator().validate({kind: "blueprint", model: freeGamesBlueprint()});
        expect(report.checks).toContainEqual(expect.objectContaining({id: "termination.free-games", status: "violation"}));
    });

    it("proves termination when the authored total free-games cap bounds every path", async () => {
        const report = await new AdvancedModelSourceValidator().validate({kind: "blueprint", model: freeGamesBlueprint(5)});
        expect(report.checks).toContainEqual(expect.objectContaining({id: "termination.free-games", status: "pass"}));
        expect(report.checks.filter((check) => check.id === "termination.free-games" && check.status === "violation")).toEqual([]);
    });
});
