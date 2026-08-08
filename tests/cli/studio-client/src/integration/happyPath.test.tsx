import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../testUtils/renderRoutedApp";

// Exercises the full human-centered happy path end to end, across a real cross-page navigation: land on
// Home's default "Design Game" tab -> edit the game model -> validate -> build -> auto-navigate into
// the Project Dashboard -> run a simulation -> its own Review step auto-opens the resulting report.
// Every screen/hook/API call used here is the app's real, already-tested production code -- this test
// only wires a fake fetch across the whole scenario, it doesn't re-implement any of it.
describe("Studio happy path: create/open -> configure -> validate -> build -> simulate -> report", () => {
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
            // Direct Build Package performs P2-POLISH-09's read-only destination preflight first.
            // Keep this happy-path destination empty so the scenario reaches the actual build and its
            // existing Open in Studio assertion without silently bypassing the safety check.
            if (path === "/api/home/blueprints/build-preview" && method === "POST") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            status: "ok",
                            warnings: [],
                            manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                            reels: 5,
                            rows: 3,
                            symbolsCount: 3,
                            blueprintHash: "abc123",
                            expectedFiles: ["build-info.json"],
                            projectRoot: "/games/sample-slot",
                            destinationHasContent: false,
                            createFiles: ["build-info.json"],
                            updateFiles: [],
                            deleteFiles: [],
                        }),
                });
            }
            if (path === "/api/home/blueprints/build" && method === "POST") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            status: "ok",
                            projectRoot: "/games/sample-slot",
                            manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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
                            context: {mode: "project", projectRoot: "/games/sample-slot"},
                            manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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
                            projectRoot: "/games/sample-slot",
                            game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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
                            packageRoot: "/games/sample-slot",
                            valid: true,
                            packageJson: {name: "sample-slot", version: "0.1.0"},
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
                            packageRoot: "/games/sample-slot",
                            valid: true,
                            game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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

        // 1. Land on Home's default "Design Game" tab -- the guided open-or-create + configure entry.
        // Awaited rather than immediate: "/" resolves the server mode first, so Home appears a tick later.
        expect(await screen.findByRole("heading", {name: "Design Your Game"})).toBeInTheDocument();

        // 2. Configure the game model -- add a symbol. The guided editor's own fields are split into
        // named sections (SectionedFormEditor) -- Symbols is one of them, so it needs its own tab click
        // first.
        await user.click(screen.getByRole("tab", {name: "Symbols"}));
        await user.type(screen.getByLabelText("New symbol id"), "wild");
        await user.click(screen.getByRole("button", {name: "Add symbol"}));

        // 3. Validate.
        await user.click(screen.getByRole("button", {name: "Validate"}));
        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());

        // 4. Build.
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        const openInStudio = await screen.findByRole("button", {name: "Open in Studio"});

        // 5. Building's success action lands us in the Project Dashboard (the same "Open in Studio"
        // bridge the app already uses everywhere a build succeeds) -- via the same guarded-navigation
        // confirm every other "leave a dirty Design Game draft" exit uses (see openProjectGuard.test.tsx):
        // the symbol added in step 2 was never saved to a source blueprint file, and building a package is
        // a distinct fact from that (see BlueprintBuildPanel's own `onBuilt` doc comment), so the draft is
        // still genuinely dirty here.
        await user.click(openInStudio);
        expect(await screen.findByText("You have unsaved changes in Design Game. Leave and lose them?")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Leave"}));
        expect(await screen.findByRole("heading", {name: "Sample Slot"})).toBeInTheDocument();

        // 6. Overview validates automatically as soon as the project loads (no separate "Validate"
        // section/click any more -- see OverviewTab's own automatic diagnostics).
        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());

        // 7. Head to Simulation and run it.
        await user.click(screen.getByRole("button", {name: "Simulation"}));
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));

        // 8. Let it complete -- Simulation's own Review step auto-advances the instant the run goes
        // terminal (see SimulationTab's own doc comment on its activeStep effect), no separate
        // "open the report" step needed.
        await waitFor(() => expect(simulationPollCount).toBeGreaterThanOrEqual(2), {timeout: 5000});

        // 9. The report renders right there on Simulation's own Review step.
        await waitFor(() => expect(screen.getByText("RTP")).toBeInTheDocument());
        expect(screen.getByText("95.00%")).toBeInTheDocument();
    }, 90000);
});
