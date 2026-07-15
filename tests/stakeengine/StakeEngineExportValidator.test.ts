import {StakeEngineExportModeInput, StakeEngineExportValidator} from "pokie";
import {buildStakeEngineTestLibrary} from "./StakeEngineTestFixtures.js";

function baseMode(): StakeEngineExportModeInput {
    return {modeName: "base", cost: 1, library: buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1})};
}

function bonusMode(): StakeEngineExportModeInput {
    return {modeName: "bonus", cost: 100, library: buildStakeEngineTestLibrary({libraryId: "bonus-lib", betMode: "freeGames", stake: 100})};
}

function issueCodes(validator: StakeEngineExportValidator, modes: StakeEngineExportModeInput[]): string[] {
    return validator.validate(modes).map((issue) => issue.code);
}

describe("StakeEngineExportValidator", () => {
    const validator = new StakeEngineExportValidator();

    it("reports no issues for a valid single-mode export", () => {
        expect(validator.validate([baseMode()])).toEqual([]);
    });

    it("reports no issues for a valid multi-mode export sharing the same game/config/pokieVersion", () => {
        expect(validator.validate([baseMode(), bonusMode()])).toEqual([]);
    });

    it("reports stakeengine-export-modes-empty for an empty modes array", () => {
        expect(issueCodes(validator, [])).toEqual(["stakeengine-export-modes-empty"]);
    });

    it("forwards WeightedOutcomeLibraryValidator issues prefixed with the mode name", () => {
        const mode = baseMode();
        const brokenLibrary = {...mode.library, libraryId: ""};
        const issues = validator.validate([{...mode, library: brokenLibrary}]);

        const forwarded = issues.find((issue) => issue.code === "weighted-outcome-library-id-invalid");
        expect(forwarded).toBeDefined();
        expect(forwarded?.message).toMatch(/^mode "base": /);
        expect(forwarded?.details?.modeName).toBe("base");
    });

    it("reports stakeengine-mode-name-invalid for a modeName with disallowed characters", () => {
        const mode = baseMode();
        expect(issueCodes(validator, [{...mode, modeName: "not valid!"}])).toContain("stakeengine-mode-name-invalid");
    });

    it("reports stakeengine-duplicate-mode-name for two modes with the exact same name", () => {
        const mode = baseMode();
        expect(issueCodes(validator, [mode, {...mode, library: bonusMode().library}])).toContain("stakeengine-duplicate-mode-name");
    });

    it("reports stakeengine-mode-name-case-collision (warning) for names differing only in case", () => {
        const mode = baseMode();
        const issues = validator.validate([mode, {...mode, modeName: "BASE", library: bonusMode().library}]);
        const collision = issues.find((issue) => issue.code === "stakeengine-mode-name-case-collision");

        expect(collision).toBeDefined();
        expect(collision?.severity).toBe("warning");
    });

    it("reports stakeengine-mode-cost-invalid for a non-positive cost", () => {
        const mode = baseMode();
        expect(issueCodes(validator, [{...mode, cost: 0}])).toContain("stakeengine-mode-cost-invalid");
        expect(issueCodes(validator, [{...mode, cost: Number.NaN}])).toContain("stakeengine-mode-cost-invalid");
    });

    it("reports stakeengine-cross-mode-provenance-mismatch when modes belong to different games", () => {
        const base = baseMode();
        const bonus = bonusMode();
        const mismatchedBonusLibrary = {
            ...bonus.library,
            outcomes: bonus.library.outcomes.map((outcome) => ({
                ...outcome,
                artifact: {...outcome.artifact, provenance: {...outcome.artifact.provenance, game: {...outcome.artifact.provenance.game, id: "other-game"}}},
            })),
        };

        expect(issueCodes(validator, [base, {...bonus, library: mismatchedBonusLibrary}])).toContain("stakeengine-cross-mode-provenance-mismatch");
    });

    it("reports stakeengine-outcome-id-not-integer for a non-canonical-integer outcome id", () => {
        const mode = baseMode();
        const library = {...mode.library, outcomes: [{...mode.library.outcomes[0], id: "not-an-integer"}, ...mode.library.outcomes.slice(1)]};

        expect(issueCodes(validator, [{...mode, library}])).toContain("stakeengine-outcome-id-not-integer");
    });

    it("reports stakeengine-outcome-weight-not-integer for a fractional weight", () => {
        const mode = baseMode();
        const library = {...mode.library, outcomes: [{...mode.library.outcomes[0], weight: 1.5}, ...mode.library.outcomes.slice(1)]};

        expect(issueCodes(validator, [{...mode, library}])).toContain("stakeengine-outcome-weight-not-integer");
    });

    it("reports stakeengine-outcome-payout-multiplier-not-integer for a fractional payoutMultiplier", () => {
        const mode = baseMode();
        const library = {
            ...mode.library,
            outcomes: mode.library.outcomes.map((outcome) =>
                outcome.id === "1" ? {...outcome, artifact: {...outcome.artifact, payoutMultiplier: 1.5}} : outcome,
            ),
        };

        expect(issueCodes(validator, [{...mode, library}])).toContain("stakeengine-outcome-payout-multiplier-not-integer");
    });
});
