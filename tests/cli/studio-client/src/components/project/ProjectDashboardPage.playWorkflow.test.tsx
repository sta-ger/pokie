import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {StudioRuntimeSessionView} from "../../../../../../cli/studio-client/src/api/types";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const GAME = {id: "a", name: "A", version: "1.0.0"};
const RUNNING_STATE = {
    status: "running",
    host: "127.0.0.1",
    port: 4123,
    baseUrl: "http://127.0.0.1:4123",
    playerUrl: "http://127.0.0.1:4200",
    debug: true,
    repositoryMode: "memory",
    startedAt: "2026-01-01T00:00:00.000Z",
};

const BASE_ROUTES: Record<string, (call: FakeCall) => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/a", game: GAME, type: "blueprint", capabilities: ["blueprint.build"]}}),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true, generated: false}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
};

function sessionFor(overrides: Partial<StudioRuntimeSessionView> = {}): StudioRuntimeSessionView {
    return {sessionId: "sess-1", game: GAME, credits: 1000, sessionVersion: 1, ...overrides};
}

async function goToPlayTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
    await user.click(screen.getByRole("button", {name: "Play"}));
}

describe("ProjectDashboardPage - Play", () => {
    it("materializes/starts the runtime, creates a session, and renders the canonical player pointed at that exact session", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);

        await user.click(await screen.findByRole("button", {name: "Start playing"}));

        const frame = await screen.findByTitle("POKIE player");
        expect(frame).toHaveAttribute("src", "http://127.0.0.1:4200?session=sess-1");

        expect(calls.some((call) => call.url === "/api/project/runtime/start")).toBe(true);
        expect(calls.some((call) => call.url === "/api/project/runtime/sessions")).toBe(true);
    }, 60000);

    it("attaches to an already-running runtime and an already-created session -- no second start/create call, the player renders immediately", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/runtime"]});
        await screen.findByRole("heading", {name: "A"});
        // Create a session from Runtime first -- Play should attach to this exact one, not start a
        // second runtime or create a second session of its own.
        await waitFor(() => expect(screen.getAllByText(/running at/).length).toBeGreaterThan(0));
        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await screen.findByRole("button", {name: "Spin"});

        await user.click(screen.getByRole("button", {name: "Play"}));

        const frame = await screen.findByTitle("POKIE player");
        expect(frame).toHaveAttribute("src", "http://127.0.0.1:4200?session=sess-1");

        expect(calls.filter((call) => call.url === "/api/project/runtime/start")).toHaveLength(0);
        expect(calls.filter((call) => call.url === "/api/project/runtime/sessions")).toHaveLength(1);
    }, 60000);

    it("shows a subject-specific recovery message, with a retry, when session creation fails", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => ({ok: false, status: 500, body: {error: "boom"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);

        await user.click(await screen.findByRole("button", {name: "Start playing"}));

        expect(
            await screen.findByText("This session couldn't be completed. Try again, and check the Studio server logs if the problem persists."),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Try again"})).toBeInTheDocument();
    }, 60000);

    // Cross-surface round presentation parity: Play and Runtime read the exact same shared session
    // state (see PlayTab's own doc comment), so a round played from Runtime's Spin button must show up
    // in Play's own "Last round" panel through the identical RoundSummary/GameScreenView chain Runtime's
    // own "Inspect round" already renders it through -- not a Play-local re-presentation of the same
    // screen/win data. This is the demonstration P4-POLISH-12 asked for: Play consuming the same shared
    // presentation contracts as Replay and Runtime, for a round actually produced by the runtime.
    it("Last round shows a round played from Runtime through the same shared RoundSummary/GameScreenView Runtime's own Inspect round uses, preserving reel-column screen orientation and runtime-provided win amounts unchanged", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor({bet: 5, win: 0})}}),
            "/api/project/runtime/sessions/sess-1/spins": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", session: sessionFor({credits: 1015, bet: 5, win: 15, sessionVersion: 2, screen: [["cherry", "lemon"], ["bar", "seven"]]})},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/runtime"]});
        await screen.findByRole("heading", {name: "A"});
        await user.click(await screen.findByRole("button", {name: "Start"}));
        await waitFor(() => expect(screen.getAllByText(/running at/).length).toBeGreaterThan(0));
        await user.click(screen.getByRole("button", {name: "Create Session"}));
        await screen.findByRole("button", {name: "Spin"});
        await user.click(screen.getByRole("button", {name: "Spin"}));
        // Runtime's own Inspect round settles onto the played round -- the same signal
        // ProjectDashboardPage.runtimeWorkflow.test.tsx waits on before asserting round detail. This is
        // the fifth sequential findBy/waitFor in this test, each carrying setupTests.ts's own 15000ms
        // asyncUtilTimeout. This file now runs in the dedicated studio-client-workflows lane (see
        // jest.config.mjs) precisely because it can't be assumed to have the fast studio-client-components
        // lane's headroom to itself -- so the first four waits can plausibly consume enough wall-clock
        // time that this one needs more than its share of the default budget to avoid a starved-assertion
        // failure that isn't an actual regression. An explicit override here (and the correspondingly
        // raised test budget below -- see this file's own sibling tests for the same 15000ms-per-wait
        // accounting) restores the same headroom that budget already gives every other wait here by
        // default.
        await screen.findByText(/Show advanced details/, undefined, {timeout: 30000});

        await user.click(screen.getByRole("button", {name: "Play"}));

        const lastRound = screen.getByText("Last round (from this Studio session)", {selector: "legend"}).closest("fieldset") as HTMLElement;
        expect(lastRound).not.toBeNull();
        // The screen's own reel-major cells, rendered by the shared GameScreenView -- unchanged from what
        // the runtime returned (never recomputed/reformatted into some Play-local shape).
        expect(within(lastRound).getByText("cherry")).toBeInTheDocument();
        expect(within(lastRound).getByText("seven")).toBeInTheDocument();
        expect(within(lastRound).getByText(/You won 15\.00/)).toBeInTheDocument();
        // The same horizontal-scroll containment every other screen-rendering surface relies on (see
        // responsive.test.tsx's own "no horizontal page overflow" coverage) -- proves this is the shared
        // ScreenTable-based rendering, not a bespoke narrow-unfriendly table.
        expect(within(lastRound).getByText("cherry").closest(".mantine-ScrollArea-root")).not.toBeNull();
    }, 90000);

    // The embedded canonical player never talks to Studio -- it spins straight against the runtime's
    // real HTTP API (see PlayTab's own doc comment) -- so this proves Last round catches up on that
    // round through Studio's own periodic re-GET of the same session (onRefreshSession/
    // SESSION_POLL_INTERVAL_MS in PlayTab.tsx), not through Runtime's own Spin proxy: the session GET
    // route below only starts returning a played round on its *second* call (simulating a round the
    // player finished between two poll ticks), and the assertion at the end proves Studio's own
    // per-session spin endpoint was never called at all.
    it("Last round catches up on a round played through the embedded canonical player itself -- via Studio's own session poll, not Runtime's Spin -- with the same shared narrow-layout rendering", async () => {
        const user = userEvent.setup();
        let sessionGetCalls = 0;
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor({bet: 5, win: 0})}}),
            "/api/project/runtime/sessions/sess-1": () => {
                sessionGetCalls += 1;
                if (sessionGetCalls < 2) {
                    return {ok: true, status: 200, body: {status: "ok", session: sessionFor({bet: 5, win: 0})}};
                }
                return {
                    ok: true,
                    status: 200,
                    body: {
                        status: "ok",
                        session: sessionFor({credits: 1020, bet: 5, win: 20, sessionVersion: 2, screen: [["wild", "orange"], ["plum", "bell"]]}),
                    },
                };
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);
        await user.click(await screen.findByRole("button", {name: "Start playing"}));
        await screen.findByTitle("POKIE player");

        const findLastRoundFieldset = () => screen.getByText("Last round (from this Studio session)", {selector: "legend"}).closest("fieldset") as HTMLElement;
        expect(within(findLastRoundFieldset()).getByText(/No round played through Studio yet this session/)).toBeInTheDocument();

        await waitFor(() => expect(within(findLastRoundFieldset()).getByText("wild")).toBeInTheDocument());

        const lastRound = findLastRoundFieldset();
        expect(within(lastRound).getByText("bell")).toBeInTheDocument();
        expect(within(lastRound).getByText(/You won 20\.00/)).toBeInTheDocument();
        // The same horizontal-scroll containment every other screen-rendering surface relies on -- proves
        // this is the shared ScreenTable-based rendering, not a bespoke narrow-unfriendly table.
        expect(within(lastRound).getByText("wild").closest(".mantine-ScrollArea-root")).not.toBeNull();
        // Studio's own per-session spin proxy (what a Runtime-tab Spin calls) was never hit -- this round
        // reached "Last round" purely through the session GET poll above.
        expect(calls.some((call) => call.url === "/api/project/runtime/sessions/sess-1/spins")).toBe(false);
    }, 30000);

    it("Last round shows an honest empty state, never a misleading 'Round complete', before any round has been played through Studio this session", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: RUNNING_STATE}),
            "/api/project/runtime/sessions": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);
        await user.click(await screen.findByRole("button", {name: "Start playing"}));
        await screen.findByTitle("POKIE player");

        const lastRound = screen.getByText("Last round (from this Studio session)", {selector: "legend"}).closest("fieldset") as HTMLElement;
        expect(within(lastRound).getByText(/No round played through Studio yet this session/)).toBeInTheDocument();
        expect(within(lastRound).queryByText(/Round complete/)).not.toBeInTheDocument();
    }, 60000);
});
