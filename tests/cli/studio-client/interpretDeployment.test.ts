import {describeDeploymentRunResult, describeDeploymentTargetsList} from "../../../cli/studio-client/interpretDeployment.js";
import type {StudioDeploymentRunView, StudioDeploymentTargetSummary, ValidationIssue} from "../../../cli/studio-client/types.js";

function target(overrides: Partial<StudioDeploymentTargetSummary> = {}): StudioDeploymentTargetSummary {
    return {id: "local-json-example", version: "1.0.0", requirements: {}, capabilities: [], ...overrides};
}

function issue(code: string, severity: ValidationIssue["severity"] = "error"): ValidationIssue {
    return {code, severity, message: `${code} message`};
}

function baseView(overrides: Partial<StudioDeploymentRunView> = {}): StudioDeploymentRunView {
    return {
        targetId: "local-json-example",
        publish: false,
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
    it("marks every stage ok and delivery skipped for a fully successful preview", () => {
        const view = baseView({
            generation: {artifacts: [{relativePath: "a.json", content: "{}"}], issues: []},
            diagnostic: {ok: true, checks: [{name: "outputDirectoryWritable", ok: true}]},
        });

        const result = describeDeploymentRunResult(view);

        expect(result.ok).toBe(true);
        expect(result.stages.map((stage) => [stage.key, stage.status])).toEqual([
            ["descriptor", "ok"],
            ["compatibility", "ok"],
            ["projection", "ok"],
            ["generation", "ok"],
            ["artifactValidation", "ok"],
            ["diagnostic", "ok"],
            ["delivery", "skipped"],
        ]);
        expect(result.artifacts).toEqual(view.generation?.artifacts);
    });

    it("marks delivery ok when publish is true and delivery succeeded", () => {
        const view = baseView({
            publish: true,
            generation: {artifacts: [], issues: []},
            diagnostic: {ok: true, checks: []},
            delivery: {delivered: true},
        });

        const result = describeDeploymentRunResult(view);

        expect(result.ok).toBe(true);
        expect(result.delivered).toBe(true);
        expect(result.stages.find((stage) => stage.key === "delivery")?.status).toBe("ok");
    });

    it("marks delivery as error when publish is true but delivery is missing", () => {
        const view = baseView({publish: true, generation: {artifacts: [], issues: []}, diagnostic: {ok: true, checks: []}});

        const result = describeDeploymentRunResult(view);

        expect(result.ok).toBe(false);
        expect(result.stages.find((stage) => stage.key === "delivery")?.status).toBe("error");
    });

    it("stops at descriptor and skips every later stage when descriptorIssues has an error", () => {
        const view = baseView({descriptorIssues: [issue("external-deployment-target-id-invalid")]});

        const result = describeDeploymentRunResult(view);

        expect(result.ok).toBe(false);
        expect(result.stages.map((stage) => [stage.key, stage.status])).toEqual([
            ["descriptor", "error"],
            ["compatibility", "skipped"],
            ["projection", "skipped"],
            ["generation", "skipped"],
            ["artifactValidation", "skipped"],
            ["diagnostic", "skipped"],
            ["delivery", "skipped"],
        ]);
        expect(result.artifacts).toEqual([]);
    });

    it("stops at compatibility and skips generation onward when compatibilityIssues has an error", () => {
        const view = baseView({compatibilityIssues: [issue("external-deployment-symbol-alphabet-invalid")]});

        const result = describeDeploymentRunResult(view);

        expect(result.stages.map((stage) => [stage.key, stage.status])).toEqual([
            ["descriptor", "ok"],
            ["compatibility", "error"],
            ["projection", "skipped"],
            ["generation", "skipped"],
            ["artifactValidation", "skipped"],
            ["diagnostic", "skipped"],
            ["delivery", "skipped"],
        ]);
    });

    it("marks generation as error when generation is undefined even without projection issues reported", () => {
        const view = baseView(); // no `generation` field at all — the generator was never reached or failed structurally

        const result = describeDeploymentRunResult(view);

        expect(result.stages.find((stage) => stage.key === "generation")?.status).toBe("error");
        expect(result.stages.find((stage) => stage.key === "artifactValidation")?.status).toBe("skipped");
    });

    it("marks generation as error when generation is present but reports its own error issues", () => {
        const view = baseView({generation: {artifacts: [], issues: [issue("external-deployment-generator-threw")]}});

        const result = describeDeploymentRunResult(view);

        expect(result.stages.find((stage) => stage.key === "generation")?.status).toBe("error");
        expect(result.stages.find((stage) => stage.key === "artifactValidation")?.status).toBe("skipped");
    });

    it("marks artifactValidation as error and diagnostic/delivery as skipped when artifactIssues has an error", () => {
        const view = baseView({
            generation: {artifacts: [{relativePath: "a.json", content: "{}"}], issues: []},
            artifactIssues: [issue("external-artifact-duplicate-path")],
            publish: true,
        });

        const result = describeDeploymentRunResult(view);

        expect(result.stages.find((stage) => stage.key === "artifactValidation")?.status).toBe("error");
        expect(result.stages.find((stage) => stage.key === "diagnostic")?.status).toBe("skipped");
        expect(result.stages.find((stage) => stage.key === "delivery")?.status).toBe("skipped");
    });

    it("marks diagnostic as error and delivery as skipped when the diagnostic reports not-ok", () => {
        const view = baseView({
            publish: true,
            generation: {artifacts: [], issues: []},
            diagnostic: {ok: false, checks: [{name: "outputDirectoryWritable", ok: false, message: "not writable"}]},
        });

        const result = describeDeploymentRunResult(view);

        expect(result.stages.find((stage) => stage.key === "diagnostic")?.status).toBe("error");
        expect(result.stages.find((stage) => stage.key === "diagnostic")?.issues).toEqual([
            {code: "outputDirectoryWritable", severity: "error", message: "not writable"},
        ]);
        expect(result.stages.find((stage) => stage.key === "delivery")?.status).toBe("skipped");
    });

    it("marks diagnostic as skipped (not error) when the target declares no diagnostic at all", () => {
        const view = baseView({publish: true, generation: {artifacts: [], issues: []}, delivery: {delivered: true}});

        const result = describeDeploymentRunResult(view);

        expect(result.stages.find((stage) => stage.key === "diagnostic")?.status).toBe("skipped");
        expect(result.stages.find((stage) => stage.key === "delivery")?.status).toBe("ok");
    });

    it("never marks delivery as skipped-due-to-diagnostic when there simply is no diagnostic", () => {
        const view = baseView({publish: true, generation: {artifacts: [], issues: []}, delivery: {delivered: true}});

        const result = describeDeploymentRunResult(view);

        expect(result.ok).toBe(true);
    });
});
