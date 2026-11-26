import {generateExactWeightedOutcomeLibrary} from "../../../src/weightedoutcome/generate/generateExactWeightedOutcomeLibrary.js";
import {buildFixtureGame} from "./GenerateTestFixtures.js";

describe("exact generation session reuse", () => {
    it("produces byte-identical outcomes for a featureless design when one session is reused", async () => {
        const regular = await generateExactWeightedOutcomeLibrary({
            libraryId: "fixture",
            game: buildFixtureGame(),
            pokieVersion: "1.0.0",
        });
        const reused = await generateExactWeightedOutcomeLibrary({
            libraryId: "fixture",
            game: buildFixtureGame(),
            pokieVersion: "1.0.0",
            reuseFeaturelessExactSession: true,
        });

        expect(reused.library.outcomes).toEqual(regular.library.outcomes);
        expect(reused.library).toEqual(regular.library);
        expect(reused.diagnostics.strategy).toBe("exact");
    });
});
