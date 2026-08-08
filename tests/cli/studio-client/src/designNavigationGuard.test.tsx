import {act, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "./testUtils/fakeFetch";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

// Covers useDesignNavigationGuard end to end, through real router transitions (not the hook in
// isolation) -- the whole point of the centralized guard is that it uniformly intercepts every kind of
// history transition, so these tests drive it the same way a real browser would: router.navigate(-1) for
// Back, and a direct router.navigate("/project/...") for a typed/linked URL. Home tab switches are driven
// through the UI itself, since those must never even reach the blocker.
const CONFIRM_TEXT = "You have unsaved changes in Design Game. Leave and lose them?";

function createProjectFetch() {
    return createRoutedFakeFetch({
        "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        "/api/project/context": () => ({
            ok: true,
            status: 200,
            body: {status: "loaded", projectRoot: "/games/a", game: {id: "a", name: "A", version: "1.0.0"}},
        }),
        "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true}}),
        "/api/project/reports": () => ({ok: true, status: 200, body: []}),
        "/api/project/replays": () => ({ok: true, status: 200, body: []}),
        "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
    });
}

async function dirtyTheDesignDraft(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    // Symbols is one of SectionedFormEditor's own sections -- needs its own tab click first. Typing
    // alone doesn't dirty the blueprint (the field is just local uncommitted input state until "Add
    // symbol" actually mutates the blueprint) -- same setup HomePage.test.tsx's own dirty-confirm test
    // uses. There is exactly one BlueprintEditorPage instance on Home (the guided Design Game tab's own).
    await user.click(screen.getByRole("tab", {name: "Symbols"}));
    await user.type(screen.getByLabelText("New symbol id"), "wild-draft");
    await user.click(screen.getByRole("button", {name: "Add symbol"}));
}

describe("useDesignNavigationGuard: centralized dirty-navigation guard", () => {
    it("blocks browser Back navigation away from Home while the Design Game draft is dirty", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createProjectFetch();
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview", "/home/design"]});

        await dirtyTheDesignDraft(user);

        await act(() => router.navigate(-1));

        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        // The blocked transition hasn't been resolved yet -- still on Home, draft untouched.
        expect(screen.getByRole("button", {name: "Design Game"})).toHaveAttribute("aria-current", "page");
        expect(router.state.location.pathname).toBe("/home/design");
    }, 60000);

    it("blocks a direct navigation to /project/* while the Design Game draft is dirty", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createProjectFetch();
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await dirtyTheDesignDraft(user);

        await act(() => router.navigate("/project/overview"));

        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Design Game"})).toHaveAttribute("aria-current", "page");
        expect(router.state.location.pathname).toBe("/home/design");
    }, 60000);

    it("Cancel keeps the current URL and preserves the dirty draft", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createProjectFetch();
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview", "/home/design"]});

        await dirtyTheDesignDraft(user);

        await act(() => router.navigate(-1));
        await screen.findByText(CONFIRM_TEXT);

        await user.click(screen.getByRole("button", {name: "Stay"}));

        await waitFor(() => expect(screen.queryByText(CONFIRM_TEXT)).not.toBeInTheDocument());
        expect(router.state.location.pathname).toBe("/home/design");
        expect(screen.getByRole("button", {name: "Design Game"})).toHaveAttribute("aria-current", "page");
        expect(screen.getByDisplayValue("wild-draft")).toBeInTheDocument();
    }, 60000);

    // Many sequential real userEvent interactions plus a real cross-page navigation -- under Jest's
    // parallel/contended workers this can exceed the project's default testTimeout, same reasoning as
    // happyPath.test.tsx's own explicit timeout.
    it("Confirm performs the originally blocked navigation exactly once", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createProjectFetch();
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview", "/home/design"]});

        await dirtyTheDesignDraft(user);

        await act(() => router.navigate(-1));
        await screen.findByText(CONFIRM_TEXT);

        await user.click(screen.getByRole("button", {name: "Leave"}));

        expect(await screen.findByRole("heading", {name: "A"})).toBeInTheDocument();
        expect(router.state.location.pathname).toBe("/project/overview");

        // blocker.proceed() resumes the exact transition that was blocked rather than issuing a second
        // navigate() on top of it -- so exactly one history entry was consumed: we're now at the start of
        // the 2-entry history stack, and a single step *forward* lands straight back on Home instead of
        // a leftover duplicate entry sitting in between.
        await act(() => router.navigate(1));
        await waitFor(() => expect(screen.getByRole("button", {name: "Design Game"})).toHaveAttribute("aria-current", "page"));
    }, 60000);

    // Many sequential real userEvent interactions -- same reasoning as above.
    it("switching Home's own tabs never prompts, even while the draft is dirty", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await dirtyTheDesignDraft(user);

        await user.click(screen.getByRole("button", {name: "Projects"}));
        expect(screen.queryByText(CONFIRM_TEXT)).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Projects"})).toHaveAttribute("aria-current", "page");

        await user.click(screen.getByRole("button", {name: "Design Game"}));
        expect(screen.queryByText(CONFIRM_TEXT)).not.toBeInTheDocument();
        expect(screen.getByDisplayValue("wild-draft")).toBeInTheDocument();
    }, 60000);

    it("registers a native beforeunload listener only while the draft is dirty", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        });
        const addSpy = jest.spyOn(window, "addEventListener");
        const removeSpy = jest.spyOn(window, "removeEventListener");

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        expect(addSpy.mock.calls.some(([type]) => type === "beforeunload")).toBe(false);

        await dirtyTheDesignDraft(user);

        await waitFor(() => expect(addSpy.mock.calls.some(([type]) => type === "beforeunload")).toBe(true));

        addSpy.mockClear();
        removeSpy.mockClear();

        // "New Blueprint" now opens the New flow's own dirty-confirm gate first (see
        // NewBlueprintDialog's own doc comment) -- Discard then Blank resets the draft back to clean,
        // same end state the direct reset used to reach in one click.
        await user.click(screen.getByRole("button", {name: "New Blueprint"}));
        await user.click(await screen.findByRole("button", {name: "Discard"}));
        await user.click(await screen.findByRole("button", {name: "Blank"}));

        await waitFor(() => expect(removeSpy.mock.calls.some(([type]) => type === "beforeunload")).toBe(true));
        expect(addSpy.mock.calls.some(([type]) => type === "beforeunload")).toBe(false);

        addSpy.mockRestore();
        removeSpy.mockRestore();
    }, 60000);

    // useBlocker only intercepts transitions it can track via history.state.idx -- entries the router
    // itself created via pushState. A raw `window.location.hash = ...` assignment (what a typed
    // address-bar edit does) creates an *untracked* entry (history.state is null) that useBlocker can't
    // compute a safe revert-delta for and silently lets through -- this is a real, verified gap (see
    // useDesignNavigationGuard's own doc comment), not a hypothetical. This exercises the fallback
    // `hashchange` listener that closes it, independent of whichever router (Memory/Hash) is mounted
    // above, since the listener operates on the native `window` object directly.
    it("blocks a raw hash edit that bypasses the router's own tracked history", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        window.location.hash = "#/home/design";
        await dirtyTheDesignDraft(user);

        window.location.hash = "#/project/overview";

        expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
        // Reverted immediately, same as useBlocker restoring the address bar for transitions it can track.
        expect(window.location.hash).toBe("#/home/design");

        await user.click(screen.getByRole("button", {name: "Leave"}));
        await waitFor(() => expect(window.location.hash).toBe("#/project/overview"));
    }, 60000);
});
