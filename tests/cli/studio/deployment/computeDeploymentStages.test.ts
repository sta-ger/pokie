import {ExternalDeploymentResult, ValidationIssue} from "pokie";
import {computeDeploymentStages} from "../../../../cli/studio/deployment/computeDeploymentStages.js";

function issue(code: string, severity: ValidationIssue["severity"] = "error"): ValidationIssue {
    return {code, severity, message: `${code} message`};
}

function baseResult(overrides: Partial<ExternalDeploymentResult> = {}): ExternalDeploymentResult {
    return {descriptorIssues: [], compatibilityIssues: [], projectionIssues: [], artifactIssues: [], ...overrides};
}

function statusOf(result: ExternalDeploymentResult, publish: boolean, key: string): string | undefined {
    return computeDeploymentStages(result, publish).find((stage) => stage.key === key)?.status;
}

function issuesOf(result: ExternalDeploymentResult, publish: boolean, key: string): readonly ValidationIssue[] | undefined {
    return computeDeploymentStages(result, publish).find((stage) => stage.key === key)?.issues;
}

describe("computeDeploymentStages", () => {
    it("marks every stage ok for a fully successful preview, with delivery skipped (never attempted)", () => {
        const result = baseResult({
            generation: {artifacts: [{relativePath: "a.json", content: "{}"}], issues: []},
            diagnostic: {ok: true, checks: [{name: "outputDirectoryWritable", ok: true}]},
        });

        const stages = computeDeploymentStages(result, false);

        expect(stages.map((stage) => [stage.key, stage.status])).toEqual([
            ["descriptor", "ok"],
            ["compatibility", "ok"],
            ["projection", "ok"],
            ["generation", "ok"],
            ["artifactValidation", "ok"],
            ["diagnostic", "ok"],
            ["delivery", "skipped"],
        ]);
    });

    it("marks delivery ok for a fully successful deploy", () => {
        const result = baseResult({
            generation: {artifacts: [], issues: []},
            diagnostic: {ok: true, checks: []},
            delivery: {delivered: true},
        });

        expect(statusOf(result, true, "delivery")).toBe("ok");
    });

    describe("the bug this pass fixes: a structural/malformed generation result", () => {
        // This is exactly ExternalDeploymentService's own shape when StandardExternalArtifactValidator
        // rejects the generator's raw return value: `generation` stays undefined, but the generator
        // itself was invoked without incident — the real explanation lives in `artifactIssues`, put
        // there by shape validation, not by the generator's own (nonexistent) `.issues`.
        const malformedResult = baseResult({
            artifactIssues: [issue("external-artifact-generation-result-invalid"), issue("external-artifact-content-type-invalid")],
        });

        it("does NOT mark generation as error or skipped — it ran without the generator itself reporting a failure", () => {
            expect(statusOf(malformedResult, false, "generation")).toBe("ok");
            expect(issuesOf(malformedResult, false, "generation")).toEqual([]);
        });

        it("marks artifactValidation as ERROR (never skipped) with the full diagnostics", () => {
            expect(statusOf(malformedResult, false, "artifactValidation")).toBe("error");
            expect(issuesOf(malformedResult, false, "artifactValidation")).toEqual(malformedResult.artifactIssues);
            expect(issuesOf(malformedResult, false, "artifactValidation")).toHaveLength(2);
        });

        it("skips diagnostic and delivery, since artifact validation itself failed", () => {
            expect(statusOf(malformedResult, true, "diagnostic")).toBe("skipped");
            expect(statusOf(malformedResult, true, "delivery")).toBe("skipped");
        });
    });

    describe("a genuine generator-reported failure (e.g. the generator threw)", () => {
        const generatorThrewResult = baseResult({
            generation: {artifacts: [], issues: [issue("external-deployment-generator-threw")]},
        });

        it("marks generation as error, with the generator's own issue", () => {
            expect(statusOf(generatorThrewResult, false, "generation")).toBe("error");
            expect(issuesOf(generatorThrewResult, false, "generation")).toEqual(generatorThrewResult.generation?.issues);
        });

        it("marks artifactValidation as skipped, matching that artifactIssues is genuinely empty here", () => {
            expect(statusOf(generatorThrewResult, false, "artifactValidation")).toBe("skipped");
        });
    });

    describe("a target/extra artifact validator failure on an otherwise well-formed generation result", () => {
        const validatorFailureResult = baseResult({
            generation: {artifacts: [{relativePath: "a.json", content: "{}"}], issues: []},
            artifactIssues: [issue("vendor-specific-check-failed")],
        });

        it("marks generation as ok", () => {
            expect(statusOf(validatorFailureResult, false, "generation")).toBe("ok");
        });

        it("marks artifactValidation as error with the validator's own issue", () => {
            expect(statusOf(validatorFailureResult, false, "artifactValidation")).toBe("error");
            expect(issuesOf(validatorFailureResult, false, "artifactValidation")).toEqual([issue("vendor-specific-check-failed")]);
        });
    });

    it("skips every later stage once descriptorIssues has an error", () => {
        const result = baseResult({descriptorIssues: [issue("external-deployment-target-id-invalid")]});

        expect(computeDeploymentStages(result, true).map((stage) => [stage.key, stage.status])).toEqual([
            ["descriptor", "error"],
            ["compatibility", "skipped"],
            ["projection", "skipped"],
            ["generation", "skipped"],
            ["artifactValidation", "skipped"],
            ["diagnostic", "skipped"],
            ["delivery", "skipped"],
        ]);
    });

    it("skips generation onward once compatibilityIssues has an error", () => {
        const result = baseResult({compatibilityIssues: [issue("external-deployment-symbol-alphabet-invalid")]});

        expect(statusOf(result, false, "compatibility")).toBe("error");
        expect(statusOf(result, false, "projection")).toBe("skipped");
        expect(statusOf(result, false, "generation")).toBe("skipped");
    });

    it("skips generation onward once projectionIssues has an error", () => {
        const result = baseResult({projectionIssues: [issue("external-deployment-projection-failed")]});

        expect(statusOf(result, false, "projection")).toBe("error");
        expect(statusOf(result, false, "generation")).toBe("skipped");
        expect(statusOf(result, false, "artifactValidation")).toBe("skipped");
    });

    it("marks diagnostic as error and delivery as skipped when the diagnostic reports not-ok", () => {
        const result = baseResult({
            generation: {artifacts: [], issues: []},
            diagnostic: {ok: false, checks: [{name: "outputDirectoryWritable", ok: false, message: "not writable"}]},
        });

        expect(statusOf(result, true, "diagnostic")).toBe("error");
        expect(issuesOf(result, true, "diagnostic")).toEqual([{code: "outputDirectoryWritable", severity: "error", message: "not writable"}]);
        expect(statusOf(result, true, "delivery")).toBe("skipped");
    });

    it("marks diagnostic as skipped (not error) when the target declares no diagnostic at all, and does not block delivery", () => {
        const result = baseResult({generation: {artifacts: [], issues: []}, delivery: {delivered: true}});

        expect(statusOf(result, true, "diagnostic")).toBe("skipped");
        expect(statusOf(result, true, "delivery")).toBe("ok");
    });

    it("marks delivery as error when publish is true but delivery is missing", () => {
        const result = baseResult({generation: {artifacts: [], issues: []}, diagnostic: {ok: true, checks: []}});

        expect(statusOf(result, true, "delivery")).toBe("error");
    });

    it("marks delivery as error when delivered is false", () => {
        const result = baseResult({generation: {artifacts: [], issues: []}, delivery: {delivered: false}});

        expect(statusOf(result, true, "delivery")).toBe("error");
    });

    it("always marks delivery as skipped when publish is false, regardless of how far the pipeline got", () => {
        const result = baseResult({generation: {artifacts: [], issues: []}, diagnostic: {ok: true, checks: []}, delivery: {delivered: true}});

        expect(statusOf(result, false, "delivery")).toBe("skipped");
    });

    it("propagates delivery's own warning-level issues even when delivery itself succeeded", () => {
        const result = baseResult({
            generation: {artifacts: [], issues: []},
            delivery: {delivered: true, issues: [issue("external-deployment-stale-output-cleanup-failed", "warning")]},
        });

        expect(statusOf(result, true, "delivery")).toBe("ok");
        expect(issuesOf(result, true, "delivery")).toEqual([issue("external-deployment-stale-output-cleanup-failed", "warning")]);
    });
});
