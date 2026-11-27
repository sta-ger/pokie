import {
    describeBlueprintValidationScopes,
    describeProjectValidationScopes,
    hasFeatureTerminationWarning,
} from "../../../cli/studio-client/src/domain/validationScope.js";

const terminatingWarning = {
    checks: [{id: "termination.free-games", status: "violation", message: "not proven to end"}],
} as never;

describe("validation scopes", () => {
    it("detects the free-games termination warning as a math finding", () => {
        expect(hasFeatureTerminationWarning(terminatingWarning)).toBe(true);
        expect(hasFeatureTerminationWarning({checks: []} as never)).toBe(false);
        expect(hasFeatureTerminationWarning(undefined)).toBe(false);
    });

    it("never collapses structure and math into one 'valid' badge", () => {
        const badges = describeBlueprintValidationScopes(
            {status: "ok", warnings: [], advanced: terminatingWarning},
            "idle",
        );
        expect(badges.find((badge) => badge.scope === "structure")?.label).toBe("Structure: valid");
        expect(badges.find((badge) => badge.scope === "math")?.label).toBe("Math: uncapped free games");
        expect(badges.find((badge) => badge.scope === "math")?.detail).toMatch(/may never end/i);
    });

    it("does not call a structure-valid project mathematically certified", () => {
        const badges = describeProjectValidationScopes({
            status: "success",
            summary: {
                valid: true,
                hasIssues: false,
                errors: [],
                warnings: [],
                information: [],
                advanced: {structuralValid: true, checks: []},
            },
        } as never);
        expect(badges.find((badge) => badge.scope === "structure")?.label).toBe("Structure: valid");
        expect(badges.find((badge) => badge.scope === "math")?.label).toBe("Math: not checked");
        expect(badges.find((badge) => badge.scope === "math")?.label).not.toMatch(/certified/i);
    });

    it("shows an exact outcome table as exact without claiming certification", () => {
        const badges = describeProjectValidationScopes({
            status: "success",
            summary: {
                valid: true,
                hasIssues: false,
                errors: [],
                warnings: [],
                information: [],
                advanced: {structuralValid: true, checks: []},
            },
        } as never, "ok");
        expect(badges.find((badge) => badge.scope === "math")?.label).toBe("Math: exact (not certified)");
        expect(badges.find((badge) => badge.scope === "math")?.detail).toMatch(/not certification/i);
    });

    it("reports a stale exact table as stale, not as a missing check", () => {
        const badges = describeProjectValidationScopes({
            status: "success",
            summary: {
                valid: true,
                hasIssues: false,
                errors: [],
                warnings: [],
                information: [],
                advanced: {structuralValid: true, checks: []},
            },
        } as never, "stale");
        expect(badges.find((badge) => badge.scope === "math")?.label).toBe("Math: numbers out of date");
        expect(badges.find((badge) => badge.scope === "math")?.detail).toMatch(/Recompute/i);
    });
});
