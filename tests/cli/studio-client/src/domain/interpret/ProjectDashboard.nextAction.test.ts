import {
    describeNextAction,
    type ProjectValidationView,
    type ValidationSummaryView,
} from "../../../../../../cli/studio-client/src/domain/interpret/ProjectDashboard";
import type {StudioSimulationJobView} from "../../../../../../cli/studio-client/src/api/types";

function summary(overrides: Partial<ValidationSummaryView> = {}): ValidationSummaryView {
    return {valid: true, errors: [], warnings: [], suggestions: [], hasIssues: false, blocking: false, ...overrides};
}

function success(overrides: Partial<ValidationSummaryView> = {}): ProjectValidationView {
    return {status: "success", summary: summary(overrides)};
}

function job(status: StudioSimulationJobView["status"]): StudioSimulationJobView {
    return {id: "job-1", status, rounds: 10, workers: 1, startedAt: new Date().toISOString(), roundsCompleted: 10, durationMs: 0};
}

describe("describeNextAction", () => {
    it("recommends validating when no validation has run yet", () => {
        const action = describeNextAction({status: "idle"}, undefined);
        expect(action.kind).toBe("validate");
    });

    it("shows an informational, non-actionable state while validation is in flight", () => {
        const action = describeNextAction({status: "loading"}, undefined);
        expect(action.kind).toBe("validating");
        expect(action.actionLabel).toBeUndefined();
    });

    it("surfaces a failed validation with a retry action, not a stale result", () => {
        const action = describeNextAction({status: "error", message: "Network error"}, undefined);
        expect(action.kind).toBe("validation-failed");
        expect(action.description).toBe("Network error");
        expect(action.actionLabel).toBe("Try again");
    });

    it("recommends fixing issues when the validation summary has errors", () => {
        const action = describeNextAction(
            success({hasIssues: true, blocking: true, errors: [{code: "E1", message: "bad"}], warnings: [{code: "W1", message: "meh"}]}),
            undefined,
        );
        expect(action.kind).toBe("fix-validation");
        expect(action.description).toContain("2 issues");
    });

    it("recommends fixing issues when the report itself is invalid, even with zero errors listed", () => {
        const action = describeNextAction(success({valid: false, blocking: true}), undefined);
        expect(action.kind).toBe("fix-validation");
    });

    it("singularizes the issue count when there is exactly one", () => {
        const action = describeNextAction(success({hasIssues: true, blocking: true, errors: [{code: "E1", message: "bad"}]}), undefined);
        expect(action.description).toContain("1 issue ");
    });

    it("does NOT block on warnings-only -- a valid project with only warnings still proceeds to simulate", () => {
        const action = describeNextAction(
            success({hasIssues: true, blocking: false, warnings: [{code: "W1", message: "meh"}, {code: "W2", message: "also meh"}]}),
            undefined,
        );
        expect(action.kind).toBe("simulate");
        expect(action.description).toContain("2 warning(s)");
    });

    it("recommends running a simulation once validation is clean and no simulation has run yet", () => {
        const action = describeNextAction(success(), undefined);
        expect(action.kind).toBe("simulate");
    });

    it("shows the simulation as in-progress while it's queued or running", () => {
        expect(describeNextAction(success(), job("queued")).kind).toBe("simulation-running");
        expect(describeNextAction(success(), job("running")).kind).toBe("simulation-running");
    });

    it("recommends viewing the report once the simulation completes", () => {
        const action = describeNextAction(success(), job("completed"));
        expect(action.kind).toBe("view-report");
    });

    it("recommends running a new simulation if the last one failed or was cancelled", () => {
        expect(describeNextAction(success(), job("failed")).kind).toBe("simulate");
        expect(describeNextAction(success(), job("cancelled")).kind).toBe("simulate");
    });

    it("prioritizes fixing blocking validation issues over an already-completed simulation", () => {
        const action = describeNextAction(success({hasIssues: true, blocking: true, errors: [{code: "E1", message: "bad"}]}), job("completed"));
        expect(action.kind).toBe("fix-validation");
    });
});
