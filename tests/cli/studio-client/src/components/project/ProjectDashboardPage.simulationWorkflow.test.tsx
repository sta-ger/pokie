import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {
    SimulationReport,
    StudioSimulationJobView,
    StudioSimulationReportDetail,
    StudioSimulationReportListEntry,
    StudioSimulationStatisticsView,
} from "../../../../../../cli/studio-client/src/api/types";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const BASE_ROUTES: Record<string, () => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({
        ok: true,
        status: 200,
        body: {status: "loaded", projectRoot: "/games/a", game: {id: "a", name: "A", version: "1.0.0"}},
    }),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true, generated: false}}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
};

function reportFor(overrides: Partial<SimulationReport> = {}): SimulationReport {
    return {
        game: {id: "a", name: "A", version: "1.0.0"},
        requestedRounds: 10000,
        rounds: 10000,
        seed: "demo-seed",
        totalBet: 10000,
        totalWin: 9600,
        rtp: 0.96,
        hitFrequency: 0.25,
        maxWin: 500,
        durationMs: 1200,
        spinsPerSecond: 8333,
        workers: 1,
        warnings: [],
        recommendations: [],
        ...overrides,
    };
}

function statisticsFor(overrides: Partial<StudioSimulationStatisticsView> = {}): StudioSimulationStatisticsView {
    return {
        volatility: 12.5,
        payoutStandardDeviation: 12.5,
        returnStandardDeviation: 0.5,
        averagePayoutConfidenceInterval95: {low: 0.9, high: 1.1},
        rtpConfidenceInterval95: {low: 0.94, high: 0.98},
        ...overrides,
    };
}

// GET /api/project/reports/:id's response envelope -- report + the same statistics a live job's own
// poll response carries (see StudioSimulationReportDetail).
function reportDetailFor(
    reportOverrides: Partial<SimulationReport> = {},
    statisticsOverrides: Partial<StudioSimulationStatisticsView> = {},
): StudioSimulationReportDetail {
    return {report: reportFor(reportOverrides), statistics: statisticsFor(statisticsOverrides)};
}

function jobFor(id: string, overrides: Partial<StudioSimulationJobView> = {}): StudioSimulationJobView {
    return {
        id,
        status: "completed",
        rounds: 10000,
        seed: "demo-seed",
        workers: 1,
        startedAt: new Date().toISOString(),
        roundsCompleted: 10000,
        durationMs: 1200,
        ...overrides,
    };
}

async function goToSimulationTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
    await user.click(screen.getByRole("button", {name: /Simulation & Reports/}));
    await screen.findByRole("button", {name: "Run Simulation"});
}

// Mantine's Stepper.Step packs the step icon + label + description into one <button>, so its
// accessible name is a concatenation (e.g. "1 Configure Set rounds") -- an exact-match query on just
// the label would never match. This mirrors how the Rounds field's own `required` asterisk (rendered
// as a separate, non-exact-text span) means /^Rounds/ rather than "Rounds" is needed for that field too.
function stepperStep(label: string, description: string): RegExp {
    return new RegExp(`${label}.*${description}`);
}

describe("ProjectDashboardPage - Simulation & Reports workflow", () => {
    it("Configure defaults to 10000 rounds, runs, and auto-opens a Review summary with recommendations/warnings intact", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/simulations": (call: FakeCall) => {
                expect(call.init?.method).toBe("POST");
                expect(JSON.parse(call.init?.body ?? "{}")).toMatchObject({rounds: 10000});
                return {ok: true, status: 200, body: jobFor("job-1", {status: "queued", roundsCompleted: 0})};
            },
            "/api/project/simulations/job-1": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-1", {status: "running", roundsCompleted: 4000})};
                }
                return {
                    ok: true,
                    status: 200,
                    body: jobFor("job-1", {
                        status: "completed",
                        report: reportFor({
                            warnings: ['"reels" is unusually large.'],
                            recommendations: ["Increase --rounds (e.g. 10000+) for more stable RTP/hit-frequency estimates."],
                        }),
                        statistics: {
                            volatility: 12.5,
                            payoutStandardDeviation: 12.5,
                            returnStandardDeviation: 0.5,
                            averagePayoutConfidenceInterval95: {low: 0.9, high: 1.1},
                            rtpConfidenceInterval95: {low: 0.94, high: 0.98},
                        },
                    }),
                };
            },
            "/api/project/reports/job-1": () => ({
                ok: true,
                status: 200,
                body: reportDetailFor({
                    warnings: ['"reels" is unusually large.'],
                    recommendations: ["Increase --rounds (e.g. 10000+) for more stable RTP/hit-frequency estimates."],
                }),
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);

        expect((screen.getByLabelText(/^Rounds/) as HTMLInputElement).value).toBe("10000");

        await user.click(screen.getByRole("button", {name: "Run Simulation"}));

        await waitFor(() => expect(screen.getByText("RTP")).toBeInTheDocument(), {timeout: 15000});
        expect(screen.getByRole("button", {name: stepperStep("Configure", "Set rounds")})).toBeInTheDocument();

        // The full report (warnings/recommendations included) is reachable via "Open full report" --
        // Mantine's Collapse keeps it mounted (keepMounted defaults to true) even while closed. The
        // compact summary (task 2 of this pass) already shows the same warning/recommendation text
        // itself, so both assertions use getAllByText/length rather than asserting exclusivity.
        await user.click(screen.getByRole("button", {name: "Open full report"}));
        await waitFor(() => expect(screen.getAllByText('"reels" is unusually large.').length).toBeGreaterThan(0));
        expect(screen.getAllByText("Increase --rounds (e.g. 10000+) for more stable RTP/hit-frequency estimates.").length).toBeGreaterThan(0);
    }, 45000);

    it("shows a failure summary and lets Retry re-run the same configuration", async () => {
        const user = userEvent.setup();
        const runCalls: unknown[] = [];
        let pollCount = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/simulations": (call: FakeCall) => {
                runCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: jobFor("job-2", {status: "queued", roundsCompleted: 0})};
            },
            "/api/project/simulations/job-2": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-2", {status: "running", roundsCompleted: 100})};
                }
                return {ok: true, status: 200, body: jobFor("job-2", {status: "failed", error: "Cannot find module './dist/index.js'"})};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);

        await user.click(screen.getByRole("button", {name: "Run Simulation"}));

        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cannot find module './dist/index.js'"), {timeout: 15000});
        expect(runCalls).toHaveLength(1);

        await user.click(screen.getByRole("button", {name: "Repeat simulation"}));
        await waitFor(() => expect(runCalls).toHaveLength(2));
        expect(runCalls[1]).toMatchObject({rounds: 10000, seed: "demo-seed", workers: 1});
    }, 45000);

    it("cancels a running simulation via the confirm modal and shows a cancelled summary", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        let cancelCalled = false;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/simulations": () => ({ok: true, status: 200, body: jobFor("job-3", {status: "queued", roundsCompleted: 0})}),
            "/api/project/simulations/job-3": (call: FakeCall) => {
                if (call.init?.method === "DELETE") {
                    cancelCalled = true;
                    return {ok: true, status: 200, body: jobFor("job-3", {status: "cancelled", roundsCompleted: 3000})};
                }
                pollCount += 1;
                if (cancelCalled) {
                    return {ok: true, status: 200, body: jobFor("job-3", {status: "cancelled", roundsCompleted: 3000})};
                }
                return {ok: true, status: 200, body: jobFor("job-3", {status: "running", roundsCompleted: pollCount * 1000})};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);

        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Cancel"})).toBeInTheDocument(), {timeout: 15000});

        await user.click(screen.getByRole("button", {name: "Cancel"}));
        await user.click(await screen.findByRole("button", {name: "Confirm"}));

        await waitFor(() => expect(cancelCalled).toBe(true));
        await waitFor(() => expect(screen.getByText(/Cancelled after/)).toBeInTheDocument(), {timeout: 15000});
    }, 45000);

    it("lists recent runs and lets the user reopen a result or run the same configuration again", async () => {
        const user = userEvent.setup();
        const entry: StudioSimulationReportListEntry = {
            id: "old-job",
            status: "completed",
            game: {id: "a", version: "1.0.0"},
            requestedRounds: 5000,
            actualRounds: 5000,
            seed: "old-seed",
            workers: 2,
            rtp: 0.94,
            hitFrequency: 0.22,
            maxWin: 300,
            startedAt: "2026-01-01T00:00:00.000Z",
            completedAt: "2026-01-01T00:00:05.000Z",
            durationMs: 5000,
            hasWarnings: false,
        };
        const runCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/reports": () => ({ok: true, status: 200, body: [entry]}),
            "/api/project/reports/old-job": () => ({ok: true, status: 200, body: reportDetailFor({requestedRounds: 5000, rounds: 5000, seed: "old-seed", workers: 2})}),
            "/api/project/simulations": (call: FakeCall) => {
                runCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: jobFor("new-job", {status: "queued", roundsCompleted: 0, rounds: 5000, seed: "old-seed", workers: 2})};
            },
            "/api/project/simulations/new-job": () => ({
                ok: true,
                status: 200,
                body: jobFor("new-job", {status: "running", roundsCompleted: 100, rounds: 5000, seed: "old-seed", workers: 2}),
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);

        const recentRunsSection = screen.getByText("Recent runs").closest("fieldset") as HTMLElement;
        await waitFor(() => expect(within(recentRunsSection).getByText(/RTP 94\.00%/)).toBeInTheDocument());

        await user.click(within(recentRunsSection).getByRole("button", {name: "Open"}));
        await waitFor(() => expect(screen.getByRole("button", {name: stepperStep("Review", "See results")})).not.toBeDisabled());
        await user.click(screen.getByRole("button", {name: "Open full report"}));
        await waitFor(() => expect(screen.getByText("old-seed")).toBeInTheDocument(), {timeout: 15000});

        await user.click(within(recentRunsSection).getByRole("button", {name: "Run again"}));
        await waitFor(() => expect(runCalls).toHaveLength(1));
        expect(runCalls[0]).toMatchObject({rounds: 5000, seed: "old-seed", workers: 2});
    }, 45000);

    it("compares the current run against another recent run side by side", async () => {
        const user = userEvent.setup();
        const entry: StudioSimulationReportListEntry = {
            id: "other-job",
            status: "completed",
            game: {id: "a", version: "1.0.0"},
            requestedRounds: 20000,
            actualRounds: 20000,
            workers: 1,
            rtp: 0.97,
            hitFrequency: 0.3,
            maxWin: 900,
            startedAt: "2026-02-01T00:00:00.000Z",
            completedAt: "2026-02-01T00:00:05.000Z",
            durationMs: 6000,
            hasWarnings: false,
        };
        let pollCount = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/reports": () => ({ok: true, status: 200, body: [entry]}),
            "/api/project/reports/other-job": () => ({ok: true, status: 200, body: reportDetailFor({requestedRounds: 20000, rounds: 20000, rtp: 0.97, seed: null})}),
            "/api/project/reports/job-4": () => ({ok: true, status: 200, body: reportDetailFor()}),
            "/api/project/simulations": () => ({ok: true, status: 200, body: jobFor("job-4", {status: "queued", roundsCompleted: 0})}),
            "/api/project/simulations/job-4": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-4", {status: "running", roundsCompleted: 100})};
                }
                return {ok: true, status: 200, body: jobFor("job-4", {status: "completed", report: reportFor()})};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);

        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Compare with another run"})).toBeInTheDocument(), {timeout: 15000});

        await user.click(screen.getByRole("button", {name: "Compare with another run"}));
        await user.click(await screen.findByRole("button", {name: /a v1\.0\.0/}));

        await waitFor(() => expect(screen.getByText("This run")).toBeInTheDocument());
        expect(screen.getByText("Comparison")).toBeInTheDocument();
        expect(screen.getAllByText(/97\.00%|96\.00%/).length).toBeGreaterThan(0);
    }, 45000);

    it("gates the Export step behind a resolved report and exposes the three download links", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/simulations": () => ({ok: true, status: 200, body: jobFor("job-5", {status: "queued", roundsCompleted: 0})}),
            "/api/project/simulations/job-5": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-5", {status: "running", roundsCompleted: 100})};
                }
                return {ok: true, status: 200, body: jobFor("job-5", {status: "completed", report: reportFor()})};
            },
            "/api/project/reports/job-5": () => ({ok: true, status: 200, body: reportDetailFor()}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);

        const exportStep = stepperStep("Export", "Download report");
        expect(screen.getByRole("button", {name: exportStep})).toBeDisabled();

        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await waitFor(() => expect(screen.getByRole("button", {name: exportStep})).not.toBeDisabled(), {timeout: 15000});

        await user.click(screen.getByRole("button", {name: exportStep}));
        expect(screen.getByRole("link", {name: "Download JSON"})).toHaveAttribute("href", "/api/project/reports/job-5/download?format=json");
        expect(screen.getByRole("link", {name: "Download Markdown"})).toHaveAttribute("href", "/api/project/reports/job-5/download?format=markdown");
        expect(screen.getByRole("link", {name: "Download HTML"})).toHaveAttribute("href", "/api/project/reports/job-5/download?format=html");
    }, 45000);

    it("keeps Review/Export steps disabled (and unreachable) until there is something to show", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);

        expect(screen.getByRole("button", {name: stepperStep("Run", "Watch progress")})).toBeDisabled();
        expect(screen.getByRole("button", {name: stepperStep("Review", "See results")})).toBeDisabled();
        expect(screen.getByRole("button", {name: stepperStep("Export", "Download report")})).toBeDisabled();
        expect(screen.getByRole("button", {name: stepperStep("Configure", "Set rounds")})).not.toBeDisabled();
    }, 45000);

    it("supports keyboard-only navigation through the Stepper, skipping disabled steps", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/simulations": () => ({ok: true, status: 200, body: jobFor("job-6", {status: "queued", roundsCompleted: 0})}),
            "/api/project/simulations/job-6": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-6", {status: "running", roundsCompleted: 100})};
                }
                return {ok: true, status: 200, body: jobFor("job-6", {status: "completed", report: reportFor()})};
            },
            "/api/project/reports/job-6": () => ({ok: true, status: 200, body: reportDetailFor()}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);

        const configureStep = stepperStep("Configure", "Set rounds");
        const runStep = stepperStep("Run", "Watch progress");
        const reviewStep = stepperStep("Review", "See results");
        const exportStep = stepperStep("Export", "Download report");

        // Before any run, Run/Review/Export are disabled -- native `disabled` buttons are unfocusable,
        // so tabbing from Configure's own step button lands on the enabled Rounds field next, not on
        // any of the three disabled steps in between.
        screen.getByRole("button", {name: configureStep}).focus();
        await user.tab();
        expect(screen.getByLabelText(/^Rounds/)).toHaveFocus();

        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await waitFor(() => expect(screen.getByRole("button", {name: exportStep})).not.toBeDisabled(), {timeout: 15000});

        // All four steps are now enabled and keyboard-activatable (Enter on a focused step navigates).
        screen.getByRole("button", {name: configureStep}).focus();
        await user.keyboard("{Enter}");
        expect(screen.getByLabelText(/^Rounds/)).toBeInTheDocument();

        screen.getByRole("button", {name: runStep}).focus();
        await user.keyboard("{Enter}");
        expect(screen.getByText(/^completed —/)).toBeInTheDocument();

        screen.getByRole("button", {name: reviewStep}).focus();
        await user.keyboard("{Enter}");
        expect(screen.getByRole("button", {name: "Open full report"})).toBeInTheDocument();

        screen.getByRole("button", {name: exportStep}).focus();
        await user.keyboard("{Enter}");
        expect(screen.getByRole("link", {name: "Download JSON"})).toBeInTheDocument();
    }, 45000);

    it("shows identical statistics for a live report and the same report reopened from Recent Runs", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const entry: StudioSimulationReportListEntry = {
            id: "job-p1",
            status: "completed",
            game: {id: "a", version: "1.0.0"},
            requestedRounds: 10000,
            actualRounds: 10000,
            seed: "demo-seed",
            workers: 1,
            rtp: 0.96,
            hitFrequency: 0.25,
            maxWin: 500,
            startedAt: "2026-03-01T00:00:00.000Z",
            completedAt: "2026-03-01T00:00:05.000Z",
            durationMs: 1200,
            hasWarnings: false,
        };
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/reports": () => ({ok: true, status: 200, body: [entry]}),
            "/api/project/reports/job-p1": () => ({ok: true, status: 200, body: reportDetailFor()}),
            "/api/project/simulations": () => ({ok: true, status: 200, body: jobFor("job-p1", {status: "queued", roundsCompleted: 0})}),
            "/api/project/simulations/job-p1": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-p1", {status: "running", roundsCompleted: 100})};
                }
                return {ok: true, status: 200, body: jobFor("job-p1", {status: "completed", report: reportFor()})};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);

        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await user.click(await screen.findByRole("button", {name: "Open full report"}, {timeout: 15000}));
        await waitFor(() => expect(screen.getAllByText("94.00% – 98.00%").length).toBeGreaterThan(0));

        // Reopen the very same report from Recent Runs -- a fresh GET, exercising the "historical" path.
        // Same id, so the full-report disclosure legitimately stays open (SimulationTab's reset effect
        // only closes it when the reviewed report *changes* -- see requirement 7) -- no need to click
        // "Open full report" again.
        await user.click(screen.getByRole("button", {name: stepperStep("Configure", "Set rounds")}));
        const recentRunsSection = screen.getByText("Recent runs").closest("fieldset") as HTMLElement;
        await user.click(within(recentRunsSection).getByRole("button", {name: "Open"}));
        await waitFor(() => expect(screen.getAllByText("94.00% – 98.00%").length).toBeGreaterThan(0));
        expect(screen.getAllByText("12.50").length).toBeGreaterThan(0); // volatility
    }, 45000);

    it("shows warnings, a convergence assessment, and the main recommendation in the auto-opened summary before opening the full report", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/simulations": () => ({ok: true, status: 200, body: jobFor("job-sum", {status: "queued", roundsCompleted: 0})}),
            "/api/project/simulations/job-sum": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-sum", {status: "running", roundsCompleted: 100})};
                }
                return {ok: true, status: 200, body: jobFor("job-sum", {status: "completed", report: reportFor()})};
            },
            "/api/project/reports/job-sum": () => ({
                ok: true,
                status: 200,
                body: reportDetailFor({
                    warnings: ["Hit frequency is 0 — no round produced a win."],
                    recommendations: ["Increase --rounds (e.g. 10000+) for more stable RTP/hit-frequency estimates.", "Use \"pokie diff\" to compare."],
                }),
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);

        await user.click(screen.getByRole("button", {name: "Run Simulation"}));

        // All three must be visible *without* clicking "Open full report" first.
        await waitFor(() => expect(screen.getByText("Hit frequency is 0 — no round produced a win.")).toBeInTheDocument(), {timeout: 15000});
        expect(screen.getByText(/RTP 95% CI:/)).toBeInTheDocument();
        expect(screen.getByText(/Increase --rounds/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Open full report"})).toBeInTheDocument();
    }, 45000);

    it("discards an out-of-order report-detail response, keeping only the latest request's result", async () => {
        const user = userEvent.setup();
        const entryX: StudioSimulationReportListEntry = {
            id: "entry-x",
            status: "completed",
            game: {id: "a", version: "1.0.0"},
            requestedRounds: 1000,
            actualRounds: 1000,
            workers: 1,
            rtp: 0.11,
            hitFrequency: 0.4,
            maxWin: 50,
            startedAt: "2026-04-01T00:00:00.000Z",
            completedAt: "2026-04-01T00:00:05.000Z",
            durationMs: 500,
            hasWarnings: false,
        };
        const entryY: StudioSimulationReportListEntry = {...entryX, id: "entry-y", rtp: 0.22, startedAt: "2026-04-02T00:00:00.000Z"};
        const fetchImpl: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/reports/entry-x") {
                return new Promise((resolve) => {
                    setTimeout(() => resolve({ok: true, status: 200, json: () => Promise.resolve(reportDetailFor({rtp: 0.11}))}), 150);
                });
            }
            if (path === "/api/project/reports/entry-y") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(reportDetailFor({rtp: 0.22}))});
            }
            if (path === "/api/project/reports") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([entryX, entryY])});
            }
            const route = BASE_ROUTES[path];
            if (route) {
                const {ok, status, body} = route();
                return Promise.resolve({ok, status, json: () => Promise.resolve(body)});
            }
            return Promise.reject(new Error(`no fake route for ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);

        const recentRunsSection = screen.getByText("Recent runs").closest("fieldset") as HTMLElement;
        await waitFor(() => expect(within(recentRunsSection).getAllByRole("button", {name: "Open"})).toHaveLength(2));
        const openButtons = within(recentRunsSection).getAllByRole("button", {name: "Open"});

        await user.click(openButtons[0]); // entry-x -- slow (150ms)
        await user.click(openButtons[1]); // entry-y -- fast, requested after entry-x

        // Mantine's Collapse keeps the (closed) full report mounted alongside the compact summary, so
        // the correct RTP legitimately renders twice (getAllByText, not an exclusivity assertion).
        await waitFor(() => expect(screen.getAllByText("22.00%").length).toBeGreaterThan(0));
        // Give entry-x's delayed response every chance to land and (incorrectly) overwrite the result.
        await new Promise((resolve) => {
            setTimeout(resolve, 300);
        });
        expect(screen.getAllByText("22.00%").length).toBeGreaterThan(0);
        expect(screen.queryByText("11.00%")).not.toBeInTheDocument();
    }, 45000);

    it("discards an out-of-order comparison response, keeping only the latest compare request's result", async () => {
        const user = userEvent.setup();
        const mainEntry: StudioSimulationReportListEntry = {
            id: "job-main",
            status: "completed",
            game: {id: "a", version: "1.0.0"},
            requestedRounds: 10000,
            actualRounds: 10000,
            workers: 1,
            rtp: 0.96,
            hitFrequency: 0.25,
            maxWin: 500,
            startedAt: "2026-05-01T00:00:00.000Z",
            completedAt: "2026-05-01T00:00:05.000Z",
            durationMs: 1200,
            hasWarnings: false,
        };
        const candidateX: StudioSimulationReportListEntry = {...mainEntry, id: "candidate-x", rtp: 0.31, startedAt: "2026-04-01T00:00:00.000Z"};
        const candidateY: StudioSimulationReportListEntry = {...mainEntry, id: "candidate-y", rtp: 0.42, startedAt: "2026-04-02T00:00:00.000Z"};
        let pollCount = 0;
        const fetchImpl: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/reports/candidate-x") {
                return new Promise((resolve) => {
                    setTimeout(() => resolve({ok: true, status: 200, json: () => Promise.resolve(reportDetailFor({rtp: 0.31}))}), 150);
                });
            }
            if (path === "/api/project/reports/candidate-y") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(reportDetailFor({rtp: 0.42}))});
            }
            if (path === "/api/project/reports/job-main") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(reportDetailFor({rtp: 0.96}))});
            }
            if (path === "/api/project/reports") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([mainEntry, candidateX, candidateY])});
            }
            if (path === "/api/project/simulations") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(jobFor("job-main", {status: "queued", roundsCompleted: 0}))});
            }
            if (path === "/api/project/simulations/job-main") {
                pollCount += 1;
                const body =
                    pollCount < 2
                        ? jobFor("job-main", {status: "running", roundsCompleted: 100})
                        : jobFor("job-main", {status: "completed", report: reportFor({rtp: 0.96})});
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)});
            }
            const route = BASE_ROUTES[path];
            if (route) {
                const {ok, status, body} = route();
                return Promise.resolve({ok, status, json: () => Promise.resolve(body)});
            }
            return Promise.reject(new Error(`no fake route for ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);

        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await user.click(await screen.findByRole("button", {name: "Compare with another run"}, {timeout: 15000}));

        await user.click(await screen.findByRole("button", {name: /a v1\.0\.0.*4\/1\/2026/}));
        await user.click(screen.getByRole("button", {name: /a v1\.0\.0.*4\/2\/2026/}));

        await waitFor(() => expect(screen.getByText("42.00%")).toBeInTheDocument());
        await new Promise((resolve) => {
            setTimeout(resolve, 300);
        });
        expect(screen.getByText("42.00%")).toBeInTheDocument();
        expect(screen.queryByText("31.00%")).not.toBeInTheDocument();
    }, 45000);

    it("clears all previous-project data (report, comparison, recent runs) when the project changes mid-load", async () => {
        const user = userEvent.setup();
        const entryA: StudioSimulationReportListEntry = {
            id: "entry-a",
            status: "completed",
            game: {id: "a", version: "1.0.0"},
            requestedRounds: 1000,
            actualRounds: 1000,
            workers: 1,
            rtp: 0.5,
            hitFrequency: 0.3,
            maxWin: 50,
            startedAt: "2026-06-01T00:00:00.000Z",
            completedAt: "2026-06-01T00:00:05.000Z",
            durationMs: 500,
            hasWarnings: false,
        };
        let releaseSlowReport: (() => void) | undefined;
        const fetchImplA: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/context") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({status: "loaded", projectRoot: "/games/a", game: {id: "a", name: "A", version: "1.0.0"}}),
                });
            }
            if (path === "/api/project/reports/entry-a") {
                return new Promise((resolve) => {
                    releaseSlowReport = () => resolve({ok: true, status: 200, json: () => Promise.resolve(reportDetailFor())});
                });
            }
            if (path === "/api/project/reports") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([entryA])});
            }
            const route = BASE_ROUTES[path];
            if (route) {
                const {ok, status, body} = route();
                return Promise.resolve({ok, status, json: () => Promise.resolve(body)});
            }
            return Promise.reject(new Error(`no fake route for ${url}`));
        };

        const first = renderRoutedApp({fetchImpl: fetchImplA, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);
        const recentRunsSectionA = screen.getByText("Recent runs").closest("fieldset") as HTMLElement;
        await user.click(within(recentRunsSectionA).getByRole("button", {name: "Open"}));
        await waitFor(() => expect(screen.getByText("Loading report…")).toBeInTheDocument());

        // Simulate navigating away (the real mechanism a project switch happens through today).
        first.unmount();

        const {fetchImpl: fetchImplB} = createRoutedFakeFetch({
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {status: "loaded", projectRoot: "/games/b", game: {id: "b", name: "B", version: "1.0.0"}},
            }),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/b", valid: true, generated: false}}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl: fetchImplB, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "B"});
        await user.click(screen.getByRole("button", {name: /Simulation & Reports/}));
        await screen.findByRole("button", {name: "Run Simulation"});

        // Project A's report request finally resolves -- must never reach project B's now-mounted UI.
        releaseSlowReport?.();
        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });

        expect(screen.getByRole("button", {name: stepperStep("Review", "See results")})).toBeDisabled();
        expect(screen.queryByText("Loading report…")).not.toBeInTheDocument();
        expect(screen.getByText("No completed simulations yet.")).toBeInTheDocument();
    }, 45000);

    it("shows no Export download links while the report is loading or after it fails to load", async () => {
        const user = userEvent.setup();
        let releaseReport: (() => void) | undefined;
        const entry: StudioSimulationReportListEntry = {
            id: "bad-job",
            status: "completed",
            game: {id: "a", version: "1.0.0"},
            requestedRounds: 1000,
            actualRounds: 1000,
            workers: 1,
            rtp: 0.5,
            hitFrequency: 0.3,
            maxWin: 50,
            startedAt: "2026-07-01T00:00:00.000Z",
            completedAt: "2026-07-01T00:00:05.000Z",
            durationMs: 500,
            hasWarnings: false,
        };
        const fetchImpl: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/reports/bad-job") {
                return new Promise((resolve) => {
                    releaseReport = () => resolve({ok: false, status: 500, json: () => Promise.resolve({error: "boom"})});
                });
            }
            if (path === "/api/project/reports") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([entry])});
            }
            const route = BASE_ROUTES[path];
            if (route) {
                const {ok, status, body} = route();
                return Promise.resolve({ok, status, json: () => Promise.resolve(body)});
            }
            return Promise.reject(new Error(`no fake route for ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);

        const recentRunsSection = screen.getByText("Recent runs").closest("fieldset") as HTMLElement;
        await user.click(within(recentRunsSection).getByRole("button", {name: "Open"}));
        await waitFor(() => expect(screen.getByText("Loading report…")).toBeInTheDocument());
        expect(screen.getByRole("button", {name: stepperStep("Export", "Download report")})).toBeDisabled();

        releaseReport?.();
        await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
        expect(screen.getByRole("button", {name: stepperStep("Export", "Download report")})).toBeDisabled();
    }, 45000);

    it("blocks Run again while a simulation is active instead of silently reattaching to the old job", async () => {
        const user = userEvent.setup();
        let runCallCount = 0;
        const entry: StudioSimulationReportListEntry = {
            id: "other-entry",
            status: "completed",
            game: {id: "a", version: "1.0.0"},
            requestedRounds: 5000,
            actualRounds: 5000,
            seed: "other-seed",
            workers: 1,
            rtp: 0.5,
            hitFrequency: 0.3,
            maxWin: 50,
            startedAt: "2026-08-01T00:00:00.000Z",
            completedAt: "2026-08-01T00:00:05.000Z",
            durationMs: 500,
            hasWarnings: false,
        };
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/reports": () => ({ok: true, status: 200, body: [entry]}),
            "/api/project/simulations": () => {
                runCallCount += 1;
                return {ok: true, status: 200, body: jobFor("active-job", {status: "running", roundsCompleted: 500})};
            },
            "/api/project/simulations/active-job": () => ({ok: true, status: 200, body: jobFor("active-job", {status: "running", roundsCompleted: 600})}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);

        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await waitFor(() => expect(runCallCount).toBe(1));

        const recentRunsSection = screen.getByText("Recent runs").closest("fieldset") as HTMLElement;
        await user.click(within(recentRunsSection).getByRole("button", {name: "Run again"}));

        expect(
            await screen.findByText("A simulation is already running for this project. Cancel it from the Run step before starting a different configuration."),
        ).toBeInTheDocument();
        expect(runCallCount).toBe(1);
    }, 45000);

    it("never lists the currently-open report in the compare picker", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const otherEntry: StudioSimulationReportListEntry = {
            id: "job-other",
            status: "completed",
            game: {id: "other-game", version: "2.0.0"},
            requestedRounds: 2000,
            actualRounds: 2000,
            workers: 1,
            rtp: 0.5,
            hitFrequency: 0.3,
            maxWin: 50,
            startedAt: "2026-09-01T00:00:00.000Z",
            completedAt: "2026-09-01T00:00:05.000Z",
            durationMs: 500,
            hasWarnings: false,
        };
        const currentEntry: StudioSimulationReportListEntry = {...otherEntry, id: "job-cur", game: {id: "a", version: "1.0.0"}};
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/reports": () => ({ok: true, status: 200, body: [otherEntry, currentEntry]}),
            "/api/project/reports/job-cur": () => ({ok: true, status: 200, body: reportDetailFor()}),
            "/api/project/simulations": () => ({ok: true, status: 200, body: jobFor("job-cur", {status: "queued", roundsCompleted: 0})}),
            "/api/project/simulations/job-cur": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-cur", {status: "running", roundsCompleted: 100})};
                }
                return {ok: true, status: 200, body: jobFor("job-cur", {status: "completed", report: reportFor()})};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);

        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await user.click(await screen.findByRole("button", {name: "Compare with another run"}, {timeout: 15000}));

        // "Compare with another run" is both the toggle button's own label and (once opened) the
        // PageSection's <legend> -- find the legend specifically to scope into the panel itself.
        const compareLegend = screen.getAllByText("Compare with another run").find((el) => el.tagName === "LEGEND") as HTMLElement;
        const comparePanel = compareLegend.closest("fieldset") as HTMLElement;
        expect(within(comparePanel).getByRole("button", {name: /other-game v2\.0\.0/})).toBeInTheDocument();
        expect(within(comparePanel).queryByRole("button", {name: /^a v1\.0\.0/})).not.toBeInTheDocument();
    }, 45000);
});
