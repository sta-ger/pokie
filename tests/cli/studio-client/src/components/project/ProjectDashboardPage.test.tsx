import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createFakeFetch, createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

function baseFetchRoutes() {
    return {
        "/api/project/context": () => ({
            ok: true,
            status: 200,
            body: {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]},
        }),
        "/api/project/inspect": () => ({
            ok: true,
            status: 200,
            body: {packageRoot: "/games/sample-slot", valid: true, packageJson: {name: "sample-slot", version: "1.0.0"}, generated: false},
        }),
        "/api/project/reports": () => ({ok: true, status: 200, body: []}),
        "/api/project/replays": () => ({ok: true, status: 200, body: []}),
        "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        "/api/project/validate": () => ({
            ok: true,
            status: 200,
            body: {packageRoot: "/games/sample-slot", valid: true, game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, errors: [], warnings: [], suggestions: []},
        }),
    };
}

describe("ProjectDashboardPage", () => {
    it("loads the project header and Overview tab, then switches tabs", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch(baseFetchRoutes());

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});

        const projectHeading = await screen.findByRole("heading", {name: "Sample Slot"});
        expect(projectHeading).toBeInTheDocument();
        const projectHeader = projectHeading.parentElement as HTMLElement;
        expect(within(projectHeader).getByText("Project path: /games/sample-slot")).not.toBeVisible();
        const projectDetails = within(projectHeader).getByRole("button", {name: "Show project location"});
        expect(projectDetails).toHaveAttribute("aria-expanded", "false");
        projectDetails.focus();
        await user.keyboard("{Enter}");
        expect(projectDetails).toHaveAttribute("aria-expanded", "true");
        expect(within(projectHeader).getByText("Project path: /games/sample-slot")).toBeVisible();
        expect(within(projectHeader).getByRole("button", {name: "Copy path"})).toBeInTheDocument();

        // No separate "Validate" section to click into any more -- validation runs automatically as
        // soon as the project loads, and its result renders right inside Overview.
        await waitFor(() => {
            expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument();
        });
        expect(screen.getByText("Game format")).toBeInTheDocument();
        expect(screen.getByText("Game design")).toBeInTheDocument();
        expect(screen.queryByText("Capabilities")).not.toBeInTheDocument();
        expect(screen.queryByText("Build from Blueprint source")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Simulation"}));
        expect(await screen.findByRole("button", {name: "Run Simulation"})).toBeInTheDocument();
        const activePanel = screen.getByRole("region", {name: "Sample Slot"});
        await waitFor(() => expect(activePanel).toHaveFocus());
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
                                game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"},
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
            if (path === "/api/project/reports/sim-1") {
                return {
                    ok: true,
                    status: 200,
                    body: {
                        report: {
                            game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"},
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
                        },
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
        await screen.findByRole("heading", {name: "Sample Slot"});

        await user.click(screen.getByRole("button", {name: "Simulation"}));
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));

        // Switch away from the Simulation tab while the job is still "running" -- the poll must keep
        // going in the background (see ProjectDashboardPage's own doc comment on why every tab's hook
        // lives at the page level, not inside the conditionally-rendered tab component).
        await user.click(screen.getByRole("button", {name: "Overview"}));

        await waitFor(() => expect(simulationPollCount).toBeGreaterThanOrEqual(2), {timeout: 3000});

        // The completed job auto-opened its report (in the background, while Overview was showing) --
        // switching back lands straight on the Review step's own summary, not the Configure step.
        await user.click(screen.getByRole("button", {name: "Simulation"}));
        await waitFor(
            () => {
                expect(screen.getAllByText("90.00%").length).toBeGreaterThan(0);
            },
            {timeout: 15000},
        );
        // 20000ms was too tight to be a safe budget once setupTests.ts raised asyncUtilTimeout to
        // 15000ms: this test's own waits alone can claim 15000ms here plus 3000ms above, and the
        // unqualified findByRole that opens it now inherits that same 15000ms cap -- 33000ms of
        // worst-case waiting inside a 20000ms budget. That inverts the intended failure mode, turning a
        // single slow-but-correct assertion into an overall-test timeout whose message points at the
        // test rather than at the assertion that was actually starved. 45000ms is the value every other
        // multi-interaction suite in this lane already uses, and it restores the invariant setupTests.ts
        // documents: the per-assertion cap always expires first, so the diagnostic names the real culprit.
    }, 60000);

    it("does not block the happy path on warnings-only validation -- Simulation stays reachable and Overview keeps showing the warnings", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...baseFetchRoutes(),
            "/api/project/validate": () => ({
                ok: true,
                status: 200,
                body: {
                    packageRoot: "/games/sample-slot",
                    valid: true,
                    game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"},
                    errors: [],
                    warnings: [{code: "W1", message: "Consider adding a description."}],
                    suggestions: [],
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "Sample Slot"});

        // No click needed -- validation runs automatically as soon as the project loads.
        await waitFor(() => expect(screen.getByText(/Valid, with warnings/)).toBeInTheDocument());

        // The Simulate tab itself stays fully usable -- warnings never gate the actual action.
        await user.click(screen.getByRole("button", {name: "Simulation"}));
        expect(screen.getByRole("button", {name: "Run Simulation"})).toBeEnabled();

        // Back on Overview, the warnings-only diagnostics are still shown, unchanged.
        await user.click(screen.getByRole("button", {name: "Overview"}));
        expect(screen.getByText(/Valid, with warnings/)).toBeInTheDocument();
    });

    it("a failed re-check clears the stale successful result instead of leaving it displayed", async () => {
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
                            packageRoot: "/games/sample-slot",
                            valid: true,
                            game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"},
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

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "Sample Slot"});

        // The automatic first check (validateCallCount === 1) succeeds.
        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());

        await user.click(screen.getByRole("button", {name: "Re-check project"}));
        await waitFor(() => expect(screen.queryByText("Valid — no issues found.")).not.toBeInTheDocument());
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("This validation check couldn't be completed. Try again. If it continues, reopen the project and retry.");
        expect(alert).not.toHaveTextContent("Internal error");
        expect(screen.queryByText("Valid — no issues found.")).not.toBeInTheDocument();
    });

    describe("Close project", () => {
        it("returns to Your projects once the server confirms the project actually closed", async () => {
            const user = userEvent.setup();
            const {fetchImpl} = createRoutedFakeFetch({
                ...baseFetchRoutes(),
                "/api/projects/close": () => ({ok: true, status: 200, body: {context: {status: "empty"}}}),
                "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            });

            renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
            await screen.findByRole("heading", {name: "Sample Slot"});

            await user.click(screen.getByRole("button", {name: "Close project"}));

            await waitFor(() => expect(screen.queryByRole("heading", {name: "Sample Slot"})).not.toBeInTheDocument());
            expect(await screen.findByRole("heading", {name: "Projects"})).toBeInTheDocument();
        });

        // The Projects breadcrumb is the direct return path to the project list. It must still close
        // the active project first rather than raw-navigating back into the same server-side workspace.
        it("returns to Your projects via its breadcrumb, closing the project first", async () => {
            const user = userEvent.setup();
            const {fetchImpl, calls} = createRoutedFakeFetch({
                ...baseFetchRoutes(),
                "/api/projects/close": () => ({ok: true, status: 200, body: {context: {status: "empty"}}}),
                "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            });

            renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
            await screen.findByRole("heading", {name: "Sample Slot"});

            await user.click(screen.getByRole("button", {name: "Your projects"}));

            await waitFor(() => expect(screen.queryByRole("heading", {name: "Sample Slot"})).not.toBeInTheDocument());
            expect(await screen.findByRole("heading", {name: "Projects"})).toBeInTheDocument();
            expect(calls.some((call) => call.url === "/api/projects/close")).toBe(true);
        });

        // Every other mutating apiClient.ts function throws on a non-ok response; closeProject() used to
        // be the one exception (it parsed the body regardless of status), and the page-level handler threw
        // the failure away entirely -- so a failed close was indistinguishable from the button silently
        // doing nothing. It must now keep the designer in context with a clear retry path, while keeping
        // the backend diagnostic collapsed as technical detail.
        it("keeps the designer in the game with recovery copy when closing fails, and lets them retry", async () => {
            const user = userEvent.setup();
            let shouldFail = true;
            const fetchImpl = (url: string, init?: RequestInit) => {
                const [path] = url.split("?");
                if (path === "/api/projects/close") {
                    if (shouldFail) {
                        return Promise.resolve({
                            ok: false,
                            status: 500,
                            json: () => Promise.resolve({error: "close failed: a spin is still writing to disk"}),
                        });
                    }
                    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({context: {status: "empty"}})});
                }
                const routes = baseFetchRoutes() as Record<string, (call: {url: string; init?: RequestInit}) => {ok: boolean; status: number; body: unknown}>;
                const route = routes[path];
                if (route) {
                    const {ok, status, body} = route({url, init});
                    return Promise.resolve({ok, status, json: () => Promise.resolve(body)});
                }
                return Promise.reject(new Error(`no fake route for ${url}`));
            };

            renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
            await screen.findByRole("heading", {name: "Sample Slot"});

            await user.click(screen.getByRole("button", {name: "Close project"}));

            const alert = await screen.findByRole("alert");
            expect(alert).toHaveTextContent("We couldn't close this game. Try closing again. If it continues, finish any active work and reopen Studio.");
            expect(screen.getByRole("button", {name: "Try closing again"})).toBeInTheDocument();
            const details = screen.getByText("Technical details").closest("details");
            expect(details).not.toBeNull();
            expect(details).not.toHaveAttribute("open");
            expect(details).toHaveTextContent("close failed: a spin is still writing to disk");
            expect(screen.getByRole("heading", {name: "Sample Slot"})).toBeInTheDocument();

            shouldFail = false;
            await user.click(screen.getByRole("button", {name: "Try closing again"}));

            await waitFor(() => expect(screen.queryByRole("heading", {name: "Sample Slot"})).not.toBeInTheDocument());
        });
    });

    // A "pokie ." boot straight into Project mode: a failed Blueprint materialization (e.g. a broken
    // "npm install") must offer normal game-opening recovery guidance, with both server diagnostics
    // available only through the collapsed technical disclosure.
    it("shows failed project entry recovery guidance up front, with raw materialization diagnostics only in a collapsed disclosure", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "error",
                    projectRoot: "/games/broken-slot",
                    error: "Installing dependencies for \"/games/broken-slot\" failed.",
                    errorDetail: "npm ERR! simulated transient local npm failure",
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("We couldn't open this game. Return to your games and try opening it again. If it continues, check the game's location and reopen Studio.");

        const summary = screen.getByText("Technical details");
        const details = summary.closest("details");
        expect(details).not.toBeNull();
        expect(alert.contains(details)).toBe(true);
        // Collapsed by default: the raw diagnostic lives inside the disclosure, never rendered up front.
        expect(details).not.toHaveAttribute("open");
        expect(details?.textContent).toContain('Installing dependencies for "/games/broken-slot" failed.');
        expect(details?.textContent).toContain("npm ERR! simulated transient local npm failure");
    });

    it("shows project-context HTTP failures as game-opening recovery with diagnostics collapsed", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: false, status: 503, body: {error: "project context service unavailable"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("We couldn't open this game. Return to your games and try opening it again. If it continues, check the game's location and reopen Studio.");
        const details = screen.getByText("Technical details").closest("details");
        expect(details).not.toHaveAttribute("open");
        expect(details).toHaveTextContent("project context service unavailable");
    });

    it("returns from a failed scoped project link to Your projects without closing a possibly active game", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "empty"}}),
            "/api/home/projects/open": () => ({
                ok: false,
                status: 500,
                body: {error: "resolver could not load /games/broken", detail: "ENOENT: internal project manifest detail"},
            }),
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        });

        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/%2Fgames%2Fbroken/overview"]});

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("We couldn't open this game. Return to your games and try opening it again. If it continues, check the game's location and reopen Studio.");
        const details = screen.getByText("Technical details").closest("details");
        expect(details).not.toHaveAttribute("open");
        expect(details).toHaveTextContent("resolver could not load /games/broken");
        expect(details).toHaveTextContent("ENOENT: internal project manifest detail");

        const returnToProjects = screen.getByRole("button", {name: "Go to Your projects"});
        returnToProjects.focus();
        await user.keyboard("{Enter}");

        await waitFor(() => expect(router.state.location.pathname).toBe("/home/projects"));
        expect(await screen.findByRole("heading", {name: "Projects"})).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/projects/close")).toBe(false);
    });
});
