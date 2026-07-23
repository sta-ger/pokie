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

        // The guided editor's own fields are grouped into sections (SectionedFormEditor) -- Symbols is
        // one of them. Advanced Tools' raw Blueprint Editor has no such tabs, so "Symbols" as a
        // role="tab" unambiguously means the guided one; [0] on the label query below is still needed
        // since the raw editor's own "New symbol id" field (untabbed) is also permanently mounted.
        await user.click(screen.getByRole("tab", {name: "Symbols"}));
        await user.type(screen.getAllByLabelText("New symbol id")[0], "wild-draft");

        await user.click(screen.getByRole("button", {name: "Open Project"}));
        expect(await screen.findByText("No recent projects yet.")).toBeInTheDocument();

        // SectionedFormEditor's own activeSection state isn't reset by this outer tab switch (it never
        // unmounts, only its display toggles, same as every other Home tab body) -- Symbols is still the
        // active section here, no need to click it again.
        await user.click(screen.getByRole("button", {name: "Design & Build"}));
        // HomePage keeps all three tab bodies permanently mounted and only toggles CSS `display` (see
        // HomePage.tsx), so the "wild-draft" value the controlled input holds is preserved across the
        // switch away and back -- but re-showing the design tab still re-renders it, and React 19 can flush
        // that restored render (plus HomePage's activeTab focus() effect) in a microtask after user.click's
        // act() settles. Observe the restored value with an awaited waitFor rather than a bare synchronous
        // read so a contended gate host can't lose that microtask race; it inherits setupTests.ts's
        // asyncUtilTimeout (no bespoke padding) and returns on the first tick once the value is present.
        await waitFor(() => expect(screen.getAllByLabelText("New symbol id")[0]).toHaveValue("wild-draft"));
    });

    // This is by far the heaviest HomePage test: it chains the most sequential real userEvent
    // interactions (dirty the draft, open the modal, Stay, restore, re-open, Leave, land on the project)
    // and so sits closest to its own per-test budget. Under the full check:full gate the workflow lane
    // runs its heaviest real-timer suites side by side at --maxWorkers=2, and these wall-clock-bound
    // tests stretch 2-4x purely from CPU starvation (measured: this suite alone runs ~24s here in
    // isolation but the whole workflow lane's per-suite times balloon under contention). 90000ms could
    // still be starved on a slower/more-contended gate host; 120000ms restores headroom for the
    // worst-case side-by-side run without changing any assertion, matching the contention-headroom
    // reasoning already applied to this file's draft-restore assertions and to happyPath.test.tsx.
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
        // Same as the first draft-restore assertion above: Design & Build's tab body was never unmounted
        // (only CSS-hidden), so the committed "wild-draft" symbol input was preserved verbatim -- but
        // re-showing the tab re-renders it, so observe the restored input with an awaited findAllByDisplayValue
        // (inheriting setupTests.ts's asyncUtilTimeout, no bespoke padding) instead of a bare synchronous
        // read that a contended gate host could win before React flushes the restored render.
        expect((await screen.findAllByDisplayValue("wild-draft"))[0]).toBeInTheDocument();

        // Confirming ("Leave") this time actually opens the project.
        await user.click(screen.getByRole("button", {name: "Open Project"}));
        await user.click(screen.getByRole("button", {name: "Open"}));
        expect(await screen.findByText("You have unsaved changes in Design & Build. Leave and lose them?")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Leave"}));

        await waitFor(() => expect(calls.find((call) => call.url === "/api/home/projects/open")).toBeDefined());
        expect(await screen.findByRole("heading", {name: "A"})).toBeInTheDocument();
    }, 120000);
});
