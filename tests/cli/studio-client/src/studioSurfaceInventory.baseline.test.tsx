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
            // This inventory fixture represents a built runtime project that also directly owns an
            // outcome-library artifact. Blueprint-specific navigation is covered separately below.
            type: "tsPackage",
            capabilities: ["runtime.execute", "outcomeLibrary.read"],
            origin: "managed",
        },
    }),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/my-slot", valid: true}}),
    "/api/project/gameModel": () => ({
        ok: true,
        status: 200,
        body: {
            basics: {status: "available", data: {id: "my-slot", name: "My Slot", version: "1.0.0"}},
            layout: {status: "unavailable", reason: "not needed for this baseline"},
            symbols: {status: "unavailable", reason: "not needed for this baseline"},
            reels: {status: "unavailable", reason: "not needed for this baseline"},
            paytable: {status: "unavailable", reason: "not needed for this baseline"},
            betsAndModes: {status: "unavailable", reason: "not needed for this baseline"},
            mechanics: {status: "unavailable", reason: "not needed for this baseline"},
            limits: {status: "unavailable", reason: "not needed for this baseline"},
        },
    }),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/rounds": () => ({ok: true, status: 200, body: []}),
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

    it("bare /project resolves to a project-scoped overview, never rendering a tab-less dashboard", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);

        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project"]});

        await screen.findByRole("heading", {name: "My Slot"});
        expect(router.state.location.pathname).toBe("/project/%2Fgames%2Fmy-slot/overview");
    });
});

describe("Home (/home/:tab) tab inventory baseline", () => {
    it("lists exactly Start a game, Projects, in that order, ungrouped", () => {
        const {fetchImpl} = createRoutedFakeFetch({"/api/home/projects/registry": () => ({ok: true, status: 200, body: []})});

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        const nav = screen.getByRole("navigation", {name: "Sections"});
        const tabButtons = within(nav).getAllByRole("button");
        expect(tabButtons.map((button) => button.textContent)).toEqual(["Start a game", "Projects"]);
        // Neither of Home's 2 tabs is grouped under a visible section label (unlike the Project
        // Dashboard's "Advanced" grouping below) -- there is no section header text anywhere in the nav.
        expect(within(nav).queryByText("Advanced")).not.toBeInTheDocument();
    });

    it("Start a game is the default tab, and Projects hosts the managed/registered list plus Add a game you already have -- Advanced Tools is gone entirely", () => {
        const {fetchImpl} = createRoutedFakeFetch({"/api/home/projects/registry": () => ({ok: true, status: 200, body: []})});

        renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});

        expect(screen.getByRole("button", {name: "Projects"})).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("heading", {name: "Projects", level: 2})).toBeInTheDocument();
        expect(screen.getByText("Add a game you already have")).toBeInTheDocument();
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
    it("keeps the six primary workflows in order and leaves Replay/Build ungrouped; direct artifact and runtime integrations appear only when their capabilities exist", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const nav = screen.getByRole("navigation", {name: "Sections"});
        const tabButtons = within(nav).getAllByRole("button");
        expect(tabButtons.map((button) => button.textContent)).toEqual([
            "Overview",
            "Game Model",
            "Play",
            "Simulation",
            "Replay",
            "Build/Export",
            "Certification",
            "Provably Fair",
        ]);
        // There is no "Advanced" exile: Overview/Game Model/Play/Simulation/Replay/Build-Export are
        // the primary flow. Certification is an artifact capability and Provably Fair is a runtime
        // integration, so this fixture intentionally has both. There's no "Validate" section any more
        // (validation is now automatic diagnostics inside Overview -- see
        // OverviewTab), and Deployment/Stake Engine Export/Analysis (Outcome Libraries) have been removed
        // outright, not just hidden -- Build/Export is the sole Studio build surface (see ExportDeployTab),
        // and their old routes are gone too (see the deep-link fallback test below).
        expect(within(nav).queryByText("Advanced")).not.toBeInTheDocument();
    });

    it("shows a Blueprint's six primary workflows without Certification or Provably Fair, directing artifact work through Build/Export", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "loaded",
                    projectRoot: "/games/blueprint-slot",
                    game: {id: "blueprint-slot", name: "Blueprint Slot", version: "1.0.0"},
                    type: "blueprint",
                    capabilities: ["blueprint.build"],
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "Blueprint Slot"});

        const nav = screen.getByRole("navigation", {name: "Sections"});
        expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual([
            "Overview",
            "Game Model",
            "Play",
            "Simulation",
            "Replay",
            "Build/Export",
        ]);
        expect(within(nav).queryByRole("button", {name: "Certification"})).not.toBeInTheDocument();
        expect(within(nav).queryByRole("button", {name: "Provably Fair"})).not.toBeInTheDocument();
    });

    it("falls back to Overview for the old Deployment, Stake Engine Export, and Outcome Libraries deep links, same as any other unrecognized tab -- they're not kept alive merely for pre-release compatibility", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);

        const deploymentRender = renderRoutedApp({fetchImpl, initialEntries: ["/project/deployment"]});
        await deploymentRender.findByRole("heading", {name: "My Slot"});
        expect(deploymentRender.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page");
        expect(deploymentRender.queryByText("Deployment has moved into Build/Export")).not.toBeInTheDocument();
        expect(deploymentRender.queryByRole("button", {name: stepperStep("Select target", "Where to publish")})).not.toBeInTheDocument();
        deploymentRender.unmount();

        const outcomeLibrariesRender = renderRoutedApp({fetchImpl, initialEntries: ["/project/outcomeLibraries"]});
        await outcomeLibrariesRender.findByRole("heading", {name: "My Slot"});
        expect(outcomeLibrariesRender.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page");
        expect(outcomeLibrariesRender.queryByText("Outcome Libraries has moved into Build/Export")).not.toBeInTheDocument();
        expect(outcomeLibrariesRender.queryByRole("button", {name: stepperStep("Select/import", "Choose a library")})).not.toBeInTheDocument();
    });

    it("lists Overview, Game Model, Build/Export and Certification for a read-only outcome-library project -- reachable without RUNTIME_EXECUTE_CAPABILITY, but Play/Simulation/Replay/Provably Fair (which need a real draw or live session) stay hidden", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "loaded",
                    projectRoot: "/games/my-slot",
                    game: {id: "my-slot", name: "My Slot", version: "1.0.0"},
                    type: "outcomeLibrary",
                    capabilities: ["outcomeLibrary.read"],
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const nav = screen.getByRole("navigation", {name: "Sections"});
        const tabButtons = within(nav).getAllByRole("button");
        expect(tabButtons.map((button) => button.textContent)).toEqual(["Overview", "Game Model", "Build/Export", "Certification"]);
    });

    it("lists Build/Export for a PAR workbook project, making its native .xlsx save destination card reachable from Studio", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "loaded",
                    projectRoot: "/games/my-slot.par.xlsx",
                    game: {id: "my-slot", name: "My Slot", version: "1.0.0"},
                    type: "parWorkbook",
                    capabilities: ["parWorkbook.exchange"],
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const nav = screen.getByRole("navigation", {name: "Sections"});
        expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual(["Overview", "Game Model", "Build/Export"]);
    });

    it("shows a diagnostic instead of the Simulation workflow when deep-linking to an operation a read-only/package-exchange project's own capabilities don't support", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "loaded",
                    projectRoot: "/games/my-slot",
                    game: {id: "my-slot", name: "My Slot", version: "1.0.0"},
                    type: "outcomeLibrary",
                    capabilities: ["outcomeLibrary.read"],
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});
        await screen.findByRole("heading", {name: "My Slot"});

        expect(screen.getByRole("alert")).toHaveTextContent('"Simulation" isn\'t available for this project');
        expect(screen.queryByRole("button", {name: stepperStep("Configure", "Set rounds")})).not.toBeInTheDocument();
    });
});

describe("Design Game start action surface baseline", () => {
    it("the one canonical Design Game editor exposes a 'Choose a different start' action", () => {
        const {fetchImpl} = createRoutedFakeFetch({"/api/home/projects/registry": () => ({ok: true, status: 200, body: []})});

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        // Exactly one -- there is no longer a second, independent Blueprint Editor instance (Advanced
        // Tools has been removed entirely -- see HomePage.tsx's own doc comment).
        expect(screen.getAllByRole("button", {name: "Choose a different start", hidden: true})).toHaveLength(1);
    });

    it("the guided instance offers a 'Show advanced options' disclosure for file and JSON tools", () => {
        const {fetchImpl} = createRoutedFakeFetch({"/api/home/projects/registry": () => ({ok: true, status: 200, body: []})});

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        expect(screen.getAllByRole("button", {name: "Show advanced options (file and JSON tools)"})).toHaveLength(1);
    });
});

// The remaining describe blocks extend this baseline to the 3 "Advanced"-grouped Project Dashboard tabs
// that still mount their own workflow (Replay/Certification/Provably Fair), which the Stepper
// audit table in docs/studio-frontend.md already classifies workflow-by-workflow but never pinned as
// executable fixtures. Deployment/Outcome Libraries/Stake Engine Export used to be three more of these --
// each now redirects straight into Build/Export instead (see the deep-link test above), so they have no
// Stepper/path-field/disabled-action surface of their own left to pin here any more; their own dedicated
// workflow test files were retired for the same reason. Each remaining tab already has its own deep,
// dedicated workflow test (e.g. ProjectDashboardPage.replayWorkflow.test.tsx) covering gating/transitions/
// error-recovery in full -- this deliberately does not re-test that. It pins the narrower "whole-surface
// inventory" facts those deep tests never assert as a single list: the complete, ordered Stepper step
// roster; which path/text fields exist and what (if any) placeholder they show; which actions are
// disabled at first mount and why; and a representative sample of the raw-error-surface pattern (every
// tab funnels a caught exception's message straight into the shared, no-wrapping `ErrorState` component --
// see docs/studio-phase2-inventory.md for the full, line-cited enumeration of every occurrence, including
// the ones not re-demonstrated here as an executable fixture).

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
        expect(screen.getByText("Load a round above to run it -- a fresh forward replay, not a reproduction of any specific prior result.")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Reproduce"})).not.toBeInTheDocument();
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

    // Deployment/Outcome Libraries/Stake Engine Export used to each have their own Stepper pinned here --
    // all three now redirect straight into Build/Export instead of mounting a Stepper at all (see the
    // deep-link test above), so there is no Stepper roster left for any of them to pin.
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

    // Deployment's Configure step, Outcome Libraries' Select/import step, and Stake Engine Export's
    // Configure step used to each have their own path-field/disabled-action baseline here -- all three
    // routes now redirect into Build/Export before any of those fields ever mount (see the deep-link test
    // above), so there is nothing left of them to pin.
});

// Was "raw-error surface baseline" -- pinned the pre-[P2-POLISH-25] behavior where these fetch
// failures rendered the server's own raw message verbatim, with no remediation copy added. Both are
// now translated (Deployment/Export & Deploy's targetsError via domain/projectActionError.ts, Replay's
// listError via domain/replayActionError.ts -- see docs/studio-phase2-workflow-audit-matrix.md) -- this
// now pins the corrected behavior instead, same role reversed.
describe("Advanced tab subject-specific recovery copy baseline", () => {
    it("Build/Export: a failed targets fetch shows a subject-specific recovery message, never the raw server text", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/deployment/targets": () => ({ok: false, status: 500, body: {error: "deployment targets registry unavailable"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/exportDeploy"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const alerts = await screen.findAllByRole("alert");
        expect(
            alerts.some(
                (alert) =>
                    alert.textContent === "The deployment targets list couldn't be completed. Try again. If it continues, reopen the project and retry.",
            ),
        ).toBe(true);
        expect(alerts.every((alert) => alert.textContent !== "deployment targets registry unavailable")).toBe(true);
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
                (alert) => alert.textContent === "The replay list couldn't be completed. Try again. If it continues, reload the replay source and retry.",
            ),
        ).toBe(true);
        expect(alerts.every((alert) => alert.textContent !== "replay list endpoint unreachable")).toBe(true);
    });
});

// [P2-POLISH-04]: unlike Replay/Deployment's targets fetch above (none of which take a user-typed
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
                    "The certification bundle directory could not be completed. Try again. If it continues, choose the location again and retry.",
            ),
        ).toBe(true);
        expect(alerts.some((alert) => alert.textContent === "bundle directory not found")).toBe(false);
    });

    // Deployment's own "Run deployment preflight", Outcome Libraries' own "Load library", and Stake
    // Engine Export's own "Run diagnostics" path-action-error baselines used to live here -- all three
    // workspaces have been removed outright (see the deep-link fallback test above), so there is nothing
    // left of them to pin.

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

    it("Design Game automatically validates its Recommended starting blueprint without exposing the removed Validate-to-Build flow", async () => {
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await waitFor(() => expect(calls.some((call) => call.url === "/api/home/blueprints/validate")).toBe(true));
        expect(await screen.findByText("Valid — no issues found.")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Validate"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Build Package"})).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Output directory (optional)")).not.toBeInTheDocument();
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

        for (const label of ["Load from path", "Save to path"]) {
            // getAllByLabelText finds inputs on Home's other, currently-hidden (CSS display:none, still
            // mounted -- see HomePage's own "hide, don't unmount" doc comment) tab too, unlike
            // getByRole's default hidden-element filtering.
            for (const field of screen.getAllByLabelText(label, {exact: false})) {
                expect(field).not.toHaveAttribute("placeholder");
            }
        }
        // Design Game creates and opens its managed Blueprint Project directly. It no longer exposes
        // the removed package-build destination field.
        expect(screen.queryByLabelText("Output directory (optional)")).not.toBeInTheDocument();

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
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));

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

describe("Projects: add a game required-field baseline", () => {
    it("keeps Check game disabled with an adjacent, programmatically associated next-step explanation until a location is entered", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({"/api/home/projects/registry": () => ({ok: true, status: 200, body: []})});
        renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});

        await screen.findByText("No games yet. Start a game or add one you already have.");
        const detectButton = await screen.findByRole("button", {name: "Check game"});
        expect(detectButton).toBeDisabled();
        expect(detectButton).toHaveAttribute("aria-describedby", "import-project-detect-help");
        expect(screen.getByText("Enter a game location or use Browse to check it before adding it.")).toHaveAttribute("id", "import-project-detect-help");

        await user.click(detectButton);

        expect(calls.some((call) => call.url === "/api/home/projects/registry/preview")).toBe(false);
        await user.type(screen.getByLabelText("Location", {exact: false}), "./my-game");
        expect(detectButton).not.toBeDisabled();
        expect(screen.queryByText("Enter a game location or use Browse to check it before adding it.")).not.toBeInTheDocument();
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
