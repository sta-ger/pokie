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
        body: {status: "loaded", projectRoot: "/games/my-slot", game: {id: "my-slot", name: "My Slot", version: "1.0.0"}},
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
    it("Replay: Find, Load, Reproduce, Inspect, Export, in that order", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/replay"]});
        await screen.findByRole("heading", {name: "My Slot"});

        expectStepsInOrder([
            screen.getByRole("button", {name: stepperStep("Find", "Locate a round")}),
            screen.getByRole("button", {name: stepperStep("Load", "Confirm & validate")}),
            screen.getByRole("button", {name: stepperStep("Reproduce", "Run the replay")}),
            screen.getByRole("button", {name: stepperStep("Inspect", "See results")}),
            screen.getByRole("button", {name: stepperStep("Export", "Download")}),
        ]);
    });

    it("Runtime: Create or restore session, Play, Inspect round, Continue session, Debug, in that order -- Debug is the only step never gated", async () => {
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/runtime"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const steps = [
            screen.getByRole("button", {name: stepperStep("Create or restore session", "Start playing")}),
            screen.getByRole("button", {name: stepperStep("Play", "Spin")}),
            screen.getByRole("button", {name: stepperStep("Inspect round", "See the result")}),
            screen.getByRole("button", {name: stepperStep("Continue session", "Keep playing")}),
            screen.getByRole("button", {name: stepperStep("Debug", "Advanced")}),
        ];
        expectStepsInOrder(steps);
        expect(steps[1]).toBeDisabled(); // Play -- gated on a session existing
        expect(steps[3]).toBeDisabled(); // Continue session -- gated on a session existing
        expect(steps[4]).not.toBeDisabled(); // Debug -- deliberately always reachable
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

    it("Deployment's Configure step shows Mode name/Outcome library path with no placeholder at all -- an empty field reads as empty, not as a pre-filled example", async () => {
        const user = userEvent.setup();
        const target = {id: "target-1", version: "1.0.0", requirements: {minPokieVersion: "1.0.0"}, capabilities: ["multiMode"]};
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: [target]}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/deployment"]});
        await screen.findByRole("heading", {name: "My Slot"});

        await user.click(await screen.findByRole("button", {name: "Select"}));
        await user.click(screen.getByRole("button", {name: stepperStep("Configure", "Modes & libraries")}));

        expect(screen.getByLabelText("Mode name")).not.toHaveAttribute("placeholder");
        expect(screen.getByLabelText("Outcome library path")).not.toHaveAttribute("placeholder");
    });

    it("Outcome Libraries' Select/import step defaults to the JSON-file selector kind, and 'Load library' stays disabled until a path is typed", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/outcomeLibraries"]});
        await screen.findByRole("heading", {name: "My Slot"});

        expect(screen.getByLabelText("Library JSON path")).toHaveAttribute("placeholder", "./outcomes/base.json");

        const loadButton = screen.getByRole("button", {name: "Load library"});
        expect(loadButton).toBeDisabled();
        await user.type(screen.getByLabelText("Library JSON path"), "./outcomes/base.json");
        expect(loadButton).not.toBeDisabled();
    });

    it("Stake Engine Export's Configure step: outDir defaults to a non-blank 'stakeengine' value, so its own placeholder can never actually be seen", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch(PROJECT_ROUTES);
        renderRoutedApp({fetchImpl, initialEntries: ["/project/stakeEngineExport"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const outDirInput = screen.getByLabelText("Output directory") as HTMLInputElement;
        expect(outDirInput.value).toBe("stakeengine");
        expect(outDirInput).toHaveAttribute("placeholder", "./stakeengine");
        expect(screen.getByLabelText("Mode name")).toHaveAttribute("placeholder", "base");
        expect(screen.getByLabelText("Outcome library path")).toHaveAttribute("placeholder", "./outcomes/base.json");

        const continueButton = screen.getByRole("button", {name: "Continue to Preview"});
        expect(continueButton).toBeDisabled();
        await user.type(screen.getByLabelText("Mode name"), "base");
        await user.type(screen.getByLabelText("Outcome library path"), "./outcomes/base.json");
        expect(continueButton).not.toBeDisabled();
    });
});

describe("Advanced tab raw-error surface baseline", () => {
    it("Deployment: a failed targets fetch renders the raw server error text verbatim, no retry/remediation copy added", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/deployment/targets": () => ({ok: false, status: 500, body: {error: "deployment targets registry unavailable"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/deployment"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const alerts = await screen.findAllByRole("alert");
        expect(alerts.some((alert) => alert.textContent === "deployment targets registry unavailable")).toBe(true);
    });

    it("Runtime: a failed status fetch renders the raw server error text verbatim, no retry/remediation copy added", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/runtime": () => ({ok: false, status: 500, body: {error: "runtime status endpoint unreachable"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/runtime"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const alerts = await screen.findAllByRole("alert");
        expect(alerts.some((alert) => alert.textContent === "runtime status endpoint unreachable")).toBe(true);
    });

    it("Replay: a failed Recent Replays fetch renders the raw server error text verbatim, no retry/remediation copy added", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/replays": () => ({ok: false, status: 500, body: {error: "replay list endpoint unreachable"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/replay"]});
        await screen.findByRole("heading", {name: "My Slot"});

        const alerts = await screen.findAllByRole("alert");
        expect(alerts.some((alert) => alert.textContent === "replay list endpoint unreachable")).toBe(true);
    });

    it("Certification: a failed Validate call renders the raw server error text verbatim, no retry/remediation copy added", async () => {
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
        expect(alerts.some((alert) => alert.textContent === "bundle directory not found")).toBe(true);
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
