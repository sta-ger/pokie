import {describeNextAction, type ValidationSummaryView} from "../../../../../../cli/studio-client/src/domain/interpret/ProjectDashboard";
import type {StudioSimulationJobView} from "../../../../../../cli/studio-client/src/api/types";

function validationSummary(overrides: Partial<ValidationSummaryView> = {}): ValidationSummaryView {
    return {valid: true, errors: [], warnings: [], suggestions: [], hasIssues: false, ...overrides};
}

function job(status: StudioSimulationJobView["status"]): StudioSimulationJobView {
    return {id: "job-1", status, rounds: 10, workers: 1, startedAt: new Date().toISOString(), roundsCompleted: 10, durationMs: 0};
}

describe("describeNextAction", () => {
    it("recommends validating when no validation has run yet", () => {
        const action = describeNextAction(undefined, undefined);
        expect(action.kind).toBe("validate");
    });

    it("recommends fixing issues when the validation summary has errors or warnings", () => {
        const action = describeNextAction(
            validationSummary({hasIssues: true, errors: [{code: "E1", message: "bad"}], warnings: [{code: "W1", message: "meh"}]}),
            undefined,
        );
        expect(action.kind).toBe("fix-validation");
        expect(action.description).toContain("2 issues");
    });

    it("singularizes the issue count when there is exactly one", () => {
        const action = describeNextAction(validationSummary({hasIssues: true, errors: [{code: "E1", message: "bad"}]}), undefined);
        expect(action.description).toContain("1 issue ");
    });

    it("recommends running a simulation once validation is clean and no simulation has run yet", () => {
        const action = describeNextAction(validationSummary(), undefined);
        expect(action.kind).toBe("simulate");
    });

    it("shows the simulation as in-progress while it's queued or running", () => {
        expect(describeNextAction(validationSummary(), job("queued")).kind).toBe("simulation-running");
        expect(describeNextAction(validationSummary(), job("running")).kind).toBe("simulation-running");
    });

    it("recommends viewing the report once the simulation completes", () => {
        const action = describeNextAction(validationSummary(), job("completed"));
        expect(action.kind).toBe("view-report");
    });

    it("recommends running a new simulation if the last one failed or was cancelled", () => {
        expect(describeNextAction(validationSummary(), job("failed")).kind).toBe("simulate");
        expect(describeNextAction(validationSummary(), job("cancelled")).kind).toBe("simulate");
    });

    it("prioritizes fixing validation issues over an already-completed simulation", () => {
        const action = describeNextAction(validationSummary({hasIssues: true, warnings: [{code: "W1", message: "meh"}]}), job("completed"));
        expect(action.kind).toBe("fix-validation");
    });
});
