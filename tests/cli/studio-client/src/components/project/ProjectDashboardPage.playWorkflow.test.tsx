import {screen, waitFor} from "@testing-library/react";
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
});
