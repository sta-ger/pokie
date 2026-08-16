import {act, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "./testUtils/fakeFetch";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

// Covers the confirm modal's own dismissal behavior -- shared by useDesignNavigationGuard's router
// blocker, its guardedAction, and its hashchange fallback, since all three spread the same CONFIRM_MODAL
// constant. Escape/click-outside/the close button must never dismiss it without an explicit Leave/Stay
// choice: for the blocker, any other dismissal would leave `blocker.state` stuck "blocked" forever (no
// proceed(), no reset()); for guardedAction, it would leave its returned Promise permanently pending,
// which leaves every awaiting caller (e.g. ProjectsPanel's own Open action) stuck forever too.
const CONFIRM_TEXT = "You have unsaved changes in Design Game. Leave and lose them?";
// The routed app keeps the complete Design Game editor mounted while Projects is visible. Its real
// user-event/modal transitions are deliberately exercised here and can exceed the workflow lane's
// usual 60s budget on a cgroup-limited gate worker, even though each assertion eventually observes the
// intended state.
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

async function dirtyTheDesignDraft(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    // Symbols is one of SectionedFormEditor's own sections -- needs its own tab click first.
    await user.click(screen.getByRole("tab", {name: "Symbols"}));
    await user.type(screen.getByLabelText("New symbol id"), "wild-draft");
    await user.click(screen.getByRole("button", {name: "Add symbol"}));
}

describe("Confirm modal: cannot be dismissed except via Leave/Stay", () => {
    it("Escape does not close the modal and leaves the blocked transition pending", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...registryRoute(),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview", "/home/design"]});

        await dirtyTheDesignDraft(user);
        await act(() => router.navigate(-1));
        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();

        await user.keyboard("{Escape}");

        // Give any (incorrect) close handling a chance to run before asserting it didn't.
        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });
        expect(screen.getByText(CONFIRM_TEXT)).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/home/design");
    }, WORKFLOW_TIMEOUT_MS);

    it("clicking outside the modal does not close it", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...registryRoute(),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview", "/home/design"]});

        await dirtyTheDesignDraft(user);
        await act(() => router.navigate(-1));
        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();

        const overlay = document.querySelector(".mantine-Overlay-root");
        expect(overlay).not.toBeNull();
        await user.click(overlay as Element);

        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });
        expect(screen.getByText(CONFIRM_TEXT)).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/home/design");
    }, WORKFLOW_TIMEOUT_MS);

    it("the modal has no close button -- only Leave and Stay", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...registryRoute(),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview", "/home/design"]});

        await dirtyTheDesignDraft(user);
        await act(() => router.navigate(-1));
        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();

        const dialog = screen.getByRole("dialog");
        const buttons = within(dialog).getAllByRole("button");
        expect(buttons.map((button) => button.textContent)).toEqual(["Stay", "Leave"]);
    }, WORKFLOW_TIMEOUT_MS);

    it("Stay releases the loading state and double-submit guard on the guardedAction path", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...registryRoute(),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: "/games/a"}, manifest: {id: "a", name: "A", version: "0.1.0"}},
            }),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await dirtyTheDesignDraft(user);
        await user.click(screen.getByRole("button", {name: "Projects"}));
        const openButton = await screen.findByRole("button", {name: "Open"});
        await user.click(openButton);

        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Stay"}));

        await waitFor(() => expect(screen.queryByText(CONFIRM_TEXT)).not.toBeInTheDocument());
        expect(openButton).not.toHaveAttribute("data-loading");
    }, WORKFLOW_TIMEOUT_MS);

    it("after Stay, a subsequent open attempt completes normally", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...registryRoute(),
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
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await dirtyTheDesignDraft(user);
        await user.click(screen.getByRole("button", {name: "Projects"}));
        const openButton = await screen.findByRole("button", {name: "Open"});
        await user.click(openButton);
        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Stay"}));
        await waitFor(() => expect(screen.queryByText(CONFIRM_TEXT)).not.toBeInTheDocument());

        await user.click(openButton);
        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Leave"}));

        await waitFor(() => expect(calls.find((call) => call.url === "/api/home/projects/open")).toBeDefined());
        expect(await screen.findByRole("heading", {name: "A"})).toBeInTheDocument();
    }, WORKFLOW_TIMEOUT_MS);
});
