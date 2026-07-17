import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../testUtils/renderRoutedApp";

// Exercises the full human-centered happy path end to end, across a real cross-page navigation: land on
// Home's default "Design & Build" tab -> edit the game model -> validate -> build -> auto-navigate into
// the Project Dashboard -> run a simulation -> open the resulting report via Overview's recommended
// next-action. Every screen/hook/API call used here is the app's real, already-tested production code --
// this test only wires a fake fetch across the whole scenario, it doesn't re-implement any of it.
describe("Studio happy path: create/open -> configure -> validate -> build -> simulate -> report", () => {
    // This is the longest test in the suite (many sequential steps plus two real-timer simulation-poll
    // waits) -- the project's global 15000ms testTimeout leaves too little headroom under concurrent
    // Jest workers, matching the same parallel-worker contention documented for the other real-timer
    // tests here (see setupTests.ts's asyncUtilTimeout) -- so this test gets its own longer timeout.
    it("walks the full guided flow end to end", async () => {
        const user = userEvent.setup();
        let simulationPollCount = 0;

        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            const method = init?.method ?? "GET";

            if (path === "/api/home/blueprints/validate" && method === "POST") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", warnings: []})});
            }
            if (path === "/api/home/blueprints/build" && method === "POST") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            status: "ok",
                            projectRoot: "/games/crazy-fruits",
                            manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
                            createdFiles: ["build-info.json"],
                            buildInfo: {blueprintHash: "abc123", pokieVersion: "1.0.0", generatedAt: new Date().toISOString(), files: []},
                            unchanged: false,
                            warnings: [],
                        }),
                });
            }
            if (path === "/api/home/projects/open" && method === "POST") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            context: {mode: "project", projectRoot: "/games/crazy-fruits"},
                            manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
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
                            projectRoot: "/games/crazy-fruits",
                            game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
                        }),
                });
            }
            if (path === "/api/project/inspect") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            packageRoot: "/games/crazy-fruits",
                            valid: true,
                            packageJson: {name: "crazy-fruits", version: "0.1.0"},
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
                            packageRoot: "/games/crazy-fruits",
                            valid: true,
                            game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
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
            if (path === "/api/project/runtime") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "stopped"})});
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
                                    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
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
                            game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
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
                        }),
                });
            }
            return Promise.reject(new Error(`no fake route for ${method} ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/"]});

        // 1. Land on Home's default "Design & Build" tab -- the guided open-or-create + configure entry.
        expect(screen.getByRole("heading", {name: "Design & Build Your Game"})).toBeInTheDocument();

        // 2. Configure the game model -- add a symbol. HomePage keeps every tab's content mounted (so
        // switching tabs never loses a draft), so the Advanced Tools tab's own raw Blueprint Editor
        // instance is also in the DOM here -- [0] is always the Design & Build tab's own, since it's the
        // first of the three tab bodies in HomePage's markup. The guided editor's own fields are further
        // split into named sections (SectionedFormEditor) -- Symbols is one of them, so it needs its own
        // tab click first; the raw Advanced Tools editor has no such tabs, so "Symbols" as a role="tab"
        // unambiguously means the guided one.
        await user.click(screen.getByRole("tab", {name: "Symbols"}));
        await user.type(screen.getAllByLabelText("New symbol id")[0], "wild");
        await user.click(screen.getAllByRole("button", {name: "Add symbol"})[0]);

        // 3. Validate.
        await user.click(screen.getAllByRole("button", {name: "Validate"})[0]);
        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());

        // 4. Build.
        await user.click(screen.getAllByRole("button", {name: "Build Package"})[0]);
        const openInStudio = await screen.findByRole("button", {name: "Open in Studio"});

        // 5. Building's success action lands us in the Project Dashboard (the same "Open in Studio"
        // bridge the app already uses everywhere a build succeeds).
        await user.click(openInStudio);
        expect(await screen.findByRole("heading", {name: "Crazy Fruits"})).toBeInTheDocument();

        // 6. Overview recommends running a simulation once the project is known-valid... but validation
        // hasn't run at the *package* level yet, so the recommended action is to validate first --
        // exactly the sequencing describeNextAction is meant to enforce.
        await waitFor(() => expect(screen.getByRole("button", {name: "Validate project"})).toBeInTheDocument());
        await user.click(screen.getByRole("button", {name: "Validate project"}));
        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());

        // 7. Back on Overview, the recommendation is now to simulate.
        await user.click(screen.getByRole("button", {name: "Overview"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Run a simulation"})).toBeInTheDocument());
        await user.click(screen.getByRole("button", {name: "Run a simulation"}));

        // 8. Run the simulation and let it complete.
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await waitFor(() => expect(simulationPollCount).toBeGreaterThanOrEqual(2), {timeout: 5000});

        // 9. Overview now recommends viewing the report -- follow it.
        await user.click(screen.getByRole("button", {name: "Overview"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "View report"})).toBeInTheDocument());
        await user.click(screen.getByRole("button", {name: "View report"}));

        // 10. The report renders on the Reports tab.
        await waitFor(() => expect(screen.getByText("RTP")).toBeInTheDocument());
        expect(screen.getByText("95.00%")).toBeInTheDocument();
    }, 45000);
});
