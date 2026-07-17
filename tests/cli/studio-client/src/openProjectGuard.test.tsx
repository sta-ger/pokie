import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "./testUtils/fakeFetch";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

// Covers useOpenProject's own guarded side effect (see useDesignNavigationGuard's GuardedAction /
// DesignNavigationGuardContext): while the Design & Build draft is dirty, opening a project must defer
// *both* the API call and the navigation until the user confirms -- Cancel must never have already told
// the server to switch the active project (the side effect this fixes), Confirm must run the call and
// the navigation exactly once with no second confirmation, and a failed call must never leave the
// router-level guard's one-shot bypass stuck "on" for some later, unrelated navigation.
const CONFIRM_TEXT = "You have unsaved changes in Design & Build. Leave and lose them?";

async function dirtyTheDesignDraft(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    // Symbols is one of SectionedFormEditor's own sections -- needs its own tab click first. Typing
    // alone doesn't dirty the blueprint -- "Add symbol" actually mutates it.
    await user.click(screen.getByRole("tab", {name: "Symbols"}));
    await user.type(screen.getAllByLabelText("New symbol id")[0], "wild-draft");
    await user.click(screen.getAllByRole("button", {name: "Add symbol"})[0]);
}

async function openViaOpenProjectForm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole("button", {name: "Open Project"}));
    await user.type(screen.getByLabelText("Project path", {exact: false}), "/games/a");
    await user.click(screen.getByRole("button", {name: "Open"}));
}

function createProjectDashboardFetchRoutes() {
    return {
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
    };
}

describe("useOpenProject: guarded side effects", () => {
    it("Cancel never calls the open-project API", async () => {
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

        await dirtyTheDesignDraft(user);
        await openViaOpenProjectForm(user);

        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Stay"}));

        await waitFor(() => expect(screen.queryByText(CONFIRM_TEXT)).not.toBeInTheDocument());
        expect(calls.find((call) => call.url === "/api/home/projects/open")).toBeUndefined();
        expect(screen.getByRole("button", {name: "Open Project"})).toHaveAttribute("aria-current", "page");
    }, 45000);

    it("Confirm calls the open-project API exactly once and navigates exactly once", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: "/games/a"}, manifest: {id: "a", name: "A", version: "0.1.0"}},
            }),
            ...createProjectDashboardFetchRoutes(),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await dirtyTheDesignDraft(user);
        await openViaOpenProjectForm(user);

        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Leave"}));

        expect(await screen.findByRole("heading", {name: "A"})).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/project/overview");
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(1);
    }, 45000);

    it("a failed open-project call keeps Home's URL and draft, without leaving the guard bypassed", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
            "/api/home/projects/open": () => ({ok: false, status: 500, body: {error: "boom"}}),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await dirtyTheDesignDraft(user);
        await openViaOpenProjectForm(user);

        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Leave"}));

        expect(await screen.findByText("boom")).toBeInTheDocument();
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(1);
        expect(router.state.location.pathname).toBe("/home/open");
        expect(screen.getByRole("button", {name: "Open Project"})).toHaveAttribute("aria-current", "page");
        await user.click(screen.getByRole("button", {name: "Design & Build"}));
        expect(screen.getAllByDisplayValue("wild-draft")[0]).toBeInTheDocument();

        // The failed attempt must not leave the router-level one-shot bypass stuck "on" -- a later,
        // unrelated navigation away from Home while still dirty must still be blocked, not silently let
        // through unconfirmed.
        router.navigate("/project/overview");
        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/home/design");
    }, 45000);

    it("browser Back/Forward and a direct route navigation are still blocked while dirty", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
            ...createProjectDashboardFetchRoutes(),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview", "/home/design"]});

        await dirtyTheDesignDraft(user);

        router.navigate(-1);
        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/home/design");
        await user.click(screen.getByRole("button", {name: "Stay"}));
        await waitFor(() => expect(screen.queryByText(CONFIRM_TEXT)).not.toBeInTheDocument());

        router.navigate("/project/overview");
        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/home/design");
    }, 45000);

    it("switching Home's own tabs never shows a confirmation, even while dirty", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await dirtyTheDesignDraft(user);

        await user.click(screen.getByRole("button", {name: "Open Project"}));
        expect(screen.queryByText(CONFIRM_TEXT)).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Advanced Tools"}));
        expect(screen.queryByText(CONFIRM_TEXT)).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Design & Build"}));
        expect(screen.queryByText(CONFIRM_TEXT)).not.toBeInTheDocument();
        expect(screen.getAllByDisplayValue("wild-draft")[0]).toBeInTheDocument();
    }, 45000);
});
