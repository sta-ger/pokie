import {MantineProvider} from "@mantine/core";
import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {readFileSync} from "fs";
import {join} from "path";
import type {ComponentProps} from "react";
import {SimulationTab} from "../../../../../../cli/studio-client/src/components/project/SimulationTab";
import {SimulationSummaryCard} from "../../../../../../cli/studio-client/src/components/common/SimulationSummaryCard";
import {describeSimulationReport} from "../../../../../../cli/studio-client/src/domain/interpret/Simulation";
import {theme} from "../../../../../../cli/studio-client/src/theme";

// Implementation regressions, not an independent visual-quality assessment.
const report = describeSimulationReport({
    game: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"},
    requestedRounds: 1000, rounds: 1000, seed: "36", totalBet: 50, totalWin: 48,
    rtp: 0.96, hitFrequency: 0.25, maxWin: 2, durationMs: 3100, spinsPerSecond: 320,
    rtpConfidenceInterval95: {low: 0.9, high: 1.02},
    sampling: {unit: "completed-logical-round", acceptedSubrounds: 1000, carriedSubrounds: 0,
        excludedSubrounds: 0, trajectories: "independent-session-per-worker"},
    diagnostics: {sampleUnit: "completed-logical-round", samples: 1000, achievedRtpHalfWidth: 0.06,
        precision: "notRequested", coverageLimitations: ["Rare outcomes may remain unseen."]},
});

function props(): ComponentProps<typeof SimulationTab> {
    return {
        progress: undefined, error: undefined, cancellationRequested: false, operation: "simulation",
        terminalReceipt: undefined, onRun: jest.fn(), onCancel: jest.fn(), onRetry: jest.fn(),
        recentRuns: {status: "empty"}, recentRunsError: undefined, onRefreshRecentRuns: jest.fn(),
        reviewedDetail: {status: "empty"}, currentReportId: undefined, onOpenHistoric: jest.fn(),
        onRunAgain: jest.fn(), runAgainNotice: undefined, compareDetail: {status: "empty"},
        onCompare: jest.fn(), onClearCompare: jest.fn(), downloadUrls: undefined,
    };
}

it("keeps summary metrics before labelled, visible sampling diagnostics on live and reopened results", async () => {
    const p = props();
    const user = userEvent.setup();
    const result = render(<MantineProvider theme={theme}><SimulationTab {...p}
        historicalResult reviewedDetail={{status: "loaded", report}}
        downloadUrls={{json: "/report.json", markdown: "/report.md", html: "/report.html"}} /></MantineProvider>);
    expect(screen.getByText(/Historical simulation result/)).toBeVisible();
    const metrics = screen.getByRole("table", {name: "Simulation summary"});
    const diagnostics = screen.getByRole("group", {name: "Sampling and precision"});
    expect(metrics.compareDocumentPosition(diagnostics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(metrics).getByText("96.00%")).toBeVisible();
    expect(within(diagnostics).getByText(/requested budget 1000/)).toBeVisible();
    expect(within(diagnostics).getByText(/neither establishes exact RTP/)).toBeVisible();
    expect(within(diagnostics).getByText(/Rare outcomes/)).toBeVisible();
    const review = screen.getByRole("button", {name: /Review/});
    expect(review).toHaveAttribute("aria-current", "step");
    expect(review.closest(".studio-simulation-stepper")).not.toBeNull();
    await user.click(screen.getByRole("button", {name: /Export.*Download report/}));
    expect(screen.getByRole("link", {name: /JSON/})).toHaveAttribute("href", "/report.json");
    await user.click(review);
    await user.click(screen.getByRole("button", {name: "Repeat simulation"}));
    expect(p.onRetry).toHaveBeenCalledTimes(1);
    // Same production summary is used for a newly completed result.
    result.rerender(<MantineProvider theme={theme}><SimulationSummaryCard outcome={{kind: "completed", report}} /></MantineProvider>);
    expect(screen.getByRole("table", {name: "Simulation summary"})).toBeVisible();
    expect(screen.getByRole("group", {name: "Sampling and precision"})).toBeVisible();
});

it("retains invalid-round feedback and disabled downstream steps before an explicit corrected run", async () => {
    const p = props();
    const user = userEvent.setup();
    render(<MantineProvider theme={theme}><SimulationTab {...p} /></MantineProvider>);
    expect(screen.getByRole("button", {name: /Review/})).toBeDisabled();
    const exportStep = screen.getByRole("button", {name: /Export.*Download report/});
    expect(exportStep).toBeDisabled();
    expect(exportStep).toHaveAttribute("aria-describedby", "simulation-export-unavailable");
    const rounds = screen.getByRole("textbox", {name: /Rounds/});
    await user.clear(rounds);
    await user.type(rounds, "0");
    expect(screen.getByRole("button", {name: "Run Simulation"})).toBeDisabled();
    expect(p.onRun).not.toHaveBeenCalled();
    await user.clear(rounds);
    await user.type(rounds, "1000");
    await user.click(screen.getByRole("button", {name: "Run Simulation"}));
    expect(p.onRun).toHaveBeenCalledWith(1000, undefined, 1, undefined, undefined);
});

it("retains per-mode caveats and keeps failed/cancelled outcomes separate from completed metrics", () => {
    const result = render(<MantineProvider theme={theme}><SimulationSummaryCard outcome={{kind: "completed", report: {
        game: report.game, requestedRounds: 1000, seed: "36", modes: {
            base: {...report, warnings: ["Low sample budget"], recommendations: ["Run more rounds"]},
            buy: {...report, rtp: 0.75},
        },
    }}} /></MantineProvider>);
    expect(screen.getAllByRole("table", {name: "Simulation summary"})).toHaveLength(2);
    expect(screen.getAllByRole("group", {name: "Sampling and precision"})).toHaveLength(2);
    expect(screen.getByText("96.00%")).toBeVisible();
    expect(screen.getByText("75.00%")).toBeVisible();
    expect(screen.getByText("Low sample budget")).toBeVisible();
    expect(screen.getByText("Run more rounds")).toBeVisible();
    result.rerender(<MantineProvider theme={theme}><SimulationSummaryCard outcome={{kind: "failed", durationMs: 100, error: "Worker failed"}} /></MantineProvider>);
    expect(screen.getByText(/Worker failed/)).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    result.rerender(<MantineProvider theme={theme}><SimulationSummaryCard outcome={{kind: "cancelled", durationMs: 100, roundsCompleted: 12, rounds: 1000}} /></MantineProvider>);
    expect(screen.getByText(/12\/1000 rounds completed/)).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

it("carries the public site's type and accessible brand palette into Studio", () => {
    const publicCss = readFileSync(join(__dirname, "../../../../../../site/site.css"), "utf8");
    expect(publicCss).toContain(`font-family: ${theme.fontFamily}`);
    expect(publicCss).toContain(`color: ${theme.black}`);
    expect(publicCss).toContain(`${theme.headings?.fontFamily}`);
    expect(publicCss).toContain(`color: ${theme.colors?.copper[8]}`);
    expect(publicCss).toContain(`background: ${theme.colors?.gray[1]}`);
    function luminance(hex: string): number {
        const rgb = hex.slice(1).match(/../g)!.map(channel => {
            const value = parseInt(channel, 16) / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    }
    for (const [foreground, background] of [["#8b3214", "#ffffff"], ["#e5baa2", "#172d3b"], ["#52636a", "#f7f5ee"]]) {
        const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        expect((values[0] + 0.05) / (values[1] + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
});
