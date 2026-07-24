import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

// HomePage keeps all three tab bodies permanently mounted (see HomePage.tsx) -- including two whole
// BlueprintEditorPage instances -- so a `screen`-wide *ByRole/*ByLabelText query has to walk the entire
// ~880-element document and run jsdom's getComputedStyle over it to decide what's in the accessibility
// tree. Measured in the gate container: tens of milliseconds per screen-wide accessibility-tree query
// (~40ms for `getByRole("heading", {name})`, ~100ms for `getByRole("tab", {name})`) against ~10ms for
// `getByRole("navigation", {name})`. Real, but an order of magnitude too small to be what this suite's
// gate failures were about.
//
// Heap is not it either, but *only because package.json's --workerIdleMemoryLimit=192MB is there*. An
// earlier revision of this comment read the lane's ~1.0-1.2GB peak as evidence that the accumulating-
// worker-memory story behind that flag and jest.config.mjs's rationale was imaginary. That reading was
// circular: the number was measured with the flag active, i.e. with the accumulation it exists to
// suppress already suppressed. Re-measured both ways in this container (cgroup memory.current sampled
// over the whole `--selectProjects studio-client-workflows --maxWorkers=2` lane, against memory.max =
// 2GiB):
//
//   | lane config                  | wall clock | peak memory.current | this file's worker heap |
//   |------------------------------|-----------:|--------------------:|------------------------:|
//   | --workerIdleMemoryLimit=192MB|      508s  |  1.216GiB (60.8%)   |                  249MB  |
//   | flag removed                 |      476s  |  1.896GiB (94.8%)   |                  462MB  |
//
// Without it the workers' heaps climb monotonically across the lane (215MB on the first file to 608MB
// on the last) and the container ends up 111MB from an OOM kill, for ~30s of wall clock. So the flag is
// load-bearing: do not delete it on the strength of a peak measured while it was switched on.
//
// What this file actually had wrong was that its tab-switch assertions could not fail for the reason
// they were written to catch (see expectActiveSection below), which no amount of timeout or memory
// tuning could have fixed. With that fixed, what is left is the plain per-test budget -- see the
// measurements above jest.setTimeout below.
//
// The scoping below is therefore kept for precision, not speed: every query targets the smallest
// container that still identifies it -- the "Sections" nav for HomePage's own tab buttons, the guided
// editor's active section panel for its own fields, the open confirm dialog for its buttons. That is
// strictly *more* precise than the screen-wide query plus a `[0]` index it replaces (the raw Blueprint
// Editor mounted under Advanced Tools has its own "New symbol id" field, which is exactly why that index
// was needed before), and no assertion is weakened or removed by it.
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

// Switching Home tabs is a real router navigation (`navigate("/home/:tab")` -> react-router's data
// router resolves the match asynchronously), so React can flush the resulting render after
// user.click's act() has already settled. That has to be observed with an awaited assertion, and it
// has to be observed on something that actually changes with the switch.
//
// Content-based waits can't do it here, which is the trap this file kept falling into: because all
// three tab bodies stay permanently mounted (see HomePage.tsx) and only *ByRole queries filter on
// accessibility-tree visibility, `findByText("No recent projects yet.")` resolves off
// RecentProjectsPanel's own mount-time fetch in the still-hidden Open Project body, and
// `findByDisplayValue("wild-draft")` matches the still-mounted symbol input -- both are already
// satisfied before any navigation happens, so neither proves the tab switched and the synchronous
// aria-current/heading reads that followed them were racing the navigation outright.
//
// aria-current on the Sections nav is the switch itself, and HomePage sets it from the same
// `activeTab` render that toggles each body's `display`, so awaiting it also synchronises every
// assertion about the now-visible body -- no per-assertion padding needed, and it returns on the
// first tick once the navigation has landed.
async function expectActiveSection(name: string): Promise<void> {
    await waitFor(() => expect(sectionsNav().getByRole("button", {name})).toHaveAttribute("aria-current", "page"));
}

// One budget for the whole file, because all four tests are in one cost class rather than three cheap ones
// and a heavy one: each renders the entire routed app (renderRoutedApp -> HomePage with all three tab bodies
// permanently mounted, two whole BlueprintEditorPage instances among them) and then drives a chain of real
// userEvent interactions across that ~880-element tree with real timers. Measured in this container at idle:
// 3.4s / 3.8s / 2.5s / 7.1s -- a 4.5x spread, not a difference in kind.
//
// The rest of this lane already pins an explicit per-test budget on every test of every such suite (45000ms
// in the ProjectDashboardPage/navigation-guard/validation suites, 90000ms for happyPath and routing's
// back/forward) instead of riding jest.config.mjs's lane-wide 60000ms default. That default is not sized for
// the gate container: the numbers behind it in docs/testing.md come from the 4-CPU reference box, whereas the
// gate's cgroup quota is 2 CPUs -- which os.cpus() does not report, it says 4 -- so --maxWorkers=2 runs two
// jsdom workers plus the Jest main process against two cores, before any external load on the gate host.
//
// The size of the budget is not a guess, and not "the previous number, raised": it is fixed by the ordering
// invariant setupTests.ts's asyncUtilTimeout is chosen for -- the per-assertion cap must expire *before* the
// whole-test budget, or a starved assertion is reported as an anonymous "Exceeded timeout of N ms for a test"
// instead of naming itself. That requires the budget to exceed the sum of every asyncUtilTimeout-governed
// await one test can sit through, *plus* that test's own real work. The heaviest test below chains eight of
// them (expectActiveSection x3, findByText x2, waitFor x2, findByRole x1) at setupTests.ts's 15000ms each,
// i.e. 120000ms of cap alone -- which is precisely the 120000ms this file used to carry, leaving exactly
// nothing for the ~7s of real work it does at idle. So the invariant was inverted for that test at every
// value this file has ever had (60000, 90000 and 120000 are all <= 8 x 15000), which is why its gate
// failures keep coming back nameless and why raising the number in fractions never held.
//
// Reproduced here by oversubscribing that same 2-CPU quota with spinner processes. The scaling is
// superlinear, and -- the part that matters -- noisy: the two 6-spinner rows are the same four tests under
// the same load, minutes apart.
//
//   | spinners alongside the run | test 1 | test 2 | test 3 | test 4 |
//   |---|---|---|---|---|
//   | none                       |  3.4s  |  3.8s  |  2.5s  |  7.1s  |
//   | 2                          |  8.6s  | 10.3s  |  6.8s  | 18.5s  |
//   | 6, run A                   | 32.2s  |  >60s  | 28.4s  | 83.6s  |
//   | 6, run B                   | 31.5s  | 26.8s  | 24.8s  | 65.4s  |
//   | 10                         | 29.0s  | 45.2s  | 21.7s  | 87.3s  |
//   | 16                         | 45.8s  | 61.2s  | 46.3s  | 119.9s |
//
// In the 6-spinner run A, test 2 is killed by the 60000ms lane default -- by the whole-test budget, not by
// any assertion, which is why nothing ever named itself unsatisfied -- while its three siblings, doing the
// same work in the same run, finish green at 28-84s; in run B that same test finishes in 26.8s. At 10
// spinners all four pass, but the heaviest spends 87.3s, i.e. 73% of a 120000ms budget, on 7.1s of
// idle-equivalent work. At 16 it lands at 119.9s -- 0.1s inside that budget, on a run where every assertion
// in it settled and nothing was wrong. A gate host only has to be marginally busier than this to push it
// over, and it goes over as an anonymous whole-test timeout rather than as a named assertion.
//
// 240000ms is that arithmetic: the 120000ms of per-assertion cap one test can legitimately absorb, plus as
// much again for its real work (7.1s at idle, 87.3s at the worst load reproduced here). It relaxes, weakens
// and removes nothing -- no assertion, wait or query below is touched -- and it restores the ordering
// setupTests.ts documents, so a genuinely stuck assertion fails first and by name. Its only cost is paid on a
// run that is already red: a hang somewhere userEvent's own awaits cannot cap takes 4 minutes to report
// itself instead of 2.
jest.setTimeout(240000);

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

        await expectActiveSection("Open Project");
        expect(await screen.findByText("No recent projects yet.")).toBeInTheDocument();
        expect(screen.getByLabelText("Project path", {exact: false})).toBeInTheDocument();
        expect(sectionsNav().getByRole("button", {name: "Design & Build"})).not.toHaveAttribute("aria-current");

        await user.click(sectionsNav().getByRole("button", {name: "Advanced Tools"}));
        await expectActiveSection("Advanced Tools");
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
        await expectActiveSection("Open Project");
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
        await expectActiveSection("Open Project");
        expect(await screen.findByText("No recent projects yet.")).toBeInTheDocument();

        // SectionedFormEditor's own activeSection state isn't reset by this outer tab switch (it never
        // unmounts, only its display toggles, same as every other Home tab body) -- Symbols is still the
        // active section here, no need to click it again.
        await user.click(sectionsNav().getByRole("button", {name: "Design & Build"}));
        await expectActiveSection("Design & Build");
        // The switch back has landed (expectActiveSection above), so the draft assertion is now the only
        // thing left to prove: Design & Build's body was never unmounted, only CSS-hidden, so the
        // "wild-draft" value its controlled input holds survived the round trip verbatim. guidedSection()
        // re-queries the tabpanel by role, so this also re-asserts that the guided editor's Symbols panel
        // is genuinely back in the accessibility tree rather than reading a hidden node.
        expect(guidedSection().getByLabelText("New symbol id")).toHaveValue("wild-draft");
    });

    // The heaviest test in the file: it chains the most sequential real userEvent interactions (dirty the
    // draft, open the modal, Stay, restore, re-open, Leave, land on the project), which is why it sets the
    // upper end of the measurements behind the file-wide budget above.
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
        await expectActiveSection("Open Project");
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
        await expectActiveSection("Design & Build");
        // Same as the first draft-restore assertion above: Design & Build's tab body was never unmounted
        // (only CSS-hidden), so the committed "wild-draft" symbol input was preserved verbatim. This is
        // scoped to the now-visible guided section rather than left as a screen-wide findByDisplayValue:
        // display-value queries don't filter on accessibility-tree visibility, so a screen-wide one would
        // have matched the still-mounted input even if the switch back had never landed -- it could never
        // have failed for the reason it was written to catch.
        expect(guidedSection().getByDisplayValue("wild-draft")).toBeInTheDocument();

        // Confirming ("Leave") this time actually opens the project.
        await user.click(sectionsNav().getByRole("button", {name: "Open Project"}));
        await expectActiveSection("Open Project");
        await user.click(openButton);
        expect(await screen.findByText("You have unsaved changes in Design & Build. Leave and lose them?")).toBeInTheDocument();
        await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Leave"}));

        await waitFor(() => expect(calls.find((call) => call.url === "/api/home/projects/open")).toBeDefined());
        expect(await screen.findByRole("heading", {name: "A"})).toBeInTheDocument();
    });
});
