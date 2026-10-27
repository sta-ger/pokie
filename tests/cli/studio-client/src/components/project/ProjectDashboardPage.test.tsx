/** @jest-environment-options {"customExportConditions":["node","node-addons"]} */
import fs from "node:fs";
import path from "node:path";
import {generatedMechanicsGame} from "../../../../../v2/fixtures/ExistingMechanicsGame";
import {StudioSimulationService} from "../../../../../../cli/studio/simulation/StudioSimulationService";
import {StudioJobService} from "../../../../../../cli/studio/jobs/StudioJobService";
import {FileStudioJobRepository} from "../../../../../../cli/studio/jobs/FileStudioJobRepository";
import {validateSimulationRequest} from "../../../../../../cli/studio/simulation/validateSimulationRequest";
import {ReplayRecorder} from "../../../../../../src/replay/ReplayRecorder";
import {GameSession} from "../../../../../../src/session/GameSession";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createFakeFetch, createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {optimizationRequest} from "../../../../../v2/fixtures/OptimizationFixture";

function baseFetchRoutes() {
    return {
        "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
        // Discovery runs alongside feature requests and continues after returning Home.
        "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
        "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
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
    it("opens a compatible component in the contract-provided inspection-only dashboard", async () => {
        const wasmPresentation = {
            label: "WASM component (inspection-only)",
            manifestCapability: "wasm.manifest.read",
            manifestCapabilityLabel: "Inspect declared WASM component metadata",
            inspectActionLabel: "Inspect declared manifest",
            inspectionSummary: "POKIE reads the compatible sidecar manifest only; it never loads or executes the WASM binary.",
        };
        const {fetchImpl} = createRoutedFakeFetch({
            ...baseFetchRoutes(),
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "artifact",
                    projectRoot: "/games/component.wasm",
                    project: {type: "wasm", rootPath: "/games/component.wasm", capabilities: ["wasm.manifest.read"], provenance: "compatible sidecar"},
                    wasmPresentation,
                },
            }),
            "/api/project/inspect": () => ({
                ok: true,
                status: 200,
                body: {
                    packageRoot: "/games/component.wasm",
                    valid: true,
                    wasmManifest: {
                        component: {id: "component", version: "1.0.0"},
                        schemaVersion: "1.0.0",
                        serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
                        host: {rng: "pokie.rng.v1", services: ["clock.v1"]},
                        capabilities: ["round.play"],
                    },
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});

        expect(await screen.findByRole("heading", {name: wasmPresentation.label})).toBeInTheDocument();
        expect(screen.getAllByText(wasmPresentation.label).length).toBeGreaterThan(1);
        expect(screen.getByText(wasmPresentation.inspectionSummary)).toBeInTheDocument();
        expect(await screen.findByRole("table", {name: "Declared WASM component manifest"})).toBeInTheDocument();
        expect(screen.getByText("pokie.session.v1")).toBeInTheDocument();
        expect(screen.getByText("clock.v1")).toBeInTheDocument();
        expect(screen.getByText("round.play")).toBeInTheDocument();
        expect(screen.queryByText("Artifact SHA-256")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Play"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Build/Export"})).not.toBeInTheDocument();
    });

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

    it("offers every planner-backed runtime workflow for a loaded PAR workbook", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...baseFetchRoutes(),
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "loaded",
                    projectRoot: "/games/sample.par.xlsx",
                    game: {id: "sample-slot", name: "Sample PAR Slot", version: "1.0.0"},
                    type: "parWorkbook",
                    capabilities: ["parWorkbook.exchange"],
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "Sample PAR Slot"});

        expect(screen.getByRole("button", {name: "Play"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Simulation"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Replay"})).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Play"}));
        expect(await screen.findByRole("button", {name: "New Play session"})).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Simulation"}));
        expect(await screen.findByRole("button", {name: "Run Simulation"})).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Replay"}));
        expect(await screen.findByText(/Load a round above to run it/)).toBeInTheDocument();
    });

    it("renders a planner runtime-preparation failure with its path, edge, and recovery intact", async () => {
        const user = userEvent.setup();
        const diagnostic =
            'Cannot prepare a runnable runtime from "/games/sample.par.xlsx". Attempted path: parWorkbook -> tsPackage; planned/reusable stages: import blueprint (parWorkbook -> blueprint), materialize tsPackage (blueprint -> tsPackage); failed conversion edge: blueprint -> tsPackage. Workbook import rejected. Next: Fix the workbook and retry.';
        const {fetchImpl} = createFakeFetch((call) => {
            const [path] = call.url.split("?");
            if (path === "/api/project/simulations") {
                return {
                    ok: true,
                    status: 201,
                    body: {id: "sim-planner-failure", status: "queued", rounds: 10000, workers: 1, startedAt: new Date().toISOString(), roundsCompleted: 0, durationMs: 0},
                };
            }
            if (path === "/api/project/simulations/sim-planner-failure") {
                return {
                    ok: true,
                    status: 200,
                    body: {
                        id: "sim-planner-failure",
                        status: "failed",
                        rounds: 10000,
                        workers: 1,
                        startedAt: new Date().toISOString(),
                        completedAt: new Date().toISOString(),
                        roundsCompleted: 0,
                        durationMs: 1,
                        error: diagnostic,
                    },
                };
            }
            const routes = baseFetchRoutes();
            const route = routes[path as keyof typeof routes];
            if (route) return route();
            throw new Error(`no fake route for ${call.url}`);
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "Sample Slot"});
        await user.click(screen.getByRole("button", {name: "Simulation"}));
        await user.click(await screen.findByRole("button", {name: "Run Simulation"}));

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(diagnostic);
        expect(alert).not.toHaveTextContent("couldn't be completed");
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
        await user.click(await screen.findByRole("button", {name: "Run Simulation"}));

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
        expect(await screen.findByRole("button", {name: "Run Simulation"})).toBeEnabled();

        // Back on Overview, the warnings-only diagnostics are still shown, unchanged.
        await user.click(screen.getByRole("button", {name: "Overview"}));
        expect(await screen.findByText(/Valid, with warnings/)).toBeInTheDocument();
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

        it("visits Your projects via its breadcrumb without closing the current project", async () => {
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
            expect(calls.some((call) => call.url === "/api/projects/close")).toBe(false);
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


it("preserves Recent Rounds audit evidence through inspection, submission and retry", async () => {
    const game = {
        getManifest: () => ({id: "sample-slot", name: "Sample Slot", version: "1.0.0"}),
        getConfigHash: () => "dashboard-audit",
        getSessionStateSchema: () => ({kind: "base" as const}),
        getSessionCommandCapabilities: () => ({bets: new GameSession().getAvailableBets()}),
        validateSessionState: (state: unknown) => new GameSession().validateSessionState(state),
        createSession: () => new GameSession(),
    };
    const recorder = new ReplayRecorder(),
        session = game.createSession();
    const recording = recorder.recordAudit(game, session, [{kind: "spin", roundId: "dashboard-round", delivery: "stepwise"}], {status: "calculated", sessionId: "dashboard-session", durability: "detached"}, {seed: "dashboard"});
    recorder.releaseAuditSession(session);
    const failed = {id: "audit-job", status: "failed", round: 1, completedRounds: 0, startedAt: "2026-10-13T00:00:00Z", durationMs: 1,
        error: "Replay terminal publication failed", auditPrefix: recording.audit};
    const {fetchImpl, calls} = createRoutedFakeFetch({
        ...baseFetchRoutes(),
        "/api/project/rounds": () => ({ok: true, status: 200, body: [{sessionId: recording.sessionId, game: recording.game, win: recording.totalWin,
            studioRound: 1, studioRecordedAt: "2026-10-13T00:00:00Z", studioSource: "play", studioOperation: "spin", debug: {recording}}]}),
        "/api/project/replays/inspect-artifact": () => ({ok: true, status: 200, body: {round: 1, seed: "dashboard", recording, artifactWarnings: [], auditStatus: "recorded"}}),
        "/api/project/replays": call => call.init?.method === "POST"
            ? {ok: true, status: 202, body: {id: "audit-job", status: "queued", round: 1, completedRounds: 0, startedAt: failed.startedAt, durationMs: 0}}
            : {ok: true, status: 200, body: []},
        "/api/project/replays/audit-job": () => ({ok: true, status: 200, body: failed}),
    });
    const user = userEvent.setup();
    renderRoutedApp({fetchImpl, initialEntries: ["/project/replay"]});
    await user.click(await screen.findByRole("radio", {name: "Session Spin"}));
    await user.click(await screen.findByRole("button", {name: /Session 1.*Round 1.*Spin/}));
    await user.click(screen.getByRole("button", {name: "Load for audit replay"}));
    await user.click(await screen.findByRole("button", {name: "Reproduce"}));
    await user.click(await screen.findByRole("button", {name: "Run again with the same parameters"}));
    await waitFor(() => expect(calls.filter(call => call.url === "/api/project/replays" && call.init?.method === "POST")).toHaveLength(2));
    expect(JSON.parse(calls.find(call => call.url === "/api/project/replays/inspect-artifact")!.init!.body!)).toEqual(JSON.parse(JSON.stringify(recording)));
    for (const call of calls.filter(call => call.url === "/api/project/replays" && call.init?.method === "POST")) {
        expect(JSON.parse(call.init!.body!)).toMatchObject({round: 1, recording: JSON.parse(JSON.stringify(recording))});
    }
});

it.each(["blueprint", "parWorkbook", "tsPackage", "outcomeLibrary", "stakeAdapter", "wasm"])("mounts optimization and discovers request-specific tuning support for %s", async type => {
    const status = {blueprint: "loaded", parWorkbook: "loaded", tsPackage: "loaded", outcomeLibrary: "outcome-source", stakeAdapter: "outcome-source", wasm: "artifact"}[type];
    const {fetchImpl} = createRoutedFakeFetch({
        ...baseFetchRoutes(),
        "/api/project/context": () => ({ok: true, status: 200, body: {
            status, projectRoot: "/games/sample-slot", type, game: {id: "sample-slot", name: "Sample Slot", version: "1"}, capabilities: [],
            project: {type, rootPath: "/games/sample-slot", capabilities: [], provenance: "fixture"},
            report: {descriptor: {kind: "native", streaming: false, limitations: []}, issues: [], modes: []},
            wasmPresentation: {label: "WASM component", inspectionSummary: "Inspect bound component", inspectActionLabel: "Inspect declared manifest"},
        }}),
        "/api/project/optimization/support": () => ({ok: true, status: 200, body: {supported: true, reason: `${type} declared tuning only`, writable: ["/declared/weight"], sourceRevision: "sha256:source"}}),
    });
    renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
    await screen.findByRole("heading", {name: "Optimize math"});
    expect(screen.getByRole("button", {name: "Run optimization"})).toBeDisabled();
    await userEvent.click(screen.getByRole("button", {name: "Check tuning support"}));
    await screen.findByText(`${type} declared tuning only`);
    expect(screen.getByText("Writable fields: /declared/weight")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Run optimization"})).toBeEnabled();
});

// Source-aware regression for the retained 100-round, 94% report followed by
// the rendered Paytable Save (A x3: 10 -> 11). This is not cold collection.
describe("V2C-34 saved-design simulation freshness", () => {
    function fixture() {
        let blueprint = {
            manifest: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"},
            reels: 3, rows: 1, symbols: ["A"], paylines: [[0, 0, 0]],
            reelStrips: [["A"], ["A"], ["A"]], availableBets: [1], paytable: {A: {3: 10}},
        };
        let run = 0;
        let saveRejected = false;
        const report = (id: string) => ({
            game: blueprint.manifest, requestedRounds: 100, rounds: 100, totalBet: 100,
            totalWin: id === "run-1" ? 94 : 98, rtp: id === "run-1" ? 0.94 : 0.98,
            hitFrequency: 0.14, maxWin: 12, durationMs: 2825, spinsPerSecond: 35,
            workers: 1, warnings: [], recommendations: [],
        });
        const simulationJob = (id: string) => ({
            id, status: "completed", requestedRounds: 100, rounds: 100, roundsCompleted: 100,
            workers: 1, startedAt: "2026-10-20T15:44:50Z", durationMs: 2825,
        });
        const commonJobs = () => Array.from({length: run}, (_, index) => ({
            id: `run-${index + 1}`, projectId: "/games/sample-slot", operation: "simulation",
            conflictKey: "simulation:/games/sample-slot", status: "completed", createdAt: index + 1,
            request: {rounds: 100, workers: 1}, result: {
                summary: "Simulation completed.",
                outputs: [{label: "Simulation report", downloadPath: `/api/project/reports/run-${index + 1}/download?format=json`}],
            },
        }));
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...baseFetchRoutes(),
            "/api/project/gameModel": () => ({ok: true, status: 200, body: {
                basics: {status: "available", data: blueprint.manifest},
                paytable: {status: "available", data: [{symbolId: "A", matchCount: 3, payout: blueprint.paytable.A[3]}]},
                betsAndModes: {status: "available", data: {availableBets: [1], betModes: []}},
                ...Object.fromEntries(["layout", "symbols", "reels", "mechanics", "limits"].map(key => [key, {status: "unavailable", reason: "Not needed for this paytable observation"}])),
            }}),
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/sample-slot", blueprint, blueprintHash: `payout-${blueprint.paytable.A[3]}`}}),
            "/api/home/blueprints/validate": ({init}) => ({ok: true, status: 200, body: JSON.parse(init!.body!).blueprint.paytable.A[3] > 0
                ? {status: "ok", warnings: []}
                : {status: "invalid", errors: [{code: "blueprint-paytable-invalid-multiplier", severity: "error", message: '"paytable.A.3" must be a positive number.'}], warnings: []}}),
            "/api/home/blueprints/save": ({init}) => {
                if (saveRejected) return {ok: false, status: 409, body: {status: "conflict", reason: "stale", error: "Source changed; reload before saving."}};
                blueprint = JSON.parse(init!.body!).blueprint;
                return {ok: true, status: 200, body: {status: "ok", path: "/games/sample-slot", blueprintHash: `payout-${blueprint.paytable.A[3]}`, sourceRevision: `sha256:payout-${blueprint.paytable.A[3]}`}};
            },
            "/api/project/simulations": () => ({ok: true, status: 201, body: simulationJob(`run-${++run}`)}),
            "/api/project/simulations/run-1": () => ({ok: true, status: 200, body: simulationJob("run-1")}),
            "/api/project/simulations/run-2": () => ({ok: true, status: 200, body: simulationJob("run-2")}),
            "/api/project/reports/run-1": () => ({ok: true, status: 200, body: {report: report("run-1")}}),
            "/api/project/reports/run-2": () => ({ok: true, status: 200, body: {report: report("run-2")}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: Array.from({length: run}, (_, index) => ({
                ...report(`run-${index + 1}`), id: `run-${index + 1}`, actualRounds: 100,
                startedAt: "2026-10-20T15:44:50Z", hasWarnings: false,
            }))}),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: commonJobs()}}),
        });
        return {
            fetchImpl, calls,
            setSaveRejected: (value: boolean) => {
                saveRejected = value;
            },
            payout: () => blueprint.paytable.A[3],
            blueprint: () => blueprint,
            applyPayout: () => {
                blueprint = {...blueprint, paytable: {A: {3: 11}}};
            },
        };
    }

    async function runInitial(user: ReturnType<typeof userEvent.setup>) {
        const runButton = await screen.findByRole("button", {name: "Run Simulation"});
        const rounds = screen.getByLabelText(/^Rounds/);
        await user.clear(rounds);
        await user.type(rounds, "100");
        await user.click(runButton);
        expect(await screen.findByRole("button", {name: "Open full report"})).toBeVisible();
        const workflow = screen.getByRole("region", {name: "Simulation workflow"});
        expect(within(workflow).getAllByText("94.00%").length).toBeGreaterThan(0);
        expect(within(workflow).queryByText(/Historical simulation result/)).not.toBeInTheDocument();
    }

    async function editPayout(user: ReturnType<typeof userEvent.setup>, value: string) {
        await user.click(screen.getByRole("button", {name: "Game Model"}));
        const paytable = (await screen.findByText("Paytable", {selector: "span"})).closest("fieldset")!;
        await user.click(within(paytable).getByRole("button", {name: "Edit"}));
        const input = await within(paytable).findByLabelText("A x3 payout");
        await user.clear(input);
        await user.type(input, value);
        return paytable;
    }

    it("V2C-34-SIMULATION-REATTACH keeps real pre-save durable work historical on first discovery, then accepts new execution", async () => {
        const user = userEvent.setup();
        const test = fixture();
        const directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c34-reattach-"));
        const root = "/games/sample-slot";
        const jobs = new StudioJobService(new FileStudioJobRepository(directory));
        let release: () => void = () => undefined;
        const gate = new Promise<void>(resolve => {
            release = resolve;
        });
        const service = new StudioSimulationService(undefined, () => Promise.resolve(generatedMechanicsGame(test.blueprint())), undefined, 50, undefined, () => gate);
        service.attachJobService(jobs);
        const original = service.start(root, {rounds: 100, workers: 1});
        if (original.status !== "created") throw new Error("Expected pre-save execution");
        let observed = false;
        const receipts: string[] = [];
        const respond = (body: unknown, status = 200) => Promise.resolve({ok: status < 400, status, json: () => Promise.resolve(body)});
        const fetchImpl: FetchLike = (url, init) => {
            const [route] = url.split("?");
            if (route === "/api/project/jobs") return respond({jobs: observed ? jobs.list(root) : []});
            if (route.startsWith("/api/project/jobs/")) return respond(jobs.get(root, route.split("/").at(-1)!));
            if (route === "/api/project/simulations") {
                observed = true;
                const result = service.start(root, validateSimulationRequest(JSON.parse(init!.body!)));
                receipts.push(result.status);
                if (result.status === "unsupported") return respond({error: result.message}, 409);
                if (result.status === "conflict") return respond({activeJobId: result.activeJobId}, 409);
                // Same public projection as StudioServer, covered separately through real HTTP.
                return respond(result.job, result.status === "reattached" ? 200 : 202);
            }
            if (route.startsWith("/api/project/simulations/")) return respond(service.getStatusForProject(root, route.split("/").at(-1)!));
            if (route === "/api/project/reports") return respond(service.listReports(root));
            if (route.startsWith("/api/project/reports/")) {
                const result = service.getReport(root, route.split("/").at(-1)!);
                return result.status === "ok" ? respond({report: result.report, statistics: result.statistics}) : respond({error: "Report not ready"}, 404);
            }
            return test.fetchImpl(url, init);
        };
        let view: ReturnType<typeof renderRoutedApp> | undefined;
        try {
            await waitFor(() => expect(service.getStatus(original.job.id)?.roundsCompleted).toBe(50));
            view = renderRoutedApp({fetchImpl, initialEntries: ["/project/gameModel"]});
            await screen.findByRole("heading", {name: "Sample Slot"});
            const paytable = await editPayout(user, "11");
            await user.click(within(paytable).getByRole("button", {name: "Save"}));
            await within(paytable).findByRole("button", {name: "Edit"});
            expect(test.payout()).toBe(11);
            expect(observed).toBe(false);
            await user.click(screen.getByRole("button", {name: "Simulation"}));
            const rounds = await screen.findByLabelText(/^Rounds/);
            await user.clear(rounds);
            await user.type(rounds, "100");
            await user.click(screen.getByRole("button", {name: "Run Simulation"}));
            await waitFor(() => expect(receipts).toEqual(["reattached"]));
            expect(jobs.list(root)).toHaveLength(1);
            expect(service.getStatus(original.job.id)?.status).toBe("running");
            const workflow = await screen.findByRole("region", {name: "Simulation workflow"});
            expect(await within(workflow).findByRole("button", {name: "Cancel"})).toBeEnabled();
            const jobCard = await screen.findByRole("region", {name: `simulation job ${original.job.id}`});
            expect(await within(jobCard).findByRole("button", {name: "Cancel"})).toBeEnabled();
            await act(async () => {
                release();
                await Promise.resolve();
            });
            await waitFor(() => expect(service.getStatus(original.job.id)?.status).toBe("completed"));
            const originalReport = JSON.stringify(service.getReport(root, original.job.id));
            await within(workflow).findByText(/Historical simulation result/);
            // Terminal observation can show the original report, but never as current design.
            expect(service.getReport(root, original.job.id)).toMatchObject({status: "ok", report: {rtp: 10}});
            await within(workflow).findByRole("button", {name: "Open full report"});
            expect(within(workflow).getByText(/Historical simulation result/)).toBeVisible();
            await user.click(within(workflow).getByRole("button", {name: /Export.*Download report/}));
            expect(within(workflow).getByRole("link", {name: "Download JSON"})).toHaveAttribute("href", `/api/project/reports/${original.job.id}/download?format=json`);
            await user.click(within(workflow).getByRole("button", {name: /Configure.*Set rounds/}));
            await user.click(within(workflow).getByRole("button", {name: "Run Simulation"}));
            await waitFor(() => expect(receipts).toEqual(["reattached", "created"]));
            await within(workflow).findByRole("button", {name: "Open full report"});
            expect(within(workflow).queryByText(/Historical simulation result/)).not.toBeInTheDocument();
            expect(jobs.list(root)).toHaveLength(2);
            const nextId = jobs.list(root).find(job => job.id !== original.job.id)!.id;
            expect(service.getReport(root, nextId)).toMatchObject({status: "ok", report: {rtp: 11}});
            expect(JSON.stringify(service.getReport(root, original.job.id))).toBe(originalReport);
            const reconstructed = new StudioSimulationService();
            reconstructed.attachJobService(new StudioJobService(new FileStudioJobRepository(directory)));
            expect(JSON.stringify(reconstructed.getReport(root, original.job.id))).toBe(originalReport);
        } finally {
            view?.unmount();
            release();
            await service.cancelAll();
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it.each(["loading", "fetch", "body"])("V2C-34-NAVIGATION-RECOVERY reaches guarded Configure after saved payout and %s exhaustion with the same real job", async phase => {
        const user = userEvent.setup();
        const test = fixture();
        const root = "/games/sample-slot";
        const directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c34-navigation-"));
        const jobs = new StudioJobService(new FileStudioJobRepository(directory));
        let release: () => void = () => undefined;
        const gate = new Promise<void>(resolve => {
            release = resolve;
        });
        const service = new StudioSimulationService(undefined, () => Promise.resolve(generatedMechanicsGame(test.blueprint())), undefined, 50, undefined, () => gate);
        service.attachJobService(jobs);
        let recoverContext = false;
        let lateContext: (() => void) | undefined;
        let submitted = 0;
        let originalId = "";
        const respond = (body: unknown, status = 200) => Promise.resolve({ok: status < 400, status, json: () => Promise.resolve(body)});
        const context = {status: "loaded", projectRoot: root, game: test.blueprint().manifest, type: "blueprint", capabilities: ["blueprint.build"]};
        const fetchImpl: FetchLike = (url, init) => {
            const [route] = url.split("?");
            if (route === "/api/project/context" && test.payout() === 11 && !recoverContext) {
                if (phase === "loading") return respond({status: "loading", projectRoot: root});
                return phase === "fetch" ? new Promise(resolve => {
                    lateContext = () => resolve({ok: true, status: 200, json: () => Promise.resolve(context)});
                }) : Promise.resolve({ok: true, status: 200, json: () => new Promise(resolve => {
                    lateContext = () => resolve(context);
                })});
            }
            if (route === "/api/project/jobs") return respond({jobs: jobs.list(root)});
            if (route.startsWith("/api/project/jobs/")) return respond(jobs.get(root, route.split("/").at(-1)!));
            if (route === "/api/project/simulations") {
                submitted++;
                const result = service.start(root, validateSimulationRequest(JSON.parse(init!.body!)));
                if (result.status !== "created") throw new Error("Expected one new execution");
                originalId = result.job.id;
                return respond(result.job, 202);
            }
            if (route.startsWith("/api/project/simulations/")) {
                return respond(service.getStatusForProject(root, route.split("/").at(-1)!));
            }
            if (route === "/api/project/reports") return respond(service.listReports(root));
            if (route.startsWith("/api/project/reports/")) {
                const result = service.getReport(root, route.split("/").at(-1)!);
                return result.status === "ok" ? respond({report: result.report, statistics: result.statistics}) : respond({error: "Report not ready"}, 404);
            }
            return test.fetchImpl(url, init);
        };
        let view: ReturnType<typeof renderRoutedApp> | undefined;
        try {
            view = renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"], strictMode: true});
            const rounds = await screen.findByLabelText(/^Rounds/);
            await user.clear(rounds);
            await user.type(rounds, "100");
            await user.click(screen.getByRole("button", {name: "Run Simulation"}));
            await waitFor(() => expect(service.getStatus(originalId)).toMatchObject({status: "running", roundsCompleted: 50}));
            const paytable = await editPayout(user, "11");
            await user.click(within(paytable).getByRole("button", {name: "Save"}));
            await within(paytable).findByRole("button", {name: "Edit"});
            expect(test.payout()).toBe(11);
            jest.useFakeTimers();
            fireEvent.click(screen.getByRole("button", {name: "Simulation"}));
            await act(() => jest.advanceTimersByTimeAsync(20_000));
            expect(view.router.state.location.pathname).toMatch(/gameModel$/);
            expect(screen.getByText(/Could not refresh this project/)).toBeVisible();
            expect(screen.getByText("Project navigation needs a retry")).toHaveAttribute("data-pokie-lifecycle-terminal", "error");
            expect(within(paytable).getByText("11")).toBeVisible();
            expect(service.getStatus(originalId)).toMatchObject({status: "running", roundsCompleted: 50});
            const card = screen.getByRole("region", {name: `simulation job ${originalId}`});
            expect(within(card).getByRole("button", {name: "Cancel"})).toBeEnabled();
            recoverContext = true;
            fireEvent.click(screen.getByRole("button", {name: "Retry project context"}));
            await act(() => jest.advanceTimersByTimeAsync(0));
            expect(view.router.state.location.pathname).toMatch(/simulation$/);
            const workflow = screen.getByRole("region", {name: "Simulation workflow"});
            fireEvent.click(within(workflow).getByRole("button", {name: /Configure.*Set rounds/}));
            await act(() => jest.advanceTimersByTimeAsync(0));
            expect(within(workflow).getByRole("button", {name: "Run Simulation"})).toBeDisabled();
            await act(async () => {
                lateContext?.();
                await Promise.resolve();
            });
            expect(screen.queryByText(/Could not refresh this project/)).not.toBeInTheDocument();
            expect(submitted).toBe(1);
            expect(jobs.list(root).map(job => job.id)).toEqual([originalId]);
            expect(service.getStatus(originalId)?.status).toBe("running");
            // Historical-result guidance belongs to an actual result, rather
            // than a still-running job. Complete the same old execution and
            // verify that navigation recovery did not grant it new authority.
            await act(async () => {
                release();
                await jest.advanceTimersByTimeAsync(1000);
            });
            expect(service.getStatus(originalId)?.status).toBe("completed");
            expect(service.getReport(root, originalId)).toMatchObject({status: "ok", report: {rtp: 10}});
            expect(within(workflow).getByText(/Historical simulation result/)).toBeVisible();
        } finally {
            view?.unmount();
            jest.useRealTimers();
            release();
            await service.cancelAll();
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it("V2C-34-SAVE-SUPERSEDE carries a pending selection to the accepted Save generation", async () => {
        const user = userEvent.setup();
        const test = fixture();
        let finishSave: (() => void) | undefined;
        let holdContext = false;
        let contextReads = 0;
        const releases: (() => void)[] = [];
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/home/blueprints/save") return new Promise(resolve => {
                finishSave = () => {
                    test.fetchImpl(url, init).then(resolve);
                };
            });
            if (url === "/api/project/context" && holdContext) {
                contextReads++;
                return new Promise(resolve => {
                    releases.push(() => {
                        test.fetchImpl(url, init).then(resolve);
                    });
                });
            }
            return test.fetchImpl(url, init);
        };
        const view = renderRoutedApp({fetchImpl, initialEntries: ["/project/gameModel"]});
        await screen.findByRole("heading", {name: "Sample Slot"});
        const paytable = await editPayout(user, "11");
        await user.click(within(paytable).getByRole("button", {name: "Save"}));
        await waitFor(() => expect(finishSave).toBeDefined());
        holdContext = true;
        await user.click(screen.getByRole("button", {name: "Simulation"}));
        await waitFor(() => expect(contextReads).toBe(1));
        await act(async () => {
            finishSave?.();
            await Promise.resolve();
        });
        await within(paytable).findByRole("button", {name: "Edit"});
        await waitFor(() => expect(contextReads).toBe(2));
        // The old terminal response cannot release the Save's newer generation.
        await act(async () => {
            releases[0]();
            await Promise.resolve();
        });
        expect(view.router.state.location.pathname).toMatch(/gameModel$/);
        await act(async () => {
            releases[1]();
            await Promise.resolve();
        });
        await screen.findByRole("button", {name: "Run Simulation"});
        expect(view.router.state.location.pathname).toMatch(/simulation$/);
        expect(test.payout()).toBe(11);
    });

    it("V2C-34-SIMULATION-SAVE invalidates the current report on accepted Save and preserves explicit historical inspection", async () => {
        const user = userEvent.setup();
        const test = fixture();
        const view = renderRoutedApp({fetchImpl: test.fetchImpl, initialEntries: ["/project/simulation"]});
        await runInitial(user);
        const paytable = await editPayout(user, "11");
        await user.click(within(paytable).getByRole("button", {name: "Save"}));
        await within(paytable).findByRole("button", {name: "Edit"});
        expect(test.payout()).toBe(11);
        expect(within(paytable).getByText("11")).toBeVisible();
        expect(JSON.parse(test.calls.find(call => call.url === "/api/home/blueprints/save")!.init!.body!)).toMatchObject({
            blueprint: {paytable: {A: {3: 11}}}, expectedHash: "payout-10", overwrite: true,
        });
        await user.click(screen.getByRole("button", {name: "Simulation"}));
        const workflow = await screen.findByRole("region", {name: "Simulation workflow"});
        expect(within(workflow).getByText(/Historical simulation result/)).toBeVisible();
        expect(within(workflow).queryByRole("button", {name: "Open full report"})).not.toBeInTheDocument();
        expect(within(workflow).queryByRole("button", {name: "Open completed simulation report"})).not.toBeInTheDocument();
        expect(within(workflow).queryByRole("link", {name: "Download JSON"})).not.toBeInTheDocument();
        const commonJob = await screen.findByRole("region", {name: "simulation job run-1"});
        expect(within(commonJob).getByText(/Historical simulation result/)).toBeVisible();
        expect(within(commonJob).getByRole("link", {name: "Download Simulation report"})).toHaveAttribute("href", "/api/project/reports/run-1/download?format=json");

        // Opening history is deliberate and labelled; bytes/provenance remain usable.
        await user.click(within(workflow).getByRole("button", {name: "Open latest report"}));
        await within(workflow).findByRole("button", {name: "Open full report"});
        expect(within(workflow).getByText(/Historical simulation result/)).toBeVisible();
        await user.click(within(workflow).getByRole("button", {name: /Export.*Download report/}));
        expect(within(workflow).getByRole("link", {name: "Download JSON"})).toHaveAttribute("href", "/api/project/reports/run-1/download?format=json");
        await user.click(within(workflow).getByRole("button", {name: /Configure.*Set rounds/}));
        await user.click(within(workflow).getByRole("button", {name: "Run Simulation"}));
        await within(workflow).findByRole("button", {name: "Open full report"});
        expect(within(workflow).queryByText(/Historical simulation result/)).not.toBeInTheDocument();
        expect(within(workflow).getAllByText("98.00%").length).toBeGreaterThan(0);

        // A new page cannot authenticate current source from durable metadata alone.
        view.unmount();
        renderRoutedApp({fetchImpl: test.fetchImpl, initialEntries: ["/project/simulation"]});
        const restored = await screen.findByRole("region", {name: "Simulation workflow"});
        await within(restored).findByRole("button", {name: "Open full report"});
        expect(within(restored).getByText(/Historical simulation result/)).toBeVisible();
    });

    it.each(["invalid", "conflict", "cancel"])("V2C-34-SIMULATION-REJECT preserves current results through %s and allows a later accepted Save", async rejection => {
        const user = userEvent.setup();
        const test = fixture();
        renderRoutedApp({fetchImpl: test.fetchImpl, initialEntries: ["/project/simulation"]});
        await runInitial(user);
        const paytable = await editPayout(user, rejection === "invalid" ? "0" : "11");
        if (rejection === "cancel") {
            await user.click(within(paytable).getByRole("button", {name: "Cancel"}));
            await user.click(await screen.findByRole("button", {name: "Confirm"}));
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        } else {
            test.setSaveRejected(rejection === "conflict");
            await user.click(within(paytable).getByRole("button", {name: "Save"}));
            await screen.findByText(rejection === "invalid" ? /Save blocked — correct these errors/ : /Source changed; reload before saving\./);
            expect(await within(paytable).findByLabelText("A x3 payout")).toHaveValue(rejection === "invalid" ? "0" : "11");
            if (rejection === "invalid") expect(test.calls.filter(call => call.url === "/api/home/blueprints/save")).toHaveLength(0);
            await user.click(within(paytable).getByRole("button", {name: "Cancel"}));
            await user.click(await screen.findByRole("button", {name: "Confirm"}));
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        }
        expect(test.payout()).toBe(10);
        await user.click(screen.getByRole("button", {name: "Simulation"}));
        const workflow = await screen.findByRole("region", {name: "Simulation workflow"});
        expect(await within(workflow).findByRole("button", {name: "Open full report"})).toBeVisible();
        expect(within(workflow).queryByText(/Historical simulation result/)).not.toBeInTheDocument();
        test.setSaveRejected(false);
        const corrected = await editPayout(user, "11");
        await user.click(within(corrected).getByRole("button", {name: "Save"}));
        await within(corrected).findByRole("button", {name: "Edit"});
        expect(test.payout()).toBe(11);
        await user.click(screen.getByRole("button", {name: "Simulation"}));
        expect(await screen.findByText(/The saved design changed/)).toBeVisible();
    });

    it.each(["report", "comparison"])("V2C-34-SIMULATION-LATE retires a pending %s on Save", async pending => {
        const user = userEvent.setup();
        const test = fixture();
        let delay = false;
        let finish: (() => Promise<void>) | undefined;
        const fetchImpl: FetchLike = (url, init) => test.fetchImpl(url, init).then(response => {
            if (delay && url === "/api/project/reports/run-1") return {...response, json: () => new Promise(resolve => {
                finish = () => response.json().then(resolve);
            })};
            return response;
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});
        await runInitial(user);
        if (pending === "comparison") {
            await user.click(screen.getByRole("button", {name: /Configure.*Set rounds/}));
            await user.click(screen.getByRole("button", {name: "Run Simulation"}));
            await screen.findByRole("button", {name: "Open full report"});
            expect(screen.getAllByText("98.00%").length).toBeGreaterThan(0);
        }
        delay = true;
        if (pending === "report") await user.click(screen.getByRole("button", {name: "Open latest report"}));
        else {
            await user.click(screen.getByRole("button", {name: "Compare with another run"}));
            await user.click(await screen.findByRole("button", {name: /sample-slot v1\.0\.0/}));
        }
        await waitFor(() => expect(finish).toBeDefined());
        const paytable = await editPayout(user, "11");
        await user.click(within(paytable).getByRole("button", {name: "Save"}));
        await within(paytable).findByRole("button", {name: "Edit"});
        await act(async () => {
            await finish!();
        });
        await user.click(screen.getByRole("button", {name: "Simulation"}));
        const workflow = await screen.findByRole("region", {name: "Simulation workflow"});
        expect(within(workflow).queryByRole("button", {name: "Open full report"})).not.toBeInTheDocument();
        expect(within(workflow).queryByText("Comparison")).not.toBeInTheDocument();
        expect(within(workflow).getByText(/Historical simulation result/)).toBeVisible();
        delay = false;
        await user.click(within(workflow).getByRole("button", {name: "Open latest report"}));
        await within(workflow).findByRole("button", {name: "Open full report"});
        expect(within(workflow).getByText(/Historical simulation result/)).toBeVisible();
    });

    it("V35 saved-source revision follows the accepted Game Model edit back to Overview and permits a fresh run", async () => {
        const user = userEvent.setup();
        const test = fixture();
        const old = {
            id: "old-opt", projectId: "/games/sample-slot", operation: "optimization", status: "completed",
            createdAt: 1, conflictKey: "opt", request: {request: optimizationRequest(), sourceRevision: "sha256:payout-10"},
            result: {summary: "Retained optimization", detail: {status: "attained", diagnostics: [], evidence: {sourceRevision: "sha256:payout-10"}, candidate: {type: "blueprint", sourceRevision: "sha256:payout-10"}}},
        };
        const original = JSON.stringify(old);
        const starts: Record<string, unknown>[] = [];
        let retainedJobs: unknown[] = [old];
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/jobs") return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({jobs: retainedJobs})});
            if (url.endsWith("/optimization/support")) return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({supported: true, reason: "Saved payout tuning", sourceRevision: `sha256:payout-${test.payout()}`})});
            if (url.endsWith("/optimization/start")) {
                const body = JSON.parse(init!.body as string);
                starts.push(body);
                const fresh = {...old, id: "new-opt", createdAt: 2, status: "running", request: {request: body.request, sourceRevision: body.sourceRevision}, result: undefined};
                retainedJobs = [fresh, old];
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({job: fresh})});
            }
            return test.fetchImpl(url, init);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByText("Verdict: attained");
        expect(screen.getByRole("button", {name: "Apply reviewed changes to source"})).toBeEnabled();
        const paytable = await editPayout(user, "11");
        await user.click(within(paytable).getByRole("button", {name: "Save"}));
        await within(paytable).findByRole("button", {name: "Edit"});
        expect(test.payout()).toBe(11);
        expect(within(paytable).getByText("11")).toBeVisible();
        await user.click(screen.getByRole("button", {name: "Overview"}));
        expect(await screen.findByText(/Stale optimization result/)).toBeVisible();
        expect(screen.queryByText("Verdict: attained")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Apply reviewed changes to source"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Save reviewed candidate"})).not.toBeInTheDocument();
        expect(screen.getByRole("region", {name: "optimization job old-opt"})).toHaveTextContent("Retained optimization");
        expect(JSON.stringify(old)).toBe(original);
        await user.click(screen.getByRole("button", {name: "Check tuning support"}));
        await screen.findByText("Saved payout tuning");
        await user.click(screen.getByRole("button", {name: "Run optimization"}));
        expect(await screen.findByRole("button", {name: "Cancel optimization"})).toBeEnabled();
        expect(starts).toEqual([{request: optimizationRequest(), sourceRevision: "sha256:payout-11", expectedProjectRoot: "/games/sample-slot"}]);
        retainedJobs = [{...old, id: "new-opt", createdAt: 2, request: {...old.request, sourceRevision: "sha256:payout-11"}, result: {...old.result, detail: {...old.result.detail, evidence: {sourceRevision: "sha256:payout-11"}, candidate: {type: "blueprint", sourceRevision: "sha256:payout-11"}}}}, old];
        await user.click(screen.getByRole("button", {name: "Game Model"}));
        await screen.findByText("Paytable", {selector: "span"});
        await user.click(screen.getByRole("button", {name: "Overview"}));
        expect(await screen.findByText("Verdict: attained")).toBeVisible();
        expect(screen.queryByText(/Stale optimization result/)).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Apply reviewed changes to source"})).toBeEnabled();
        expect(screen.getByRole("button", {name: "Save reviewed candidate"})).toBeDisabled();
    });

    it.each(["invalid", "conflict", "cancel"])("V35 saved-source keeps optimizer review current after %s without an accepted Save", async rejection => {
        const user = userEvent.setup();
        const test = fixture();
        const job = {
            id: "reviewed-opt", projectId: "/games/sample-slot", operation: "optimization", status: "completed",
            createdAt: 1, conflictKey: "opt", request: {request: optimizationRequest(), sourceRevision: "sha256:payout-10"},
            result: {summary: "Reviewed optimization", detail: {status: "attained", diagnostics: [], candidate: {type: "blueprint", sourceRevision: "sha256:payout-10"}}},
        };
        const fetchImpl: FetchLike = (url, init) => url === "/api/project/jobs"
            ? Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({jobs: [job]})}) : test.fetchImpl(url, init);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByText("Verdict: attained");
        const paytable = await editPayout(user, rejection === "invalid" ? "0" : "11");
        if (rejection !== "cancel") {
            test.setSaveRejected(rejection === "conflict");
            await user.click(within(paytable).getByRole("button", {name: "Save"}));
            await screen.findByText(rejection === "invalid" ? /Save blocked — correct these errors/ : /Source changed; reload before saving/);
        }
        await user.click(within(paytable).getByRole("button", {name: "Cancel"}));
        await user.click(await screen.findByRole("button", {name: "Confirm"}));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        await user.click(screen.getByRole("button", {name: "Overview"}));
        expect(await screen.findByText("Verdict: attained")).toBeVisible();
        expect(screen.queryByText(/Stale optimization result/)).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Apply reviewed changes to source"})).toBeEnabled();
        expect(screen.getByLabelText("Candidate destination")).toBeVisible();
        expect(test.payout()).toBe(10);
    });

    it("V2C-34-SIMULATION-APPLY invalidates through the sibling authored Apply but preserves Save-as", async () => {
        const user = userEvent.setup();
        const test = fixture();
        let exposeOptimization = false;
        const optimizationJob = {
            id: "opt-1", projectId: "/games/sample-slot", operation: "optimization", status: "completed",
            createdAt: 1, conflictKey: "opt", request: {request: optimizationRequest()}, result: {
                summary: "Reviewed tuning", detail: {status: "attained", diagnostics: [],
                    candidate: {path: "/scratch/reviewed.json", type: "blueprint"}},
            },
        };
        const actions: string[] = [];
        const fetchImpl: FetchLike = (url, init) => {
            if (url.endsWith("/optimization/save") || url.endsWith("/optimization/apply")) {
                actions.push(url);
                if (url.endsWith("apply")) test.applyPayout();
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({outputPath: "/reviewed.json"})});
            }
            return test.fetchImpl(url, init).then(response => {
                if (exposeOptimization && url.split("?")[0] === "/api/project/jobs") return {...response, json: async () => {
                    const body = await response.json() as {jobs: unknown[]};
                    return {jobs: [...body.jobs, optimizationJob]};
                }};
                return response;
            });
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});
        await runInitial(user);
        exposeOptimization = true;
        await user.click(screen.getByRole("button", {name: "Overview"}));
        const destination = await screen.findByLabelText("Candidate destination");
        await user.type(destination, "/reviewed.json");
        await user.click(screen.getByRole("button", {name: "Save reviewed candidate"}));
        await screen.findByText("Candidate saved: /reviewed.json");
        expect(test.payout()).toBe(10);
        await user.click(screen.getByRole("button", {name: "Simulation"}));
        const workflow = await screen.findByRole("region", {name: "Simulation workflow"});
        expect(await within(workflow).findByRole("button", {name: "Open full report"})).toBeVisible();
        expect(within(workflow).queryByText(/Historical simulation result/)).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Overview"}));
        await user.click(await screen.findByRole("button", {name: "Apply reviewed changes to source"}));
        await screen.findByText(/Authored changes applied/);
        expect(test.payout()).toBe(11);
        await user.click(screen.getByRole("button", {name: "Simulation"}));
        const changed = await screen.findByRole("region", {name: "Simulation workflow"});
        expect(within(changed).getByText(/Historical simulation result/)).toBeVisible();
        expect(within(changed).queryByRole("button", {name: "Open full report"})).not.toBeInTheDocument();
        expect(actions).toEqual(["/api/project/optimization/save", "/api/project/optimization/apply"]);
    });
});
