import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
            await user.click(screen.getByRole("button", {name: "Simulation"}));
            expect(screen.getByRole("button", {name: stepperStep("Review", "See results")})).toHaveAttribute("aria-current", "step");
            expect(screen.queryByLabelText(/^Rounds/)).not.toBeInTheDocument();
            expect(screen.queryByText(/Captured simulation settings restored/)).not.toBeInTheDocument();
            expect(screen.getByText(new RegExp(`^Simulation ${status} —`)).parentElement).toHaveAttribute("data-pokie-lifecycle-result-durable-job", `replacement-${attempt}`);
            expect(screen.getByRole("button", {name: "Repeat simulation"})).toBeVisible();
            expect(submissions).toHaveLength(attempt);
            // A fresh explicit selection after consumption restores Configure
            // again, even when dispatched from a different project tab.
            await user.click(screen.getByRole("button", {name: "Overview"}));
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
            await user.click(screen.getByRole("button", {name: "Simulation"}));
            expect(screen.getByRole("button", {name: stepperStep("Review", "See results")})).toHaveAttribute("aria-current", "step");
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

    it("V35-RETRY-HANDOFF-LIFETIME preserves invalid and server-rejected settings through correction and subsequent successful reuse", async () => {
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
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/simulations": call => {
                submissions.push(JSON.parse(call.init!.body!));
                if (submissions.length === 1) return {ok: false, status: 400, body: {error: "Correct the worker setting."}};
                return {ok: true, status: 201, body: jobFor(`corrected-${submissions.length}`, {status: "queued", rounds: 1234})};
            },
            "/api/project/simulations/corrected-2": () => ({ok: true, status: 200, body: jobFor("corrected-2", {status: "cancelled", rounds: 1234})}),
            "/api/project/simulations/corrected-3": () => ({ok: true, status: 200, body: jobFor("corrected-3", {status: "cancelled", rounds: 1234})}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});
        await user.click(within(await screen.findByRole("region", {name: "simulation job invalid-retry"})).getByRole("button", {name: "Retry"}));
        expect(await screen.findByLabelText(/^Rounds/)).toHaveValue("5000000");
        expect(screen.getByLabelText(/^Rounds/)).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByRole("button", {name: "Run Simulation"})).toBeDisabled();
        await user.type(screen.getByLabelText(/^Rounds/), "{Enter}");
        expect(submissions).toHaveLength(0);
        await user.clear(screen.getByLabelText(/^Rounds/));
        await user.type(screen.getByLabelText(/^Rounds/), "1234");
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await screen.findByText(/This simulation request was rejected as invalid/);
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

    it("V35 selecting a different retained request clears absent optional fields instead of reusing the previous retry", async () => {
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
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/simulations": call => {
                const request = JSON.parse(call.init!.body!);
                submissions.push(request);
                return {ok: true, status: 201, body: jobFor("new-fixed", {...request, status: "queued"})};
            },
            "/api/project/simulations/new-fixed": () => ({ok: true, status: 200, body: jobFor("new-fixed", {rounds: 10, status: "cancelled"})}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});
        for (const i of [0, 1]) {
            const card = await screen.findByRole("region", {name: `simulation job retained-${i}`});
            await user.click(within(card).getByRole("button", {name: "Retry"}));
            expect(await screen.findByLabelText(/^Rounds/)).toHaveValue(String(requests[i].rounds));
        }
        expect(screen.queryByText(/Captured adaptive stopping/)).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await waitFor(() => expect(submissions).toEqual([requests[1]]));
        await screen.findByText(/^Simulation cancelled —/);
    });

});
