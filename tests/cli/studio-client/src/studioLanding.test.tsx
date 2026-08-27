import {fireEvent, screen, waitFor} from "@testing-library/react";
import {createFakeFetch, createRoutedFakeFetch} from "./testUtils/fakeFetch";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

const PROJECT_ROUTES = {
    "/api/project/context": () => ({
        ok: true,
        status: 200,
        body: {status: "loaded", projectRoot: "/games/my-slot", game: {id: "my-slot", name: "My Slot", version: "1.0.0"}},
    }),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/my-slot", valid: true}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
};

// The startup handshake: the server knows which mode it was launched in, but a hash route never reaches
// it, so "/" has to ask /api/context before landing. These cover the mismatch that used to make every
// startup — including "pokie ." and a bare "pokie" inside a project — open Home regardless.
describe("Studio startup landing route", () => {
    it("lands a project-mode server straight on the project dashboard", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "project", projectRoot: "/games/my-slot"}}),
            ...PROJECT_ROUTES,
        });

        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/"]});

        await screen.findByRole("heading", {name: "My Slot"});
        expect(router.state.location.pathname).toBe("/project/%2Fgames%2Fmy-slot/overview");
    });

    it("lands a home-mode server on Home", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
        });

        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/"]});

        await screen.findByRole("heading", {name: "Design Your Game"});
        expect(router.state.location.pathname).toBe("/home/design");
    });

    it("replaces the landing entry so Back doesn't return to a blank \"/\"", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
        });

        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/"]});

        await screen.findByRole("heading", {name: "Design Your Game"});
        expect(router.state.historyAction).toBe("REPLACE");
    });

    it("shows a starting state while the mode is still being resolved", () => {
        // A fetch that never settles: the landing must render something rather than a blank screen.
        const fetchImpl = () =>
            new Promise<never>(() => {
                // Intentionally never resolves or rejects.
            });

        renderRoutedApp({fetchImpl, initialEntries: ["/"]});

        expect(screen.getByRole("status")).toHaveTextContent("Opening Studio…");
    });

    it("explains a failed launch check and lets the designer choose a game instead of silently changing screens", async () => {
        const {fetchImpl} = createFakeFetch((call) => {
            if (call.url === "/api/context") {
                throw new Error("context unreachable");
            }
            return {ok: true, status: 200, body: []};
        });

        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/"]});

        expect(await screen.findByText(/Studio couldn't determine which project to open/)).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/");
        fireEvent.click(screen.getByRole("button", {name: "Choose or create a game"}));
        await waitFor(() => expect(router.state.location.pathname).toBe("/home/design"));
    });

    it("keeps an HTTP launch-context failure on the actionable recovery screen", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/context": () => ({ok: false, status: 500, body: {error: "launch context unavailable"}}),
        });

        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/"]});

        expect(await screen.findByText(/Studio couldn't determine which project to open/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Choose or create a game"})).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/");
    });

    it("asks the server exactly once, and never consults a remembered last project", async () => {
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "project", projectRoot: "/games/my-slot"}}),
            ...PROJECT_ROUTES,
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/"]});

        await screen.findByRole("heading", {name: "My Slot"});
        expect(calls.filter((call) => call.url === "/api/context")).toHaveLength(1);
        expect(calls.some((call) => call.url.includes("recent-projects"))).toBe(false);
    });
});
