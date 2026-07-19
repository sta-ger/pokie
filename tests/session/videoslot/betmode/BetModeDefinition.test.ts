import {BetModeDefinition} from "pokie";

describe("BetModeDefinition", () => {
    it("defaults to stakeMultiplier 1 and forcesFeatureEntry false", () => {
        const mode = new BetModeDefinition("base");

        expect(mode.getId()).toBe("base");
        expect(mode.getStakeMultiplier()).toBe(1);
        expect(mode.forcesFeatureEntry()).toBe(false);
        expect(mode.getMetadata()).toBeUndefined();
        expect(mode.getTargetRtp()).toBeUndefined();
    });

    it("carries stakeMultiplier/forcesFeatureEntry/metadata/targetRtp through", () => {
        const mode = new BetModeDefinition("buy-bonus", {
            stakeMultiplier: 100,
            forcesFeatureEntry: true,
            metadata: {tag: "high-roller"},
            targetRtp: 0.965,
        });

        expect(mode.getStakeMultiplier()).toBe(100);
        expect(mode.forcesFeatureEntry()).toBe(true);
        expect(mode.getMetadata()).toEqual({tag: "high-roller"});
        expect(mode.getTargetRtp()).toBe(0.965);
    });

    it("rejects a non-positive stakeMultiplier", () => {
        expect(() => new BetModeDefinition("ante", {stakeMultiplier: 0})).toThrow(/stakeMultiplier/);
        expect(() => new BetModeDefinition("ante", {stakeMultiplier: -1})).toThrow(/stakeMultiplier/);
        expect(() => new BetModeDefinition("ante", {stakeMultiplier: Infinity})).toThrow(/stakeMultiplier/);
    });

    it("rejects a non-finite targetRtp", () => {
        expect(() => new BetModeDefinition("base", {targetRtp: Infinity})).toThrow(/targetRtp/);
    });
});
