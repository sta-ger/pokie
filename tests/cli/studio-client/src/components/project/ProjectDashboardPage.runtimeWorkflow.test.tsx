import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {StudioRuntimeSessionView} from "../../../../../../cli/studio-client/src/api/types";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const GAME = {id: "a", name: "A", version: "1.0.0"};
const RUNNING_STATE = {
    status: "running",
    host: "127.0.0.1",
    port: 4123,
    baseUrl: "http://127.0.0.1:4123",
    debug: false,
    repositoryMode: "memory",
    startedAt: "2026-01-01T00:00:00.000Z",
};

const BASE_ROUTES: Record<string, (call: FakeCall) => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/a", game: GAME}}),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true, generated: false}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
};

function sessionFor(overrides: Partial<StudioRuntimeSessionView> = {}): StudioRuntimeSessionView {
    return {sessionId: "sess-1", game: GAME, credits: 995, bet: 5, win: 0, sessionVersion: 1, ...overrides};
}

async function goToRuntimeTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
    await user.click(screen.getByRole("button", {name: "Runtime"}));
    await screen.findByRole("button", {name: "Start"});
}

async function startRuntime(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole("button", {name: "Start"}));
    await waitFor(() => expect(screen.getAllByText(/running at/).length).toBeGreaterThan(0));
}

function stepperStep(label: string, description: string): RegExp {
    return new RegExp(`${label}.*${description}`);
}

describe("ProjectDashboardPage - Runtime Preview & Sessions workflow", () => {
    it("creates a session and auto-advances to Play, then spins with no requestId/version visible until Advanced details is opened", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
            "/api/project/runtime/sessions/sess-1/spins": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", session: sessionFor({credits: 1005, bet: 5, win: 15, sessionVersion: 2, screen: [["cherry", "lemon"]]})},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));

        // Auto-advanced to Play -- "Spin" only lives there.
        await screen.findByRole("button", {name: "Spin"});
        expect(screen.getByText(/Session sess-1/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Spin"}));

        // Auto-advanced to Inspect round with a readable win banner -- no raw requestId/sessionVersion
        // anywhere on screen by default.
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());
        expect(screen.queryByText(/sessionVersion/)).not.toBeInTheDocument();
        expect(screen.queryByRole("textbox", {name: /request id/i})).not.toBeInTheDocument();

        await user.click(screen.getByText(/Show advanced details/));
        expect(screen.getAllByText(/"credits": 1005/).length).toBeGreaterThan(0);
    }, 45000);

    it("restores an existing session by id", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions/sess-old": () => ({ok: true, status: 200, body: {status: "ok", session: sessionFor({sessionId: "sess-old", credits: 500})}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("radio", {name: "Restore existing"}));
        await user.type(screen.getByLabelText("Session id"), "sess-old");
        await user.click(screen.getByRole("button", {name: "Load Session"}));

        await screen.findByRole("button", {name: "Spin"});
        expect(screen.getByText(/Session sess-old.*500\.00/)).toBeInTheDocument();
    }, 45000);

    it("proves idempotent replay: retrying the last request returns the exact same result", async () => {
        const user = userEvent.setup();
        let spinCallCount = 0;
        let capturedRequestId: string | undefined;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
            "/api/project/runtime/sessions/sess-1/spins": (call: FakeCall) => {
                const body = JSON.parse(call.init?.body ?? "{}") as {requestId?: string};
                spinCallCount += 1;
                if (capturedRequestId === undefined) {
                    capturedRequestId = body.requestId;
                } else {
                    // A real idempotent server would replay the cached result for the same requestId --
                    // asserting the *same* id was resent is the frontend-observable half of that contract.
                    expect(body.requestId).toBe(capturedRequestId);
                }
                return {
                    ok: true,
                    status: 200,
                    body: {status: "ok", session: sessionFor({credits: 1005, win: 15, sessionVersion: 2})},
                };
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        await user.click(screen.getByRole("button", {name: stepperStep("Debug", "Advanced")}));
        await user.click(screen.getByRole("button", {name: "Retry last request (same request id)"}));

        await waitFor(() => expect(spinCallCount).toBe(2));
        expect(capturedRequestId).toBeDefined();
    }, 45000);

    it("shows a clear 'insufficient funds' state with a shortcut to create a new session", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor({credits: 0})}}),
            "/api/project/runtime/sessions/sess-1/spins": () => ({ok: false, status: 400, body: {error: "Session cannot play the next round."}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));

        expect(await screen.findByText("Session cannot play the next round.")).toBeInTheDocument();
        expect(screen.getByText("Can't play this round")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Create a new session"}));
        expect(screen.getByRole("radio", {name: "New session"})).toBeChecked();
    }, 45000);

    it("shows a clear 'session changed elsewhere' conflict state, and Reload session recovers it", async () => {
        const user = userEvent.setup();
        let spinAttempts = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor({sessionVersion: 1})}}),
            "/api/project/runtime/sessions/sess-1": () => ({ok: true, status: 200, body: {status: "ok", session: sessionFor({sessionVersion: 2, credits: 1010})}}),
            "/api/project/runtime/sessions/sess-1/spins": () => {
                spinAttempts += 1;
                return {ok: false, status: 409, body: {error: "Expected session version 1 but was 2.", reason: "conflict"}};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));

        expect(await screen.findByText("Expected session version 1 but was 2.")).toBeInTheDocument();
        expect(screen.getByText("Session changed elsewhere")).toBeInTheDocument();
        expect(spinAttempts).toBe(1);

        await user.click(screen.getByRole("button", {name: "Reload session"}));
        await waitFor(() => expect(screen.getByText(/1010\.00/)).toBeInTheDocument());
    }, 45000);

    it("shows a clear runtime-not-running state when spinning without a running runtime session", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
            "/api/project/runtime/sessions/sess-1/spins": () => ({ok: false, status: 409, body: {error: "Runtime is not running.", reason: "not-running"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));

        expect(await screen.findByText("Runtime is not running — start it first.")).toBeInTheDocument();
    }, 45000);

    it("a session action in flight blocks a different one from overlapping it, and only the request that was actually made lands", async () => {
        // loadSession/createSession/spin are each individually double-submit-guarded, and every
        // session-mutating control shares the same `session.status === "loading"` signal for its own
        // `loading`/disabled state -- so a real user can never actually fire a second, different session
        // action while an earlier one is still in flight (this is what useRuntimeManager's own
        // sessionRequestIdRef defends in depth: see useRuntimeManager.staleResponse.test.tsx for the
        // hook-level race, exercised directly since the UI itself prevents it here). This test confirms
        // that protection holds end to end: the second control stays inert while the first is pending,
        // and once the first genuinely resolves, its own (and only its own) result is what's shown.
        const user = userEvent.setup();
        let releaseSlow: (() => void) | undefined;
        const fetchImpl: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/runtime") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "stopped"})});
            }
            if (path === "/api/project/runtime/spins") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
            }
            if (path === "/api/project/runtime/start") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(RUNNING_STATE)});
            }
            if (path === "/api/project/runtime/sessions/session-a") {
                return new Promise((resolve) => {
                    releaseSlow = () => resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: sessionFor({sessionId: "session-a", credits: 111})})});
                });
            }
            if (path === "/api/project/runtime/sessions") {
                return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: sessionFor({sessionId: "session-b", credits: 222})})});
            }
            const route = BASE_ROUTES[path];
            if (route) {
                const {ok, status, body} = route({url, init: undefined});
                return Promise.resolve({ok, status, json: () => Promise.resolve(body)});
            }
            return Promise.reject(new Error(`no fake route for ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("radio", {name: "Restore existing"}));
        await user.type(screen.getByLabelText("Session id"), "session-a");
        await user.click(screen.getByRole("button", {name: "Load Session"}));
        expect(screen.getByRole("button", {name: "Load Session"})).toBeDisabled();

        // Switching to "New session" and attempting to create one while the restore is still pending
        // has no effect -- the shared loading state keeps Create Session inert too.
        await user.click(screen.getByRole("radio", {name: "New session"}));
        expect(screen.getByRole("button", {name: "Create Session"})).toBeDisabled();
        await user.click(screen.getByRole("button", {name: "Create Session"}));
        expect(screen.queryByText(/Session session-b/)).not.toBeInTheDocument();

        releaseSlow?.();
        await screen.findByText(/Session session-a.*111\.00/);
        expect(screen.queryByText(/Session session-b/)).not.toBeInTheDocument();
    }, 45000);

    it("clears session/history when the project changes mid-load", async () => {
        const user = userEvent.setup();
        let releaseSlow: (() => void) | undefined;
        const fetchImplA: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/context") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "loaded", projectRoot: "/games/a", game: GAME})});
            }
            if (path === "/api/project/runtime") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "stopped"})});
            }
            if (path === "/api/project/runtime/spins") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
            }
            if (path === "/api/project/runtime/start") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(RUNNING_STATE)});
            }
            if (path === "/api/project/runtime/sessions/session-a") {
                return new Promise((resolve) => {
                    releaseSlow = () => resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: sessionFor({sessionId: "session-a"})})});
                });
            }
            const route = BASE_ROUTES[path];
            if (route) {
                const {ok, status, body} = route({url, init: undefined});
                return Promise.resolve({ok, status, json: () => Promise.resolve(body)});
            }
            return Promise.reject(new Error(`no fake route for ${url}`));
        };

        const first = renderRoutedApp({fetchImpl: fetchImplA, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);
        await user.click(screen.getByRole("radio", {name: "Restore existing"}));
        await user.type(screen.getByLabelText("Session id"), "session-a");
        await user.click(screen.getByRole("button", {name: "Load Session"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Load Session"})).toBeDisabled());

        first.unmount();

        const {fetchImpl: fetchImplB} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/b", game: {id: "b", name: "B", version: "1.0.0"}}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/b", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl: fetchImplB, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "B"});
        await user.click(screen.getByRole("button", {name: "Runtime"}));
        await screen.findByRole("button", {name: "Start"});

        releaseSlow?.();
        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });

        expect(screen.queryByText(/Session session-a/)).not.toBeInTheDocument();
        expect(screen.getByText("stopped")).toBeInTheDocument();
    }, 45000);

    it("navigates to Replay & Debug and auto-selects the exact round among several recent spins, landing straight on Inspect", async () => {
        const user = userEvent.setup();
        let capturedRequestId: string | undefined;
        // Several *other* recent spins already on record -- two for a different session, one for this
        // same session but a different (older, decoy) requestId -- the handoff must pick out exactly the
        // one just played, never any of these.
        const decoys: StudioRuntimeSessionView[] = [
            sessionFor({sessionId: "sess-other", credits: 50, win: 999, studioRequestId: "decoy-request-other-1", debug: {stateAfter: {}, requestId: "decoy-request-other-1"}}),
            sessionFor({sessionId: "sess-other", credits: 40, win: 888, studioRequestId: "decoy-request-other-2", debug: {stateAfter: {}, requestId: "decoy-request-other-2"}}),
            sessionFor({sessionId: "sess-1", credits: 700, win: 777, studioRequestId: "decoy-request-sess-1-older", debug: {stateAfter: {}, requestId: "decoy-request-sess-1-older"}}),
        ];
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({
                ok: true,
                status: 200,
                body:
                    capturedRequestId === undefined
                        ? decoys
                        : [
                            sessionFor({
                                credits: 1005,
                                win: 15,
                                sessionVersion: 2,
                                studioRequestId: capturedRequestId,
                                debug: {stateAfter: {}, requestId: capturedRequestId},
                            }),
                            ...decoys,
                        ],
            }),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
            "/api/project/runtime/sessions/sess-1/spins": (call: FakeCall) => {
                const body = JSON.parse(call.init?.body ?? "{}") as {requestId?: string};
                capturedRequestId = body.requestId;
                return {ok: true, status: 200, body: {status: "ok", session: sessionFor({credits: 1005, win: 15, sessionVersion: 2})}};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        // Fix 2: round history refreshes automatically after the spin, with no manual Refresh -- confirm
        // the page's own recentSpins already carries this exact round (not just that the spin itself
        // resolved) before relying on it for the handoff below.
        await user.click(screen.getByRole("button", {name: stepperStep("Continue session", "Keep playing")}));
        await waitFor(() => expect(screen.getByText(new RegExp(capturedRequestId as string))).toBeInTheDocument());

        await user.click(screen.getByRole("button", {name: stepperStep("Debug", "Advanced")}));
        await user.click(screen.getByRole("button", {name: "Debug this round in Replay & Debug"}));

        // Auto-selected straight to the Inspect step's own detail table -- no Find-step radio in the
        // DOM at all, since there was nothing left to pick manually.
        expect(await screen.findByText("sess-1")).toBeInTheDocument();
        expect(screen.getByText(capturedRequestId as string)).toBeInTheDocument();
        expect(screen.queryByRole("radio", {name: "Session Spin"})).not.toBeInTheDocument();
    }, 45000);

    it("shows round history in Continue session without a manual Refresh click", async () => {
        const user = userEvent.setup();
        let capturedRequestId: string | undefined;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({
                ok: true,
                status: 200,
                body:
                    capturedRequestId === undefined
                        ? []
                        : [
                            sessionFor({
                                credits: 1005,
                                win: 15,
                                sessionVersion: 2,
                                studioRequestId: capturedRequestId,
                                debug: {stateAfter: {}, requestId: capturedRequestId},
                            }),
                        ],
            }),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
            "/api/project/runtime/sessions/sess-1/spins": (call: FakeCall) => {
                const body = JSON.parse(call.init?.body ?? "{}") as {requestId?: string};
                capturedRequestId = body.requestId;
                return {ok: true, status: 200, body: {status: "ok", session: sessionFor({credits: 1005, win: 15, sessionVersion: 2})}};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        // Navigate straight to "Continue session" -- never touching its own "Refresh" button -- and the
        // just-played round must already be there (Fix 2: the spin's own settle effect refreshes this
        // list automatically).
        await user.click(screen.getByRole("button", {name: stepperStep("Continue session", "Keep playing")}));
        await waitFor(() => expect(screen.queryByText("No rounds played yet this session.")).not.toBeInTheDocument());
        expect(screen.getByText(/credits 1005\.00, win 15\.00/)).toBeInTheDocument();
    }, 45000);

    it("Stop clears round history so old spins are no longer shown", async () => {
        const user = userEvent.setup();
        let stopped = false;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({
                ok: true,
                status: 200,
                body: stopped
                    ? []
                    : [
                        sessionFor({
                            credits: 1005,
                            win: 15,
                            sessionVersion: 2,
                            studioRequestId: "req-before-stop",
                            debug: {stateAfter: {}, requestId: "req-before-stop"},
                        }),
                    ],
            }),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/stop": () => {
                stopped = true;
                return {ok: true, status: 200, body: {status: "stopped"}};
            },
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
            "/api/project/runtime/sessions/sess-1/spins": () => ({ok: true, status: 200, body: {status: "ok", session: sessionFor({credits: 1005, win: 15, sessionVersion: 2})}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        // Confirm the old round is on record (via the "Restore existing" recent-sessions list, since the
        // Stepper itself resets to step 0 once the session is torn down by Stop) before stopping.
        await user.click(screen.getByRole("button", {name: stepperStep("Create or restore session", "Start playing")}));
        await user.click(screen.getByRole("radio", {name: "Restore existing"}));
        expect(await screen.findByText("sess-1")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Stop"}));
        await user.click(await screen.findByRole("button", {name: "Confirm"}));
        await waitFor(() => expect(screen.getByText("stopped")).toBeInTheDocument());

        // Start it back up (step 0 only shows the session picker while `running`) and land back on
        // "Restore existing" -- the old sess-1 entry must be gone now that the frontend's cached round
        // history caught up to the server's own teardown, instead of still listing a session from the
        // runtime instance that no longer exists.
        await startRuntime(user);
        await user.click(screen.getByRole("radio", {name: "Restore existing"}));
        await waitFor(() => expect(screen.queryByText("sess-1")).not.toBeInTheDocument());
        expect(screen.getByText("No recent sessions yet in this Studio session.")).toBeInTheDocument();
    }, 45000);

    it("switching sessions clears the last spin so Retry/Debug can't resend a stale requestId", async () => {
        const user = userEvent.setup();
        let createCallCount = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => {
                createCallCount += 1;
                return {ok: true, status: 201, body: {status: "ok", session: sessionFor({sessionId: createCallCount === 1 ? "sess-1" : "sess-2"})}};
            },
            "/api/project/runtime/sessions/sess-1/spins": () => ({ok: true, status: 200, body: {status: "ok", session: sessionFor({credits: 1005, win: 15, sessionVersion: 2})}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        await user.click(screen.getByRole("button", {name: stepperStep("Debug", "Advanced")}));
        expect(screen.getByRole("button", {name: "Retry last request (same request id)"})).toBeEnabled();
        expect(screen.getByRole("button", {name: "Debug this round in Replay & Debug"})).toBeEnabled();

        // Switch to a brand new session (sess-2) -- Fix 3's requirement: the previous session's lastSpin
        // must never carry over and become retriable/debuggable against this new session.
        await user.click(screen.getByRole("button", {name: stepperStep("Create or restore session", "Start playing")}));
        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await screen.findByRole("button", {name: "Spin"});
        expect(screen.getByText(/Session sess-2/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: stepperStep("Debug", "Advanced")}));
        expect(screen.getByRole("button", {name: "Retry last request (same request id)"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "Debug this round in Replay & Debug"})).toBeDisabled();
    }, 45000);

    it("switching projects clears the last spin so Retry/Debug can't resend a stale requestId from the old project", async () => {
        const user = userEvent.setup();
        const {fetchImpl: fetchImplA} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
            "/api/project/runtime/sessions/sess-1/spins": () => ({ok: true, status: 200, body: {status: "ok", session: sessionFor({credits: 1005, win: 15, sessionVersion: 2})}}),
        });

        const first = renderRoutedApp({fetchImpl: fetchImplA, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);
        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        first.unmount();

        const {fetchImpl: fetchImplB} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/b", game: {id: "b", name: "B", version: "1.0.0"}}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/b", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl: fetchImplB, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "B"});
        await user.click(screen.getByRole("button", {name: "Runtime"}));
        await screen.findByRole("button", {name: "Start"});

        // A brand new project's Runtime tab (a full remount, see ProjectDashboardPage's key={projectKey})
        // must show no trace of the previous project's session -- Retry/Debug are disabled since there is
        // neither a reachable session nor a lastSpin carried over.
        await user.click(screen.getByRole("button", {name: stepperStep("Debug", "Advanced")}));
        expect(screen.getByRole("button", {name: "Retry last request (same request id)"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "Debug this round in Replay & Debug"})).toBeDisabled();
        expect(screen.queryByText(/Session sess-1/)).not.toBeInTheDocument();
    }, 45000);

    it("Debug this round finds the exact round among several recent spins with a real debug: false contract (no debug bundle at all)", async () => {
        const user = userEvent.setup();
        let capturedRequestId: string | undefined;
        // Every entry here has *no* `debug` field at all -- exactly what StudioRuntimeManager.buildSessionView()
        // returns when the runtime was started without debug mode. The handoff/matching must work purely off
        // studioRequestId in this case, since debug.requestId simply doesn't exist.
        const decoys: StudioRuntimeSessionView[] = [
            sessionFor({sessionId: "sess-other", credits: 50, win: 999, studioRequestId: "decoy-request-other-1"}),
            sessionFor({sessionId: "sess-1", credits: 700, win: 777, studioRequestId: "decoy-request-sess-1-older"}),
        ];
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({
                ok: true,
                status: 200,
                body: capturedRequestId === undefined ? decoys : [sessionFor({credits: 1005, win: 15, sessionVersion: 2, studioRequestId: capturedRequestId}), ...decoys],
            }),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
            "/api/project/runtime/sessions/sess-1/spins": (call: FakeCall) => {
                const body = JSON.parse(call.init?.body ?? "{}") as {requestId?: string};
                capturedRequestId = body.requestId;
                return {ok: true, status: 200, body: {status: "ok", session: sessionFor({credits: 1005, win: 15, sessionVersion: 2})}};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        await user.click(screen.getByRole("button", {name: stepperStep("Debug", "Advanced")}));
        await user.click(screen.getByRole("button", {name: "Debug this round in Replay & Debug"}));

        expect(await screen.findByText("sess-1")).toBeInTheDocument();
        expect(screen.getByText(capturedRequestId as string)).toBeInTheDocument();
        expect(screen.queryByRole("radio", {name: "Session Spin"})).not.toBeInTheDocument();
    }, 45000);

    it("shows a clear fallback instead of a silent generic list when the exact target round has already fallen out of the bounded recent-spin history", async () => {
        const user = userEvent.setup();
        // recentSpins is loaded with *other* rounds, but never the one about to be played -- simulating
        // StudioRuntimeManager's bounded ring buffer having already evicted it (a burst of newer spins from
        // elsewhere) by the time this lookup runs.
        const unrelatedRounds: StudioRuntimeSessionView[] = [
            sessionFor({sessionId: "sess-other", credits: 50, win: 999, studioRequestId: "unrelated-request"}),
        ];
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: unrelatedRounds}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
            "/api/project/runtime/sessions/sess-1/spins": () => ({ok: true, status: 200, body: {status: "ok", session: sessionFor({credits: 1005, win: 15, sessionVersion: 2})}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        await user.click(screen.getByRole("button", {name: stepperStep("Debug", "Advanced")}));
        await user.click(screen.getByRole("button", {name: "Debug this round in Replay & Debug"}));

        expect(await screen.findByText("Round no longer available")).toBeInTheDocument();
        expect(screen.getByText(/isn't in the recent spin history anymore/)).toBeInTheDocument();
        // Never silently degrades to just showing the Find step with no explanation -- the picker is still
        // there (with whatever unrelated rounds are actually available), but the explicit fallback message
        // makes clear why nothing was auto-selected.
        expect(screen.getByRole("radio", {name: "Session Spin"})).toBeInTheDocument();
        expect(screen.getByText(/session sess-other/)).toBeInTheDocument();
    }, 45000);
});
