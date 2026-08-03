import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
        body: {
            status: "loaded",
            projectRoot: "/games/my-slot",
            game: {id: "my-slot", name: "My Slot", version: "1.0.0"},
            type: "blueprint",
            capabilities: ["blueprint.build"],
            origin: "managed",
        },
    }),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/my-slot", valid: true}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
    "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
};

// Combined label+description accessible-name matcher for a Mantine Stepper.Step -- every Advanced tab's
// Stepper renders its icon slot as a bare step-number text node until that step is completed (see
// Stepper/StepperStep's own `getStepFragment(icon, step)`), so a plain `{name: label}` match would miss
// the leading digit; this mirrors the pattern the workflow-level tests (e.g.
// ProjectDashboardPage.replayWorkflow.test.tsx's own `stepperStep`) already use for the same reason.
function stepperStep(label: string, description: string): RegExp {
    return new RegExp(`${label}.*${description}`);
}

// Pins DOM order (not just presence) for a "whole Stepper inventory" assertion -- each step must follow
// the previous one in document order, matching the JSX sequence in the tab's own source.
function expectStepsInOrder(steps: HTMLElement[]): void {
    for (let index = 1; index < steps.length; index += 1) {
        const position = steps[index - 1].compareDocumentPosition(steps[index]);
        expect(position & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    }
}

describe("Studio route table baseline", () => {
    it("an entirely unrecognized path falls back to Design Game, not a blank/error screen", () => {
        const {fetchImpl} = createRoutedFakeFetch({"/api/home/projects/registry": () => ({ok: true, status: 200, body: []})});

        renderRoutedApp({fetchImpl, initialEntries: ["/does-not-exist/at-all"]});

        expect(screen.getByRole("heading", {name: "Design Your Game"})).toBeInTheDocument();
    });

    it("bare /project redirects to /project/overview, never rendering a tab-less dashboard", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);

        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project"]});

        await screen.findByRole("heading", {name: "My Slot"});
        expect(router.state.location.pathname).toBe("/project/overview");
    });
});

describe("Home (/home/:tab) tab inventory baseline", () => {
    it("lists exactly Design Game, Projects, in that order, ungrouped", () => {
        const {fetchImpl} = createRoutedFakeFetch({"/api/home/projects/registry": () => ({ok: true, status: 200, body: []})});

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        const nav = screen.getByRole("navigation", {name: "Sections"});
        const tabButtons = within(nav).getAllByRole("button");
        expect(tabButtons.map((button) => button.textContent)).toEqual(["Design Game", "Projects"]);
        // Neither of Home's 2 tabs is grouped under a visible section label (unlike the Project
        // Dashboard's "Advanced" grouping below) -- there is no section header text anywhere in the nav.
        expect(within(nav).queryByText("Advanced")).not.toBeInTheDocument();
    });

    it("Design Game is the default tab, and Projects hosts the managed/registered list plus Import Project -- Advanced Tools is gone entirely", () => {
        const {fetchImpl} = createRoutedFakeFetch({"/api/home/projects/registry": () => ({ok: true, status: 200, body: []})});

        renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});

        expect(screen.getByRole("button", {name: "Projects"})).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("heading", {name: "Projects", level: 2})).toBeInTheDocument();
        expect(screen.getByText("Import Project")).toBeInTheDocument();
        // The hand-coded scaffold/init-in-place/build-from-blueprint-file tools that used to live behind
        // Advanced Tools are gone entirely -- init is now directed to the CLI (`pokie init`/`pokie create`),
        // not duplicated in Studio.
        expect(screen.queryByRole("heading", {name: "Scaffold a hand-coded game"})).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", {name: "Initialize an existing directory"})).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", {name: "Build from an existing blueprint file"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Advanced Tools"})).not.toBeInTheDocument();
    });
});

describe("Project Dashboard (/project/:tab) tab inventory baseline", () => {
    it("lists exactly the 9 supported tabs, in order, with a single 'Advanced' grouping starting at Replay -- no standalone Validate, Deployment, or Stake Engine Export entries", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const nav = screen.getByRole("navigation", {name: "Sections"});
        const tabButtons = within(nav).getAllByRole("button");
        expect(tabButtons.map((button) => button.textContent)).toEqual([
            "Overview",
            "Game Model",
            "Simulation",
            "Analysis",
            "Replay",
            "Runtime",
            "Build/Export",
            "Certification",
            "Fairness",
        ]);
        // Exactly one "Advanced" section header for the whole nav (NavTabs only prints one when the
        // section actually changes from the previous item's) -- Overview/Game Model/Simulation/Analysis
        // stay ungrouped as the primary happy path; everything from Replay onward shares it. There's no
        // "Validate" section any more (validation is now automatic diagnostics inside Overview -- see
        // OverviewTab), and Deployment/Stake Engine Export are reachable only through Build/Export, not
        // as their own top-level entries (their routes still work -- see the deep-link test below).
        expect(within(nav).getAllByText("Advanced")).toHaveLength(1);
    });

    it("still deep-links to Deployment and Stake Engine Export even though neither has its own nav entry", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);

        renderRoutedApp({fetchImpl, initialEntries: ["/project/deployment"]});
        await screen.findByRole("heading", {name: "My Slot"});
        expect(screen.getByRole("button", {name: stepperStep("Select target", "Where to publish")})).toBeInTheDocument();
    });

    it("hides Game Model from the nav for a project this Studio can't edit as a Blueprint", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {status: "loaded", projectRoot: "/games/my-slot", game: {id: "my-slot", name: "My Slot", version: "1.0.0"}, type: "tsPackage", capabilities: ["runtime.execute"]},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const nav = screen.getByRole("navigation", {name: "Sections"});
        expect(within(nav).queryByRole("button", {name: "Game Model"})).not.toBeInTheDocument();
    });
});

describe("New Blueprint action surface baseline", () => {
    it("the one canonical (Design Game) Blueprint Editor instance exposes a 'New Blueprint' action", () => {
        const {fetchImpl} = createRoutedFakeFetch({"/api/home/projects/registry": () => ({ok: true, status: 200, body: []})});

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        // Exactly one -- there is no longer a second, independent Blueprint Editor instance (Advanced
        // Tools has been removed entirely -- see HomePage.tsx's own doc comment).
        expect(screen.getAllByRole("button", {name: "New Blueprint", hidden: true})).toHaveLength(1);
    });

    it("the guided instance offers a 'Show advanced options' disclosure for JSON mode / load-save by path", () => {
        const {fetchImpl} = createRoutedFakeFetch({"/api/home/projects/registry": () => ({ok: true, status: 200, body: []})});

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        expect(screen.getAllByRole("button", {name: "Show advanced options (JSON mode, load/save by path)"})).toHaveLength(1);
    });
});

// The remaining describe blocks extend this baseline to the 7 "Advanced"-grouped Project Dashboard tabs
// (Replay/Runtime/Certification/Provably Fair/Deployment/Outcome Libraries/Stake Engine Export), which
// the Stepper audit table in docs/studio-frontend.md already classifies workflow-by-workflow but never
// pinned as executable fixtures. Each tab already has its own deep, dedicated workflow test (e.g.
// ProjectDashboardPage.replayWorkflow.test.tsx) covering gating/transitions/error-recovery in full --
// this deliberately does not re-test that. It pins the narrower "whole-surface inventory" facts those
// deep tests never assert as a single list: the complete, ordered Stepper step roster; which path/text
// fields exist and what (if any) placeholder they show; which actions are disabled at first mount and
// why; and a representative sample of the raw-error-surface pattern (every tab funnels a caught
// exception's message straight into the shared, no-wrapping `ErrorState` component -- see
// docs/studio-phase2-inventory.md for the full, line-cited enumeration of every occurrence across all 7
// tabs, including the ones not re-demonstrated here as an executable fixture).

describe("Advanced tab Stepper inventory baseline", () => {
    // Replay has no single sequential order shared by every source (a live spin has nothing to
    // reproduce; a pasted artifact validates before it can reproduce; a fresh seed/round or simulation
    // round has no prior result to compare against) -- see ReplayTab's own doc comment for why the old
    // Find -> Load -> Reproduce -> Inspect -> Export Stepper was replaced with a source choice, whose
    // own configuration/load controls, loaded card, action bar, and result view render inline instead
    // of behind separate pages.
    it("Replay: a source choice (Recreate from seed, Replay Artifact, Session Spin, Recent Simulation), not a linear Stepper", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/replay"]});
        await screen.findByRole("heading", {name: "My Slot"});

        expect(screen.queryByRole("button", {name: stepperStep("Find", "Locate a round")})).not.toBeInTheDocument();

        const sourcePicker = screen.getByRole("radiogroup", {name: "Find method"});
        expectStepsInOrder([
            within(sourcePicker).getByRole("radio", {name: "Recreate from seed"}),
            within(sourcePicker).getByRole("radio", {name: "Replay Artifact"}),
            within(sourcePicker).getByRole("radio", {name: "Session Spin"}),
            within(sourcePicker).getByRole("radio", {name: "Recent Simulation"}),
        ]);
        expect(screen.getByRole("radio", {name: "Recreate from seed"})).toBeChecked();
        // Nothing loaded yet under the default source -- the source-specific empty prompt shows instead
        // of a loaded card/action bar/result view.
        expect(screen.getByText("Load a round above to reproduce it.")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Reproduce"})).not.toBeInTheDocument();
    });

    // Runtime's old Create/restore -> Play -> Inspect -> Continue -> Debug Stepper forced a fixed order
    // and gated Play/Continue behind a session existing -- but a real Runtime session is used cyclically
    // (spin, inspect, spin again, pick an older round from history, retry or debug it, spin some more),
    // never a one-way pipeline -- see RuntimeTab.tsx's own doc comment for why it's now a workspace of
    // always-mounted panels (each degrading to an explanatory EmptyState instead of being gated away)
    // instead of a Stepper, the same "no forced order" reasoning the Replay redesign above already
    // established for that tab.
    it("Runtime: Server, Current session, Inspect round, Round history, Retry & Debug -- a cyclic workspace, not a gated Stepper", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/runtime"]});
        await screen.findByRole("heading", {name: "My Slot"});

        expect(screen.queryByRole("button", {name: stepperStep("Create or restore session", "Start playing")})).not.toBeInTheDocument();

        const panels = [
            screen.getByRole("group", {name: "Server"}),
            screen.getByRole("group", {name: "Current session"}),
            screen.getByRole("group", {name: "Inspect round"}),
            screen.getByRole("group", {name: "Round history for this session"}),
            screen.getByRole("group", {name: "Retry & Debug"}),
        ];
        expectStepsInOrder(panels);

        // Every panel is visible immediately -- with no session yet, and the runtime not even started,
        // none of them are hidden behind a prior step the way the old Stepper's Play/Continue/Inspect
        // were; each just explains what's missing instead.
        expect(within(panels[1]).getByText("Start the runtime server above first.")).toBeInTheDocument();
        expect(within(panels[2]).getByText(/Spin a round, or pick one from round history below/)).toBeInTheDocument();
        expect(within(panels[3]).getByText("Create or restore a session first.")).toBeInTheDocument();
        expect(within(panels[4]).getAllByText("Create or restore a session first.").length).toBeGreaterThan(0);
    });

    it("Certification: Select/configure, Validate, Build bundle, Inspect, Export, in that order", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/certification"]});
        await screen.findByRole("heading", {name: "My Slot"});

        expectStepsInOrder([
            screen.getByRole("button", {name: stepperStep("Select/configure", "Bundle & modes")}),
            screen.getByRole("button", {name: stepperStep("Validate", "Preflight")}),
            screen.getByRole("button", {name: stepperStep("Build bundle", "Sample & publish")}),
            screen.getByRole("button", {name: stepperStep("Inspect", "Manifest & artifacts")}),
            screen.getByRole("button", {name: stepperStep("Export", "Download manifest")}),
        ]);
    });

    it("Provably Fair: Configure, Generate/inspect proof, Verify, Review diagnostics, in that order -- Verify is never gated", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/provablyFair"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const steps = [
            screen.getByRole("button", {name: stepperStep("Configure", "Seeds & mode")}),
            screen.getByRole("button", {name: stepperStep("Generate/inspect proof", "Reveal")}),
            screen.getByRole("button", {name: stepperStep("Verify", "Cross-check")}),
            screen.getByRole("button", {name: stepperStep("Review diagnostics", "Issues")}),
        ];
        expectStepsInOrder(steps);
        expect(steps[1]).toBeDisabled(); // Generate/inspect proof -- gated on a successful Configure
        expect(steps[2]).not.toBeDisabled(); // Verify -- deliberately reachable regardless of prior state
        expect(steps[3]).toBeDisabled(); // Review diagnostics -- gated on a Verify result existing
    });

    it("Deployment: Select target, Configure, Check compatibility, Preview artifacts, Deploy, Review result, in that order", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/deployment"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const steps = [
            screen.getByRole("button", {name: stepperStep("Select target", "Where to publish")}),
            screen.getByRole("button", {name: stepperStep("Configure", "Modes & libraries")}),
            screen.getByRole("button", {name: stepperStep("Check compatibility", "Preflight")}),
            screen.getByRole("button", {name: stepperStep("Preview artifacts", "What would be generated")}),
            screen.getByRole("button", {name: stepperStep("Deploy", "Publish")}),
            screen.getByRole("button", {name: stepperStep("Review result", "Outcome")}),
        ];
        expectStepsInOrder(steps);
        // No target selected yet -- every step past "Select target" is gated, including "Configure"
        // itself (unlike every other Advanced tab's own first content step).
        expect(steps[1]).toBeDisabled();
        expect(steps[2]).toBeDisabled();
        expect(steps[3]).toBeDisabled();
        expect(steps[4]).toBeDisabled();
        expect(steps[5]).toBeDisabled();
    });

    it("Outcome Libraries: Select/import, Validate & analyze, Inspect, Compare or use, in that order", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/outcomeLibraries"]});
        await screen.findByRole("heading", {name: "My Slot"});

        expectStepsInOrder([
            screen.getByRole("button", {name: stepperStep("Select/import", "Choose a library")}),
            screen.getByRole("button", {name: stepperStep("Validate & analyze", "Diagnostics")}),
            screen.getByRole("button", {name: stepperStep("Inspect", "Distribution & features")}),
            screen.getByRole("button", {name: stepperStep("Compare or use", "Diff & hand-off")}),
        ]);
    });

    it("Stake Engine Export: Configure, Preview, Validate diagnostics, Export, Review result, in that order", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/stakeEngineExport"]});
        await screen.findByRole("heading", {name: "My Slot"});

        expectStepsInOrder([
            screen.getByRole("button", {name: stepperStep("Configure", "Source, modes & output")}),
            screen.getByRole("button", {name: stepperStep("Preview", "What will be exported")}),
            screen.getByRole("button", {name: stepperStep("Validate diagnostics", "Preflight & provenance")}),
            screen.getByRole("button", {name: stepperStep("Export", "Write to disk")}),
            screen.getByRole("button", {name: stepperStep("Review result", "Manifest & files")}),
        ]);
    });
});

describe("Advanced tab path-field & disabled-action baseline", () => {
    it("Certification's Select/configure step: bundle-dir/mode-name/seed placeholders read as real-looking example values, and 'Continue to Validate' stays disabled until a bundle dir is typed", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/certification"]});
        await screen.findByRole("heading", {name: "My Slot"});

        expect(screen.getByLabelText("Source outcome-library bundle directory")).toHaveAttribute("placeholder", "./outcomes/bundle");
        expect(screen.getByLabelText("Mode name")).toHaveAttribute("placeholder", "base");
        // Flagged as a misleading-placeholder finding (not changed here): this embeds a real-looking
        // date+mode-name pattern rather than an obviously-fake token like "<seed>".
        expect(screen.getByLabelText("Seed")).toHaveAttribute("placeholder", "cert-2026-07-20-base");

        const continueButton = screen.getByRole("button", {name: "Continue to Validate"});
        expect(continueButton).toBeDisabled();
        await user.type(screen.getByLabelText("Source outcome-library bundle directory"), "./outcomes/bundle-a");
        expect(continueButton).not.toBeDisabled();
    });

    it("Provably Fair's Configure step: bundle-dir/server-seed/client-seed placeholders read as real-looking values, and all four text fields (not the nonce) gate 'Compute commitments'", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/provablyFair"]});
        await screen.findByRole("heading", {name: "My Slot"});

        expect(screen.getByLabelText("Source outcome-library bundle directory")).toHaveAttribute("placeholder", "./outcomes/bundle");
        expect(screen.getByLabelText("Server seed")).toHaveAttribute("placeholder", "operator-server-seed");
        expect(screen.getByLabelText("Client seed")).toHaveAttribute("placeholder", "player-client-seed");

        const computeButton = screen.getByRole("button", {name: "Compute commitments"});
        expect(computeButton).toBeDisabled();
        await user.type(screen.getByLabelText("Source outcome-library bundle directory"), "./outcomes/bundle-a");
        await user.type(screen.getByLabelText("Mode name"), "base");
        await user.type(screen.getByLabelText("Server seed"), "server-seed-1");
        await user.type(screen.getByLabelText("Client seed"), "client-seed-1");
        // Nonce is left at its untouched default -- isConfigureValid never requires it.
        expect(computeButton).not.toBeDisabled();
    });

    it("Deployment's Configure step: Mode name is a disabled Select with an explanatory placeholder until the current build's modes are known, and Outcome library path has no placeholder at all", async () => {
        const target = {id: "target-1", version: "1.0.0", requirements: {minPokieVersion: "1.0.0"}, capabilities: ["multiMode"]};
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: [target]}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/deployment"]});
        await screen.findByRole("heading", {name: "My Slot"});

        // A lone target auto-selects and lands straight on Configure -- no artificial Select-target click.
        // PROJECT_ROUTES' own inspect route never declares `generated`, so the project's own build modes
        // stay unavailable -- Mode name is a disabled Select (deployment modes only ever come from the
        // current build, never a hand-typed field), explicit about why via its own placeholder.
        const modeNameField = await screen.findByRole("combobox", {name: "Mode name"});
        expect(modeNameField).toBeDisabled();
        expect(modeNameField).toHaveAttribute("placeholder", "Build modes unavailable");
        expect(screen.getByLabelText("Outcome library path")).not.toHaveAttribute("placeholder");
    });

    it("Outcome Libraries' Select/import step defaults to the JSON-file selector kind, and 'Load library' stays disabled until a path is typed", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/outcomeLibraries"]});
        await screen.findByRole("heading", {name: "My Slot"});

        await user.click(await screen.findByRole("button", {name: stepperStep("Select/import", "Choose a library")}));
        expect(screen.getByLabelText("Library JSON path")).toHaveAttribute("placeholder", "./outcomes/base.json");

        const loadButton = screen.getByRole("button", {name: "Load library"});
        expect(loadButton).toBeDisabled();
        await user.type(screen.getByLabelText("Library JSON path"), "./outcomes/base.json");
        expect(loadButton).not.toBeDisabled();
    });

    it("Stake Engine Export's Configure step: outDir is inferable (a real, non-blank 'stakeengine' initial value, not a placeholder) -- Mode name/Source canonical outcome library stay genuinely non-inferable placeholders", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/stakeEngineExport"]});
        await screen.findByRole("heading", {name: "My Slot"});

        // [P2-POLISH-04]: outDir's own default output directory is a real code-backed convention (this
        // tab's own state, mirrored nowhere else) -- it renders as an actual initial *value*, so its
        // former "./stakeengine" placeholder (structurally unreachable, since the field is never blank)
        // was removed rather than left as dead/misleading markup. Mode name and the source canonical
        // outcome library have no such convention anywhere in the CLI (no command derives/writes a
        // per-mode-name library path -- see docs/studio-phase2-inventory.md's own v5 update) --
        // genuinely un-inferable, so they correctly keep their illustrative placeholders.
        const outDirInput = screen.getByLabelText("Output directory") as HTMLInputElement;
        expect(outDirInput.value).toBe("stakeengine");
        expect(outDirInput).not.toHaveAttribute("placeholder");
        expect(screen.getByLabelText("Mode name")).toHaveAttribute("placeholder", "base");
        expect(screen.getByLabelText("Source: canonical outcome library")).toHaveAttribute("placeholder", "./outcomes/base.json");

        const continueButton = screen.getByRole("button", {name: "Continue to Preview"});
        expect(continueButton).toBeDisabled();
        await user.type(screen.getByLabelText("Mode name"), "base");
        await user.type(screen.getByLabelText("Source: canonical outcome library"), "./outcomes/base.json");
        expect(continueButton).not.toBeDisabled();
    });
});

// Was "raw-error surface baseline" -- pinned the pre-[P2-POLISH-25] behavior where these three fetch
// failures rendered the server's own raw message verbatim, with no remediation copy added. All three are
// now translated (Deployment/Export & Deploy's targetsError via domain/projectActionError.ts, Runtime's
// state.message via domain/runtimeActionError.ts, Replay's listError via domain/replayActionError.ts --
// see docs/studio-phase2-workflow-audit-matrix.md) -- this now pins the corrected behavior instead, same
// role reversed.
describe("Advanced tab subject-specific recovery copy baseline", () => {
    it("Deployment: a failed targets fetch shows a subject-specific recovery message, never the raw server text", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/deployment/targets": () => ({ok: false, status: 500, body: {error: "deployment targets registry unavailable"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/deployment"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const alerts = await screen.findAllByRole("alert");
        expect(
            alerts.some(
                (alert) =>
                    alert.textContent === "The deployment targets list couldn't be completed. Try again, and check the Studio server logs if the problem persists.",
            ),
        ).toBe(true);
        expect(alerts.every((alert) => alert.textContent !== "deployment targets registry unavailable")).toBe(true);
    });

    it("Runtime: a failed status fetch shows a subject-specific recovery message, never the raw server text", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/runtime": () => ({ok: false, status: 500, body: {error: "runtime status endpoint unreachable"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/runtime"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const alerts = await screen.findAllByRole("alert");
        expect(
            alerts.some(
                (alert) => alert.textContent === "The runtime server couldn't be completed. Try again, and check the Studio server logs if the problem persists.",
            ),
        ).toBe(true);
        expect(alerts.every((alert) => alert.textContent !== "runtime status endpoint unreachable")).toBe(true);
    });

    it("Replay: a failed Recent Replays fetch shows a subject-specific recovery message, never the raw server text", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/replays": () => ({ok: false, status: 500, body: {error: "replay list endpoint unreachable"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/replay"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const alerts = await screen.findAllByRole("alert");
        expect(
            alerts.some(
                (alert) => alert.textContent === "The replay list couldn't be completed. Try again, and check the Studio server logs if the problem persists.",
            ),
        ).toBe(true);
        expect(alerts.every((alert) => alert.textContent !== "replay list endpoint unreachable")).toBe(true);
    });
});

// [P2-POLISH-04]: unlike Runtime/Replay/Deployment's targets fetch above (none of which take a user-typed
// path -- see docs/studio-phase2-inventory.md's "Raw-error surfaces" per-section notes), every scoped
// path-based action below now turns its raw backend failure into inline, subject-specific status +
// remediation copy via `domain/pathActionError.ts`'s `describePathActionError` -- the raw server text is
// never rendered verbatim. See pathActionError.test.ts for the classifier's own reason-by-reason coverage.
describe("Scoped path-action error remediation baseline", () => {
    it("Certification: a failed Validate call is turned into bundle-directory-specific inline remediation, never the raw server error text", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/certification/validate-source": () => ({ok: false, status: 500, body: {error: "bundle directory not found"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/certification"]});
        await screen.findByRole("heading", {name: "My Slot"});

        await user.type(screen.getByLabelText("Source outcome-library bundle directory"), "./outcomes/missing");
        await user.click(screen.getByRole("button", {name: "Continue to Validate"}));
        await user.click(screen.getByRole("button", {name: "Validate source bundle"}));

        const alerts = await screen.findAllByRole("alert");
        expect(
            alerts.some(
                (alert) =>
                    alert.textContent ===
                    "The certification bundle directory could not be completed. Try again, and check the Studio server logs if the problem persists.",
            ),
        ).toBe(true);
        expect(alerts.some((alert) => alert.textContent === "bundle directory not found")).toBe(false);
    });

    it("Deployment: a failed deployment preflight call is turned into outcome-library-specific inline remediation, never the raw server error text", async () => {
        const user = userEvent.setup();
        const target = {id: "target-1", version: "1.0.0", requirements: {minPokieVersion: "1.0.0"}, capabilities: ["multiMode"]};
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: {status: "ok", modeIds: ["base"]}}),
            "/api/project/outcome-libraries/registry": () => ({ok: true, status: 200, body: {status: "ok", bundleDir: "outcomelibrary", buildStatus: "missing"}}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: [target]}),
            "/api/project/deployment/runs": () => ({ok: false, status: 500, body: {error: 'Could not read "./outcomes/base.json": ENOENT: no such file or directory'}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/deployment"]});
        await screen.findByRole("heading", {name: "My Slot"});

        // A lone target auto-selects and lands straight on Configure -- no artificial Select-target click.
        // The project's own sole build mode ("base") auto-selects into the row -- deployment modes only
        // ever come from the current build, never a hand-typed name.
        await waitFor(() => expect(screen.getByRole("combobox", {name: "Mode name"})).toHaveValue("base"));
        await user.type(screen.getByLabelText("Outcome library path"), "./outcomes/missing.json");
        await user.click(screen.getByRole("button", {name: "Run deployment preflight"}));

        const alerts = await screen.findAllByRole("alert");
        expect(alerts.some((alert) => alert.textContent === "The deployment's outcome library file could not be found. Check the path and try again.")).toBe(
            true,
        );
        expect(alerts.some((alert) => alert.textContent?.includes("ENOENT"))).toBe(false);
    });

    it("Outcome Libraries: a failed Load library call is turned into subject-specific inline remediation, never the raw server error text", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/outcome-libraries/select": () => ({ok: false, status: 500, body: {error: "EACCES: permission denied, open '/proj/outcomes/base.json'"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/outcomeLibraries"]});
        await screen.findByRole("heading", {name: "My Slot"});

        await user.click(await screen.findByRole("button", {name: stepperStep("Select/import", "Choose a library")}));
        await user.type(screen.getByLabelText("Library JSON path"), "./outcomes/base.json");
        await user.click(screen.getByRole("button", {name: "Load library"}));

        const alerts = await screen.findAllByRole("alert");
        expect(alerts.some((alert) => alert.textContent === "The outcome library isn't readable. Check its permissions and try again.")).toBe(true);
        expect(alerts.some((alert) => alert.textContent?.includes("EACCES"))).toBe(false);
    });

    it("Stake Engine Export: a failed Validate diagnostics call is turned into subject-specific inline remediation, never the raw server error text", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/stakeengine/validate": () => ({ok: false, status: 500, body: {error: 'mode "base": Could not read "./outcomes/base.json": ENOENT: no such file or directory'}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/stakeEngineExport"]});
        await screen.findByRole("heading", {name: "My Slot"});

        await user.type(screen.getByLabelText("Mode name"), "base");
        await user.type(screen.getByLabelText("Source: canonical outcome library"), "./outcomes/missing.json");
        await user.click(screen.getByRole("button", {name: "Continue to Preview"}));
        await user.click(screen.getByRole("button", {name: "Continue to Validate diagnostics"}));
        await user.click(screen.getByRole("button", {name: "Run diagnostics"}));

        const alerts = await screen.findAllByRole("alert");
        expect(
            alerts.some(
                (alert) => alert.textContent === "The Stake Engine export's outcome library could not be found. Check the path and try again.",
            ),
        ).toBe(true);
        expect(alerts.some((alert) => alert.textContent?.includes("ENOENT"))).toBe(false);
    });

    it("Provably Fair: a failed Compute commitments call is turned into bundle-directory-specific inline remediation, never the raw server error text", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/fairness/configure": () => ({ok: false, status: 500, body: {error: 'Could not read bundle "./outcomes/bundle": ENOENT: no such file or directory'}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/provablyFair"]});
        await screen.findByRole("heading", {name: "My Slot"});

        await user.type(screen.getByLabelText("Source outcome-library bundle directory"), "./outcomes/bundle-a");
        await user.type(screen.getByLabelText("Mode name"), "base");
        await user.type(screen.getByLabelText("Server seed"), "server-seed-1");
        await user.type(screen.getByLabelText("Client seed"), "client-seed-1");
        await user.click(screen.getByRole("button", {name: "Compute commitments"}));

        const alerts = await screen.findAllByRole("alert");
        expect(
            alerts.some(
                (alert) => alert.textContent === "The Provably Fair bundle directory could not be found. Check the path and try again.",
            ),
        ).toBe(true);
        expect(alerts.some((alert) => alert.textContent?.includes("ENOENT"))).toBe(false);
    });

    it("Design Game: a failed Build Package call is turned into output-directory-specific inline remediation, never the raw server error text", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
            // Matches StudioBlueprintService.build()'s own GamePackageGenerator.generate() rejection
            // shape for an output directory it can't write to -- reported as a 200 {status: "error"}
            // domain result, never an HTTP-level failure (see StudioServer's own handleBlueprintBuild).
            // P2-POLISH-09 first performs the same read-only destination preview used by Build Preview
            // before allowing a write. Model that successful, empty-destination preflight explicitly so
            // this test still reaches the Build Package domain failure it is intended to cover.
            "/api/home/blueprints/build-preview": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    warnings: [],
                    manifest: {id: "my-slot", name: "My Slot", version: "1.0.0"},
                    reels: 5,
                    rows: 3,
                    symbolsCount: 3,
                    blueprintHash: "sha256:preview",
                    expectedFiles: [],
                    projectRoot: "/no/such/dir",
                    destinationHasContent: false,
                    createFiles: [],
                    updateFiles: [],
                    deleteFiles: [],
                },
            }),
            "/api/home/blueprints/build": () => ({ok: true, status: 200, body: {status: "error", error: "ENOENT: no such file or directory, mkdir '/no/such/dir'"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await user.click(screen.getByRole("button", {name: "Validate"}));
        await waitFor(() => expect(screen.getByText("Ready to build")).toBeInTheDocument());

        await user.type(screen.getByLabelText("Output directory (optional)"), "./no/such/dir");
        await user.click(screen.getByRole("button", {name: "Build Package"}));

        const alerts = await screen.findAllByRole("alert");
        expect(alerts.some((alert) => alert.textContent === "The output directory could not be found. Check the path and try again.")).toBe(
            true,
        );
        expect(alerts.some((alert) => alert.textContent?.includes("ENOENT"))).toBe(false);
    });

});

describe("Advanced tab inferable-empty-input baseline", () => {
    it("Runtime: a blank Host/Port/Default seed on Start is silently omitted from the request body, not sent as empty strings or rejected", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/runtime/start": () => ({ok: true, status: 200, body: {status: "running", baseUrl: "http://127.0.0.1:4000"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/runtime"]});
        await screen.findByRole("heading", {name: "My Slot"});

        await user.click(screen.getByRole("button", {name: "Start"}));

        await waitFor(() => expect(calls.some((call) => call.url === "/api/project/runtime/start")).toBe(true));
        const startCall = calls.find((call) => call.url === "/api/project/runtime/start");
        expect(JSON.parse(startCall?.init?.body ?? "{}")).toEqual({debug: false, repositoryMode: "memory"});
    });
});

// The remaining describe blocks extend this baseline to Home's own 2 tabs (Design Game, Projects --
// Advanced Tools has been removed entirely, see HomePage.tsx's own doc comment) with the same
// "whole-surface inventory" material the Advanced-tab blocks above pin: every path/text field's
// placeholder (or lack of one), and a raw-error-surface trigger neither BlueprintEditorPage.*.test.tsx
// nor openProjectGuard.test.tsx already demonstrates end to end.

describe("Design Game / Projects: path-field placeholder baseline", () => {
    it("no path/text field on Design Game carries a placeholder, unlike Projects' own Import Project location field", () => {
        const {fetchImpl} = createRoutedFakeFetch({"/api/home/projects/registry": () => ({ok: true, status: 200, body: []})});
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        for (const label of ["Load from path", "Save to path", "Output directory (optional)"]) {
            // getAllByLabelText finds inputs on Home's other, currently-hidden (CSS display:none, still
            // mounted -- see HomePage's own "hide, don't unmount" doc comment) tab too, unlike
            // getByRole's default hidden-element filtering.
            for (const field of screen.getAllByLabelText(label, {exact: false})) {
                expect(field).not.toHaveAttribute("placeholder");
            }
        }

        // Unlike every Design Game field above, Projects' own Import Project location field does carry
        // an illustrative placeholder -- it's the one path field in this group meant to be filled with
        // an arbitrary, previously-unknown location rather than a value the app can infer or remember.
        expect(screen.getByLabelText("Location", {exact: false})).toHaveAttribute("placeholder", "./my-game");
    });
});

describe("Design Game: Load/Save raw-error-surface baseline", () => {
    it("Load from path / Save to path have no required-field gating at all -- a blank path is sent straight to the server, whose raw rejection is turned into subject-specific inline remediation, never rendered verbatim", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            // Matches the exact server-side rejection validateLoadBlueprintRequest.ts throws for a
            // blank/whitespace path -- StudioServer maps that thrown Error to this 400 shape.
            "/api/home/blueprints/load": () => ({ok: false, status: 400, body: {error: '"path" is required.'}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        // Load/Save are tucked behind Design Game's own "Show advanced options" disclosure.
        await user.click(screen.getByRole("button", {name: "Show advanced options (JSON mode, load/save by path)"}));

        // Unlike every required PathInput/TextInput elsewhere in this group, "Load from path" carries no
        // `required` prop -- so clicking Load with a blank field isn't silently blocked by native HTML
        // validation; it actually reaches the server.
        await user.click(screen.getByRole("button", {name: "Load"}));

        await waitFor(() => expect(calls.some((call) => call.url === "/api/home/blueprints/load")).toBe(true));
        expect(JSON.parse(calls.find((call) => call.url === "/api/home/blueprints/load")?.init?.body ?? "{}")).toEqual({path: ""});
        // [P2-POLISH-04]: describePathActionError turns the raw '"path" is required.' rejection into
        // subject-specific inline status + remediation -- the raw server text is never shown verbatim.
        const alerts = await screen.findAllByRole("alert");
        expect(alerts.some((alert) => alert.textContent === "The blueprint file is missing or invalid. Provide a valid value and try again.")).toBe(
            true,
        );
        expect(alerts.some((alert) => alert.textContent === '"path" is required.')).toBe(false);
    });
});

describe("Projects: Import Project required-field baseline", () => {
    it("'Detect' is a no-op (no API call, no feedback) for a blank/whitespace-only location, unlike every path field elsewhere in this group", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({"/api/home/projects/registry": () => ({ok: true, status: 200, body: []})});
        renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});

        const detectButton = await screen.findByRole("button", {name: "Detect"});
        expect(detectButton).not.toBeDisabled();

        await user.click(detectButton);

        expect(calls.some((call) => call.url === "/api/home/projects/registry/preview")).toBe(false);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});

describe("[P2-POLISH-04] project-scoped path fields: shared PathInput, resolved against the project's own root", () => {
    it("Certification's bundle-directory field is a PathInput whose resolved-path hint is requested against the open project's root, not Studio's own server root", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch(PROJECT_ROUTES);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/certification"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const bundleDirField = screen.getByLabelText("Source outcome-library bundle directory", {exact: false});
        expect(screen.getByRole("button", {name: "Browse…"})).toBeInTheDocument();

        await user.type(bundleDirField, "./outcomes/bundle");
        await user.click(screen.getByRole("button", {name: "Browse…"}));

        await waitFor(() =>
            expect(calls.some((call) => call.url.startsWith("/api/home/fs/browse") && call.url.includes("base=%2Fgames%2Fmy-slot"))).toBe(true),
        );
    });
});
