import {BetModeDefinition, BetModesConfig} from "pokie";

describe("BetModesConfig", () => {
    it("defaults to a single 'base' mode with stakeMultiplier 1", () => {
        const config = new BetModesConfig();

        expect(config.getDefaultBetModeId()).toBe("base");
        expect(config.getBetModeIds()).toEqual(["base"]);
        expect(config.getBetMode("base")?.getStakeMultiplier()).toBe(1);
        expect(config.getBetMode("base")?.forcesFeatureEntry()).toBe(false);
    });

    it("looks up configured modes by id and reports undefined for an unknown id", () => {
        const ante = new BetModeDefinition("ante", {stakeMultiplier: 1.25});
        const config = new BetModesConfig([new BetModeDefinition("base"), ante], "base");

        expect(config.getBetMode("ante")).toBe(ante);
        expect(config.getBetMode("nope")).toBeUndefined();
        expect(config.getBetModeIds()).toEqual(["base", "ante"]);
    });

    it("rejects an empty modes list", () => {
        expect(() => new BetModesConfig([])).toThrow(/at least one bet mode/);
    });

    it("rejects duplicate mode ids", () => {
        expect(
            () => new BetModesConfig([new BetModeDefinition("base"), new BetModeDefinition("base")], "base"),
        ).toThrow(/Duplicate bet mode id "base"/);
    });

    it("rejects a defaultModeId that isn't among the configured modes", () => {
        expect(() => new BetModesConfig([new BetModeDefinition("base")], "ante")).toThrow(
            /Default bet mode "ante" is not among the configured modes/,
        );
    });
});
