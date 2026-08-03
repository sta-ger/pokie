import {screen, waitFor, within} from "@testing-library/react";
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
// Same as RUNNING_STATE, except started with debug mode on -- "Debug this round" is gated on this (see
// describeDebugAvailability's own doc comment: a runtime started without debug mode carries no internal
// trace data on any round, so the button offers a truthful "restart with debug mode on" recovery instead
// of pretending there's something to inspect), so every test exercising that handoff needs it.
const RUNNING_STATE_DEBUG = {...RUNNING_STATE, debug: true};

const BASE_ROUTES: Record<string, (call: FakeCall) => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/a", game: GAME, type: "blueprint", capabilities: ["blueprint.build"]}}),
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

// Every panel is a labeled Fieldset (Mantine's PageSection) -- scoping into one by its own legend text
// is what disambiguates e.g. the two "Show advanced details" disclosures (spin overrides vs. a round's
// own raw JSON) or the two places "sess-1" legitimately appears (the session card vs. a round history
// entry), now that this is a workspace of always-mounted panels rather than one Stepper page at a time.
function section(legend: string): HTMLElement {
    const fieldset = screen.getByText(legend, {selector: "legend"}).closest("fieldset");
    if (!fieldset) {
        throw new Error(`section "${legend}" not found`);
    }
    return fieldset as HTMLElement;
}

describe("ProjectDashboardPage - Runtime session workspace", () => {
    it("creates a session and shows the played round directly, with no requestId/version visible until Advanced details is opened", async () => {
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

        // No stepper to advance -- "Spin" is already reachable directly under the current session card.
        await screen.findByRole("button", {name: "Spin"});
        expect(screen.getByText(/Session sess-1/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Spin"}));

        // The played round shows up directly in "Inspect round" with a readable win banner -- no raw
        // requestId/sessionVersion visible on screen by default. The raw JSON lives in Advanced details'
        // mounted-but-hidden region (see AdvancedDisclosure's own doc comment), so this checks visibility,
        // not DOM presence. The "Request id" textbox genuinely isn't reachable via role query here -- it's
        // the session card's own Advanced-spin-options field, hidden behind its own (separate) disclosure.
        const inspect = section("Inspect round");
        // The settle effect that turns a completed spin into a selected round runs off the same
        // microtask chain as the fetch response, but a slow render can push its continuation onto a
        // real timer tick (see jestPolyfills.ts's own MessageChannel doc comment) -- waiting for the
        // round's own disclosure toggle to appear is what makes this robust to that, instead of
        // asserting immediately against whatever rendered synchronously after the click.
        await within(inspect).findByText(/Show advanced details/);
        expect(within(inspect).getByText(/"sessionVersion"/)).not.toBeVisible();
        expect(screen.queryByRole("textbox", {name: /request id/i})).not.toBeInTheDocument();

        await user.click(within(inspect).getByText(/Show advanced details/));
        expect(within(inspect).getAllByText(/"credits": 1005/).length).toBeGreaterThan(0);
    }, 60000);

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
    }, 60000);

    it("disables Load Session for a blank (or whitespace-only) session id, with inline guidance, and restores normal behavior once a session id is supplied", async () => {
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

        // Blank by default -- Load Session must not look clickable, and the input itself explains why.
        expect(screen.getByRole("button", {name: "Load Session"})).toBeDisabled();
        expect(screen.getByText("Required to load an existing session")).toBeInTheDocument();

        // Whitespace-only is the same as blank -- still disabled, no silent no-op click possible.
        await user.type(screen.getByLabelText("Session id"), "   ");
        expect(screen.getByRole("button", {name: "Load Session"})).toBeDisabled();

        // A real, trimmed session id restores the normal Load Session behavior.
        await user.clear(screen.getByLabelText("Session id"));
        await user.type(screen.getByLabelText("Session id"), "sess-old");
        expect(screen.getByRole("button", {name: "Load Session"})).not.toBeDisabled();

        await user.click(screen.getByRole("button", {name: "Load Session"}));

        await screen.findByRole("button", {name: "Spin"});
        expect(screen.getByText(/Session sess-old.*500\.00/)).toBeInTheDocument();
    }, 60000);

    it("shows a subject-specific recovery message, never the raw backend text or a silent no-op, when Load Session fails outright", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions/sess-bad": () => ({ok: true, status: 200, body: {status: "error", error: "Internal runtime session error."}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("radio", {name: "Restore existing"}));
        await user.type(screen.getByLabelText("Session id"), "sess-bad");
        await user.click(screen.getByRole("button", {name: "Load Session"}));

        expect(
            await screen.findByText("This request couldn't be completed. Try again, and check the Studio server logs if the problem persists."),
        ).toBeInTheDocument();
        expect(screen.queryByText("Internal runtime session error.")).not.toBeInTheDocument();
        // Still recoverable in place -- Load Session stays right there to retry, not a dead end.
        expect(screen.getByRole("button", {name: "Load Session"})).toBeInTheDocument();
    }, 60000);

    it("shows a subject-specific recovery message instead of raw backend text when the runtime server itself fails to start", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/start": () => ({
                ok: true,
                status: 200,
                body: {status: "failed", error: "EADDRINUSE: address already in use 127.0.0.1:4123"},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);

        await user.click(screen.getByRole("button", {name: "Start"}));

        expect(
            await screen.findByText(
                "The runtime server couldn't start -- the configured host/port is already in use. Choose a different port, or stop whatever else is using it, then try again.",
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText(/EADDRINUSE/)).not.toBeInTheDocument();
    }, 60000);

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

        const retry = section("Retry & Debug");
        expect(within(retry).getByText(capturedRequestId as string)).toBeInTheDocument();
        await user.click(within(retry).getByRole("button", {name: "Retry this request"}));

        await waitFor(() => expect(spinCallCount).toBe(2));
        expect(capturedRequestId).toBeDefined();
    }, 60000);

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

        expect(screen.getByText("Can't play this round")).toBeInTheDocument();
        expect(
            await screen.findByText(
                /This session can.t play another round right now -- for example, insufficient balance for the bet/,
            ),
        ).toBeInTheDocument();
        // The raw server message is still available, but tucked behind the disclosure, never the primary text.
        expect(screen.getByText("Session cannot play the next round.")).not.toBeVisible();
        await user.click(screen.getByText("Show advanced details (server message)"));
        expect(screen.getByText("Session cannot play the next round.")).toBeVisible();

        await user.click(screen.getByRole("button", {name: "Create a new session"}));
        expect(screen.getByRole("radio", {name: "New session"})).toBeChecked();
    }, 60000);

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

        expect(screen.getByText("Session changed elsewhere")).toBeInTheDocument();
        expect(
            await screen.findByText(/This session was updated by another request since it was last loaded here/),
        ).toBeInTheDocument();
        expect(spinAttempts).toBe(1);
        // The raw server message is still available, but tucked behind the disclosure, never the primary text.
        expect(screen.getByText("Expected session version 1 but was 2.")).not.toBeVisible();
        await user.click(screen.getByText("Show advanced details (server message)"));
        expect(screen.getByText("Expected session version 1 but was 2.")).toBeVisible();

        await user.click(screen.getByRole("button", {name: "Reload session"}));
        await waitFor(() => expect(screen.getByText(/1010\.00/)).toBeInTheDocument());
    }, 60000);

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
    }, 60000);

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
    }, 60000);

    it("clears session/history when the project changes mid-load", async () => {
        const user = userEvent.setup();
        let releaseSlow: (() => void) | undefined;
        const fetchImplA: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/context") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "loaded", projectRoot: "/games/a", game: GAME, type: "blueprint", capabilities: ["blueprint.build"]})});
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
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/b", game: {id: "b", name: "B", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
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
    }, 60000);

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
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE_DEBUG}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
            "/api/project/runtime/sessions/sess-1/spins": (call: FakeCall) => {
                const body = JSON.parse(call.init?.body ?? "{}") as {requestId?: string};
                capturedRequestId = body.requestId;
                return {
                    ok: true,
                    status: 200,
                    body: {status: "ok", session: sessionFor({credits: 1005, win: 15, sessionVersion: 2, debug: {stateAfter: {}, requestId: capturedRequestId}})},
                };
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        // Round history refreshes automatically after the spin, with no manual Refresh -- confirm the
        // page's own recentSpins already carries this exact round (not just that the spin itself
        // resolved) before relying on it for the handoff below. The just-played round is also
        // auto-selected (see the settle effect's own doc comment), which is what makes it Debug-ready.
        const history = section("Round history for this session");
        await waitFor(() => expect(within(history).getByText(new RegExp(capturedRequestId as string))).toBeInTheDocument());

        await user.click(screen.getByRole("button", {name: "Debug this round in Replay & Debug"}));

        // Auto-selected straight to the loaded round card -- no manual pick needed, even though the
        // source-choice control (and the recent-spin picker beneath it) both stay visible per Replay's
        // information architecture (there's no "Find step" that gets left behind once loaded).
        expect(await screen.findByRole("cell", {name: "sess-1"})).toBeInTheDocument();
        expect(screen.getByText(capturedRequestId as string)).toBeInTheDocument();
    }, 60000);

    it("shows round history without a manual Refresh click", async () => {
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

        // The just-played round must already be listed -- never touching "Round history"'s own "Refresh"
        // button (the spin's own settle effect refreshes this list automatically).
        const history = section("Round history for this session");
        await waitFor(() => expect(within(history).queryByText("No rounds played yet this session.")).not.toBeInTheDocument());
        expect(within(history).getByText(/credits 1005\.00, win 15\.00/)).toBeInTheDocument();
    }, 60000);

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

        // Confirm the old round is on record (via the "Restore existing" recent-sessions list) before
        // stopping.
        await user.click(screen.getByRole("button", {name: "Create or restore a different session"}));
        await user.click(screen.getByRole("radio", {name: "Restore existing"}));
        expect(await screen.findByRole("button", {name: "sess-1"})).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Stop"}));
        await user.click(await screen.findByRole("button", {name: "Confirm"}));
        await waitFor(() => expect(screen.getByText("stopped")).toBeInTheDocument());

        // Start it back up (the session switcher reopens on its own once the session is gone) and land
        // back on "Restore existing" -- the old sess-1 entry must be gone now that the frontend's cached
        // round history caught up to the server's own teardown, instead of still listing a session from
        // the runtime instance that no longer exists.
        await startRuntime(user);
        await user.click(screen.getByRole("radio", {name: "Restore existing"}));
        await waitFor(() => expect(screen.queryByText("sess-1")).not.toBeInTheDocument());
        expect(screen.getByText("No recent sessions yet in this Studio session.")).toBeInTheDocument();
    }, 60000);

    it("switching sessions clears the selected round so Retry/Debug can't act on stale data", async () => {
        const user = userEvent.setup();
        let createCallCount = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE_DEBUG}),
            "/api/project/runtime/sessions": () => {
                createCallCount += 1;
                return {ok: true, status: 201, body: {status: "ok", session: sessionFor({sessionId: createCallCount === 1 ? "sess-1" : "sess-2"})}};
            },
            "/api/project/runtime/sessions/sess-1/spins": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", session: sessionFor({credits: 1005, win: 15, sessionVersion: 2, debug: {stateAfter: {}, requestId: "req-1"}})},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        expect(screen.getByRole("button", {name: "Retry this request"})).toBeEnabled();
        expect(screen.getByRole("button", {name: "Debug this round in Replay & Debug"})).toBeEnabled();

        // Switch to a brand new session (sess-2) -- the previous session's selected round must never
        // carry over and become retriable/debuggable against this new session.
        await user.click(screen.getByRole("button", {name: "Create or restore a different session"}));
        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await screen.findByRole("button", {name: "Spin"});
        expect(screen.getByText(/Session sess-2/)).toBeInTheDocument();

        expect(screen.queryByRole("button", {name: "Retry this request"})).not.toBeInTheDocument();
        expect(screen.getByText("No request has been made yet in this session -- spin a round, or pick one from history below.")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Debug this round in Replay & Debug"})).not.toBeInTheDocument();
        expect(screen.getByText("Select a round from history below to debug.")).toBeInTheDocument();
    }, 60000);

    it("a failed subsequent spin can't leave the previous round actionable in Inspect, Retry, or Debug", async () => {
        const user = userEvent.setup();
        let spinCallCount = 0;
        const requestIds: string[] = [];
        let releaseSecondSpin: (() => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/project/runtime") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "stopped"})});
            }
            if (path === "/api/project/runtime/spins") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
            }
            if (path === "/api/project/runtime/start") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(RUNNING_STATE_DEBUG)});
            }
            if (path === "/api/project/runtime/sessions") {
                return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: sessionFor()})});
            }
            if (path === "/api/project/runtime/sessions/sess-1/spins") {
                const body = JSON.parse(init?.body ?? "{}") as {requestId?: string};
                spinCallCount += 1;
                requestIds.push(body.requestId ?? "");
                if (spinCallCount === 1) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        json: () =>
                            Promise.resolve({
                                status: "ok",
                                session: sessionFor({credits: 1005, win: 15, sessionVersion: 2, debug: {stateAfter: {}, requestId: requestIds[0]}}),
                            }),
                    });
                }
                // The second (and any later) spin stays pending until released -- this is what lets the
                // test assert the prior round is already gone the instant the new spin is issued, not only
                // once its (failing) response actually lands.
                return new Promise((resolve) => {
                    releaseSecondSpin = () =>
                        resolve({ok: false, status: 400, json: () => Promise.resolve({error: "Session cannot play the next round."})});
                });
            }
            const route = BASE_ROUTES[path];
            if (route) {
                const {ok, status, body} = route({url, init});
                return Promise.resolve({ok, status, json: () => Promise.resolve(body)});
            }
            return Promise.reject(new Error(`no fake route for ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        expect(screen.getByRole("button", {name: "Retry this request"})).toBeEnabled();
        expect(screen.getByRole("button", {name: "Debug this round in Replay & Debug"})).toBeEnabled();

        // Fire a second spin that will fail once it resolves. The prior round must stop being
        // Inspect/Debug-able the instant this spin is issued, not only once its failure lands.
        await user.click(screen.getByRole("button", {name: "Spin"}));

        expect(screen.queryByRole("button", {name: "Debug this round in Replay & Debug"})).not.toBeInTheDocument();
        expect(screen.getByText("Select a round from history below to debug.")).toBeInTheDocument();
        expect(screen.queryByText(/You won 15\.00/)).not.toBeInTheDocument();
        expect(screen.getByText("Spin a round, or pick one from round history below, to inspect it here.")).toBeInTheDocument();

        releaseSecondSpin?.();
        expect(await screen.findByText("Can't play this round")).toBeInTheDocument();
        // The raw server message is still available, but tucked behind the disclosure, never the primary text.
        expect(screen.getByText("Session cannot play the next round.")).not.toBeVisible();

        // Still no trace of the first round now that the failure has actually landed.
        expect(screen.queryByRole("button", {name: "Debug this round in Replay & Debug"})).not.toBeInTheDocument();
        expect(screen.getByText("Select a round from history below to debug.")).toBeInTheDocument();
        expect(screen.queryByText(/You won 15\.00/)).not.toBeInTheDocument();
        expect(screen.getByText("Spin a round, or pick one from round history below, to inspect it here.")).toBeInTheDocument();

        // Retry must target the request that actually just failed, never silently fall back to the
        // first round's already-succeeded request id.
        await user.click(screen.getByRole("button", {name: "Retry this request"}));
        await waitFor(() => expect(spinCallCount).toBe(3));
        expect(requestIds[1]).not.toBe(requestIds[0]);
        expect(requestIds[2]).toBe(requestIds[1]);
    }, 60000);

    it("switching projects clears the selected round so Retry/Debug can't act on stale data from the old project", async () => {
        const user = userEvent.setup();
        const {fetchImpl: fetchImplA} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE_DEBUG}),
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
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/b", game: {id: "b", name: "B", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
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
        // must show no trace of the previous project's session -- Retry/Debug show neither a reachable
        // session nor a selected round carried over.
        expect(screen.queryByRole("button", {name: "Retry this request"})).not.toBeInTheDocument();
        expect(screen.getAllByText("Create or restore a session first.").length).toBeGreaterThan(0);
        expect(screen.queryByRole("button", {name: "Debug this round in Replay & Debug"})).not.toBeInTheDocument();
        expect(screen.queryByText(/Session sess-1/)).not.toBeInTheDocument();
    }, 60000);

    it("Debug this round is blocked without debug capability, and truthfully offers to restart with debug mode on", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/restart": () => ({ok: true, status: 200, body: RUNNING_STATE_DEBUG}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
            "/api/project/runtime/sessions/sess-1/spins": () => ({ok: true, status: 200, body: {status: "ok", session: sessionFor({credits: 1005, win: 15, sessionVersion: 2})}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        // Debug mode is off (RUNNING_STATE's own `debug: false`) -- even though a round is selected (the
        // one just played), there's genuinely no trace data to inspect, so no "Debug this round" button
        // is offered at all -- only a truthful recovery action instead.
        expect(screen.queryByRole("button", {name: "Debug this round in Replay & Debug"})).not.toBeInTheDocument();
        expect(screen.getByText("Debug mode is off")).toBeInTheDocument();
        expect(screen.getByText(/started without debug mode/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Restart with debug mode on"}));

        await waitFor(() => {
            const server = section("Server");
            expect(within(server).getByRole("cell", {name: "on"})).toBeInTheDocument();
        });
    }, 60000);

    it("a round selected from history that predates debug mode being enabled stays blocked for Debug, even though the runtime now reports debug mode on", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            // Already on record before this Studio session ever loaded it, and carrying no `debug` field --
            // same shape a non-debug runtime would have produced -- even though the runtime this list is
            // fetched from is *currently* running with debug mode on (RUNNING_STATE_DEBUG below). This is
            // the exact scenario a purely current-runtime-flag check gets wrong: the round itself never
            // captured trace data, regardless of what the server reports right now.
            "/api/project/runtime/spins": () => ({
                ok: true,
                status: 200,
                body: [sessionFor({credits: 700, win: 777, studioRound: 1, studioRequestId: "req-predates-debug"})],
            }),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE_DEBUG}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await screen.findByRole("button", {name: "Spin"});

        const history = section("Round history for this session");
        await waitFor(() => expect(within(history).getByText(/req-predates-debug/)).toBeInTheDocument());
        await user.click(within(history).getByText(/req-predates-debug/));

        // Blocked, with a round-specific explanation -- and, critically, no "restart with debug mode on"
        // recovery action, since the runtime already has debug mode on and restarting again can't
        // retroactively give this specific already-recorded round the trace it never captured.
        expect(screen.queryByRole("button", {name: "Debug this round in Replay & Debug"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Restart with debug mode on"})).not.toBeInTheDocument();
        expect(screen.getByText(/no debug trace data on record/)).toBeInTheDocument();
        expect(screen.getByText(/can't be produced retroactively/)).toBeInTheDocument();
    }, 60000);

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
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE_DEBUG}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
            "/api/project/runtime/sessions/sess-1/spins": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", session: sessionFor({credits: 1005, win: 15, sessionVersion: 2, debug: {stateAfter: {}, requestId: "req-1"}})},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        await user.click(screen.getByRole("button", {name: "Debug this round in Replay & Debug"}));

        expect(await screen.findByText("Round no longer available")).toBeInTheDocument();
        expect(screen.getByText(/isn't available in the recent spin history anymore/)).toBeInTheDocument();
        // Never silently degrades to just showing the Find step with no explanation -- the picker is still
        // there (with whatever unrelated rounds are actually available), but the explicit fallback message
        // makes clear why nothing was auto-selected.
        expect(screen.getByRole("radio", {name: "Session Spin"})).toBeInTheDocument();
        expect(screen.getByText(/session sess-other/)).toBeInTheDocument();
    }, 60000);

    it("shows a normal loading state, never the fallback, while the recent-spin lookup is still in flight", async () => {
        const user = userEvent.setup();
        let spinsCallCount = 0;
        const fetchImpl: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/runtime") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "stopped"})});
            }
            if (path === "/api/project/runtime/spins") {
                spinsCallCount += 1;
                if (spinsCallCount === 1) {
                    // The initial mount fetch resolves immediately with nothing on record yet.
                    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
                }
                // The refresh triggered by the spin itself never settles within this test -- simulates
                // still being in flight by the moment the user navigates to Replay & Debug.
                return new Promise(() => {
                    // Deliberately never resolves -- see the comment above this branch.
                });
            }
            if (path === "/api/project/runtime/start") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(RUNNING_STATE_DEBUG)});
            }
            if (path === "/api/project/runtime/sessions") {
                return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: sessionFor()})});
            }
            if (path === "/api/project/runtime/sessions/sess-1/spins") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            status: "ok",
                            session: sessionFor({credits: 1005, win: 15, sessionVersion: 2, debug: {stateAfter: {}, requestId: "req-1"}}),
                        }),
                });
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

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        await user.click(screen.getByRole("button", {name: "Debug this round in Replay & Debug"}));

        expect(await screen.findByText("Loading recent spins…")).toBeInTheDocument();
        expect(screen.queryByText("Round no longer available")).not.toBeInTheDocument();
    }, 60000);

    it("shows only the fetch error, never the fallback, when refreshing recent spins fails", async () => {
        const user = userEvent.setup();
        let spinsCallCount = 0;
        const fetchImpl: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/runtime") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "stopped"})});
            }
            if (path === "/api/project/runtime/spins") {
                spinsCallCount += 1;
                if (spinsCallCount === 1) {
                    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
                }
                // The refresh triggered by the spin itself fails outright (network error) -- must surface
                // as the plain fetch error, never as a claim that the round was looked up and not found.
                return Promise.reject(new Error("network down"));
            }
            if (path === "/api/project/runtime/start") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(RUNNING_STATE_DEBUG)});
            }
            if (path === "/api/project/runtime/sessions") {
                return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: sessionFor()})});
            }
            if (path === "/api/project/runtime/sessions/sess-1/spins") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            status: "ok",
                            session: sessionFor({credits: 1005, win: 15, sessionVersion: 2, debug: {stateAfter: {}, requestId: "req-1"}}),
                        }),
                });
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

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        // Still on the Runtime tab: its own "Round history" panel translates the fetch failure into a
        // subject-specific recovery message -- never the raw "network down" text.
        expect(
            await screen.findByText("The round history couldn't be completed. Try again, and check the Studio server logs if the problem persists."),
        ).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Debug this round in Replay & Debug"}));

        // The handoff lands on Replay & Debug, which reads the exact same recentSpinsError state through
        // its own rendering -- translated into its own subject-specific recovery message, never the raw
        // fetch error text and never the "not found" fallback.
        expect(
            await screen.findByText("The spin list couldn't be completed. Try again, and check the Studio server logs if the problem persists."),
        ).toBeInTheDocument();
        expect(screen.queryByText("network down")).not.toBeInTheDocument();
        expect(screen.queryByText("Round no longer available")).not.toBeInTheDocument();
        expect(screen.queryByText("Loading recent spins…")).not.toBeInTheDocument();
    }, 60000);

    it("Create Session and Load Session immediately drop a round selected from history, even before the request settles or if it fails", async () => {
        const user = userEvent.setup();
        let capturedRequestId: string | undefined;
        let createCallCount = 0;
        let releaseSecondCreate: (() => void) | undefined;
        let releaseLoad: (() => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/project/runtime") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "stopped"})});
            }
            if (path === "/api/project/runtime/start") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(RUNNING_STATE_DEBUG)});
            }
            if (path === "/api/project/runtime/spins") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve(
                            capturedRequestId === undefined
                                ? []
                                : [
                                    sessionFor({credits: 1005, win: 15, sessionVersion: 2, studioRound: 1, studioRequestId: capturedRequestId, debug: {stateAfter: {}, requestId: capturedRequestId}}),
                                    sessionFor({credits: 700, win: 777, studioRound: 0, studioRequestId: "req-older-decoy", debug: {stateAfter: {}, requestId: "req-older-decoy"}}),
                                ],
                        ),
                });
            }
            if (path === "/api/project/runtime/sessions") {
                createCallCount += 1;
                if (createCallCount === 1) {
                    return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: sessionFor()})});
                }
                // The re-create stays pending until released, then rejects outright (a network failure,
                // never touching sessionId -- unlike a resolved business error, which would) -- proves the
                // previously selected round is gone the instant Create Session is clicked again, not only
                // once the failure actually lands.
                return new Promise((_resolve, reject) => {
                    releaseSecondCreate = () => reject(new Error("Cannot create another session right now."));
                });
            }
            if (path === "/api/project/runtime/sessions/sess-1/spins") {
                const body = JSON.parse(init?.body ?? "{}") as {requestId?: string};
                capturedRequestId = body.requestId;
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: sessionFor({credits: 1005, win: 15, sessionVersion: 2})})});
            }
            if (path === "/api/project/runtime/sessions/sess-1") {
                // Reloading the very same session id also stays pending until released, then rejects --
                // sessionId never changes in that case, so nothing but a synchronous clear on click can
                // drop the stale selection.
                return new Promise((_resolve, reject) => {
                    releaseLoad = () => reject(new Error("Session not found."));
                });
            }
            const route = BASE_ROUTES[path];
            if (route) {
                const {ok, status, body} = route({url, init});
                return Promise.resolve({ok, status, json: () => Promise.resolve(body)});
            }
            return Promise.reject(new Error(`no fake route for ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        // Pick the *older* decoy round from history, not the one just spun -- its requestId disagrees
        // with lastSpin, so Retry & Debug are now keyed off this selection instead.
        const history = section("Round history for this session");
        await waitFor(() => expect(within(history).getByText(/req-older-decoy/)).toBeInTheDocument());
        await user.click(within(history).getByText(/req-older-decoy/));
        expect(await screen.findByRole("button", {name: "Debug this round in Replay & Debug"})).toBeEnabled();
        expect(within(section("Retry & Debug")).getByText("req-older-decoy")).toBeInTheDocument();

        // Re-create a session while that older round is still selected. The prior selection must stop
        // being Inspect/Debug-able, and Retry & Debug must fall back to the real last spin, the instant
        // the request is issued -- not only once its failure actually lands.
        await user.click(screen.getByRole("button", {name: "Create or restore a different session"}));
        await user.click(screen.getByRole("button", {name: "Create Session"}));

        expect(screen.queryByRole("button", {name: "Debug this round in Replay & Debug"})).not.toBeInTheDocument();
        expect(screen.getByText("Select a round from history below to debug.")).toBeInTheDocument();
        expect(screen.queryByText(/You won 15\.00/)).not.toBeInTheDocument();
        expect(within(section("Retry & Debug")).queryByText("req-older-decoy")).not.toBeInTheDocument();
        expect(within(section("Retry & Debug")).getByText(capturedRequestId as string)).toBeInTheDocument();

        releaseSecondCreate?.();
        expect(
            await screen.findByText("This request couldn't be completed. Try again, and check the Studio server logs if the problem persists."),
        ).toBeInTheDocument();
        expect(screen.queryByText("Cannot create another session right now.")).not.toBeInTheDocument();

        // Still no trace of the stale selection now that the failure has actually landed.
        expect(screen.queryByRole("button", {name: "Debug this round in Replay & Debug"})).not.toBeInTheDocument();
        expect(screen.getByText("Select a round from history below to debug.")).toBeInTheDocument();
        expect(within(section("Retry & Debug")).queryByText("req-older-decoy")).not.toBeInTheDocument();

        // Re-select the older round, then take the Load Session path instead -- same story: gone the
        // instant the request is issued, still gone once it fails.
        await user.click(within(section("Round history for this session")).getByText(/req-older-decoy/));
        expect(await screen.findByRole("button", {name: "Debug this round in Replay & Debug"})).toBeEnabled();

        await user.click(screen.getByRole("button", {name: "Create or restore a different session"}));
        await user.click(screen.getByRole("radio", {name: "Restore existing"}));
        await user.type(screen.getByLabelText("Session id"), "sess-1");
        await user.click(screen.getByRole("button", {name: "Load Session"}));

        expect(screen.queryByRole("button", {name: "Debug this round in Replay & Debug"})).not.toBeInTheDocument();
        expect(screen.getByText("Select a round from history below to debug.")).toBeInTheDocument();
        expect(within(section("Retry & Debug")).queryByText("req-older-decoy")).not.toBeInTheDocument();

        releaseLoad?.();
        expect(
            await screen.findByText("This request couldn't be completed. Try again, and check the Studio server logs if the problem persists."),
        ).toBeInTheDocument();
        expect(screen.queryByText("Session not found.")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Debug this round in Replay & Debug"})).not.toBeInTheDocument();
        expect(screen.getByText("Select a round from history below to debug.")).toBeInTheDocument();
    }, 60000);

    it("Retry immediately drops a round selected from history, even before the retry settles or if it fails", async () => {
        const user = userEvent.setup();
        let capturedRequestId: string | undefined;
        let spinCallCount = 0;
        let releaseRetry: (() => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/project/runtime") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "stopped"})});
            }
            if (path === "/api/project/runtime/start") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(RUNNING_STATE_DEBUG)});
            }
            if (path === "/api/project/runtime/spins") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve(
                            capturedRequestId === undefined
                                ? []
                                : [
                                    sessionFor({credits: 1005, win: 15, sessionVersion: 2, studioRound: 1, studioRequestId: capturedRequestId, debug: {stateAfter: {}, requestId: capturedRequestId}}),
                                    sessionFor({credits: 700, win: 777, studioRound: 0, studioRequestId: "req-older-decoy", debug: {stateAfter: {}, requestId: "req-older-decoy"}}),
                                ],
                        ),
                });
            }
            if (path === "/api/project/runtime/sessions") {
                return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: sessionFor()})});
            }
            if (path === "/api/project/runtime/sessions/sess-1/spins") {
                const body = JSON.parse(init?.body ?? "{}") as {requestId?: string};
                spinCallCount += 1;
                if (spinCallCount === 1) {
                    capturedRequestId = body.requestId;
                    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: sessionFor({credits: 1005, win: 15, sessionVersion: 2})})});
                }
                // The retry (of the *older* selected round, not lastSpin) stays pending until released,
                // then fails -- proves the stale selection is gone the instant Retry is clicked.
                return new Promise((resolve) => {
                    releaseRetry = () => resolve({ok: false, status: 409, json: () => Promise.resolve({error: "Session changed elsewhere.", reason: "conflict"})});
                });
            }
            const route = BASE_ROUTES[path];
            if (route) {
                const {ok, status, body} = route({url, init});
                return Promise.resolve({ok, status, json: () => Promise.resolve(body)});
            }
            return Promise.reject(new Error(`no fake route for ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToRuntimeTab(user);
        await startRuntime(user);

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());

        const history = section("Round history for this session");
        await waitFor(() => expect(within(history).getByText(/req-older-decoy/)).toBeInTheDocument());
        await user.click(within(history).getByText(/req-older-decoy/));
        expect(await screen.findByRole("button", {name: "Debug this round in Replay & Debug"})).toBeEnabled();

        await user.click(screen.getByRole("button", {name: "Retry this request"}));

        expect(screen.queryByRole("button", {name: "Debug this round in Replay & Debug"})).not.toBeInTheDocument();
        expect(screen.getByText("Select a round from history below to debug.")).toBeInTheDocument();
        expect(screen.queryByText(/You won 15\.00/)).not.toBeInTheDocument();

        releaseRetry?.();
        expect(await screen.findByText("Session changed elsewhere")).toBeInTheDocument();
        expect(
            await screen.findByText(/This session was updated by another request since it was last loaded here/),
        ).toBeInTheDocument();
        // The raw server message is still available, but tucked behind the disclosure, never the primary text.
        expect(screen.getByText("Session changed elsewhere.")).not.toBeVisible();

        expect(screen.queryByRole("button", {name: "Debug this round in Replay & Debug"})).not.toBeInTheDocument();
        expect(screen.getByText("Select a round from history below to debug.")).toBeInTheDocument();
        expect(screen.queryByText(/You won 15\.00/)).not.toBeInTheDocument();
    }, 60000);

    it("Server Refresh immediately drops a round selected from history, falling back to the real last spin for Retry", async () => {
        const user = userEvent.setup();
        let capturedRequestId: string | undefined;
        let started = false;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            // Stateful, unlike the other tests' static stub -- Server Refresh re-issues this same GET, so
            // it must keep reporting "running" once Start has actually happened, or the assertions below
            // would be confounded by the whole session card disappearing along with the round selection.
            "/api/project/runtime": () => ({ok: true, status: 200, body: started ? RUNNING_STATE_DEBUG : {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({
                ok: true,
                status: 200,
                body:
                    capturedRequestId === undefined
                        ? []
                        : [
                            sessionFor({credits: 1005, win: 15, sessionVersion: 2, studioRound: 1, studioRequestId: capturedRequestId, debug: {stateAfter: {}, requestId: capturedRequestId}}),
                            sessionFor({credits: 700, win: 777, studioRound: 0, studioRequestId: "req-older-decoy", debug: {stateAfter: {}, requestId: "req-older-decoy"}}),
                        ],
            }),
            "/api/project/runtime/start": () => {
                started = true;
                return {ok: true, status: 200, body: RUNNING_STATE_DEBUG};
            },
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

        // Pick the *older* decoy round from history, not the one just spun -- its requestId disagrees
        // with lastSpin, so Retry & Debug are now keyed off this selection instead (same setup as
        // "Retry immediately drops a round selected from history" above).
        const history = section("Round history for this session");
        await waitFor(() => expect(within(history).getByText(/req-older-decoy/)).toBeInTheDocument());
        await user.click(within(history).getByText(/req-older-decoy/));
        expect(await screen.findByRole("button", {name: "Debug this round in Replay & Debug"})).toBeEnabled();
        expect(within(section("Retry & Debug")).getByText("req-older-decoy")).toBeInTheDocument();

        const server = section("Server");
        await user.click(within(server).getByRole("button", {name: "Refresh"}));

        expect(screen.queryByRole("button", {name: "Debug this round in Replay & Debug"})).not.toBeInTheDocument();
        expect(screen.getByText("Select a round from history below to debug.")).toBeInTheDocument();
        expect(screen.getByText("Spin a round, or pick one from round history below, to inspect it here.")).toBeInTheDocument();
        // Retry & Debug falls back to the real last spin, not the stale round selection -- same
        // "unavailable to the previous round, not to Retry itself" contract every other selection-clearing
        // action in this file already honors (see e.g. the "Create Session and Load Session immediately
        // drop..." test above).
        expect(within(section("Retry & Debug")).queryByText("req-older-decoy")).not.toBeInTheDocument();
        expect(within(section("Retry & Debug")).getByText(capturedRequestId as string)).toBeInTheDocument();

        // The running session itself is untouched -- Server Refresh only drops the stale round selection.
        expect(screen.getByText(/Session sess-1/)).toBeInTheDocument();
        expect(await within(server).findByText("running at http://127.0.0.1:4123")).toBeInTheDocument();
    }, 60000);

    it("the recent-session-list Refresh immediately drops a round selected from history, falling back to the real last spin for Retry", async () => {
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
                            sessionFor({credits: 1005, win: 15, sessionVersion: 2, studioRound: 1, studioRequestId: capturedRequestId, debug: {stateAfter: {}, requestId: capturedRequestId}}),
                            sessionFor({credits: 700, win: 777, studioRound: 0, studioRequestId: "req-older-decoy", debug: {stateAfter: {}, requestId: "req-older-decoy"}}),
                        ],
            }),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE_DEBUG}),
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

        const history = section("Round history for this session");
        await waitFor(() => expect(within(history).getByText(/req-older-decoy/)).toBeInTheDocument());
        await user.click(within(history).getByText(/req-older-decoy/));
        expect(await screen.findByRole("button", {name: "Debug this round in Replay & Debug"})).toBeEnabled();
        expect(within(section("Retry & Debug")).getByText("req-older-decoy")).toBeInTheDocument();

        // Reopens the create/restore switcher (selection persists across this, it only toggles
        // visibility) and lands on "Restore existing" to reach the recent-session-list's own Refresh --
        // distinct from both "Server" Refresh and "Round history for this session" Refresh.
        await user.click(screen.getByRole("button", {name: "Create or restore a different session"}));
        await user.click(screen.getByRole("radio", {name: "Restore existing"}));

        const currentSession = section("Current session");
        await user.click(within(currentSession).getByRole("button", {name: "Refresh"}));

        expect(screen.queryByRole("button", {name: "Debug this round in Replay & Debug"})).not.toBeInTheDocument();
        expect(screen.getByText("Select a round from history below to debug.")).toBeInTheDocument();
        expect(screen.getByText("Spin a round, or pick one from round history below, to inspect it here.")).toBeInTheDocument();
        expect(within(section("Retry & Debug")).queryByText("req-older-decoy")).not.toBeInTheDocument();
        expect(within(section("Retry & Debug")).getByText(capturedRequestId as string)).toBeInTheDocument();

        // The current session itself is untouched -- still sess-1, no create/load request was fired.
        expect(screen.getByText(/Session sess-1/)).toBeInTheDocument();
    }, 60000);
});
