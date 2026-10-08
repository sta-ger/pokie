import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {OutcomeSourceOverview} from "../../../../../../cli/studio-client/src/components/project/OutcomeSourceOverview";
import {StudioApiProvider} from "../../../../../../cli/studio-client/src/context/StudioApiProvider";
import {describeProjectHeader} from "../../../../../../cli/studio-client/src/domain/interpret/ProjectDashboard";
import type {ProjectDashboardContext} from "../../../../../../cli/studio-client/src/api/types";

function renderMetrics(rtp: number, hitFrequency: number, errors = false) {
    const context: ProjectDashboardContext = {
        status: "outcome-source", projectRoot: "/stake", project: {type: "stakeAdapter", rootPath: "/stake", capabilities: [], provenance: "test"},
        report: {rootPath: "/stake", descriptor: {kind: "stakeEngine", streaming: false, limitations: []},
            issues: errors ? [{code: "bad-source", severity: "error", message: "Invalid source"}] : [],
            modes: errors ? [] : [{modeName: "base", analysis: {totalWeight: "18446744073709551616", rtp, hitFrequency, zeroWinFrequency: 1, variance: 2 ** -62, standardDeviation: 2 ** -31, maxRatio: 2, maxWinProbability: 2 ** -64}}]},
    };
    const header = describeProjectHeader(context);
    if (header.status !== "outcome-source") throw new Error("Expected outcome source");
    render(<MantineProvider><StudioApiProvider><OutcomeSourceOverview header={header} /></StudioApiProvider></MantineProvider>);
}

it("renders positive rare canonical metrics distinctly from zero without enabling Stake sampling", () => {
    renderMetrics(2 ** -63, 2 ** -64);
    expect(screen.getByText("1.08e-17%")).toBeInTheDocument();
    expect(screen.getByText("5.42e-18%")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Draw an outcome"})).not.toBeInTheDocument();
});

it("preserves ordinary percentage formatting and exact zero", () => {
    renderMetrics(0.075, 0);
    expect(screen.getByText("7.50%")).toBeInTheDocument();
    expect(screen.getByText("0.00%")).toBeInTheDocument();
});

it("retains the diagnostic failure view with no analysis table", () => {
    renderMetrics(0, 0, true);
    expect(screen.getByText(/1 issue\(s\) found/)).toBeInTheDocument();
    expect(screen.queryByTestId("outcome-source-mode-table")).not.toBeInTheDocument();
});
