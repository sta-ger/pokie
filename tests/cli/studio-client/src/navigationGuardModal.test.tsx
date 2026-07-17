import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "./testUtils/fakeFetch";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

// Covers the confirm modal's own dismissal behavior -- shared by useDesignNavigationGuard's router
// blocker, its guardedAction, and its hashchange fallback, since all three spread the same CONFIRM_MODAL
// constant. Escape/click-outside/the close button must never dismiss it without an explicit Leave/Stay
// choice: for the blocker, any other dismissal would leave `blocker.state` stuck "blocked" forever (no
// proceed(), no reset()); for guardedAction, it would leave its returned Promise permanently pending,
// which leaves every awaiting caller (e.g. OpenProjectForm's loading state and its double-submit guard)
// stuck forever too.
const CONFIRM_TEXT = "You have unsaved changes in Design & Build. Leave and lose them?";

async function dirtyTheDesignDraft(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.type(screen.getAllByLabelText("New symbol id")[0], "wild-draft");
    await user.click(screen.getAllByRole("button", {name: "Add symbol"})[0]);
}

describe("Confirm modal: cannot be dismissed except via Leave/Stay", () => {
    it("Escape does not close the modal and leaves the blocked transition pending", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview", "/home/design"]});

        await dirtyTheDesignDraft(user);
        router.navigate(-1);
        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();

        await user.keyboard("{Escape}");

        // Give any (incorrect) close handling a chance to run before asserting it didn't.
        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });
        expect(screen.getByText(CONFIRM_TEXT)).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/home/design");
    }, 45000);

    it("clicking outside the modal does not close it", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview", "/home/design"]});

        await dirtyTheDesignDraft(user);
        router.navigate(-1);
        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();

        const overlay = document.querySelector(".mantine-Overlay-root");
        expect(overlay).not.toBeNull();
        await user.click(overlay as Element);

        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });
        expect(screen.getByText(CONFIRM_TEXT)).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/home/design");
    }, 45000);

    it("the modal has no close button -- only Leave and Stay", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview", "/home/design"]});

        await dirtyTheDesignDraft(user);
        router.navigate(-1);
        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();

        const dialog = screen.getByRole("dialog");
        const buttons = within(dialog).getAllByRole("button");
        expect(buttons.map((button) => button.textContent)).toEqual(["Stay", "Leave"]);
    }, 45000);

    it("Stay releases the loading state and double-submit guard on the guardedAction path", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: "/games/a"}, manifest: {id: "a", name: "A", version: "0.1.0"}},
            }),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await dirtyTheDesignDraft(user);
        await user.click(screen.getByRole("button", {name: "Open Project"}));
        await user.type(screen.getByLabelText("Project path", {exact: false}), "/games/a");
        await user.click(screen.getByRole("button", {name: "Open", exact: true}));

        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        expect(screen.getByText("Opening…")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Stay"}));

        await waitFor(() => expect(screen.queryByText(CONFIRM_TEXT)).not.toBeInTheDocument());
        await waitFor(() => expect(screen.queryByText("Opening…")).not.toBeInTheDocument());
        expect(screen.getByRole("button", {name: "Open", exact: true})).not.toHaveAttribute("data-loading");
    }, 45000);

    it("after Stay, a subsequent open attempt completes normally", async () => {
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

        await dirtyTheDesignDraft(user);
        await user.click(screen.getByRole("button", {name: "Open Project"}));
        await user.type(screen.getByLabelText("Project path", {exact: false}), "/games/a");
        await user.click(screen.getByRole("button", {name: "Open", exact: true}));
        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Stay"}));
        await waitFor(() => expect(screen.queryByText(CONFIRM_TEXT)).not.toBeInTheDocument());

        await user.click(screen.getByRole("button", {name: "Open", exact: true}));
        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Leave"}));

        expect(await screen.findByRole("heading", {name: "A"})).toBeInTheDocument();
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(1);
    }, 45000);
});
