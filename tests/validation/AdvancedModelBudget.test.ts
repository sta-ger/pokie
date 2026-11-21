import type {GameBlueprint} from "../../src/generated/GameBlueprint.js";
import {AdvancedModelSourceValidator} from "../../src/validation/AdvancedModelSourceValidator.js";
import {createStarterGameBlueprint} from "../../cli/build/createStarterGameBlueprint.js";

// A complete, deterministic 5×3 game with exactly 3,125 reel-stop combinations. The old default
// analysis budget stopped at 1,000 outcomes (and then 10,000 transitions once outcomes was raised),
// so a tiny model that is fully enumerable in seconds reported "inconclusive" on every screen.
function deterministicStarter(): GameBlueprint {
    const blueprint = createStarterGameBlueprint();
    Reflect.deleteProperty(blueprint, "symbolWeights");
    return {
        ...blueprint,
        paylines: [
            [0, 0, 0, 0, 0],
            [1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2],
        ],
        reelStrips: [
            ["A", "K", "Q", "J", "J"],
            ["K", "Q", "A", "J", "J"],
            ["Q", "K", "J", "A", "J"],
            ["K", "J", "Q", "A", "J"],
            ["J", "Q", "K", "J", "A"],
        ],
    };
}

describe("advanced analysis default budget", () => {
    it("completes for an ordinary 5×3, three-line game without a caller override", async () => {
        const report = await new AdvancedModelSourceValidator().validate({kind: "blueprint", model: deterministicStarter()});

        expect(report.status).toBe("complete");
        expect(report.verdict).not.toBe("inconclusive");
        expect(report.limitations).toEqual([]);
    });
});
