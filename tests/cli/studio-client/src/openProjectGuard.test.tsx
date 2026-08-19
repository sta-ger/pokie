import {act, fireEvent, screen, waitFor} from "@testing-library/react";
import {createRoutedFakeFetch} from "./testUtils/fakeFetch";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

// Covers useOpenProject's own guarded side effect (see useDesignNavigationGuard's GuardedAction /
// DesignNavigationGuardContext): while the Design Game draft is dirty, opening a project must defer
// *both* the API call and the navigation until the user confirms -- Cancel must never have already told
// the server to switch the active project (the side effect this fixes), Confirm must run the call and
// the navigation exactly once with no second confirmation, and a failed call must never leave the
// router-level guard's one-shot bypass stuck "on" for some later, unrelated navigation.
const CONFIRM_TEXT = "You have unsaved changes in Design Game. Leave and lose them?";
// These cover real guarded Home -> Project transitions with the visited editor sections still mounted.
// Keep a conservative ceiling for a contended gate worker; the setup itself uses single change/click
// events because character-by-character input is outside this suite's contract.
const WORKFLOW_TIMEOUT_MS = 120_000;

// The Projects tab's Open action only ever appears for an already-registered project (see
// ProjectsPanel's own OPENABLE_TYPE) -- every test here seeds exactly one such row to open.
function registryRoute() {
    return {
        "/api/home/projects/registry": () => ({
            ok: true,
            status: 200,
            body: [
                {
                    location: "/games/a",
                    name: "A",
                    type: "tsPackage",
                    capabilities: [],
                    origin: "managed",
                    lastOpenedAt: "2026-01-01T00:00:00.000Z",
                    status: "ok",
                },
            ],
        }),
    };
}

function dirtyTheDesignDraft(): void {
    // Symbols is one of SectionedFormEditor's own sections -- needs its own tab click first. Typing
    // alone doesn't dirty the blueprint -- "Add symbol" actually mutates it.
    fireEvent.click(screen.getByRole("tab", {name: "Symbols"}));
    // These assertions start at the committed draft mutation; character-by-character typing is covered
    // elsewhere and only repeats ten full jsdom interaction cycles here.
    fireEvent.change(screen.getByLabelText("New symbol id"), {target: {value: "wild-draft"}});
    fireEvent.click(screen.getByRole("button", {name: "Add symbol"}));
}

async function openViaProjectsRegistry(): Promise<void> {
    fireEvent.click(screen.getByRole("button", {name: "Projects"}));
    fireEvent.click(await screen.findByRole("button", {name: "Open"}));
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
        "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
    };
}

describe("useOpenProject: guarded side effects", () => {
    it("creates a Recommended Blueprint, then reopens its saved Projects row into the Workspace", async () => {
        let saved = false;
        const blueprintLocation = "/games/starter-slot/blueprint.json";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: saved
                    ? [{
                        location: blueprintLocation,
                        name: "Starter Slot",
                        type: "blueprint",
                        capabilities: ["blueprint.build"],
                        origin: "managed",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "ok",
                    }]
                    : [],
            }),
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
            "/api/home/blueprints/save-managed": () => {
                saved = true;
                return {
                    ok: true,
                    status: 201,
                    body: {
                        status: "ok",
                        path: blueprintLocation,
                        name: "starter-slot",
                        blueprintHash: "starter-hash",
                        registeredProject: {
                            location: blueprintLocation,
                            name: "Starter Slot",
                            type: "blueprint",
                            capabilities: ["blueprint.build"],
                            origin: "managed",
                            status: "ok",
                        },
                    },
                };
            },
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: blueprintLocation}, manifest: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"}},
            }),
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {status: "loaded", projectRoot: blueprintLocation, game: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"}, type: "blueprint", capabilities: ["blueprint.build"]},
            }),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: blueprintLocation, valid: true}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        fireEvent.click(screen.getByRole("button", {name: "Create Project"}));
        expect(await screen.findByRole("heading", {name: "Starter Slot"})).toBeInTheDocument();
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(1);

        await act(() => router.navigate("/home/projects"));
        fireEvent.click(await screen.findByRole("button", {name: "Open"}));

        expect(await screen.findByRole("heading", {name: "Starter Slot"})).toBeInTheDocument();
        expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(blueprintLocation)}/overview`);
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(2);
    }, WORKFLOW_TIMEOUT_MS);

    it("Cancel never calls the open-project API", async () => {
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...registryRoute(),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: "/games/a"}, manifest: {id: "a", name: "A", version: "0.1.0"}},
            }),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        dirtyTheDesignDraft();
        await openViaProjectsRegistry();

        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", {name: "Stay"}));

        await waitFor(() => expect(screen.queryByText(CONFIRM_TEXT)).not.toBeInTheDocument());
        expect(calls.find((call) => call.url === "/api/home/projects/open")).toBeUndefined();
        expect(screen.getByRole("button", {name: "Projects"})).toHaveAttribute("aria-current", "page");
    }, WORKFLOW_TIMEOUT_MS);

    it("Confirm calls the open-project API exactly once and navigates exactly once", async () => {
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...registryRoute(),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: "/games/a"}, manifest: {id: "a", name: "A", version: "0.1.0"}},
            }),
            ...createProjectDashboardFetchRoutes(),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        dirtyTheDesignDraft();
        await openViaProjectsRegistry();

        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", {name: "Leave"}));

        expect(await screen.findByRole("heading", {name: "A"})).toBeInTheDocument();
        expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent("/games/a")}/overview`);
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(1);
    }, WORKFLOW_TIMEOUT_MS);

    it("a failed open-project call keeps Home's URL and draft, without leaving the guard bypassed", async () => {
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...registryRoute(),
            "/api/home/projects/open": () => ({ok: false, status: 500, body: {error: "boom"}}),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        dirtyTheDesignDraft();
        await openViaProjectsRegistry();

        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", {name: "Leave"}));

        // The raw "boom" server message is never rendered verbatim -- see [P2-POLISH-04]'s
        // describePathActionError, which turns it into subject-specific status + remediation copy.
        expect(await screen.findByText("The project directory could not be completed. Try again. If it continues, choose the location again and retry.")).toBeInTheDocument();
        expect(screen.queryByText("boom")).not.toBeInTheDocument();
        // A transient open/materialization failure must not remove the registered project row:
        // the visible Open action is the user's direct retry path.
        expect(screen.getByRole("button", {name: "Open"})).toBeInTheDocument();
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(1);
        expect(router.state.location.pathname).toBe("/home/projects");
        expect(screen.getByRole("button", {name: "Projects"})).toHaveAttribute("aria-current", "page");
        fireEvent.click(screen.getByRole("button", {name: "Design Game"}));
        expect(screen.getByDisplayValue("wild-draft")).toBeInTheDocument();

        // The failed attempt must not leave the router-level one-shot bypass stuck "on" -- a later,
        // unrelated navigation away from Home while still dirty must still be blocked, not silently let
        // through unconfirmed.
        await act(() => router.navigate("/project/overview"));
        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/home/design");
    }, WORKFLOW_TIMEOUT_MS);

    it("browser Back/Forward and a direct route navigation are still blocked while dirty", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...registryRoute(),
            ...createProjectDashboardFetchRoutes(),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview", "/home/design"]});

        dirtyTheDesignDraft();

        await act(() => router.navigate(-1));
        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/home/design");
        fireEvent.click(screen.getByRole("button", {name: "Stay"}));
        await waitFor(() => expect(screen.queryByText(CONFIRM_TEXT)).not.toBeInTheDocument());

        await act(() => router.navigate("/project/overview"));
        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/home/design");
    }, WORKFLOW_TIMEOUT_MS);

    it("switching Home's own tabs never shows a confirmation, even while dirty", () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...registryRoute(),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        dirtyTheDesignDraft();

        fireEvent.click(screen.getByRole("button", {name: "Projects"}));
        expect(screen.queryByText(CONFIRM_TEXT)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", {name: "Design Game"}));
        expect(screen.queryByText(CONFIRM_TEXT)).not.toBeInTheDocument();
        expect(screen.getByDisplayValue("wild-draft")).toBeInTheDocument();
    }, WORKFLOW_TIMEOUT_MS);
});
