import {describeFeatureEventLabel} from "../../../cli/studio-client/src/domain/featureEventLabels.js";

describe("describeFeatureEventLabel", () => {
    it("uses the math-review name for the standard free-games trigger", () => {
        expect(describeFeatureEventLabel("freeGamesTriggered")).toBe("Free games triggered");
    });

    it("humanizes an unknown camel-case event instead of hiding it", () => {
        expect(describeFeatureEventLabel("bonusWheelOpened")).toBe("Bonus wheel opened");
    });
});
