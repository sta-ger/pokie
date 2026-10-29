import {SimulationSummaryCard} from "../../../../../../cli/studio-client/src/components/common/SimulationSummaryCard";
import {featureAnalyticsReport} from "../../../../../v2/fixtures/FeatureAnalyticsFixture";
import {describeSimulationReport, type SimulationReportView} from "../../../../../../cli/studio-client/src/domain/interpret/Simulation";
import type {SimulationReport} from "../../../../../../cli/studio-client/src/api/types";
import {MantineProvider} from "@mantine/core";
import userEvent from "@testing-library/user-event";
import {render, within} from "@testing-library/react";
import {SimulationReportDisplay} from "../../../../../../cli/studio-client/src/components/common/SimulationReportDisplay";

it.each(["summary", "full"] as const)("separates outcomes, precision and notes on %s with repeatable disclosure and report replacement", async surface => {
    const user = userEvent.setup();
    const source = {...featureAnalyticsReport(), warnings: ["No seed was provided", "Requested precision was not attained"],
        recommendations: ["Choose a seed", "Increase the round budget"]};
    const retained = JSON.stringify(source);
    const show = (report: SimulationReport) => <MantineProvider>{surface === "summary"
        ? <SimulationSummaryCard outcome={{kind: "completed", report: describeSimulationReport(report)}} />
        : <SimulationReportDisplay view={describeSimulationReport(report)} />}</MantineProvider>;
    const result = render(show(source));
    const outcomes = result.getByRole("table", {name: surface === "summary" ? "Simulation summary" : "Simulation result metrics"});
    expect(within(outcomes).getAllByRole("row")).toHaveLength(4);
    expect(within(outcomes).getAllByRole("rowheader").map(cell => cell.textContent)).toEqual([
        "RTP", "Hit frequency", surface === "summary" ? "Volatility" : "Volatility (std. deviation)", "Max win",
    ]);
    const precision = result.getByRole("region", {name: "Precision and convergence"});
    const notes = result.getByRole("region", {name: "Report notes"});
    expect(outcomes.compareDocumentPosition(precision) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(precision.parentElement).toBe(notes.parentElement);
    expect(within(precision).getByText(/3 usable samples/)).toBeVisible();
    expect(within(precision).getByText(/Empirical estimates/)).toBeVisible();
    expect(notes).toHaveAttribute("data-has-warnings", "true");
    for (const warning of source.warnings) expect(within(notes).getByText(warning)).toBeVisible();
    for (const line of [...source.recommendations, ...source.diagnostics!.coverageLimitations]) {
        expect(within(notes).getByText(line)).not.toBeVisible();
    }
    const toggle = within(notes).getByRole("button", {name: "Show recommendations and limits"});
    const details = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    for (let reuse = 0; reuse < 2; reuse++) {
        toggle.focus();
        await user.keyboard("{Enter}");
        expect(toggle).toHaveFocus();
        expect(details).toBeVisible();
        for (const line of [...source.recommendations, ...source.diagnostics!.coverageLimitations]) {
            expect(within(notes).getByText(line)).toBeVisible();
        }
        await user.keyboard(" ");
        expect(details).not.toBeVisible();
    }
    await user.click(toggle);
    result.rerender(show({...source, rtp: 0, warnings: [], recommendations: [], diagnostics: undefined,
        rtpConfidenceInterval95: {low: 0, high: 0}, averagePayoutConfidenceInterval95: undefined}));
    expect(within(outcomes).getByText("0.00%")).toBeVisible();
    expect(notes).not.toHaveAttribute("data-has-warnings");
    expect(within(notes).getByText("Coverage limitations: 0 · Recommendations: 0")).toBeVisible();
    expect(within(notes).getByText(/Persisted precision\/support diagnostics unavailable/)).toBeVisible();
    expect(within(precision).getByText(/Precision unavailable/)).toBeVisible();
    expect(within(precision).getByText(surface === "summary" ? "RTP 95% CI: 0.00% – 0.00%" : "0.00% – 0.00%")).toBeVisible();
    expect(result.queryByText("Choose a seed")).not.toBeInTheDocument();
    expect(result.queryByText("No seed was provided")).not.toBeInTheDocument();
    result.rerender(show(source));
    expect(within(notes).getByText("Choose a seed")).toBeVisible();
    expect(within(notes).getByRole("button", {name: "Hide recommendations and limits"})).toHaveAttribute("aria-controls", details.id);
    expect(JSON.stringify(source)).toBe(retained);
});

it("separates reproduction bytes from accounting and keeps per-mode identity and optional absence truthful", async () => {
    const user = userEvent.setup();
    const original = featureAnalyticsReport();
    const command = `pokie sim /games/${"long-path/".repeat(15)}blueprint.json --rounds 10000 --mode base`;
    const base = {...original, reproducibility: {...original.reproducibility!, command, configHash: "sha256:base", pokieVersion: "2.0.0"}};
    const buy = {...original, reproducibility: undefined};
    const source = {game: original.game, requestedRounds: 10000, seed: null, modes: {base, buy}};
    const retained = JSON.stringify(source);
    const result = render(<MantineProvider><SimulationReportDisplay view={describeSimulationReport(source)} /></MantineProvider>);
    const baseMode = within(result.getByRole("group", {name: "Mode: base"}));
    const buyMode = within(result.getByRole("group", {name: "Mode: buy"}));
    await user.click(baseMode.getByRole("button", {name: "Show run identity and accounting"}));
    const accounting = baseMode.getByRole("table", {name: "Run identity and accounting"});
    expect(accounting).toHaveTextContent(original.game.id);
    expect(within(accounting).getByText("Total bet").closest("tr")).toHaveTextContent(original.totalBet.toFixed(2));
    expect(baseMode.getByText(command)).not.toBeVisible();
    const reproduce = baseMode.getByText("Reproduce this run");
    expect(reproduce.tagName).toBe("SUMMARY");
    await user.click(reproduce);
    expect(baseMode.getByText(command)).toBeVisible();
    expect(baseMode.getByText("sha256:base")).toBeVisible();
    expect(baseMode.getByText("2.0.0")).toBeVisible();
    expect(buyMode.queryByText("Reproduce this run")).not.toBeInTheDocument();
    expect(buyMode.queryByRole("table", {name: "Run identity and accounting"})).not.toBeInTheDocument();
    await user.click(reproduce);
    expect(baseMode.getByText(command)).not.toBeVisible();
    await user.click(reproduce);
    expect(baseMode.getByText(command)).toBeVisible();
    expect(JSON.stringify(source)).toBe(retained);
});

it("shows payout confidence bounds in payout units while keeping RTP bounds in percent", () => {
    const report = featureAnalyticsReport();
    const view = describeSimulationReport({
        ...report,
        rtpConfidenceInterval95: {low: 0.91, high: 0.99},
        averagePayoutConfidenceInterval95: {low: 0.9, high: 1.1},
    });
    const result = render(<MantineProvider><SimulationReportDisplay view={view} /></MantineProvider>);
    const payout = result.getByText("Average payout 95% confidence interval").closest("tr")!;
    expect(within(payout).getByRole("cell")).toHaveTextContent(/^0\.90 – 1\.10$/);
    const rtp = result.getByText("RTP 95% confidence interval").closest("tr")!;
    expect(within(rtp).getByRole("cell")).toHaveTextContent(/^91\.00% – 99\.00%$/);
    result.unmount();

    const summary = render(<MantineProvider><SimulationSummaryCard outcome={{kind: "completed", report: view}} /></MantineProvider>);
    expect(summary.getByText("RTP 95% CI: 91.00% – 99.00%")).toBeVisible();
});

it("keeps zero, unavailable and per-mode payout confidence bounds distinct after report replacement", () => {
    const report = featureAnalyticsReport();
    const result = render(<MantineProvider><SimulationReportDisplay view={describeSimulationReport({
        ...report, averagePayoutConfidenceInterval95: {low: 0, high: 0},
    })} /></MantineProvider>);
    const payoutCell = () => within(result.getByText("Average payout 95% confidence interval").closest("tr")!).getByRole("cell");
    expect(payoutCell()).toHaveTextContent(/^0\.00 – 0\.00$/);
    result.rerender(<MantineProvider><SimulationReportDisplay view={describeSimulationReport({
        ...report, averagePayoutConfidenceInterval95: undefined,
    })} /></MantineProvider>);
    expect(payoutCell()).toHaveTextContent(/^—$/);
    result.rerender(<MantineProvider><SimulationReportDisplay view={describeSimulationReport({
        game: report.game,
        requestedRounds: report.requestedRounds,
        seed: report.seed,
        modes: {
            base: {...report, averagePayoutConfidenceInterval95: {low: 0.9, high: 1.1}},
            buy: {...report, averagePayoutConfidenceInterval95: {low: 7.5, high: 8}},
        },
    })} /></MantineProvider>);
    for (const [mode, bounds] of [["base", "0.90 – 1.10"], ["buy", "7.50 – 8.00"]]) {
        const section = result.getByRole("group", {name: `Mode: ${mode}`});
        const row = within(section).getByText("Average payout 95% confidence interval").closest("tr")!;
        expect(within(row).getByRole("cell").textContent).toBe(bounds);
    }
});

it("renders weighted configuration, actual counts and distinct uncovered/zero-weight states", async () => {
    const view: SimulationReportView = {
        game: {id: "tiny", name: "Tiny", version: "1"}, rounds: 1, requestedRounds: 1, seed: "1", totalBet: 1, totalWin: 4,
        rtp: 4, hitFrequency: 1, maxWin: 4, durationMs: 1, spinsPerSecond: 1, workers: 1, warnings: [], recommendations: [],
        reelSequences: [{reelIndex: 0, context: "logical-round", model: "tiny", selections: 1, variants: [
            {id: "a", weight: 1, probability: 0.25, count: 1, frequency: 1, uncovered: false},
            {id: "b", weight: 3, probability: 0.75, count: 0, frequency: 0, uncovered: true},
            {id: "zero", weight: 0, probability: 0, count: 0, frequency: 0, uncovered: false},
        ]}],
    };
    const result = render(<MantineProvider><SimulationReportDisplay view={view} /></MantineProvider>);
    for (const toggle of result.getAllByRole("button", {name: "Show analytical tables and feature detail"})) await userEvent.click(toggle);
    expect(result.getByText("Observed frequency = count / selections.")).toBeInTheDocument();
    expect(result.getByText("logical-round: 1 selections")).toBeInTheDocument();
    const row = result.getByText("b").closest("tr")!;
    expect(within(row).getByText("0.75")).toBeInTheDocument();
    expect(within(row).getByText("uncovered")).toBeInTheDocument();
    expect(result.getByText("zero weight")).toBeInTheDocument();
});


it("renders zero denominators and the exact ratio of a positive underflowed probability", async () => {
    const view: SimulationReportView = {game: {id: "empty", name: "Empty", version: "1"}, rounds: 0, requestedRounds: 0, seed: null, totalBet: 0, totalWin: 0, rtp: 0, hitFrequency: 0, maxWin: 0, durationMs: 0, spinsPerSecond: 0, workers: 1, warnings: [], recommendations: [], reelSequences: [{reelIndex: 0, context: "logical-round", model: "tiny", selections: 0, variants: [{id: "tiny", weight: Number.MIN_VALUE, probability: 0, probabilityRatio: {numerator: "1", denominator: "12345678901234567890"}, count: 0, frequency: 0, uncovered: true}]}]};
    const result = render(<MantineProvider><SimulationReportDisplay view={view} /></MantineProvider>);
    for (const toggle of result.getAllByRole("button", {name: "Show analytical tables and feature detail"})) await userEvent.click(toggle);
    expect(result.getByText("logical-round: 0 selections")).toBeInTheDocument();
    expect(result.getByText("1/12345678901234567890")).toBeInTheDocument();
    expect(result.getByText("uncovered")).toBeInTheDocument();
    expect(result.container.textContent).not.toContain("NaN");
});

it("renders each mode's actual stake and jackpot pool observations without blended metrics", async () => {
    const report: SimulationReport = {game: {id: "jackpot", name: "Jackpot", version: "1"}, rounds: 2, requestedRounds: 2, seed: "ante", totalBet: 0.15, totalWin: 10, rtp: 10 / 0.15, hitFrequency: 0.5, maxWin: 10, durationMs: 1, spinsPerSecond: 2000, betMode: "ante", targetRtp: 0.95, rtpDeviation: 10 / 0.15 - 0.95, jackpot: {awardCount: 1, totalAwarded: 10, totalContributed: 0.015, contribution: 10 / 0.15, pools: {mini: {awardCount: 1, totalAwarded: 10, totalContributed: 0.015, contribution: 10 / 0.15}}}, reproducibility: {game: {id: "jackpot", name: "Jackpot", version: "1"}, seed: "ante", requestedRounds: 2, actualRounds: 2, command: "pokie sim jackpot --mode ante --seed ante"}};
    const view = describeSimulationReport({game: report.game, requestedRounds: 2, seed: "ante", modes: {ante: report, base: {...report, betMode: "base", totalBet: 0.1}}});
    const result = render(<MantineProvider><SimulationReportDisplay view={view} /></MantineProvider>);
    for (const toggle of result.getAllByRole("button", {name: "Show analytical tables and feature detail"})) await userEvent.click(toggle);
    for (const toggle of result.getAllByRole("button", {name: "Show run identity and accounting"})) await userEvent.click(toggle);
    expect(result.getByText("All modes — independent results per mode")).toBeInTheDocument();
    expect(result.getByText("Mode: ante")).toBeInTheDocument();
    expect(result.getByText("Mode: base")).toBeInTheDocument();
    expect(result.getAllByText("mini")).toHaveLength(2);
    expect(result.getAllByText("0.015")).toHaveLength(2);
    expect(result.getByText(/actual stake 0.15/)).toBeInTheDocument();
    expect(result.getByText(/Bet mode: ante/)).toBeInTheDocument();
    expect(result.getAllByText("pokie sim jackpot --mode ante --seed ante")).toHaveLength(2);
});

it("displays completed logical rounds separately from accepted and unfinished subrounds", async () => {
    const report: SimulationReport = {game: {id: "bounded", name: "Bounded", version: "1"}, rounds: 2, requestedRounds: 9, seed: "1", totalBet: 0.15, totalWin: 1, rtp: 1 / 0.15, hitFrequency: 1, maxWin: 0.5, durationMs: 1, spinsPerSecond: 9, sampling: {unit: "completed-logical-round", acceptedSubrounds: 9, carriedSubrounds: 1, excludedSubrounds: 1, trajectories: "independent-session-per-worker"}, logicalRounds: {rounds: 2, steps: 8, totalStake: 0.1, totalWin: 1}};
    const view = describeSimulationReport(report);
    const result = render(<MantineProvider><SimulationReportDisplay view={view} /></MantineProvider>);
    for (const toggle of result.getAllByRole("button", {name: "Show sampling and precision"})) await userEvent.click(toggle);
    const table = result.getByRole("table", {name: "Sampling and precision"});
    for (const [label, value] of [["Usable samples", "2 (completed-logical-round)"], ["Accepted subrounds", "9"],
        ["Carried subrounds", "1"], ["Excluded unfinished/restored subrounds", "1"]]) {
        expect(within(within(table).getByText(label).closest("tr")!).getByRole("cell")).toHaveTextContent(value);
    }
});

it("forwards real bonus selection statistics through the API view and rendered report", async () => {
    const user = userEvent.setup();
    const api = await import("../../../../../../src/index");
    const {weightedBonusBlueprint} = await import("../../../../../v2/fixtures/WeightedBonusGame");
    const {generatedMechanicsGame, mechanicsSession} = await import("../../../../../v2/fixtures/ExistingMechanicsGame");
    const blueprint = weightedBonusBlueprint(),
        game = generatedMechanicsGame(blueprint);
    const statistics = new api.AggregateSimulationRunner(mechanicsSession(game, 0), 1).run().getStatistics();
    const report = new api.SimulationReportBuilder().build({manifest: blueprint.manifest, requestedRounds: 1, statistics, durationMs: 1});
    const view = describeSimulationReport(JSON.parse(JSON.stringify(report)));
    const result = render(<MantineProvider><SimulationReportDisplay view={view} /></MantineProvider>);
    await user.click(result.getByRole("button", {name: "Show analytical tables and feature detail"}));
    expect(result.getByText("Weighted bonus prizes")).toBeVisible();
    expect(result.getByText(/1 eligible selections; 0 completed; 1 incomplete/)).toBeVisible();
    const large = result.getByText("large").closest("tr")!;
    expect(within(large).getByText("0.75")).toBeVisible();
    expect(within(large).getByText("observed")).toBeVisible();
    expect(result.getByText("unobserved")).toBeVisible();
    expect(result.getByText("zero weight")).toBeVisible();
});

it("renders analytics availability, zero denominators, unfinished features and populated ratios", async () => {
    const zero = featureAnalyticsReport("empty");
    const result = render(<MantineProvider><SimulationReportDisplay view={describeSimulationReport({...zero, analytics: undefined})} /></MantineProvider>);
    for (const toggle of result.getAllByRole("button", {name: "Show analytical tables and feature detail"})) await userEvent.click(toggle);
    expect(result.getByText(/Feature analytics unavailable/)).toBeVisible();
    result.rerender(<MantineProvider><SimulationReportDisplay view={describeSimulationReport(zero)} /></MantineProvider>);
    const lifecycle = () => result.getByRole("table", {name: "Feature lifecycle summary"});
    expect(within(lifecycle()).getAllByRole("row")).toHaveLength(8);
    expect(within(lifecycle()).getAllByText("0 / 0 = 0")).toHaveLength(21);
    expect(result.container.textContent).not.toContain("NaN");
    result.rerender(<MantineProvider><SimulationReportDisplay view={describeSimulationReport(featureAnalyticsReport("incomplete"))} /></MantineProvider>);
    const incomplete = within(lifecycle()).getByRole("row", {name: /^freeGames /});
    expect(within(incomplete).getAllByRole("cell").map(cell => cell.textContent)).toEqual(["1 / 1 = 1", "0", "1", "0 / 0 = 0", "0 / 0 = 0"]);
    result.rerender(<MantineProvider><SimulationReportDisplay view={describeSimulationReport(featureAnalyticsReport())} /></MantineProvider>);
    const populated = within(lifecycle()).getByRole("row", {name: /^freeGames /});
    expect(within(populated).getByText("4 / 1 = 4")).toBeVisible();
    const attribution = result.getByRole("table", {name: "Payout attribution"});
    const feature = within(attribution).getByRole("row", {name: /^feature /});
    expect(within(feature).getAllByRole("cell").map(cell => cell.textContent)).toEqual(["14 / 24 = 0.5833333333333334", "14 / 30 = 0.4666666666666667"]);
});

it("keeps precision visible and discloses complete attribution and noise limitations in both result views", async () => {
    const report = featureAnalyticsReport("empty");
    const view = describeSimulationReport(report);
    for (const surface of [<SimulationSummaryCard key="summary" outcome={{kind: "completed", report: view}} />, <SimulationReportDisplay key="report" view={view} />]) {
        const result = render(<MantineProvider>{surface}</MantineProvider>);
        expect(result.getByText(/0 usable samples/)).toBeVisible();
        expect(result.getByText(/neither establishes exact RTP/)).not.toBeVisible();
        await userEvent.click(result.getByRole("button", {name: "Show recommendations and limits"}));
        expect(result.getByText(/neither establishes exact RTP/)).toBeVisible();
        await userEvent.click(result.getByRole("button", {name: "Show sampling and precision"}));
        if (result.queryByRole("table", {name: "Sampling and precision"})) {
            expect(result.getByText("Diagnostic usable samples").closest("tr")).toHaveTextContent("0 (completed-logical-round)");
        } else expect(result.container.textContent).toContain("usable samples 0");
        expect(result.container.textContent).toContain("insufficientSamples");
        expect(result.container.textContent).toContain("neither establishes exact RTP");
        expect(result.container.textContent).toContain("supported but no entries observed");
        result.unmount();
    }
});


it("leads with grouped results and discloses real analytics without losing counts, units or caveats", async () => {
    const user = userEvent.setup();
    const report = featureAnalyticsReport();
    const original = JSON.stringify(report);
    const view = describeSimulationReport(report);
    const result = render(<MantineProvider><SimulationReportDisplay view={view} /></MantineProvider>);
    expect(result.queryByRole("table", {name: "Sampling and precision"})).not.toBeInTheDocument();
    expect(result.queryByRole("table", {name: "Analytics population"})).not.toBeInTheDocument();
    expect(result.queryByRole("table", {name: "Run identity and accounting"})).not.toBeInTheDocument();
    await user.click(result.getByRole("button", {name: "Show sampling and precision"}));
    await user.click(result.getByRole("button", {name: "Show analytical tables and feature detail"}));
    const metrics = result.getByRole("table", {name: "Simulation result metrics"});
    const sampling = result.getByRole("table", {name: "Sampling and precision"});
    expect(metrics).toHaveClass("studio-simulation-metrics");
    expect(metrics.compareDocumentPosition(sampling) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(result.getByText(/neither establishes exact RTP/)).not.toBeVisible();
    await user.click(result.getByRole("button", {name: "Show recommendations and limits"}));
    expect(result.getByText(/neither establishes exact RTP/)).toBeVisible();
    expect(result.container.textContent).not.toContain(JSON.stringify(report.payoutHistogram));
    for (const name of ["Canonical hit rates", "Component statistics", "freeGames distributions", "Analytics provenance"]) {
        expect(result.queryByRole("table", {name})).not.toBeInTheDocument();
    }
    const componentToggle = result.getByRole("button", {name: "Show canonical hits and components"});
    componentToggle.focus();
    await user.keyboard("{Enter}");
    expect(componentToggle).toHaveFocus();
    expect(componentToggle).toHaveAttribute("aria-expanded", "true");
    const components = result.getByRole("table", {name: "Component statistics"});
    expect(components.closest(".mantine-ScrollArea-root")).not.toBeNull();
    expect(within(components).getAllByRole("row").slice(1).map(row => row.textContent)).toEqual(
        Object.values(report.analytics!.components).map(c => `${c.type}${c.id}${c.symbol ?? "none"}${c.samples}${c.occurrences}${c.amount}`),
    );
    const hits = result.getByRole("table", {name: "Canonical hit rates"});
    for (const [kind, group] of Object.entries(report.analytics!.hitRates)) {
        for (const [id, r] of Object.entries(group)) {
            expect(within(hits).getByRole("row", {name: `${kind} ${id} ${r.numerator} / ${r.denominator} = ${r.value}`})).toBeVisible();
        }
    }
    await user.click(componentToggle);
    expect(components).not.toBeVisible();
    await user.click(componentToggle);
    expect(result.getByRole("table", {name: "Component statistics"})).toBe(components);
    await user.click(result.getByRole("button", {name: "Show win and feature details"}));
    const distribution = result.getByRole("table", {name: "freeGames distributions"});
    expect(within(distribution).getAllByRole("row").slice(1).map(row => within(row).getAllByRole("cell").map(cell => cell.textContent))).toEqual(
        report.analytics!.features.freeGames.durationHistogram.map((count, i) => [String(count), String(report.analytics!.features.freeGames.winHistogram[i])]),
    );
    expect(result.getByRole("table", {name: "Bet mode attribution"})).toBeVisible();
    await user.click(result.getByRole("button", {name: "Show analytics provenance"}));
    expect(within(result.getByRole("table", {name: "Analytics provenance"})).getByText("known-answer")).toBeVisible();
    await user.click(result.getByRole("button", {name: "Show advanced details (payout histogram)"}));
    expect(result.getByText("Payout bucket (currency)")).toBeVisible();
    expect(result.getByText(/legacy keys: 0, 1-9/)).toBeVisible();
    expect(JSON.stringify(report)).toBe(original);
});

it("retains unavailable attribution and replaces disclosed observations without stale statistics", async () => {
    const user = userEvent.setup();
    const report = featureAnalyticsReport();
    const view = (reportView: SimulationReportView) => <MantineProvider><SimulationReportDisplay view={reportView} /></MantineProvider>;
    const result = render(view(describeSimulationReport(report)));
    await user.click(result.getByRole("button", {name: "Show sampling and precision"}));
    await user.click(result.getByRole("button", {name: "Show analytical tables and feature detail"}));
    await user.click(result.getByRole("button", {name: "Show canonical hits and components"}));
    result.rerender(view(describeSimulationReport(featureAnalyticsReport("empty"))));
    expect(result.getByText("No canonical components observed.")).toBeVisible();
    expect(result.getByRole("table", {name: "Component statistics"})).not.toHaveTextContent("mini");
    const legacy = {...report, sampling: undefined, diagnostics: undefined, analytics: {
        ...report.analytics!, envelope: {...report.analytics!.envelope, components: false, lifecycle: false},
    }};
    result.rerender(view(describeSimulationReport(legacy)));
    expect(result.getByText("Canonical symbol/line/scatter hits unavailable.")).toBeVisible();
    expect(result.getByText(/Feature lifecycle unavailable:/)).toBeVisible();
    expect(result.queryByRole("table", {name: "Feature lifecycle summary"})).not.toBeInTheDocument();
    expect(result.getByText("Precision unavailable (legacy report)", {exact: false})).toBeVisible();
    await user.click(result.getByRole("button", {name: "Show recommendations and limits"}));
    expect(result.getByText(/Persisted precision\/support diagnostics unavailable/)).toBeVisible();
    expect(result.getByText(/3 \(accepted-subround\)/)).toBeVisible();
});


it("keeps per-mode analytics, provenance and disclosure state separate", async () => {
    const user = userEvent.setup();
    const report = featureAnalyticsReport();
    const base = {...report, betMode: "base", averagePayoutConfidenceInterval95: {low: 0, high: 0}};
    const buy = {...featureAnalyticsReport("empty"), betMode: "buy", averagePayoutConfidenceInterval95: undefined};
    const result = render(<MantineProvider><SimulationReportDisplay view={describeSimulationReport({game: report.game,
        requestedRounds: 5, seed: null, modes: {base, buy}})} /></MantineProvider>);
    const baseMode = within(result.getByRole("group", {name: "Mode: base"}));
    const buyMode = within(result.getByRole("group", {name: "Mode: buy"}));
    expect(baseMode.getByText("0.00 – 0.00")).toBeVisible();
    expect(buyMode.getByText("Average payout 95% confidence interval").closest("tr")).toHaveTextContent("—");
    await user.click(baseMode.getByRole("button", {name: "Show recommendations and limits"}));
    expect(buyMode.getByRole("button", {name: "Show recommendations and limits"})).toHaveAttribute("aria-expanded", "false");
    await user.click(baseMode.getByRole("button", {name: "Show analytical tables and feature detail"}));
    expect(buyMode.getByRole("button", {name: "Show analytical tables and feature detail"})).toHaveAttribute("aria-expanded", "false");
    await user.click(buyMode.getByRole("button", {name: "Show analytical tables and feature detail"}));
    await user.click(baseMode.getByRole("button", {name: "Show canonical hits and components"}));
    expect(baseMode.getByRole("table", {name: "Component statistics"})).toHaveTextContent("mini");
    expect(buyMode.queryByRole("table", {name: "Component statistics"})).not.toBeInTheDocument();
    expect(buyMode.getByRole("button", {name: "Show canonical hits and components"})).toHaveAttribute("aria-expanded", "false");
    expect(buyMode.getAllByText(/supported but no entries observed/)).toHaveLength(7);
});
