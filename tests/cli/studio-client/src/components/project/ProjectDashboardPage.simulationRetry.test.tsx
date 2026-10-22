import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {StudioSimulationJobView} from "../../../../../../cli/studio-client/src/api/types";
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
    it.each(["cancelled", "failed"] as const)("V35 retained %s card Retry exposes captured configuration and completes explicit replacement before and after remount", async status => {
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
            "/api/project/simulations/replacement-1": () => ({ok: true, status: 200, body: jobFor("replacement-1", {...request, status: "cancelled"})}),
            "/api/project/simulations/replacement-2": () => ({ok: true, status: 200, body: jobFor("replacement-2", {...request, status: "cancelled"})}),
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
            await user.click(screen.getByRole("button", {name: "Run Simulation"}));
            await waitFor(() => expect(submissions).toHaveLength(attempt));
            expect(submissions[attempt - 1]).toEqual(request);
            const receipt = await screen.findByText(/^Simulation cancelled —/);
            expect(receipt.parentElement).toHaveAttribute("data-pokie-lifecycle-result-durable-job", `replacement-${attempt}`);
        }
        rendered.unmount();
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
