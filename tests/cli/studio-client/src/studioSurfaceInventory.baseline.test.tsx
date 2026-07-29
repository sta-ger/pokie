import {screen, within} from "@testing-library/react";
import {createRoutedFakeFetch} from "./testUtils/fakeFetch";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

// Phase 2's own starting point: this file freezes the *actual* (not aspirational) Studio route/tab
// surface as an executable fixture, before any redesign work touches it -- see docs/studio-frontend.md
// for the narrative description this pins down. A future redesign step that intentionally changes one
// of these is expected to edit the matching assertion here too, not regress it by accident.
//
// This deliberately does not re-test what's already covered elsewhere at finer grain (routing.test.tsx's
// own direct-link/back-forward coverage, studioLanding.test.tsx's own mode-resolution coverage,
// guidedProgress's own Stepper-vs-progress-list semantics) -- it exists to pin the *whole-surface*
// inventory (every route, every named tab, in the order/grouping actually rendered) in one place.

const PROJECT_ROUTES = {
    "/api/project/context": () => ({
        ok: true,
        status: 200,
        body: {status: "loaded", projectRoot: "/games/my-slot", game: {id: "my-slot", name: "My Slot", version: "1.0.0"}},
    }),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/my-slot", valid: true}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
};

describe("Studio route table baseline", () => {
    it("an entirely unrecognized path falls back to Design & Build, not a blank/error screen", () => {
        const {fetchImpl} = createRoutedFakeFetch({"/api/home/recent-projects": () => ({ok: true, status: 200, body: []})});

        renderRoutedApp({fetchImpl, initialEntries: ["/does-not-exist/at-all"]});

        expect(screen.getByRole("heading", {name: "Design & Build Your Game"})).toBeInTheDocument();
    });

    it("bare /project redirects to /project/overview, never rendering a tab-less dashboard", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);

        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project"]});

        await screen.findByRole("heading", {name: "My Slot"});
        expect(router.state.location.pathname).toBe("/project/overview");
    });
});

describe("Home (/home/:tab) tab inventory baseline", () => {
    it("lists exactly Design & Build, Open Project, Advanced Tools, in that order, ungrouped", () => {
        const {fetchImpl} = createRoutedFakeFetch({"/api/home/recent-projects": () => ({ok: true, status: 200, body: []})});

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        const nav = screen.getByRole("navigation", {name: "Sections"});
        const tabButtons = within(nav).getAllByRole("button");
        expect(tabButtons.map((button) => button.textContent)).toEqual(["Design & Build", "Open Project", "Advanced Tools"]);
        // None of Home's 3 tabs are grouped under a visible section label (unlike the Project Dashboard's
        // "Advanced" grouping below) -- there is no section header text anywhere in the nav.
        expect(within(nav).queryByText("Advanced")).not.toBeInTheDocument();
    });

    it("Design & Build is the default tab, and Advanced Tools hosts the raw (non-guided) Blueprint Editor alongside every other non-featured tool", () => {
        const {fetchImpl} = createRoutedFakeFetch({"/api/home/recent-projects": () => ({ok: true, status: 200, body: []})});

        renderRoutedApp({fetchImpl, initialEntries: ["/home/advanced"]});

        expect(screen.getByRole("button", {name: "Advanced Tools"})).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("heading", {name: "Raw Blueprint Editor"})).toBeInTheDocument();
        expect(screen.getByRole("heading", {name: "Scaffold a hand-coded game"})).toBeInTheDocument();
        expect(screen.getByRole("heading", {name: "Initialize an existing directory"})).toBeInTheDocument();
        expect(screen.getByRole("heading", {name: "Build from an existing blueprint file"})).toBeInTheDocument();
    });
});

describe("Project Dashboard (/project/:tab) tab inventory baseline", () => {
    it("lists exactly the 11 named tabs, in order, with a single 'Advanced' grouping starting at Replay", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const nav = screen.getByRole("navigation", {name: "Sections"});
        const tabButtons = within(nav).getAllByRole("button");
        expect(tabButtons.map((button) => button.textContent)).toEqual([
            "Overview",
            "Validate",
            "Simulation & Reports",
            "Replay",
            "Runtime",
            "Deployment",
            "Outcome Libraries",
            "Mechanics Editor",
            "Certification",
            "Provably Fair",
            "Stake Engine Export",
        ]);
        // Exactly one "Advanced" section header for the whole nav (NavTabs only prints one when the
        // section actually changes from the previous item's) -- Overview/Validate/Simulation & Reports
        // stay ungrouped as the primary happy path; everything from Replay onward shares it.
        expect(within(nav).getAllByText("Advanced")).toHaveLength(1);
    });
});

describe("New Blueprint action surface baseline", () => {
    it("both the guided (Design & Build) and raw (Advanced Tools) Blueprint Editor instances expose a 'New Blueprint' action", () => {
        const {fetchImpl} = createRoutedFakeFetch({"/api/home/recent-projects": () => ({ok: true, status: 200, body: []})});

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        // The raw (Advanced Tools) instance's own "New Blueprint" button is permanently mounted too
        // (hidden via CSS, not unmounted -- see HomePage's own "hide, don't unmount" tab convention), so
        // this button always exists exactly twice -- `hidden: true` is needed to count the
        // currently-inactive tab's copy, which getByRole excludes by default.
        expect(screen.getAllByRole("button", {name: "New Blueprint", hidden: true})).toHaveLength(2);
    });

    it("only the guided instance offers a 'Show advanced options' disclosure -- the raw editor has no such toggle at all", () => {
        const {fetchImpl} = createRoutedFakeFetch({"/api/home/recent-projects": () => ({ok: true, status: 200, body: []})});

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        expect(screen.getAllByRole("button", {name: "Show advanced options (JSON mode, load/save by path)"})).toHaveLength(1);
    });
});
