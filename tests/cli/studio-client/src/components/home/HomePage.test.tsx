import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

describe("HomePage", () => {
    it("defaults to Design & Build and switches between tabs, keeping aria-current on the active one", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        expect(screen.getByRole("heading", {name: "Design & Build Your Game"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Design & Build"})).toHaveAttribute("aria-current", "page");

        await user.click(screen.getByRole("button", {name: "Open Project"}));

        expect(await screen.findByText("No recent projects yet.")).toBeInTheDocument();
        expect(screen.getByLabelText("Project path", {exact: false})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Open Project"})).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("button", {name: "Design & Build"})).not.toHaveAttribute("aria-current");

        await user.click(screen.getByRole("button", {name: "Advanced Tools"}));
        expect(screen.getByRole("heading", {name: "Advanced Tools"})).toBeInTheDocument();
        expect(screen.getByRole("heading", {name: "Raw Blueprint Editor"})).toBeInTheDocument();
    });

    it("opens a project from the Open Project tab's form", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: "/games/a"}, manifest: {id: "a", name: "A", version: "0.1.0"}},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await user.click(screen.getByRole("button", {name: "Open Project"}));
        await user.type(screen.getByLabelText("Project path", {exact: false}), "/games/a");
        await user.click(screen.getByRole("button", {name: "Open"}));

        await waitFor(() => {
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/open",
                    init: expect.objectContaining({body: JSON.stringify({projectRoot: "/games/a"})}),
                }),
            );
        });
    });

    it("preserves a Design & Build draft across Design -> Open -> Design (tabs stay mounted, never unmounted)", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        // Advanced Tools' raw Blueprint Editor is also permanently mounted, so [0] is Design & Build's.
        await user.type(screen.getAllByLabelText("New symbol id")[0], "wild-draft");

        await user.click(screen.getByRole("button", {name: "Open Project"}));
        expect(await screen.findByText("No recent projects yet.")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Design & Build"}));
        expect(screen.getAllByLabelText("New symbol id")[0]).toHaveValue("wild-draft");
    });

    // Many sequential real userEvent interactions -- under Jest's parallel workers this can exceed the
    // project's default testTimeout, same reasoning as happyPath.test.tsx's own explicit timeout.
    it("asks for confirmation before leaving a dirty Design & Build draft to open a project, and Cancel preserves it", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: "/games/a"}, manifest: {id: "a", name: "A", version: "0.1.0"}},
            }),
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {status: "loaded", projectRoot: "/games/a", game: {id: "a", name: "A", version: "0.1.0"}},
            }),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        // Typing alone doesn't dirty the blueprint (the "New symbol id" field is just local uncommitted
        // input state until "Add symbol" actually mutates the blueprint) -- click it too so the editor is
        // genuinely dirty.
        await user.type(screen.getAllByLabelText("New symbol id")[0], "wild-draft");
        await user.click(screen.getAllByRole("button", {name: "Add symbol"})[0]);

        await user.click(screen.getByRole("button", {name: "Open Project"}));
        await user.type(screen.getByLabelText("Project path", {exact: false}), "/games/a");
        await user.click(screen.getByRole("button", {name: "Open"}));

        expect(await screen.findByText("You have unsaved changes in Design & Build. Leave and lose them?")).toBeInTheDocument();

        // Cancel ("Stay") -- useOpenProject's guardedAction defers the API call itself until confirmed
        // (see openProjectGuard.test.tsx for a dedicated check that it never fired), so we're still on
        // Home, on the Open Project tab (never navigated to /project), and the draft is exactly where it
        // was.
        await user.click(screen.getByRole("button", {name: "Stay"}));
        await waitFor(() =>
            expect(screen.queryByText("You have unsaved changes in Design & Build. Leave and lose them?")).not.toBeInTheDocument(),
        );
        expect(screen.getByRole("button", {name: "Open Project"})).toHaveAttribute("aria-current", "page");
        await user.click(screen.getByRole("button", {name: "Design & Build"}));
        expect(screen.getAllByDisplayValue("wild-draft")[0]).toBeInTheDocument();

        // Confirming ("Leave") this time actually opens the project.
        await user.click(screen.getByRole("button", {name: "Open Project"}));
        await user.click(screen.getByRole("button", {name: "Open"}));
        expect(await screen.findByText("You have unsaved changes in Design & Build. Leave and lose them?")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Leave"}));

        await waitFor(() => expect(calls.find((call) => call.url === "/api/home/projects/open")).toBeDefined());
        expect(await screen.findByRole("heading", {name: "A"})).toBeInTheDocument();
    }, 45000);
});
