import {MantineProvider} from "@mantine/core";
import {act, render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {OutcomeSourceOverview} from "../../../../../../cli/studio-client/src/components/project/OutcomeSourceOverview";
import {StudioApiProvider} from "../../../../../../cli/studio-client/src/context/StudioApiProvider";
import {describeProjectHeader} from "../../../../../../cli/studio-client/src/domain/interpret/ProjectDashboard";
import type {OutcomeSourceSampleView, ProjectDashboardContext} from "../../../../../../cli/studio-client/src/api/types";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {createFakeFetch} from "../../testUtils/fakeFetch";

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
    expect(screen.queryByRole("button", {name: /^Draw an outcome/})).not.toBeInTheDocument();
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

function renderNativeModes(fetchImpl: FetchLike, onRoundRecorded = jest.fn(), errors = false) {
    const header = describeProjectHeader({
        status: "outcome-source", projectRoot: "/library", project: {type: "outcomeLibrary", rootPath: "/library", capabilities: ["outcomeSource.read", "outcomeSource.sample"], provenance: "test"},
        report: {rootPath: "/library", descriptor: {kind: "native", streaming: true, limitations: []},
            issues: errors ? [{code: "bad-source", severity: "error", message: "Invalid source"}] : [],
            modes: ["base", "ante"].map(modeName => ({modeName, analysis: {totalWeight: 3, rtp: 0, hitFrequency: 0, zeroWinFrequency: 1, variance: 0, standardDeviation: 0, maxRatio: 0, maxWinProbability: 0}}))},
    });
    if (header.status !== "outcome-source") throw new Error("Expected outcome source");
    render(<MantineProvider><StudioApiProvider fetchImpl={fetchImpl}><OutcomeSourceOverview header={header} onRoundRecorded={onRoundRecorded} /></StudioApiProvider></MantineProvider>);
    return onRoundRecorded;
}

function drawnMode(mode: string): OutcomeSourceSampleView {
    return {
        supported: true, replayId: `${mode}-draw`,
        selection: {libraryId: `${mode}-lib`, libraryHash: "retained-hash", totalWeight: 3,
            outcome: {id: `${mode}-outcome`, weight: 2, artifact: {
                schemaVersion: 1, roundId: `${mode}:1`, provenance: {game: {id: "weighted", name: "Weighted", version: "1.0.0"}, pokieVersion: "1.3.0"},
                betMode: mode, stake: mode === "ante" ? 0.05 * 1.5 : 0.05, totalWin: 0, payoutMultiplier: 0,
                screen: [["A"]], steps: [{index: 0, screen: [["A"]], totalWin: 0, wins: []}], wins: [],
                featureEvents: [{type: "chargedBetMode", data: {id: mode}}],
            }}},
    };
}

it.each(["base", "ante"])("uniquely selects the %s row and dispatches its explicit weighted draw seed", async mode => {
    const {fetchImpl, calls} = createFakeFetch(({url}) => ({ok: true, status: 200, body: url === "/api/project/outcome-source/sample" ? drawnMode(mode) : {}}));
    const recorded = renderNativeModes(fetchImpl);
    expect(screen.getAllByRole("button", {name: /^Draw an outcome/}).map(button => button.textContent)).toEqual([
        "Draw an outcome (base)", "Draw an outcome (ante)",
    ]);
    expect(screen.queryByRole("button", {name: "Draw an outcome"})).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Seed (optional)"), " v2c12-weighted-draw ");
    await user.click(screen.getByRole("button", {name: `Draw an outcome (${mode})`}));
    await screen.findByText(`Drew outcome "${mode}-outcome"`);
    expect(calls.filter(call => call.url === "/api/project/outcome-source/sample")).toEqual([{
        url: "/api/project/outcome-source/sample",
        init: {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({modeName: mode, seed: "v2c12-weighted-draw"})},
    }]);
    expect(recorded).toHaveBeenCalledTimes(1);
    expect(within(screen.getByText("Bet mode").closest("tr")!).getByRole("cell")).toHaveTextContent(mode);
    expect(within(screen.getByText("Stake").closest("tr")!).getByRole("cell").textContent).toBe(String(mode === "ante" ? 0.05 * 1.5 : 0.05));
    expect(screen.getByRole("link", {name: "Download draw replay JSON"})).toHaveAttribute("href", `/api/project/replays/${mode}-draw/download`);
});

it("disables both mode actions during a draw, reports rejection and permits a different mode retry", async () => {
    let resolveDraw: ((response: Awaited<ReturnType<FetchLike>>) => void) | undefined;
    const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(url => url === "/api/project/symbol-artwork" ? Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({})}) : new Promise(resolve => {
        resolveDraw = resolve;
    }));
    const recorded = renderNativeModes(fetchImpl);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", {name: "Draw an outcome (ante)"}));
    for (const button of screen.getAllByRole("button", {name: /^Draw an outcome/})) expect(button).toBeDisabled();
    await user.click(screen.getByRole("button", {name: "Draw an outcome (base)"}));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await act(async () => {
        resolveDraw!({ok: false, status: 400, json: () => Promise.resolve({error: "Source content changed. Retry the draw."})});
        await Promise.resolve();
    });
    expect(await screen.findByText("Source content changed. Retry the draw.")).toBeInTheDocument();
    expect(recorded).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", {name: "Download draw replay JSON"})).not.toBeInTheDocument();
    for (const button of screen.getAllByRole("button", {name: /^Draw an outcome/})) expect(button).toBeEnabled();
    await user.click(screen.getByRole("button", {name: "Draw an outcome (base)"}));
    expect(JSON.parse(fetchImpl.mock.calls[1][1]!.body!)).toEqual({modeName: "base"});
    await act(async () => {
        resolveDraw!({ok: true, status: 200, json: () => Promise.resolve(drawnMode("base"))});
        await Promise.resolve();
    });
    expect(await screen.findByText('Drew outcome "base-outcome"')).toBeInTheDocument();
    expect(screen.queryByText("Source content changed. Retry the draw.")).not.toBeInTheDocument();
    expect(recorded).toHaveBeenCalledTimes(1);
});

it("does not offer either native mode action when source analysis has errors", () => {
    const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: drawnMode("base")}));
    renderNativeModes(fetchImpl, jest.fn(), true);
    expect(screen.queryByRole("button", {name: /^Draw an outcome/})).not.toBeInTheDocument();
    expect(screen.getByText(/1 issue\(s\) found/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
});
