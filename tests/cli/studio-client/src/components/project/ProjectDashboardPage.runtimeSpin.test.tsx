import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const BASE_ROUTES: Record<string, () => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({
        ok: true,
        status: 200,
        body: {status: "loaded", projectRoot: "/games/a", game: {id: "a", name: "A", version: "1.0.0"}},
    }),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true, generated: false}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
};

describe("ProjectDashboardPage - Runtime spin 409 reason disambiguation", () => {
    it("shows a stale-version conflict message distinctly from a not-running message, driven by the server's own `reason` field", async () => {
        const user = userEvent.setup();
        let runtimeRunning = false;
        const {fetchImpl} = createFakeFetch((call) => {
            const [path] = call.url.split("?");
            if (path === "/api/project/runtime") {
                return {ok: true, status: 200, body: runtimeRunning ? {status: "running", host: "127.0.0.1", port: 3200, baseUrl: "http://127.0.0.1:3200", debug: false, repositoryMode: "memory", startedAt: new Date().toISOString()} : {status: "stopped"}};
            }
            if (path === "/api/project/runtime/start") {
                runtimeRunning = true;
                return {ok: true, status: 200, body: {status: "running", host: "127.0.0.1", port: 3200, baseUrl: "http://127.0.0.1:3200", debug: false, repositoryMode: "memory", startedAt: new Date().toISOString()}};
            }
            if (path === "/api/project/runtime/sessions") {
                return {ok: true, status: 200, body: {status: "ok", session: {sessionId: "s1", game: {id: "a", name: "A", version: "1.0.0"}, credits: 100, sessionVersion: 1}}};
            }
            if (path === "/api/project/runtime/sessions/s1/spins") {
                // A stale expectedSessionVersion -- the server's own `reason` field disambiguates this
                // from "runtime not running", both of which ride on the same HTTP 409.
                return {ok: false, status: 409, body: {error: "Expected session version 1 but was 2.", reason: "conflict"}};
            }
            const route = BASE_ROUTES[path];
            if (route) {
                return route();
            }
            throw new Error(`no fake route for ${call.url}`);
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Runtime"}));
        await user.click(screen.getByRole("button", {name: "Start"}));
        await waitFor(() => expect(screen.getAllByText(/running at/).length).toBeGreaterThan(0));

        await user.click(screen.getByRole("button", {name: "Create Session"}));
        // Auto-advances to the Play step once the session is created -- "Spin" only becomes reachable
        // there, so waiting for its own confirmation line doubles as waiting for that navigation.
        await screen.findByText(/Session s1/);

        await user.click(screen.getByRole("button", {name: "Spin"}));

        // "conflict" (stale version) must show the server's own message, not the generic "Runtime is not
        // running" text -- these are both 409s but mean different things.
        expect(await screen.findByText("Expected session version 1 but was 2.")).toBeInTheDocument();
        expect(screen.queryByText("Runtime is not running — start it first.")).not.toBeInTheDocument();
    });
});
