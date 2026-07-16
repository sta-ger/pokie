import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createFakeFetch, createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

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

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});

        expect(await screen.findByRole("heading", {name: "Crazy Fruits"})).toBeInTheDocument();
        await waitFor(() => expect(screen.getAllByText("/games/crazy-fruits").length).toBeGreaterThan(0));

        await user.click(screen.getByRole("button", {name: "Validate"}));
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

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "Crazy Fruits"});

        await user.click(screen.getByRole("button", {name: "Simulate"}));
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));

        // Switch away from the Simulation tab while the job is still "running" -- the poll must keep
        // going in the background (see ProjectDashboardPage's own doc comment on why every tab's hook
        // lives at the page level, not inside the conditionally-rendered tab component).
        await user.click(screen.getByRole("button", {name: "Overview"}));

        await waitFor(() => expect(simulationPollCount).toBeGreaterThanOrEqual(2), {timeout: 3000});

        await user.click(screen.getByRole("button", {name: "Simulate"}));
        await waitFor(() => {
            expect(screen.getByText(/completed/)).toBeInTheDocument();
        });
    });

    it("does not block the happy path on warnings-only validation -- Overview still recommends simulating", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...baseFetchRoutes(),
            "/api/project/validate": () => ({
                ok: true,
                status: 200,
                body: {
                    packageRoot: "/games/crazy-fruits",
                    valid: true,
                    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "1.0.0"},
                    errors: [],
                    warnings: [{code: "W1", message: "Consider adding a description."}],
                    suggestions: [],
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "Crazy Fruits"});

        await user.click(screen.getByRole("button", {name: "Validate project"}));
        await waitFor(() => expect(screen.getByText(/Valid, with warnings/)).toBeInTheDocument());

        // Back on Overview, the recommendation is to simulate -- not blocked by the warning.
        await user.click(screen.getByRole("button", {name: "Overview"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Run a simulation"})).toBeInTheDocument());
        expect(screen.queryByRole("button", {name: "Review validation"})).not.toBeInTheDocument();

        // The Simulate tab itself stays fully usable -- warnings never gate the actual action, only the
        // Overview recommendation's copy.
        await user.click(screen.getByRole("button", {name: "Simulate"}));
        expect(screen.getByRole("button", {name: "Run Simulation"})).toBeEnabled();

        await user.click(screen.getByRole("button", {name: "Validate"}));
        expect(screen.getByText(/Valid, with warnings/)).toBeInTheDocument();
    });

    it("a failed re-validation clears the stale successful result instead of leaving it displayed", async () => {
        const user = userEvent.setup();
        let validateCallCount = 0;
        const {fetchImpl} = createFakeFetch((call) => {
            const [path] = call.url.split("?");
            if (path === "/api/project/validate") {
                validateCallCount += 1;
                if (validateCallCount === 1) {
                    return {
                        ok: true,
                        status: 200,
                        body: {
                            packageRoot: "/games/crazy-fruits",
                            valid: true,
                            game: {id: "crazy-fruits", name: "Crazy Fruits", version: "1.0.0"},
                            errors: [],
                            warnings: [],
                            suggestions: [],
                        },
                    };
                }
                return {ok: false, status: 500, body: {error: "Internal error"}};
            }
            const routes = baseFetchRoutes();
            const route = routes[path as keyof typeof routes];
            if (route) {
                return route();
            }
            throw new Error(`no fake route for ${call.url}`);
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/validation"]});
        await screen.findByRole("heading", {name: "Crazy Fruits"});

        await user.click(screen.getByRole("button", {name: "Run Validate"}));
        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());

        await user.click(screen.getByRole("button", {name: "Run Validate"}));
        await waitFor(() => expect(screen.queryByText("Valid — no issues found.")).not.toBeInTheDocument());
        expect(await screen.findByText("Internal error")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Overview"}));
        expect(await screen.findByText("Validation failed")).toBeInTheDocument();
        expect(screen.queryByText("Valid — no issues found.")).not.toBeInTheDocument();
    });
});
