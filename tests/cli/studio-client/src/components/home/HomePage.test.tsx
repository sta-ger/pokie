import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

// HomePage keeps all three tab bodies permanently mounted (see HomePage.tsx) -- including two whole
// BlueprintEditorPage instances -- so a `screen`-wide *ByRole/*ByLabelText query has to walk the entire
// ~900-element document and run jsdom's getComputedStyle over it to decide what's in the accessibility
// tree. Measured on an idle machine: ~800-1100ms for a single `screen.getByRole("button", {name})` or
// `screen.getByLabelText(...)`, against ~30ms for `getByRole("navigation")`, ~13ms for
// `getByRole("dialog")` and ~1ms for the same query scoped to a small container. That per-query cost --
// not the interactions themselves -- is what made this suite heavy, and it is what makes it starvation-
// prone under the full gate: a `waitFor` whose own query costs a second gets only a handful of polls
// inside setupTests.ts's asyncUtilTimeout, so a contended host can expire the wait before React has had
// a fair chance to flush the render being waited on.
//
// So every query below is scoped to the smallest container that still identifies its target: the
// "Sections" nav for HomePage's own tab buttons, the guided editor's active section panel for its own
// fields, the open confirm dialog for its buttons. That is strictly *more* precise than the screen-wide
// query plus a `[0]` index it replaces (the raw Blueprint Editor mounted under Advanced Tools has its
// own "New symbol id" field, which is exactly why that index was needed before), and no assertion is
// weakened or removed by it.
function sectionsNav() {
    return within(screen.getByRole("navigation", {name: "Sections"}));
}

// The guided editor's own fields are grouped into sections by SectionedFormEditor, which renders only
// the active section's panel -- and Advanced Tools' raw Blueprint Editor has no such tabs -- so there is
// exactly one `tabpanel` in the document, the guided editor's. Re-querying it (rather than caching the
// node) also asserts it is still in the accessibility tree, i.e. that its tab body is really shown.
function guidedSection() {
    return within(screen.getByRole("tabpanel"));
}

describe("HomePage", () => {
    it("defaults to Design & Build and switches between tabs, keeping aria-current on the active one", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        expect(screen.getByRole("heading", {name: "Design & Build Your Game"})).toBeInTheDocument();
        expect(sectionsNav().getByRole("button", {name: "Design & Build"})).toHaveAttribute("aria-current", "page");

        await user.click(sectionsNav().getByRole("button", {name: "Open Project"}));

        expect(await screen.findByText("No recent projects yet.")).toBeInTheDocument();
        expect(screen.getByLabelText("Project path", {exact: false})).toBeInTheDocument();
        expect(sectionsNav().getByRole("button", {name: "Open Project"})).toHaveAttribute("aria-current", "page");
        expect(sectionsNav().getByRole("button", {name: "Design & Build"})).not.toHaveAttribute("aria-current");

        await user.click(sectionsNav().getByRole("button", {name: "Advanced Tools"}));
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

        await user.click(sectionsNav().getByRole("button", {name: "Open Project"}));
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

        // Symbols is one of the guided editor's own SectionedFormEditor sections, so it needs its own tab
        // click before its panel -- and with it the "New symbol id" field -- exists.
        await user.click(screen.getByRole("tab", {name: "Symbols"}));
        await user.type(guidedSection().getByLabelText("New symbol id"), "wild-draft");

        await user.click(sectionsNav().getByRole("button", {name: "Open Project"}));
        expect(await screen.findByText("No recent projects yet.")).toBeInTheDocument();

        // SectionedFormEditor's own activeSection state isn't reset by this outer tab switch (it never
        // unmounts, only its display toggles, same as every other Home tab body) -- Symbols is still the
        // active section here, no need to click it again.
        await user.click(sectionsNav().getByRole("button", {name: "Design & Build"}));
        // HomePage keeps all three tab bodies permanently mounted and only toggles CSS `display` (see
        // HomePage.tsx), so the "wild-draft" value the controlled input holds is preserved across the
        // switch away and back -- but re-showing the design tab still re-renders it, and React 19 can flush
        // that restored render (plus HomePage's activeTab focus() effect) in a microtask after user.click's
        // act() settles. Observe the restored value with an awaited waitFor rather than a bare synchronous
        // read so a contended gate host can't lose that microtask race; it inherits setupTests.ts's
        // asyncUtilTimeout (no bespoke padding) and returns on the first tick once the value is present.
        await waitFor(() => expect(guidedSection().getByLabelText("New symbol id")).toHaveValue("wild-draft"));
    });

    // This is by far the heaviest HomePage test: it chains the most sequential real userEvent
    // interactions (dirty the draft, open the modal, Stay, restore, re-open, Leave, land on the project)
    // and so sits closest to its own per-test budget. check:full itself no longer starves it --
    // test:workflows runs this lane `--runInBand` (see package.json), one heavy real-timer suite at a
    // time -- so under check:full this budget is pure headroom. It stays at 120000ms rather than dropping
    // to the 90000ms the lane's other two heaviest tests use because test:coverage (via check:release)
    // still runs this lane at --maxWorkers=2 alongside every other project *and* under coverage
    // instrumentation, which is the worst contention this test ever sees. Headroom only: no assertion is
    // relaxed or removed by this number.
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
        // genuinely dirty. Symbols is one of SectionedFormEditor's own sections, so it needs its own tab
        // click first.
        await user.click(screen.getByRole("tab", {name: "Symbols"}));
        await user.type(guidedSection().getByLabelText("New symbol id"), "wild-draft");
        await user.click(guidedSection().getByRole("button", {name: "Add symbol"}));

        await user.click(sectionsNav().getByRole("button", {name: "Open Project"}));
        await user.type(screen.getByLabelText("Project path", {exact: false}), "/games/a");
        // The Open Project tab body is never unmounted either, so this submit button stays the very same
        // node for the whole test -- resolved once here so the second submit below doesn't have to pay
        // for another screen-wide role query.
        const openButton = screen.getByRole("button", {name: "Open"});
        await user.click(openButton);

        expect(await screen.findByText("You have unsaved changes in Design & Build. Leave and lose them?")).toBeInTheDocument();

        // Cancel ("Stay") -- useOpenProject's guardedAction defers the API call itself until confirmed
        // (see openProjectGuard.test.tsx for a dedicated check that it never fired), so we're still on
        // Home, on the Open Project tab (never navigated to /project), and the draft is exactly where it
        // was.
        await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Stay"}));
        await waitFor(() =>
            expect(screen.queryByText("You have unsaved changes in Design & Build. Leave and lose them?")).not.toBeInTheDocument(),
        );
        expect(sectionsNav().getByRole("button", {name: "Open Project"})).toHaveAttribute("aria-current", "page");
        await user.click(sectionsNav().getByRole("button", {name: "Design & Build"}));
        // Same as the first draft-restore assertion above: Design & Build's tab body was never unmounted
        // (only CSS-hidden), so the committed "wild-draft" symbol input was preserved verbatim -- but
        // re-showing the tab re-renders it, so observe the restored input with an awaited
        // findByDisplayValue (inheriting setupTests.ts's asyncUtilTimeout, no bespoke padding) instead of
        // a bare synchronous read that a contended gate host could win before React flushes the restored
        // render. Display-value queries don't consult the accessibility tree, so this one is cheap
        // screen-wide.
        expect(await screen.findByDisplayValue("wild-draft")).toBeInTheDocument();

        // Confirming ("Leave") this time actually opens the project.
        await user.click(sectionsNav().getByRole("button", {name: "Open Project"}));
        await user.click(openButton);
        expect(await screen.findByText("You have unsaved changes in Design & Build. Leave and lose them?")).toBeInTheDocument();
        await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Leave"}));

        await waitFor(() => expect(calls.find((call) => call.url === "/api/home/projects/open")).toBeDefined());
        expect(await screen.findByRole("heading", {name: "A"})).toBeInTheDocument();
    }, 120000);
});
