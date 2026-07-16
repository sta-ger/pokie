import {describeDeploymentRunResult, describeDeploymentTargetsList} from "../../../cli/studio-client/interpretDeployment.js";
import type {StudioDeploymentRunView, StudioDeploymentStageSummary, StudioDeploymentTargetSummary} from "../../../cli/studio-client/types.js";

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
