import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {ProjectDashboardPage} from "../../../../../../cli/studio-client/src/components/project/ProjectDashboardPage";
import {createFakeFetch, createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

function baseFetchRoutes() {
    return {
        "/api/project/context": () => ({
            ok: true,
            status: 200,
            body: {status: "loaded", projectRoot: "/games/crazy-fruits", game: {id: "crazy-fruits", name: "Crazy Fruits", version: "1.0.0"}},
        }),
        "/api/project/inspect": () => ({
            ok: true,
            status: 200,
            body: {packageRoot: "/games/crazy-fruits", valid: true, packageJson: {name: "crazy-fruits", version: "1.0.0"}, generated: false},
        }),
        "/api/project/reports": () => ({ok: true, status: 200, body: []}),
        "/api/project/replays": () => ({ok: true, status: 200, body: []}),
        "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
        "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        "/api/project/validate": () => ({
            ok: true,
            status: 200,
            body: {packageRoot: "/games/crazy-fruits", valid: true, game: {id: "crazy-fruits", name: "Crazy Fruits", version: "1.0.0"}, errors: [], warnings: [], suggestions: []},
        }),
    };
}

describe("ProjectDashboardPage", () => {
    it("loads the project header and Overview tab, then switches tabs", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch(baseFetchRoutes());

        renderWithProviders(<ProjectDashboardPage />, {fetchImpl, initialEntries: ["/project"]});

        expect(await screen.findByRole("heading", {name: "Crazy Fruits"})).toBeInTheDocument();
        await waitFor(() => expect(screen.getAllByText("/games/crazy-fruits").length).toBeGreaterThan(0));

        await user.click(screen.getByRole("button", {name: "Validation"}));
        await user.click(screen.getByRole("button", {name: "Run Validate"}));

        await waitFor(() => {
            expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument();
        });
    });

    it("keeps a running simulation's polling alive across a tab switch", async () => {
        const user = userEvent.setup();
        let simulationPollCount = 0;
        const {fetchImpl} = createFakeFetch((call) => {
            const [path] = call.url.split("?");
            if (path === "/api/project/simulations") {
                return {
                    ok: true,
                    status: 201,
                    body: {id: "sim-1", status: "running", rounds: 100, workers: 1, startedAt: new Date().toISOString(), roundsCompleted: 0, durationMs: 0},
                };
            }
            if (path === "/api/project/simulations/sim-1") {
                simulationPollCount++;
                const completed = simulationPollCount >= 2;
                return {
                    ok: true,
                    status: 200,
                    body: {
                        id: "sim-1",
                        status: completed ? "completed" : "running",
                        rounds: 100,
                        workers: 1,
                        startedAt: new Date().toISOString(),
                        roundsCompleted: completed ? 100 : 50,
                        durationMs: 10,
                        report: completed
                            ? {
                                game: {id: "crazy-fruits", name: "Crazy Fruits", version: "1.0.0"},
                                requestedRounds: 100,
                                rounds: 100,
                                seed: null,
                                totalBet: 100,
                                totalWin: 90,
                                rtp: 0.9,
                                hitFrequency: 0.3,
                                maxWin: 50,
                                durationMs: 10,
                                spinsPerSecond: 10,
                                warnings: [],
                            }
                            : undefined,
                    },
                };
            }
            const routes = baseFetchRoutes();
            const route = routes[path as keyof typeof routes];
            if (route) {
                return route();
            }
            throw new Error(`no fake route for ${call.url}`);
        });

        renderWithProviders(<ProjectDashboardPage />, {fetchImpl, initialEntries: ["/project"]});
        await screen.findByRole("heading", {name: "Crazy Fruits"});

        await user.click(screen.getByRole("button", {name: "Simulation"}));
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));

        // Switch away from the Simulation tab while the job is still "running" -- the poll must keep
        // going in the background (see ProjectDashboardPage's own doc comment on why every tab's hook
        // lives at the page level, not inside the conditionally-rendered tab component).
        await user.click(screen.getByRole("button", {name: "Overview"}));

        await waitFor(() => expect(simulationPollCount).toBeGreaterThanOrEqual(2), {timeout: 3000});

        await user.click(screen.getByRole("button", {name: "Simulation"}));
        await waitFor(() => {
            expect(screen.getByText(/completed/)).toBeInTheDocument();
        });
    });
});
