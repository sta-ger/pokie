import {act, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "./testUtils/fakeFetch";
import {renderHashRoutedApp, renderRoutedApp} from "./testUtils/renderRoutedApp";

async function traverseBrowserHistory(direction: "back" | "forward"): Promise<void> {
    await act(async () => {
        const popped = new Promise<void>((resolve) => {
            window.addEventListener("popstate", () => resolve(), {once: true});
        });
        window.history[direction]();
        await popped;
    });
}

describe("Routable Home/Project sections: refresh and direct-link", () => {
    it("a legacy project link can return to Your projects after an HTTP context failure without closing a project", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: false, status: 503, body: {error: "project context service unavailable"}}),
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        });

        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("We couldn't open this game. Return to your games and try opening it again. If it continues, check the game's location and reopen Studio.");
        const details = screen.getByText("Technical details").closest("details");
        expect(details).not.toHaveAttribute("open");
        expect(details).toHaveTextContent("project context service unavailable");

        const returnToProjects = screen.getByRole("button", {name: "Go to Your projects"});
        returnToProjects.focus();
        await user.keyboard("{Enter}");

        await waitFor(() => expect(router.state.location.pathname).toBe("/home/projects"));
        expect(await screen.findByRole("heading", {name: "Projects"})).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/projects/close")).toBe(false);
    });

    it("a direct link to a non-default Home tab renders that tab, not the default", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});

        expect(screen.getByRole("heading", {name: "Projects"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Projects"})).toHaveAttribute("aria-current", "page");
        expect(screen.queryByRole("heading", {name: "Design Your Game"})).not.toBeInTheDocument();
        // ProjectsPanel's own mount-time registry fetch (see its own doc comment) is still in flight at
        // this point -- awaiting its settling keeps this test from returning while that promise is still
        // pending, which would otherwise resolve after cleanup/the next test starts and call setState
        // outside any act() this test controls.
        expect(await screen.findByText("No games yet. Start a game or add one you already have.")).toBeInTheDocument();
    });

    it("a direct link to a non-default Project tab renders that tab, not Overview", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "loaded",
                    projectRoot: "/games/a",
                    game: {id: "a", name: "A", version: "1.0.0"},
                    type: "blueprint",
                    capabilities: ["blueprint.build"],
                },
            }),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});

        await screen.findByRole("heading", {name: "A"});
        expect(screen.getByRole("button", {name: "Simulation"})).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("button", {name: "Run Simulation"})).toBeInTheDocument();
    });

    it("a direct link to an operation the project's own capabilities don't support shows a diagnostic, never that operation's workflow", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "loaded",
                    projectRoot: "/games/a",
                    game: {id: "a", name: "A", version: "1.0.0"},
                    // A read-only/package-exchange project (e.g. an outcome library) -- neither
                    // "blueprint.build" nor "runtime.execute" -- can't run Simulation in-process.
                    type: "outcomeLibrary",
                    capabilities: ["outcomeLibrary.read"],
                },
            }),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });

        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});

        await screen.findByRole("heading", {name: "A"});
        // Simulation's own workflow never mounts -- no "Run Simulation" control anywhere on the page.
        expect(screen.queryByRole("button", {name: "Run Simulation"})).not.toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent('"Simulation" isn\'t available for this project');
        // Nor is Simulation offered as a destination to navigate to in the first place.
        expect(screen.queryByRole("button", {name: "Simulation"})).not.toBeInTheDocument();

        // The diagnostic is a recovery state, not a dead end: return to a section this project's own
        // capability matrix actually supports, while preserving its project-scoped route.
        await user.click(screen.getByRole("button", {name: "Go to Overview"}));
        await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent("/games/a")}/overview`));
        expect(screen.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page");
    });

    it("an unrecognized :tab falls back to the default section instead of erroring", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        });

        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/home/does-not-exist"]});

        // Navigate commits from an effect.  Waiting for the final route keeps this test from ending
        // while that state update is still pending, without incorrectly waiting for the CSS-hidden
        // Projects panel's registry request (it deliberately does not make one until visible).
        await waitFor(() => expect(router.state.location.pathname).toBe("/home/design"));
        expect(screen.getByRole("heading", {name: "Design Your Game"})).toBeInTheDocument();
    });

    it("replaces an unknown project section with that project's Overview route, so reload and browser history stay intelligible", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/open": () => ({ok: true, status: 200, body: {context: {mode: "project", projectRoot: "/games/a"}}}),
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "loaded",
                    projectRoot: "/games/a",
                    game: {id: "a", name: "A", version: "1.0.0"},
                    type: "blueprint",
                    capabilities: ["blueprint.build"],
                },
            }),
            "/api/project/validate": () => ({ok: true, status: 200, body: {valid: true, issues: []}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/rounds": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: []}),
            "/api/project/outcome-libraries/registry": () => ({ok: true, status: 200, body: {status: "missing"}}),
        });
        const projectPath = `/project/${encodeURIComponent("/games/a")}/retired-section`;
        const {router} = renderRoutedApp({fetchImpl, initialEntries: [projectPath]});

        await screen.findByRole("heading", {name: "A"});
        await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent("/games/a")}/overview`));
        expect(screen.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page");
    });
});

describe("Routable Home sections: browser back/forward", () => {
    it("back and forward navigate between previously-visited sections", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        });

        // renderRoutedApp now mounts a real data router (createMemoryRouter), so router.navigate(-1)/(1)
        // drives real history back/forward directly -- the same mechanism a real browser's Back/Forward
        // buttons use, no sibling test component needed.
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        expect(screen.getByRole("button", {name: "Start a game"})).toHaveAttribute("aria-current", "page");

        await user.click(screen.getByRole("button", {name: "Projects"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Projects"})).toHaveAttribute("aria-current", "page"));

        await act(() => router.navigate(-1));
        await waitFor(() => expect(screen.getByRole("button", {name: "Start a game"})).toHaveAttribute("aria-current", "page"));

        await act(() => router.navigate(1));
        await waitFor(() => expect(screen.getByRole("button", {name: "Projects"})).toHaveAttribute("aria-current", "page"));
        // Many sequential real userEvent interactions -- under Jest's parallel workers this can exceed
        // even the project's raised 60000ms testTimeout, same reasoning as happyPath.test.tsx's own
        // explicit timeout.
    }, 90000);
});

describe("Project-scoped browser history", () => {
    it("keeps every Forward entry after Back restores a legacy-scoped project", async () => {
        let currentProjectRoot = "/games/a";
        const dashboardForCurrentProject = () => ({
            ok: true,
            status: 200,
            body: {
                status: "loaded",
                projectRoot: currentProjectRoot,
                game: {
                    id: currentProjectRoot === "/games/a" ? "a" : "b",
                    name: currentProjectRoot === "/games/a" ? "A" : "B",
                    version: "1.0.0",
                },
                type: "blueprint",
                capabilities: ["blueprint.build"],
            },
        });
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/open": (call) => {
                currentProjectRoot = (JSON.parse(call.init?.body ?? "{}") as {projectRoot: string}).projectRoot;
                return {ok: true, status: 200, body: {context: {mode: "project", projectRoot: currentProjectRoot}}};
            },
            "/api/project/context": dashboardForCurrentProject,
            "/api/project/validate": () => ({ok: true, status: 200, body: {valid: true, issues: []}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: currentProjectRoot, valid: true}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/rounds": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: []}),
            "/api/project/outcome-libraries/registry": () => ({ok: true, status: 200, body: []}),
        });
        const aRoute = `/project/${encodeURIComponent("/games/a")}/play`;
        const bRoute = `/project/${encodeURIComponent("/games/b")}/play`;

        window.history.replaceState(null, "", "#/project/play");
        const {router} = renderHashRoutedApp({fetchImpl});

        await screen.findByRole("heading", {name: "A"});
        await waitFor(() => expect(window.location.hash).toBe(`#${aRoute}`));
        // The router must own the replacement too: merely rewriting the native hash leaves its tracked
        // location stale and breaks a later Forward traversal through this entry.
        await waitFor(() => expect(router.state.location.pathname).toBe(aRoute));
        expect(window.history.state).toMatchObject({idx: 0});

        await act(() => router.navigate("/home/design"));
        await act(() => router.navigate("/home/projects"));
        await act(() => router.navigate(`/project/${encodeURIComponent("/games/b")}/overview`));
        await screen.findByRole("heading", {name: "B"});
        await act(() => router.navigate(bRoute));

        await traverseBrowserHistory("back");
        await traverseBrowserHistory("back");
        await traverseBrowserHistory("back");
        await traverseBrowserHistory("back");
        await screen.findByRole("heading", {name: "A"});
        expect(router.state.location.pathname).toBe(aRoute);
        expect(window.location.hash).toBe(`#${aRoute}`);

        await traverseBrowserHistory("forward");
        await waitFor(() => expect(router.state.location.pathname).toBe("/home/design"));
        await traverseBrowserHistory("forward");
        await waitFor(() => expect(router.state.location.pathname).toBe("/home/projects"));
        await traverseBrowserHistory("forward");
        await traverseBrowserHistory("forward");
        await screen.findByRole("heading", {name: "B"});
        expect(router.state.location.pathname).toBe(bRoute);
        expect(window.location.hash).toBe(`#${bRoute}`);
    });

    it("upgrades a legacy unscoped entry so Back and Forward restore their own projects", async () => {
        // Studio originally opened A at the legacy, ambiguous `/project/play` URL. The first render
        // must replace that entry with A's scoped route before B is opened; otherwise Back finds the
        // old URL and displays B again because the server only has one mutable current project.
        let currentProjectRoot = "/games/a";
        const dashboardForCurrentProject = () => ({
            ok: true,
            status: 200,
            body: {
                status: "loaded",
                projectRoot: currentProjectRoot,
                game: {
                    id: currentProjectRoot === "/games/a" ? "a" : "b",
                    name: currentProjectRoot === "/games/a" ? "A" : "B",
                    version: "1.0.0",
                },
                type: "blueprint",
                capabilities: ["blueprint.build"],
            },
        });
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/open": (call) => {
                currentProjectRoot = (JSON.parse(call.init?.body ?? "{}") as {projectRoot: string}).projectRoot;
                return {ok: true, status: 200, body: {context: {mode: "project", projectRoot: currentProjectRoot}}};
            },
            "/api/project/context": dashboardForCurrentProject,
            "/api/project/validate": () => ({ok: true, status: 200, body: {valid: true, issues: []}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: currentProjectRoot, valid: true}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/rounds": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: []}),
            "/api/project/outcome-libraries/registry": () => ({ok: true, status: 200, body: []}),
        });
        const aRoute = `/project/${encodeURIComponent("/games/a")}/play`;
        const bRoute = `/project/${encodeURIComponent("/games/b")}/play`;
        // The regression is specific to an externally-created browser hash entry, not a memory
        // router's synthetic initial entry. Start from that real shape so every Back/Forward step
        // exercises createHashRouter's native history bookkeeping.
        window.history.replaceState(null, "", "#/project/play");
        const {router} = renderHashRoutedApp({fetchImpl});

        await screen.findByRole("heading", {name: "A"});
        expect(screen.getByRole("button", {name: "Play"})).toHaveAttribute("aria-current", "page");
        await waitFor(() => expect(window.location.hash).toBe(`#${aRoute}`));

        await act(() => router.navigate(bRoute));
        await screen.findByRole("heading", {name: "B"});

        await traverseBrowserHistory("back");
        await screen.findByRole("heading", {name: "A"});

        await traverseBrowserHistory("forward");
        await screen.findByRole("heading", {name: "B"});

        expect(calls.filter((call) => call.url === "/api/home/projects/open").map((call) => JSON.parse(call.init?.body ?? "{}"))).toEqual([
            {projectRoot: "/games/b"},
            {projectRoot: "/games/a"},
            {projectRoot: "/games/b"},
        ]);
    });
});
