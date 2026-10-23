import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {SimulationReport, StudioSimulationJobView, StudioSimulationReportListEntry} from "../../../../../../cli/studio-client/src/api/types";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const BASE_ROUTES = {
    "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/a", game: {id: "a", name: "A", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
    "/api/project/gameModel": () => ({ok: true, status: 200, body: {betsAndModes: {status: "available", data: {availableBets: [0.05], betModes: []}}}}),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true, generated: false}}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
};

function jobFor(id: string, overrides: Partial<StudioSimulationJobView>): StudioSimulationJobView {
    return {id, status: "completed", rounds: 10000, workers: 1, startedAt: "2026-10-22T18:16:28.000Z", roundsCompleted: 10000, durationMs: 1200, ...overrides};
}

function stepperStep(label: string, description: string): RegExp {
    return new RegExp(`${label}.*${description}`);
}

describe("V35 retained simulation retry", () => {
    it.each(["cancelled", "failed"] as const)("V35-COMPLETED-RUN-AGAIN opens captured Configure without submitting, then preserves the explicit replacement's %s view", async status => {
        const user = userEvent.setup();
        const originalId = "1d305f0190f643efb76ef415ba7e2f22";
        const report: SimulationReport = {game: {id: "a", name: "A", version: "1.0.0"}, requestedRounds: 1, rounds: 1, seed: null,
            totalBet: 1, totalWin: 0, rtp: 0, hitFrequency: 0, maxWin: 0, durationMs: 2641, spinsPerSecond: 1,
            workers: 1, warnings: [], recommendations: []};
        const entry: StudioSimulationReportListEntry = {id: originalId, status: "completed", game: report.game,
            requestedRounds: 1, actualRounds: 1, rtp: 0, workers: 1, durationMs: 2641,
            startedAt: "2026-10-22T19:33:51.000Z", completedAt: "2026-10-22T19:33:54.000Z", hasWarnings: false};
        const submissions: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: submissions.length > 0 ? [entry] : []}),
            [`/api/project/reports/${originalId}`]: () => ({ok: true, status: 200, body: {report}}),
            "/api/project/simulations": call => {
                const submitted = JSON.parse(call.init!.body!);
                submissions.push(submitted);
                return {ok: true, status: 201, body: jobFor(submissions.length === 1 ? originalId : "explicit-replacement", {
                    ...submitted, status: "queued", roundsCompleted: 0,
                })};
            },
            [`/api/project/simulations/${originalId}`]: () => ({ok: true, status: 200, body: jobFor(originalId, {rounds: 1, roundsCompleted: 1, durationMs: 2641, report})}),
            "/api/project/simulations/explicit-replacement": () => ({ok: true, status: 200, body: jobFor("explicit-replacement", {rounds: 7, roundsCompleted: 0, status})}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});
        await user.clear(await screen.findByLabelText(/^Rounds/));
        await user.type(screen.getByLabelText(/^Rounds/), "1");
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await screen.findByText(/^Simulation completed —/);
        const recentRuns = screen.getByText("Recent runs").closest("fieldset")!;
        const runAgain = await within(recentRuns).findByRole("button", {name: "Run again"});
        for (let selection = 0; selection < 2; selection++) {
            await user.click(runAgain);
            expect(await screen.findByLabelText(/^Rounds/)).toHaveValue("1");
            expect(screen.getByRole("button", {name: stepperStep("Configure", "Set rounds")})).toHaveAttribute("aria-current", "step");
            expect(runAgain).toHaveFocus();
            expect(submissions).toEqual([{rounds: 1, workers: 1}]);
            expect(screen.getByText(/^Simulation completed —/).parentElement).toHaveAttribute("data-pokie-lifecycle-result-durable-job", originalId);
            await user.clear(screen.getByLabelText(/^Rounds/));
            await user.type(screen.getByLabelText(/^Rounds/), "7");
        }
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        const terminal = await screen.findByText(new RegExp(`^Simulation ${status} —`));
        expect(terminal.parentElement).toHaveAttribute("data-pokie-lifecycle-result-durable-job", "explicit-replacement");
        expect(submissions).toEqual([{rounds: 1, workers: 1}, {rounds: 7, workers: 1}]);
        await user.click(screen.getByRole("button", {name: "Overview"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page"));
        await user.click(screen.getByRole("button", {name: "Simulation"}));
        expect(await screen.findByRole("button", {name: stepperStep("Review", "See results")})).toHaveAttribute("aria-current", "step");
        expect(screen.queryByLabelText(/^Rounds/)).not.toBeInTheDocument();
        expect(screen.getByText(new RegExp(`^Simulation ${status} —`)).parentElement).toHaveAttribute("data-pokie-lifecycle-result-durable-job", "explicit-replacement");
        await user.click(screen.getByRole("button", {name: "Run again"}));
        expect(await screen.findByLabelText(/^Rounds/)).toHaveValue("1");
        await user.click(screen.getByRole("button", {name: "Open latest report"}));
        await screen.findByRole("button", {name: "Open full report"});
        await user.click(screen.getByRole("button", {name: "Overview"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page"));
        await user.click(screen.getByRole("button", {name: "Simulation"}));
        expect(await screen.findByRole("button", {name: stepperStep("Review", "See results")})).toHaveAttribute("aria-current", "step");
        expect(screen.queryByText(/Captured simulation settings restored/)).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: stepperStep("Export", "Download report")}));
        expect(screen.getByRole("link", {name: "Download JSON"})).toHaveAttribute("href", `/api/project/reports/${originalId}/download?format=json`);
        await user.click(screen.getByRole("button", {name: "Run again"}));
        expect(await screen.findByLabelText(/^Rounds/)).toHaveValue("1");
        expect(submissions).toHaveLength(2);
    });

    it.each(["ante", "all"])("V35-COMPLETED-RUN-AGAIN retains the requested adaptive %s budget and optional settings until explicit submission", async modeName => {
        const user = userEvent.setup();
        const convergence = {minRounds: 2, rtpTolerance: 0.01, checkIntervalRounds: 2};
        const request = {rounds: 100, seed: "retained-seed", workers: 2, modeName, convergence};
        const submissions: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: [{
                id: "adaptive", status: "completed", game: {id: "a", version: "1.0.0"},
                requestedRounds: request.rounds, actualRounds: modeName === "all" ? undefined : 4,
                seed: request.seed, workers: request.workers, modeName, convergence,
                modes: modeName === "all" ? {base: {rounds: 4}, ante: {rounds: 6}} : undefined,
                durationMs: 1, startedAt: "2026-10-22T12:00:00.000Z", completedAt: "2026-10-22T12:00:00.001Z", hasWarnings: false,
            }]}),
            "/api/project/simulations": call => {
                const submitted = JSON.parse(call.init!.body!);
                submissions.push(submitted);
                return {ok: true, status: 201, body: jobFor("adaptive-replacement", {status: "queued", ...submitted})};
            },
            "/api/project/simulations/adaptive-replacement": () => ({ok: true, status: 200, body: jobFor("adaptive-replacement", {status: "cancelled", ...request})}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});
        await user.click(await screen.findByRole("button", {name: "Run again"}));
        expect(await screen.findByLabelText(/^Rounds/)).toHaveValue("100");
        expect(screen.getByLabelText("Seed (optional)")).toHaveValue("retained-seed");
        expect(screen.getByLabelText(/^Workers/)).toHaveValue("2");
        expect(screen.getByText(/Captured adaptive stopping/)).toHaveTextContent("stable checks 3");
        expect(submissions).toHaveLength(0);
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await screen.findByText(/^Simulation cancelled —/);
        expect(submissions).toEqual([request]);
        expect(convergence).not.toHaveProperty("stableChecks");
    });

    it.each(["cancelled", "failed"] as const)("V35-RETRY-HANDOFF-LIFETIME retained %s Retry is reusable while consumed handoffs cannot override replacement terminal navigation", async status => {
        const user = userEvent.setup();
        const request = {rounds: 2000000, workers: 1};
        const submissions: unknown[] = [];
        const retained = {
            id: "0aeeb088f0e14f35a9d5d9e24f113e22", projectId: "/games/a", operation: "simulation",
            request, conflictKey: "simulation:/games/a", status, createdAt: 1,
            recovery: {action: "retry", reason: "Run the simulation again with the captured parameters."},
        };
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [retained]}}),
            [`/api/project/simulations/${retained.id}`]: () => ({ok: true, status: 200, body: jobFor(retained.id, {
                ...request, status, roundsCompleted: 14000, durationMs: 14090,
            })}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/simulations": call => {
                const submitted = JSON.parse(call.init!.body!);
                submissions.push(submitted);
                return {ok: true, status: 201, body: jobFor(`replacement-${submissions.length}`, {status: "queued", roundsCompleted: 0, ...submitted})};
            },
            "/api/project/simulations/replacement-1": () => ({ok: true, status: 200, body: jobFor("replacement-1", {...request, rounds: 1234, status})}),
            "/api/project/simulations/replacement-2": () => ({ok: true, status: 200, body: jobFor("replacement-2", {...request, rounds: 1234, status})}),
        });
        let rendered = renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});
        for (const attempt of [1, 2]) {
            if (attempt === 2) {
                rendered.unmount();
                rendered = renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});
            }
            await screen.findByText(new RegExp(`^Simulation ${status} —`));
            // The retained failure was the common card's Retry while Review was mounted.
            await user.click(screen.getByRole("button", {name: stepperStep("Review", "See results")}));
            expect(screen.queryByLabelText(/^Rounds/)).not.toBeInTheDocument();
            const card = await screen.findByRole("region", {name: `simulation job ${retained.id}`});
            const retry = within(card).getByRole("button", {name: "Retry"});
            await user.click(retry);
            expect(await screen.findByLabelText(/^Rounds/)).toHaveValue("2000000");
            expect(screen.getByText("Captured simulation settings restored. Review them and choose Run Simulation to retry.")).toBeVisible();
            expect(retry).toHaveFocus();
            expect(submissions).toHaveLength(attempt - 1);
            // Selecting the same card again must also restore the captured values.
            await user.clear(screen.getByLabelText(/^Rounds/));
            await user.type(screen.getByLabelText(/^Rounds/), "7");
            await user.click(retry);
            expect(await screen.findByLabelText(/^Rounds/)).toHaveValue("2000000");
            // The replacement owns a different budget, so a replay of the
            // original handoff cannot masquerade as its terminal result.
            await user.clear(screen.getByLabelText(/^Rounds/));
            await user.type(screen.getByLabelText(/^Rounds/), "1234");
            await user.click(screen.getByRole("button", {name: "Run Simulation"}));
            await waitFor(() => expect(submissions).toHaveLength(attempt));
            expect(submissions[attempt - 1]).toEqual({...request, rounds: 1234});
            const receipt = await screen.findByText(new RegExp(`^Simulation ${status} —`));
            expect(receipt.parentElement).toHaveAttribute("data-pokie-lifecycle-result-durable-job", `replacement-${attempt}`);
            await user.click(screen.getByRole("button", {name: "Overview"}));
            await waitFor(() => expect(screen.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page"));
            await user.click(screen.getByRole("button", {name: "Simulation"}));
            expect(await screen.findByRole("button", {name: stepperStep("Review", "See results")})).toHaveAttribute("aria-current", "step");
            expect(screen.queryByLabelText(/^Rounds/)).not.toBeInTheDocument();
            expect(screen.queryByText(/Captured simulation settings restored/)).not.toBeInTheDocument();
            expect(screen.getByText(new RegExp(`^Simulation ${status} —`)).parentElement).toHaveAttribute("data-pokie-lifecycle-result-durable-job", `replacement-${attempt}`);
            expect(screen.getByRole("button", {name: "Repeat simulation"})).toBeVisible();
            expect(submissions).toHaveLength(attempt);
            // A fresh explicit selection after consumption restores Configure
            // again, even when dispatched from a different project tab.
            await user.click(screen.getByRole("button", {name: "Overview"}));
            await waitFor(() => expect(screen.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page"));
            await user.click(within(screen.getByRole("region", {name: `simulation job ${retained.id}`})).getByRole("button", {name: "Retry"}));
            expect(await screen.findByLabelText(/^Rounds/)).toHaveValue("2000000");
            expect(submissions).toHaveLength(attempt);
        }
        rendered.unmount();
    });

    it.each(["cancelled", "failed"] as const)("V35-RETRY-HANDOFF-LIFETIME historical report selection consumes the earlier %s handoff and survives revisiting", async status => {
        const user = userEvent.setup();
        const report: SimulationReport = {game: {id: "a", name: "A", version: "1.0.0"}, requestedRounds: 100, rounds: 100, seed: null,
            totalBet: 100, totalWin: 96, rtp: 0.96, hitFrequency: 0.25, maxWin: 10, durationMs: 1200, spinsPerSecond: 80,
            workers: 1, warnings: [], recommendations: []};
        const entry: StudioSimulationReportListEntry = {id: "historic", status: "completed", game: report.game,
            requestedRounds: 100, actualRounds: 100, rtp: 0.96, workers: 1, durationMs: 1200, seed: null,
            startedAt: "2026-10-22T12:00:00.000Z", completedAt: "2026-10-22T12:00:01.200Z", hasWarnings: false};
        const retained = {id: "old-retry", projectId: "/games/a", operation: "simulation", request: {rounds: 2000000},
            conflictKey: "simulation:/games/a", status, createdAt: 1, recovery: {action: "retry", reason: "Review captured settings."}};
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [retained]}}),
            "/api/project/simulations/old-retry": () => ({ok: true, status: 200, body: jobFor("old-retry", {status, rounds: 2000000})}),
            "/api/project/reports": () => ({ok: true, status: 200, body: [entry]}),
            "/api/project/reports/historic": () => ({ok: true, status: 200, body: {report}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});
        await screen.findByText(new RegExp(`^Simulation ${status} —`));
        await user.click(within(await screen.findByRole("region", {name: "simulation job old-retry"})).getByRole("button", {name: "Retry"}));
        expect(await screen.findByLabelText(/^Rounds/)).toHaveValue("2000000");
        await user.click(await screen.findByRole("button", {name: "Open latest report"}));
        await screen.findByText("96.00%");
        for (let revisit = 0; revisit < 2; revisit++) {
            await user.click(screen.getByRole("button", {name: "Overview"}));
            await waitFor(() => expect(screen.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page"));
            await user.click(screen.getByRole("button", {name: "Simulation"}));
            expect(await screen.findByRole("button", {name: stepperStep("Review", "See results")})).toHaveAttribute("aria-current", "step");
            expect(screen.getByText("96.00%")).toBeVisible();
            await user.click(screen.getByRole("button", {name: stepperStep("Export", "Download report")}));
            expect(screen.getByRole("link", {name: "Download JSON"})).toHaveAttribute("href", "/api/project/reports/historic/download?format=json");
            expect(screen.queryByLabelText(/^Rounds/)).not.toBeInTheDocument();
            expect(screen.queryByText(/Captured simulation settings restored/)).not.toBeInTheDocument();
        }
        expect(calls.filter(call => call.url === "/api/project/simulations" && call.init?.method === "POST")).toHaveLength(0);
        await user.click(within(screen.getByRole("region", {name: "simulation job old-retry"})).getByRole("button", {name: "Retry"}));
        expect(await screen.findByLabelText(/^Rounds/)).toHaveValue("2000000");
    });

    it.each(["common-card", "recent-report"])("V35-RETRY-HANDOFF-LIFETIME %s preserves invalid and server-rejected settings through correction and subsequent successful reuse", async surface => {
        const user = userEvent.setup();
        const request = {rounds: 5000000, workers: 2, seed: "captured-seed"};
        const submissions: unknown[] = [];
        const retained = {id: "invalid-retry", projectId: "/games/a", operation: "simulation", request,
            conflictKey: "simulation:/games/a", status: "cancelled", createdAt: 1,
            recovery: {action: "retry", reason: "Review captured settings."}};
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [retained]}}),
            "/api/project/simulations/invalid-retry": () => ({ok: true, status: 200, body: jobFor("invalid-retry", {...request, status: "cancelled"})}),
            "/api/project/reports": () => ({ok: true, status: 200, body: surface === "recent-report" ? [{
                id: "oversized-history", status: "completed", game: {id: "a", version: "1.0.0"}, requestedRounds: request.rounds,
                actualRounds: 5, seed: request.seed, workers: request.workers, durationMs: 1,
                startedAt: "2026-10-22T12:00:00.000Z", completedAt: "2026-10-22T12:00:00.001Z", hasWarnings: false,
            }] : []}),
            "/api/project/simulations": call => {
                submissions.push(JSON.parse(call.init!.body!));
                if (submissions.length === 1) return {ok: false, status: 400, body: {error: "Correct the worker setting."}};
                return {ok: true, status: 201, body: jobFor(`corrected-${submissions.length}`, {status: "queued", rounds: 1234})};
            },
            "/api/project/simulations/corrected-2": () => ({ok: true, status: 200, body: jobFor("corrected-2", {status: "cancelled", rounds: 1234})}),
            "/api/project/simulations/corrected-3": () => ({ok: true, status: 200, body: jobFor("corrected-3", {status: "cancelled", rounds: 1234})}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});
        const recover = surface === "common-card"
            ? within(await screen.findByRole("region", {name: "simulation job invalid-retry"})).getByRole("button", {name: "Retry"})
            : await screen.findByRole("button", {name: "Run again"});
        await user.click(recover);
        expect(await screen.findByLabelText(/^Rounds/)).toHaveValue("5000000");
        expect(screen.getByLabelText(/^Rounds/)).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByRole("button", {name: "Run Simulation"})).toBeDisabled();
        await user.type(screen.getByLabelText(/^Rounds/), "{Enter}");
        expect(submissions).toHaveLength(0);
        await user.clear(screen.getByLabelText(/^Rounds/));
        await user.type(screen.getByLabelText(/^Rounds/), "1234");
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await screen.findByText("This simulation request couldn't be completed. Try again. If it continues, reopen the project and retry.");
        expect(screen.getByLabelText(/^Rounds/)).toHaveValue("1234");
        expect(screen.getByLabelText("Seed (optional)")).toHaveValue("captured-seed");
        expect(screen.getByLabelText(/^Workers/)).toHaveValue("2");
        expect(screen.queryByText(/Captured simulation settings restored/)).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Show advanced details (seed, workers)"}));
        await user.clear(screen.getByLabelText(/^Workers/));
        await user.type(screen.getByLabelText(/^Workers/), "1");
        for (const attempt of [2, 3]) {
            await user.click(screen.getByRole("button", {name: "Run Simulation"}));
            await waitFor(() => expect(submissions).toHaveLength(attempt));
            const receipt = await screen.findByText(/^Simulation cancelled —/);
            expect(receipt.parentElement).toHaveAttribute("data-pokie-lifecycle-result-durable-job", `corrected-${attempt}`);
            expect(submissions[attempt - 1]).toEqual({...request, rounds: 1234, workers: 1});
            await user.click(screen.getByRole("button", {name: "Back to configuration"}));
            expect(screen.getByLabelText(/^Rounds/)).toHaveValue("1234");
        }
    });

    it.each(["common-card", "recent-report"])("V35 %s selection clears absent optional fields instead of reusing the previous retry", async surface => {
        const user = userEvent.setup();
        const convergence = {minRounds: 2, rtpTolerance: 0.01, checkIntervalRounds: 2, stableChecks: 1};
        const requests = [{rounds: 100, seed: "old", workers: 2, modeName: "all", convergence}, {rounds: 10, workers: 1}];
        const jobs = requests.map((request, i) => ({id: `retained-${i}`, projectId: "/games/a", operation: "simulation", request,
            conflictKey: "simulation:/games/a", status: "cancelled", createdAt: i,
            recovery: {action: "retry", reason: "Run the simulation again with the captured parameters."}}));
        const submissions: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs}}),
            "/api/project/simulations/retained-0": () => ({ok: true, status: 200, body: jobFor("retained-0", {...requests[0], status: "cancelled"})}),
            "/api/project/reports": () => ({ok: true, status: 200, body: surface === "recent-report" ? requests.map((request, i) => ({
                id: `report-${i}`, status: "completed", game: {id: "a", version: "1.0.0"}, requestedRounds: request.rounds,
                actualRounds: i === 0 ? undefined : 10, workers: request.workers,
                seed: request.seed, modeName: request.modeName, convergence: request.convergence,
                durationMs: 1, startedAt: "2026-10-22T12:00:00.000Z", completedAt: "2026-10-22T12:00:00.001Z", hasWarnings: false,
            })) : []}),
            "/api/project/simulations": call => {
                const request = JSON.parse(call.init!.body!);
                submissions.push(request);
                return {ok: true, status: 201, body: jobFor(submissions.length === 1 ? "new-fixed" : "new-repeat", {...request, status: "queued"})};
            },
            "/api/project/simulations/new-fixed": () => ({ok: true, status: 200, body: jobFor("new-fixed", {rounds: 10, status: "cancelled"})}),
            "/api/project/simulations/new-repeat": () => ({ok: true, status: 200, body: jobFor("new-repeat", {rounds: 10, status: "cancelled"})}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});
        for (const i of [0, 1]) {
            const recover = surface === "common-card"
                ? within(await screen.findByRole("region", {name: `simulation job retained-${i}`})).getByRole("button", {name: "Retry"})
                : (await screen.findAllByRole("button", {name: "Run again"}))[i];
            await user.click(recover);
            expect(await screen.findByLabelText(/^Rounds/)).toHaveValue(String(requests[i].rounds));
            expect(screen.getByLabelText("Seed (optional)")).toHaveValue(requests[i].seed ?? "");
            expect(screen.getByLabelText(/^Workers/)).toHaveValue(String(requests[i].workers));
            if (i === 0) expect(screen.getByText(/Captured adaptive stopping/)).toHaveTextContent("stable checks 1");
            expect(submissions).toHaveLength(0);
        }
        expect(screen.queryByText(/Captured adaptive stopping/)).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await waitFor(() => expect(submissions).toEqual([requests[1]]));
        await screen.findByText(/^Simulation cancelled —/);
        // Feature Repeat uses the hook's current captured execution, and
        // consumes a pending common-card handoff just as Configure Run does.
        await user.click(within(screen.getByRole("region", {name: "simulation job retained-1"})).getByRole("button", {name: "Retry"}));
        expect(await screen.findByLabelText(/^Rounds/)).toHaveValue("10");
        await user.click(screen.getByRole("button", {name: stepperStep("Review", "See results")}));
        await user.click(screen.getByRole("button", {name: "Repeat simulation"}));
        const receipt = await screen.findByText(/^Simulation retry cancelled —/);
        expect(receipt.parentElement).toHaveAttribute("data-pokie-lifecycle-result-durable-job", "new-repeat");
        expect(submissions).toEqual([requests[1], requests[1]]);
        await user.click(screen.getByRole("button", {name: "Overview"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page"));
        await user.click(screen.getByRole("button", {name: "Simulation"}));
        expect(await screen.findByRole("button", {name: stepperStep("Review", "See results")})).toHaveAttribute("aria-current", "step");
        expect(screen.queryByLabelText(/^Rounds/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Captured simulation settings restored/)).not.toBeInTheDocument();
    });

});


describe("V35-RELOAD-DISCOVERY-STATUS", () => {
    const response = (body: unknown) => ({ok: true, status: 200, json: () => Promise.resolve(body)});
    const retained = {id: "restored-simulation", projectId: "/games/a", operation: "simulation", request: {rounds: 2000000},
        conflictKey: "simulation:/games/a", status: "running", createdAt: 1};

    it("explains delayed list then delayed detail, rejects early form submission, and reattaches the same cancellable job", async () => {
        let resolveList: ((value: ReturnType<typeof response>) => void) | undefined;
        let resolveDetail: ((value: ReturnType<typeof response>) => void) | undefined;
        const list = new Promise<ReturnType<typeof response>>(resolve => {
            resolveList = resolve;
        });
        const detail = new Promise<ReturnType<typeof response>>(resolve => {
            resolveDetail = resolve;
        });
        const base = createRoutedFakeFetch({...BASE_ROUTES, "/api/project/reports": () => ({ok: true, status: 200, body: []})});
        const writes: string[] = [];
        const fetchImpl: FetchLike = (url, init) => {
            if (init?.method === "POST" && (url.includes("/simulations") || url.includes("/jobs/"))) writes.push(url);
            if (url === "/api/project/jobs") return list;
            if (url === `/api/project/jobs/${retained.id}`) return Promise.resolve(response(retained));
            if (url === `/api/project/simulations/${retained.id}`) return detail;
            return base.fetchImpl(url, init);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});
        const run = await screen.findByRole("button", {name: "Run Simulation"});
        expect(run).toBeDisabled();
        expect(screen.getAllByText("Checking for retained simulations…").length).toBeGreaterThan(0);
        expect(screen.queryByText("Simulation ready")).not.toBeInTheDocument();
        fireEvent.submit(run.closest("form")!);
        expect(writes).toEqual([]);
        await act(async () => {
            resolveList?.(response({jobs: [retained]}));
            await Promise.resolve();
        });
        await waitFor(() => expect(screen.getAllByText("Reattaching to retained simulation; waiting for its details…").length).toBeGreaterThan(0));
        expect(run).toBeDisabled();
        expect(screen.queryByText("Simulation ready")).not.toBeInTheDocument();
        fireEvent.submit(run.closest("form")!);
        expect(writes).toEqual([]);
        await act(async () => {
            resolveDetail?.(response(jobFor(retained.id, {status: "running", rounds: 2000000, roundsCompleted: 26000})));
            await Promise.resolve();
        });
        await within(screen.getByRole("region", {name: "Simulation workflow"})).findByRole("button", {name: "Cancel"});
        expect(screen.queryByText("Reattaching to retained simulation; waiting for its details…")).not.toBeInTheDocument();
        expect(writes).toEqual([]);
    });

    it("keeps discovery rejection truthful, reconnects to empty and enables only explicit Run", async () => {
        let offline = true;
        const base = createRoutedFakeFetch({...BASE_ROUTES, "/api/project/reports": () => ({ok: true, status: 200, body: []})});
        const writes: string[] = [];
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/jobs") return offline ? Promise.reject(new Error("discovery unavailable")) : Promise.resolve(response({jobs: []}));
            if (url === "/api/project/simulations") {
                writes.push(url);
                return Promise.resolve(response(jobFor("explicit", {status: "queued"})));
            }
            if (url === "/api/project/simulations/explicit") return Promise.resolve(response(jobFor("explicit", {status: "failed", error: "Execution rejected"})));
            return base.fetchImpl(url, init);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});
        await screen.findByText(/discovery unavailable/);
        expect(screen.getByRole("button", {name: "Run Simulation"})).toBeDisabled();
        expect(screen.getAllByText("Cannot check retained simulations. Reconnect to Studio before starting another run.").length).toBeGreaterThan(0);
        expect(screen.queryByText("Simulation ready")).not.toBeInTheDocument();
        offline = false;
        await userEvent.click(screen.getByRole("button", {name: "Reattach to retained work"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Run Simulation"})).toBeEnabled());
        expect(writes).toEqual([]);
        await userEvent.click(screen.getByRole("button", {name: "Run Simulation"}));
        await screen.findByText(/^Simulation failed —/);
        expect(writes).toEqual(["/api/project/simulations"]);
    });

    it("retains the reattachment wait after detail failure and reconnects without enabling a competing run", async () => {
        let details = 0;
        let finishDetail: ((value: ReturnType<typeof response>) => void) | undefined;
        const base = createRoutedFakeFetch({...BASE_ROUTES, "/api/project/reports": () => ({ok: true, status: 200, body: []})});
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/jobs") return Promise.resolve(response({jobs: [retained]}));
            if (url === `/api/project/jobs/${retained.id}`) return Promise.resolve(response(retained));
            if (url === `/api/project/simulations/${retained.id}`) {
                if (++details === 1) return Promise.reject(new Error("detail unavailable"));
                return new Promise(resolve => {
                    finishDetail = resolve;
                });
            }
            expect(url).not.toBe("/api/project/simulations");
            return base.fetchImpl(url, init);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});
        await screen.findByText(/Cannot observe this simulation.*detail unavailable/);
        expect(screen.getByRole("button", {name: "Run Simulation"})).toBeDisabled();
        expect(screen.getAllByText("Reattaching to retained simulation; waiting for its details…").length).toBeGreaterThan(0);
        await waitFor(() => expect(finishDetail).toBeDefined());
        await act(async () => {
            finishDetail?.(response(jobFor(retained.id, {status: "cancelled", roundsCompleted: 100})));
            await Promise.resolve();
        });
        await screen.findByText(/^Simulation cancelled —/);
        expect(screen.queryByText(/Cannot observe this simulation/)).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Repeat simulation"})).toBeEnabled();
    });

    it("does not let an old project's delayed detail settle the new project's unresolved discovery", async () => {
        let currentRoot = "/games/a";
        let finishOldDetail: ((value: ReturnType<typeof response>) => void) | undefined;
        let finishNewList: ((value: ReturnType<typeof response>) => void) | undefined;
        const newList = new Promise<ReturnType<typeof response>>(resolve => {
            finishNewList = resolve;
        });
        const base = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: currentRoot,
                game: {id: "current", name: "Current", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
        });
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/jobs") return currentRoot === "/games/a" ? Promise.resolve(response({jobs: [retained]})) : newList;
            if (url === `/api/project/jobs/${retained.id}`) return Promise.resolve(response(retained));
            if (url === `/api/project/simulations/${retained.id}`) return new Promise(resolve => {
                finishOldDetail = resolve;
            });
            expect(url).not.toBe("/api/project/simulations");
            return base.fetchImpl(url, init);
        };
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/%2Fgames%2Fa/simulation"]});
        await waitFor(() => expect(finishOldDetail).toBeDefined());
        currentRoot = "/games/b";
        await act(async () => {
            await router.navigate("/project/%2Fgames%2Fb/simulation");
        });
        await screen.findByRole("button", {name: "Run Simulation"});
        await act(async () => {
            finishOldDetail?.(response(jobFor(retained.id, {status: "cancelled"})));
            await Promise.resolve();
        });
        expect(screen.getByRole("button", {name: "Run Simulation"})).toBeDisabled();
        expect(screen.getAllByText("Checking for retained simulations…").length).toBeGreaterThan(0);
        expect(screen.queryByText(/^Simulation cancelled/)).not.toBeInTheDocument();
        expect(screen.queryByRole("region", {name: `simulation job ${retained.id}`})).not.toBeInTheDocument();
        await act(async () => {
            finishNewList?.(response({jobs: []}));
            await Promise.resolve();
        });
        await waitFor(() => expect(screen.getByRole("button", {name: "Run Simulation"})).toBeEnabled());
    });

    it("lets explicit terminal Retry supersede delayed historical detail without submitting or replaying it over Configure", async () => {
        let finishDetail: ((value: ReturnType<typeof response>) => void) | undefined;
        const terminal = {...retained, status: "cancelled", recovery: {action: "retry", reason: "Run again with captured parameters."}};
        const base = createRoutedFakeFetch({...BASE_ROUTES, "/api/project/reports": () => ({ok: true, status: 200, body: []})});
        const writes: unknown[] = [];
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/jobs") return Promise.resolve(response({jobs: [terminal]}));
            if (url === `/api/project/simulations/${retained.id}`) return new Promise(resolve => {
                finishDetail = resolve;
            });
            if (url === "/api/project/simulations") {
                writes.push(JSON.parse(init!.body!));
                return Promise.resolve(response(jobFor("replacement", {status: "queued"})));
            }
            if (url === "/api/project/simulations/replacement") return Promise.resolve(response(jobFor("replacement", {status: "failed"})));
            return base.fetchImpl(url, init);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});
        const card = await screen.findByRole("region", {name: `simulation job ${retained.id}`});
        await waitFor(() => expect(finishDetail).toBeDefined());
        expect(screen.getByRole("button", {name: "Run Simulation"})).toBeDisabled();
        await userEvent.click(within(card).getByRole("button", {name: "Retry"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Run Simulation"})).toBeEnabled());
        expect(screen.getByLabelText(/^Rounds/)).toHaveValue("2000000");
        await act(async () => {
            finishDetail?.(response(jobFor(retained.id, {status: "cancelled", rounds: 123})));
            await Promise.resolve();
        });
        expect(screen.getByLabelText(/^Rounds/)).toHaveValue("2000000");
        expect(screen.getByRole("button", {name: "Run Simulation"})).toBeEnabled();
        expect(writes).toEqual([]);
        await userEvent.click(screen.getByRole("button", {name: "Run Simulation"}));
        await screen.findByText(/^Simulation failed —/);
        expect(writes).toEqual([{rounds: 2000000, workers: 1}]);
    });

});
