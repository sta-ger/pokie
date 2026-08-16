import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../testUtils/renderRoutedApp";

// Exercises the full human-centered happy path end to end, across a real cross-page navigation: land on
// Home's default "Design Game" tab -> start from its validated Recommended model -> create and open a
// managed Blueprint Project -> run a simulation -> its own Review step auto-opens the resulting report.
// Every screen/hook/API call used here is the app's real, already-tested production code -- this test
// only wires a fake fetch across the whole scenario, it doesn't re-implement any of it.
describe("Studio happy path: recommended model -> create project -> simulate -> report", () => {
    // This is the longest test in the suite (many sequential steps plus two real-timer simulation-poll
    // waits) -- even the project's raised 60000ms global testTimeout leaves too little headroom under
    // concurrent Jest workers (these real-timer tests are wall-clock-bound, so CPU starvation from a
    // sibling heavy suite stretches them 2-4x), matching the same parallel-worker contention documented
    // for the other real-timer tests here (see setupTests.ts's asyncUtilTimeout) -- so this test gets
    // its own much longer timeout.
    it("walks the full guided flow end to end", async () => {
        const user = userEvent.setup();
        let simulationPollCount = 0;

        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            const method = init?.method ?? "GET";

            // Startup handshake: "/" resolves the server's mode before landing (see StudioLanding).
            // This flow is the home-mode one, which is what puts step 1 below on Home.
            if (path === "/api/context") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({mode: "home"})});
            }

            if (path === "/api/home/projects/registry" && method === "GET") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
            }
            if (path === "/api/home/blueprints/validate" && method === "POST") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", warnings: []})});
            }
            if (path === "/api/home/blueprints/save-managed" && method === "POST") {
                return Promise.resolve({
                    ok: true,
                    status: 201,
                    json: () =>
                        Promise.resolve({
                            status: "ok",
                            path: "/projects/starter-slot/blueprint.json",
                            name: "starter-slot",
                            blueprintHash: "starter-hash",
                            registeredProject: {
                                location: "/projects/starter-slot/blueprint.json",
                                name: "Starter Slot",
                                type: "blueprint",
                                capabilities: ["runtime.execute"],
                                origin: "managed",
                                status: "ok",
                            },
                        }),
                });
            }
            if (path === "/api/home/projects/open" && method === "POST") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            context: {mode: "project", projectRoot: "/projects/starter-slot"},
                            manifest: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"},
                        }),
                });
            }
            if (path === "/api/project/context") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            status: "loaded",
                            projectRoot: "/projects/starter-slot",
                            game: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"},
                            type: "blueprint",
                            capabilities: ["blueprint.build"],
                        }),
                });
            }
            if (path === "/api/project/inspect") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            packageRoot: "/projects/starter-slot",
                            valid: true,
                            packageJson: {name: "starter-slot", version: "0.1.0"},
                            buildInfo: {
                                blueprintHash: "abc123",
                                source: "in-memory-blueprint",
                                pokieVersion: "1.0.0",
                                generatedAt: new Date().toISOString(),
                                files: [],
                            },
                        }),
                });
            }
            if (path === "/api/project/validate") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            packageRoot: "/projects/starter-slot",
                            valid: true,
                            game: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"},
                            errors: [],
                            warnings: [],
                            suggestions: [],
                        }),
                });
            }
            if (path === "/api/project/reports" && method === "GET") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
            }
            if (path === "/api/project/replays") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
            }
            if (path === "/api/project/deployment/targets") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
            }
            if (path === "/api/project/simulations" && method === "POST") {
                return Promise.resolve({
                    ok: true,
                    status: 201,
                    json: () =>
                        Promise.resolve({
                            id: "sim-1",
                            status: "running",
                            rounds: 1000,
                            workers: 1,
                            startedAt: new Date().toISOString(),
                            roundsCompleted: 0,
                            durationMs: 0,
                        }),
                });
            }
            if (path === "/api/project/simulations/sim-1") {
                simulationPollCount += 1;
                const completed = simulationPollCount >= 2;
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            id: "sim-1",
                            status: completed ? "completed" : "running",
                            rounds: 1000,
                            workers: 1,
                            startedAt: new Date().toISOString(),
                            roundsCompleted: completed ? 1000 : 500,
                            durationMs: 10,
                            report: completed
                                ? {
                                    game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                                    requestedRounds: 1000,
                                    rounds: 1000,
                                    seed: null,
                                    totalBet: 1000,
                                    totalWin: 950,
                                    rtp: 0.95,
                                    hitFrequency: 0.3,
                                    maxWin: 100,
                                    durationMs: 10,
                                    spinsPerSecond: 100,
                                    warnings: [],
                                }
                                : undefined,
                        }),
                });
            }
            if (path === "/api/project/reports/sim-1") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            report: {
                                game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                                requestedRounds: 1000,
                                rounds: 1000,
                                seed: null,
                                totalBet: 1000,
                                totalWin: 950,
                                rtp: 0.95,
                                hitFrequency: 0.3,
                                maxWin: 100,
                                durationMs: 10,
                                spinsPerSecond: 100,
                                warnings: [],
                            },
                        }),
                });
            }
            return Promise.reject(new Error(`no fake route for ${method} ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/"]});

        // 1. Land on Home's default "Design Game" tab. It starts from a playable Recommended model.
        // Awaited rather than immediate: "/" resolves the server mode first, so Home appears a tick later.
        expect(await screen.findByRole("heading", {name: "Design Your Game"})).toBeInTheDocument();
        expect(screen.getByLabelText("Game name")).toHaveValue("Starter Slot");

        // 2. Automatic validation makes the Recommended model ready without a Configure -> Validate ->
        // Build sequence or an artifact destination.
        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());
        expect(screen.queryByRole("button", {name: "Validate"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Build Package"})).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Output directory (optional)")).not.toBeInTheDocument();

        // 3. Create atomically persists/registers the managed Blueprint Project and opens its Workspace.
        await user.click(screen.getByRole("button", {name: "Create Project"}));
        expect(await screen.findByRole("heading", {name: "Starter Slot"})).toBeInTheDocument();

        // 4. Overview validates automatically as soon as the project loads (no separate "Validate"
        // section/click any more -- see OverviewTab's own automatic diagnostics).
        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());

        // 5. Head to Simulation and run it.
        await user.click(screen.getByRole("button", {name: "Simulation"}));
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));

        // 6. Let it complete -- Simulation's own Review step auto-advances the instant the run goes
        // terminal (see SimulationTab's own doc comment on its activeStep effect), no separate
        // "open the report" step needed.
        await waitFor(() => expect(simulationPollCount).toBeGreaterThanOrEqual(2), {timeout: 5000});

        // 7. The report renders right there on Simulation's own Review step.
        await waitFor(() => expect(screen.getByText("RTP")).toBeInTheDocument());
        expect(screen.getByText("95.00%")).toBeInTheDocument();
    }, 90000);
});
