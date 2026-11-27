import {nextAvailableLookingGameId} from "../../../cli/studio-client/src/domain/gameIdSuggestion.js";

describe("guided Game id collision fallback", () => {
    it("offers a concrete next id when the current id has no numeric suffix", () => {
        expect(nextAvailableLookingGameId("starter-slot")).toBe("starter-slot-2");
    });

    it("increments an existing numeric suffix instead of stacking another one", () => {
        expect(nextAvailableLookingGameId("starter-slot-2")).toBe("starter-slot-3");
        expect(nextAvailableLookingGameId("starter-slot-99")).toBe("starter-slot-100");
    });

    it("uses a safe placeholder for an empty id", () => {
        expect(nextAvailableLookingGameId("   ")).toBe("my-game");
    });
});
