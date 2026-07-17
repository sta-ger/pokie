import {
    collectStageIssues,
    describeDeploymentOutcome,
    describeDeploymentRunResult,
    describeDeploymentTargetsList,
    describeTargetCapability,
    describeTargetRequirements,
    splitIssuesBySeverity,
} from "../../../../../../cli/studio-client/src/domain/interpret/Deployment";
import type {
    StudioDeploymentRunView,
    StudioDeploymentStageSummary,
    StudioDeploymentTargetSummary,
    ValidationIssue,
} from "../../../../../../cli/studio-client/src/api/types";

function target(overrides: Partial<StudioDeploymentTargetSummary> = {}): StudioDeploymentTargetSummary {
    return {id: "local-json-example", version: "1.0.0", requirements: {}, capabilities: [], ...overrides};
}

function stage(key: StudioDeploymentStageSummary["key"], status: StudioDeploymentStageSummary["status"]): StudioDeploymentStageSummary {
    return {key, label: key, status, issues: []};
}

function baseView(overrides: Partial<StudioDeploymentRunView> = {}): StudioDeploymentRunView {
    return {
        targetId: "local-json-example",
        publish: false,
        stages: [],
        descriptorIssues: [],
        compatibilityIssues: [],
        projectionIssues: [],
        artifactIssues: [],
        ...overrides,
    };
}

describe("describeDeploymentTargetsList", () => {
    it("reports empty for no targets", () => {
        expect(describeDeploymentTargetsList([])).toEqual({status: "empty"});
    });

    it("reports loaded with the given targets", () => {
        const targets = [target()];
        expect(describeDeploymentTargetsList(targets)).toEqual({status: "loaded", targets});
    });
});

describe("describeDeploymentRunResult", () => {
    it("passes the server's own stages through unchanged — never re-deriving them", () => {
        const stages = [stage("descriptor", "ok"), stage("compatibility", "error")];
        const view = baseView({stages});

        const result = describeDeploymentRunResult(view);

        expect(result.stages).toBe(stages); // same reference — no transform applied
    });

    it("is ok only when every stage is not an error", () => {
        const view = baseView({
            stages: [stage("descriptor", "ok"), stage("compatibility", "ok"), stage("projection", "skipped")],
        });

        expect(describeDeploymentRunResult(view).ok).toBe(true);
    });

    it("is not ok when any stage reports an error, however far the pipeline otherwise got", () => {
        const view = baseView({
            stages: [stage("descriptor", "ok"), stage("compatibility", "ok"), stage("artifactValidation", "error")],
        });

        expect(describeDeploymentRunResult(view).ok).toBe(false);
    });

    it("extracts the generated artifacts from generation, defaulting to empty when there is none", () => {
        const withArtifacts = describeDeploymentRunResult(baseView({generation: {artifacts: [{relativePath: "a.json", content: "{}"}], issues: []}}));
        expect(withArtifacts.artifacts).toEqual([{relativePath: "a.json", content: "{}"}]);

        const withoutGeneration = describeDeploymentRunResult(baseView());
        expect(withoutGeneration.artifacts).toEqual([]);
    });

    it("carries publish and delivered through as-is", () => {
        const result = describeDeploymentRunResult(baseView({publish: true, delivery: {delivered: true}}));

        expect(result.publish).toBe(true);
        expect(result.delivered).toBe(true);
    });

    it("delivered is undefined when there is no delivery", () => {
        expect(describeDeploymentRunResult(baseView()).delivered).toBeUndefined();
    });
});

describe("describeDeploymentOutcome", () => {
    it("is incompatible when the descriptor stage errors", () => {
        const result = describeDeploymentRunResult(baseView({stages: [stage("descriptor", "error")]}));
        expect(describeDeploymentOutcome(result)).toBe("incompatible");
    });

    it("is incompatible when the compatibility stage errors", () => {
        const result = describeDeploymentRunResult(baseView({stages: [stage("descriptor", "ok"), stage("compatibility", "error")]}));
        expect(describeDeploymentOutcome(result)).toBe("incompatible");
    });

    it("is validation-failure when projection/generation/artifactValidation errors, even though compatibility passed", () => {
        for (const key of ["projection", "generation", "artifactValidation"] as const) {
            const result = describeDeploymentRunResult(
                baseView({stages: [stage("descriptor", "ok"), stage("compatibility", "ok"), stage(key, "error")]}),
            );
            expect(describeDeploymentOutcome(result)).toBe("validation-failure");
        }
    });

    it("is transport-failure when diagnostic or delivery errors despite otherwise-valid content", () => {
        for (const key of ["diagnostic", "delivery"] as const) {
            const result = describeDeploymentRunResult(
                baseView({
                    publish: true,
                    stages: [stage("descriptor", "ok"), stage("compatibility", "ok"), stage("artifactValidation", "ok"), stage(key, "error")],
                }),
            );
            expect(describeDeploymentOutcome(result)).toBe("transport-failure");
        }
    });

    it("is partial when every stage passes and this was a preview (publish: false)", () => {
        const result = describeDeploymentRunResult(baseView({publish: false, stages: [stage("descriptor", "ok"), stage("diagnostic", "ok")]}));
        expect(describeDeploymentOutcome(result)).toBe("partial");
    });

    it("is success when every stage passes and this was a real deploy (publish: true)", () => {
        const result = describeDeploymentRunResult(
            baseView({publish: true, stages: [stage("descriptor", "ok"), stage("diagnostic", "ok"), stage("delivery", "ok")]}),
        );
        expect(describeDeploymentOutcome(result)).toBe("success");
    });

    it("classifies by the first failing stage even when a later stage also failed (skipped doesn't count as an error)", () => {
        const result = describeDeploymentRunResult(
            baseView({stages: [stage("descriptor", "ok"), stage("compatibility", "error"), stage("projection", "skipped")]}),
        );
        expect(describeDeploymentOutcome(result)).toBe("incompatible");
    });
});

describe("collectStageIssues", () => {
    it("flattens issues from only the requested stage keys, preserving server-computed content", () => {
        const compatIssue: ValidationIssue = {code: "X", severity: "error", message: "nope"};
        const projectionIssue: ValidationIssue = {code: "Y", severity: "warning", message: "hmm"};
        const stages: StudioDeploymentStageSummary[] = [
            {key: "descriptor", label: "d", status: "ok", issues: []},
            {key: "compatibility", label: "c", status: "error", issues: [compatIssue]},
            {key: "projection", label: "p", status: "ok", issues: [projectionIssue]},
        ];

        expect(collectStageIssues(stages, ["descriptor", "compatibility"])).toEqual([compatIssue]);
        expect(collectStageIssues(stages, ["projection"])).toEqual([projectionIssue]);
        expect(collectStageIssues(stages, ["diagnostic"])).toEqual([]);
    });
});

describe("splitIssuesBySeverity", () => {
    it("puts only error-severity issues in errors, folding warning and info into warnings", () => {
        const issues: ValidationIssue[] = [
            {code: "a", severity: "error", message: "e"},
            {code: "b", severity: "warning", message: "w"},
            {code: "c", severity: "info", message: "i"},
        ];

        const {errors, warnings} = splitIssuesBySeverity(issues);

        expect(errors).toEqual([issues[0]]);
        expect(warnings).toEqual([issues[1], issues[2]]);
    });
});

describe("describeTargetCapability", () => {
    it("returns a friendly description for a known capability id", () => {
        expect(describeTargetCapability("multiMode")).toBe("More than one bet mode in a single deployment");
    });

    it("falls back to the raw id for an unrecognized (third-party) capability", () => {
        expect(describeTargetCapability("myVendor.replayUrls")).toBe("myVendor.replayUrls");
    });
});

describe("describeTargetRequirements", () => {
    it("describes every declared requirement in plain language", () => {
        const lines = describeTargetRequirements({minPokieVersion: "1.2.0", symbolAlphabet: "numeric", requiresHomogeneousProvenance: true});
        expect(lines).toEqual([
            "Every deployed mode's outcome library must have been built with pokie v1.2.0 or newer.",
            "Every symbol must be a numeric id -- string symbols are rejected.",
            "Every mode in one deployment must come from the same game build (id, version, config).",
        ]);
    });

    it("reports 'no special requirements' when nothing was declared", () => {
        expect(describeTargetRequirements({})).toEqual(["No special requirements -- accepts any compatible outcome library."]);
    });

    it("does not mention symbolAlphabet when it is 'any' (the permissive default)", () => {
        expect(describeTargetRequirements({symbolAlphabet: "any"})).toEqual(["No special requirements -- accepts any compatible outcome library."]);
    });
});
