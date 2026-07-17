import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {StudioSimulationJobView, SimulationReport, StudioSimulationReportListEntry} from "../../../../../../cli/studio-client/src/api/types";
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
                body: reportFor({
                    warnings: ['"reels" is unusually large.'],
                    recommendations: ["Increase --rounds (e.g. 10000+) for more stable RTP/hit-frequency estimates."],
                }),
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToSimulationTab(user);

        expect((screen.getByLabelText(/^Rounds/) as HTMLInputElement).value).toBe("10000");

        await user.click(screen.getByRole("button", {name: "Run Simulation"}));

        await waitFor(() => expect(screen.getByText(/RTP/)).toBeInTheDocument(), {timeout: 15000});
        expect(screen.getByRole("button", {name: stepperStep("Configure", "Set rounds")})).toBeInTheDocument();

        // The full report (warnings/recommendations included) is reachable via "Open full report" --
        // Mantine's Collapse keeps it mounted (keepMounted defaults to true) even while closed, so this
        // asserts reachability rather than DOM absence beforehand.
        await user.click(screen.getByRole("button", {name: "Open full report"}));
        await waitFor(() => expect(screen.getByText('"reels" is unusually large.')).toBeInTheDocument());
        expect(screen.getByText("Increase --rounds (e.g. 10000+) for more stable RTP/hit-frequency estimates.")).toBeInTheDocument();
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
            "/api/project/reports/old-job": () => ({ok: true, status: 200, body: reportFor({requestedRounds: 5000, rounds: 5000, seed: "old-seed", workers: 2})}),
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
        await waitFor(() => expect(screen.getByText(/94\.00%/)).toBeInTheDocument(), {timeout: 15000});

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
            "/api/project/reports/other-job": () => ({ok: true, status: 200, body: reportFor({requestedRounds: 20000, rounds: 20000, rtp: 0.97, seed: null})}),
            "/api/project/reports/job-4": () => ({ok: true, status: 200, body: reportFor()}),
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
            "/api/project/reports/job-5": () => ({ok: true, status: 200, body: reportFor()}),
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
            "/api/project/reports/job-6": () => ({ok: true, status: 200, body: reportFor()}),
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
});
