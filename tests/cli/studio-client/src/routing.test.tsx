import {act, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "./testUtils/fakeFetch";
import {renderHashRoutedApp, renderRoutedApp} from "./testUtils/renderRoutedApp";

describe("Routable Home/Project sections: refresh and direct-link", () => {
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
        expect(await screen.findByText("No projects yet -- import or design one below.")).toBeInTheDocument();
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

        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});

        await screen.findByRole("heading", {name: "A"});
        // Simulation's own workflow never mounts -- no "Run Simulation" control anywhere on the page.
        expect(screen.queryByRole("button", {name: "Run Simulation"})).not.toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent('"Simulation" isn\'t available for this project');
        // Nor is Simulation offered as a destination to navigate to in the first place.
        expect(screen.queryByRole("button", {name: "Simulation"})).not.toBeInTheDocument();
    });

    it("an unrecognized :tab falls back to the default section instead of erroring", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/does-not-exist"]});

        expect(screen.getByRole("heading", {name: "Design Your Game"})).toBeInTheDocument();
        // Same reasoning as the direct-link test above: the still-mounted (CSS-hidden) Projects tab
        // body's own ProjectsPanel kicked off its mount-time registry fetch too -- await it settling
        // before this test ends.
        expect(await screen.findByText("No projects yet -- import or design one below.")).toBeInTheDocument();
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

        expect(screen.getByRole("button", {name: "Design Game"})).toHaveAttribute("aria-current", "page");

        await user.click(screen.getByRole("button", {name: "Projects"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Projects"})).toHaveAttribute("aria-current", "page"));

        await act(() => router.navigate(-1));
        await waitFor(() => expect(screen.getByRole("button", {name: "Design Game"})).toHaveAttribute("aria-current", "page"));

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

        await act(() => router.navigate("/home/design"));
        await act(() => router.navigate("/home/projects"));
        await act(() => router.navigate(`/project/${encodeURIComponent("/games/b")}/overview`));
        await screen.findByRole("heading", {name: "B"});
        await act(() => router.navigate(bRoute));

        await act(() => router.navigate(-4));
        await screen.findByRole("heading", {name: "A"});
        expect(router.state.location.pathname).toBe(aRoute);

        await act(() => router.navigate(1));
        await waitFor(() => expect(router.state.location.pathname).toBe("/home/design"));
        await act(() => router.navigate(1));
        await waitFor(() => expect(router.state.location.pathname).toBe("/home/projects"));
        await act(() => router.navigate(2));
        await screen.findByRole("heading", {name: "B"});
        expect(router.state.location.pathname).toBe(bRoute);
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
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/play"]});

        await screen.findByRole("heading", {name: "A"});
        expect(screen.getByRole("button", {name: "Play"})).toHaveAttribute("aria-current", "page");
        await waitFor(() => expect(router.state.location.pathname).toBe(aRoute));

        await act(() => router.navigate(bRoute));
        await screen.findByRole("heading", {name: "B"});

        await act(() => router.navigate(-1));
        await screen.findByRole("heading", {name: "A"});

        await act(() => router.navigate(1));
        await screen.findByRole("heading", {name: "B"});

        expect(calls.filter((call) => call.url === "/api/home/projects/open").map((call) => JSON.parse(call.init?.body ?? "{}"))).toEqual([
            {projectRoot: "/games/b"},
            {projectRoot: "/games/a"},
            {projectRoot: "/games/b"},
        ]);
    });
});
