import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

// HomePage keeps both tab bodies permanently mounted (see HomePage.tsx) -- so a `screen`-wide
// *ByRole/*ByLabelText query has to walk the entire document and run jsdom's getComputedStyle over it to
// decide what's in the accessibility tree. Measured in the gate container: tens of milliseconds per
// screen-wide accessibility-tree query (~40ms for `getByRole("heading", {name})`, ~100ms for
// `getByRole("tab", {name})`) against ~10ms for `getByRole("navigation", {name})`. Real, but an order of
// magnitude too small to be what this suite's gate failures were about.
//
// Two things were, and neither is a timeout:
//
//   1. This file's tab-switch assertions could not fail for the reason they were written to catch (see
//      expectActiveSection below).
//   2. The lane ran every process with a V8 old-space ceiling larger than the whole container. That is
//      a lane-level property, fixed in package.json/jest.config.mjs, not here -- but it is why this
//      file kept coming back red under check:full while passing on its own, and why five successive
//      rounds of raising the budget below changed nothing. Do not read a failure here as a budget
//      problem again without first checking the worker's actual heap_size_limit.
//
// The scoping below is therefore kept for precision, not speed: every query targets the smallest
// container that still identifies it -- the "Sections" nav for HomePage's own tab buttons, the guided
// editor's active section panel for its own fields, the open confirm dialog for its buttons.
function sectionsNav() {
    return within(screen.getByRole("navigation", {name: "Sections"}));
}

// The guided editor's own fields are grouped into sections by SectionedFormEditor, which renders only
// the active section's panel, so there is exactly one `tabpanel` in the document. Re-querying it (rather
// than caching the node) also asserts it is still in the accessibility tree, i.e. that its tab body is
// really shown.
function guidedSection() {
    return within(screen.getByRole("tabpanel"));
}

// Switching Home tabs is a real router navigation (`navigate("/home/:tab")` -> react-router's data
// router resolves the match asynchronously), so React can flush the resulting render after
// user.click's act() has already settled. That has to be observed with an awaited assertion, and it
// has to be observed on something that actually changes with the switch.
//
// Content-based waits can't do it here, which is the trap this file kept falling into: because both
// tab bodies stay permanently mounted (see HomePage.tsx) and only *ByRole queries filter on
// accessibility-tree visibility, a findByText off ProjectsPanel's own mount-time fetch in the
// still-hidden Projects body, or a findByDisplayValue matching the still-mounted symbol input, would
// both be satisfied before any navigation happens, so neither proves the tab switched and the
// synchronous aria-current/heading reads that followed them would be racing the navigation outright.
//
// aria-current on the Sections nav is the switch itself, and HomePage sets it from the same
// `activeTab` render that toggles each body's `display`, so awaiting it also synchronises every
// assertion about the now-visible body -- no per-assertion padding needed, and it returns on the
// first tick once the navigation has landed.
async function expectActiveSection(name: string): Promise<void> {
    await waitFor(() => expect(sectionsNav().getByRole("button", {name})).toHaveAttribute("aria-current", "page"));
}

// One budget for the whole file -- see the equivalent note this replaces for the historical measurements
// this number is derived from; the shape of the suite (render the entire routed app, drive a chain of
// real userEvent interactions with real timers) hasn't changed with the tab redesign.
jest.setTimeout(120000);

describe("HomePage", () => {
    it("defaults to Design Game and switches between tabs, keeping aria-current on the active one", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        expect(screen.getByRole("heading", {name: "Design Your Game"})).toBeInTheDocument();
        expect(sectionsNav().getByRole("button", {name: "Design Game"})).toHaveAttribute("aria-current", "page");

        await user.click(sectionsNav().getByRole("button", {name: "Projects"}));

        await expectActiveSection("Projects");
        expect(await screen.findByText("No projects yet -- import or design one below.")).toBeInTheDocument();
        expect(screen.getByLabelText("Location", {exact: false})).toBeInTheDocument();
        expect(sectionsNav().getByRole("button", {name: "Design Game"})).not.toHaveAttribute("aria-current");

        // The removed "Advanced Tools" scaffold/init-in-place flows have no replacement inside Studio --
        // this is the visible pointer to the CLI commands that replace them (see HomePage.tsx's own doc
        // comment), so it has to survive as user-facing copy, not just a source comment.
        expect(
            screen.getByText((_, element) => element?.tagName.toLowerCase() === "p" && (element.textContent ?? "").includes("pokie init")),
        ).toBeInTheDocument();
        expect(
            screen.getByText((_, element) => element?.tagName.toLowerCase() === "p" && (element.textContent ?? "").includes("pokie create")),
        ).toBeInTheDocument();

        await user.click(sectionsNav().getByRole("button", {name: "Design Game"}));
        await expectActiveSection("Design Game");
        expect(screen.getByRole("heading", {name: "Design Your Game"})).toBeInTheDocument();
    });

    it("refreshes a moved managed project when returning from Design Game", async () => {
        const user = userEvent.setup();
        let status: "ok" | "missing" = "ok";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [
                    {
                        location: "/games/moved",
                        name: "Moved game",
                        type: "tsPackage",
                        capabilities: [],
                        origin: "managed",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status,
                    },
                ],
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});

        expect(await screen.findByRole("button", {name: "Open"})).toBeInTheDocument();
        await user.click(sectionsNav().getByRole("button", {name: "Design Game"}));
        await expectActiveSection("Design Game");

        status = "missing";
        await user.click(sectionsNav().getByRole("button", {name: "Projects"}));
        await expectActiveSection("Projects");

        expect(await screen.findByText("Moved game (missing)")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Relocate"})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Open"})).not.toBeInTheDocument();
        expect(calls.filter((call) => call.url.startsWith("/api/home/projects/registry")).length).toBe(2);
    });

    it("opens an already-registered project from the Projects tab's registry list", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
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
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: "/games/a"}, manifest: {id: "a", name: "A", version: "0.1.0"}},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await user.click(sectionsNav().getByRole("button", {name: "Projects"}));
        await expectActiveSection("Projects");
        await user.click(await screen.findByRole("button", {name: "Open"}));

        await waitFor(() => {
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/open",
                    init: expect.objectContaining({body: JSON.stringify({projectRoot: "/games/a"})}),
                }),
            );
        });
    });

    it("preserves a Design Game draft across Design -> Projects -> Design (tabs stay mounted, never unmounted)", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        // Symbols is one of the guided editor's own SectionedFormEditor sections, so it needs its own tab
        // click before its panel -- and with it the "New symbol id" field -- exists.
        await user.click(screen.getByRole("tab", {name: "Symbols"}));
        await user.type(guidedSection().getByLabelText("New symbol id"), "wild-draft");

        await user.click(sectionsNav().getByRole("button", {name: "Projects"}));
        await expectActiveSection("Projects");
        expect(await screen.findByText("No projects yet -- import or design one below.")).toBeInTheDocument();

        // SectionedFormEditor's own activeSection state isn't reset by this outer tab switch (it never
        // unmounts, only its display toggles, same as every other Home tab body) -- Symbols is still the
        // active section here, no need to click it again.
        await user.click(sectionsNav().getByRole("button", {name: "Design Game"}));
        await expectActiveSection("Design Game");
        // The switch back has landed (expectActiveSection above), so the draft assertion is now the only
        // thing left to prove: Design Game's body was never unmounted, only CSS-hidden, so the
        // "wild-draft" value its controlled input holds survived the round trip verbatim. guidedSection()
        // re-queries the tabpanel by role, so this also re-asserts that the guided editor's Symbols panel
        // is genuinely back in the accessibility tree rather than reading a hidden node.
        expect(guidedSection().getByLabelText("New symbol id")).toHaveValue("wild-draft");
    });

    // The heaviest test in the file: it chains the most sequential real userEvent interactions (dirty the
    // draft, open the modal, Stay, restore, re-open, Leave, land on the project), which is why it sets the
    // upper end of the measurements behind the file-wide budget above.
    it("asks for confirmation before leaving a dirty Design Game draft to open a project, and Cancel preserves it", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
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

        // Typing alone doesn't dirty the blueprint (the "New symbol id" field is just local uncommitted
        // input state until "Add symbol" actually mutates the blueprint) -- click it too so the editor is
        // genuinely dirty. Symbols is one of SectionedFormEditor's own sections, so it needs its own tab
        // click first.
        await user.click(screen.getByRole("tab", {name: "Symbols"}));
        await user.type(guidedSection().getByLabelText("New symbol id"), "wild-draft");
        await user.click(guidedSection().getByRole("button", {name: "Add symbol"}));

        await user.click(sectionsNav().getByRole("button", {name: "Projects"}));
        await expectActiveSection("Projects");
        // The Projects tab body is never unmounted either, so this row's Open button stays the very same
        // node for the whole test -- resolved once here so the second click below doesn't have to pay
        // for another screen-wide role query.
        const openButton = await screen.findByRole("button", {name: "Open"});
        await user.click(openButton);

        expect(await screen.findByText("You have unsaved changes in Design Game. Leave and lose them?")).toBeInTheDocument();

        // Cancel ("Stay") -- useOpenProject's guardedAction defers the API call itself until confirmed
        // (see openProjectGuard.test.tsx for a dedicated check that it never fired), so we're still on
        // Home, on the Projects tab (never navigated to /project), and the draft is exactly where it
        // was.
        await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Stay"}));
        await waitFor(() =>
            expect(screen.queryByText("You have unsaved changes in Design Game. Leave and lose them?")).not.toBeInTheDocument(),
        );
        expect(sectionsNav().getByRole("button", {name: "Projects"})).toHaveAttribute("aria-current", "page");
        await user.click(sectionsNav().getByRole("button", {name: "Design Game"}));
        await expectActiveSection("Design Game");
        // Same as the first draft-restore assertion above: Design Game's tab body was never unmounted
        // (only CSS-hidden), so the committed "wild-draft" symbol input was preserved verbatim. This is
        // scoped to the now-visible guided section rather than left as a screen-wide findByDisplayValue:
        // display-value queries don't filter on accessibility-tree visibility, so a screen-wide one would
        // have matched the still-mounted input even if the switch back had never landed -- it could never
        // have failed for the reason it was written to catch.
        expect(guidedSection().getByDisplayValue("wild-draft")).toBeInTheDocument();

        // Confirming ("Leave") this time actually opens the project.
        await user.click(sectionsNav().getByRole("button", {name: "Projects"}));
        await expectActiveSection("Projects");
        await user.click(openButton);
        expect(await screen.findByText("You have unsaved changes in Design Game. Leave and lose them?")).toBeInTheDocument();
        await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Leave"}));

        await waitFor(() => expect(calls.find((call) => call.url === "/api/home/projects/open")).toBeDefined());
        expect(await screen.findByRole("heading", {name: "A"})).toBeInTheDocument();
    });
});
