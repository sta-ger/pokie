import {
    describeExistingArtifactFreshness,
    findExistingArtifactBuildJob,
} from "../../../cli/studio-client/src/domain/existingArtifactBuild.js";
import type {StudioFormatConversionPlan, StudioJobView} from "../../../cli/studio-client/src/api/types.js";

function job(overrides: Partial<StudioJobView>): StudioJobView {
    return {
        id: "job",
        projectId: "/project",
        operation: "artifact-build",
        request: {},
        conflictKey: "artifact:/project/par.xlsx",
        status: "completed",
        createdAt: 1,
        ...overrides,
    };
}

describe("findExistingArtifactBuildJob", () => {
    it("finds the newest completed build for the same target and output path", () => {
        const jobs = [
            job({id: "older", completedAt: 10, result: {summary: "", detail: {target: "parWorkbook"}, outputs: [{path: "/project/par.xlsx", label: "Built artifact"}]}}),
            job({id: "newer", completedAt: 20, result: {summary: "", detail: {target: "parWorkbook"}, outputs: [{path: "/project/par.xlsx", label: "Built artifact"}]}}),
            job({id: "other-target", completedAt: 30, result: {summary: "", detail: {target: "wasm"}, outputs: [{path: "/project/par.xlsx", label: "Built artifact"}]}}),
        ];
        expect(findExistingArtifactBuildJob(jobs, "parWorkbook", "/project/par.xlsx")?.id).toBe("newer");
    });

    it("does not offer a download for a failed or unrelated job", () => {
        const jobs = [
            job({id: "failed", status: "error", result: {summary: "", detail: {target: "parWorkbook"}, outputs: [{path: "/project/par.xlsx", label: "Built artifact"}]}}),
            job({id: "elsewhere", result: {summary: "", detail: {target: "parWorkbook"}, outputs: [{path: "/project/other.xlsx", label: "Built artifact"}]}}),
        ];
        expect(findExistingArtifactBuildJob(jobs, "parWorkbook", "/project/par.xlsx")).toBeUndefined();
    });
});

function builtJob(provenance?: Record<string, string>): StudioJobView {
    return job({
        result: {
            summary: "",
            detail: {
                target: "parWorkbook",
                result: {status: "ok", plan: {source: {configurationProvenance: provenance}}},
            },
            outputs: [{path: "/project/par.xlsx", label: "Built artifact"}],
        },
    });
}

function previewPlan(provenance?: Record<string, string>): StudioFormatConversionPlan {
    return {source: {configurationProvenance: provenance}} as unknown as StudioFormatConversionPlan;
}

describe("describeExistingArtifactFreshness", () => {
    it("marks an output stale when its retained source binding differs from the current preview", () => {
        const result = describeExistingArtifactFreshness(
            builtJob({inputBindingHash: "sha256:before", configurationHash: "sha256:before"}),
            previewPlan({inputBindingHash: "sha256:after", configurationHash: "sha256:after"}),
        );
        expect(result.status).toBe("stale");
        expect(result.reason).toContain("earlier saved design");
    });

    it("accepts the same source binding as current", () => {
        const result = describeExistingArtifactFreshness(
            builtJob({inputBindingHash: "sha256:same", configurationHash: "sha256:same"}),
            previewPlan({inputBindingHash: "sha256:same", configurationHash: "sha256:same"}),
        );
        expect(result.status).toBe("current");
    });

    it("never claims current when the build record has no retained plan or fingerprint", () => {
        expect(describeExistingArtifactFreshness(undefined, previewPlan({inputBindingHash: "sha256:current"})).status).toBe("unknown");
        expect(describeExistingArtifactFreshness(builtJob(undefined), previewPlan({inputBindingHash: "sha256:current"})).status).toBe("unknown");
        expect(describeExistingArtifactFreshness(builtJob({inputBindingHash: "sha256:old"}), previewPlan(undefined)).status).toBe("unknown");
    });
});
