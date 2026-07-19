import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {GamePackageInspectionReport, StudioBlueprintValidationView} from "../../../../../../cli/studio-client/src/api/types";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const GAME = {id: "a", name: "A", version: "1.0.0"};
const PROJECT_ROOT = "/games/a";
const SOURCE_PATH = "/games/a-source/blueprint.json";

const BLUEPRINT = {
    manifest: GAME,
    reels: 3,
    rows: 3,
    symbols: ["A", "B", "S"],
    scatters: ["S"],
    paytable: {A: {3: 5}, B: {3: 2}, S: {3: 2}},
    availableBets: [1],
};
// A plain fixture string, not a real hash -- correctness of the actual hash algorithm/comparison is
// verified against the real filesystem in applyGameBlueprintToProject.test.ts. This only has to be
// something the fake /load response returns and the fake /apply response can be asserted to receive
// back unchanged, proving the client threads it through rather than inventing its own.
const BLUEPRINT_HASH = "sha256:loaded-blueprint";

const GENERATED_INSPECT_REPORT: GamePackageInspectionReport = {
    packageRoot: PROJECT_ROOT,
    valid: true,
    generated: true,
    packageJson: {name: "a", version: "1.0.0"},
    buildInfo: {
        schemaVersion: 1,
        generatedBy: "pokie build",
        pokieVersion: "1.3.0",
        generatedAt: "2026-01-01T00:00:00.000Z",
        blueprintHash: "sha256:blueprint",
        source: SOURCE_PATH,
        game: GAME,
    },
};

function jsonResponse(body: unknown, status = 200) {
    return Promise.resolve({ok: status < 400, status, json: () => Promise.resolve(body)});
}

const BASE_ROUTES: Record<string, (call: FakeCall) => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: PROJECT_ROOT, game: GAME}}),
    "/api/project/inspect": () => ({ok: true, status: 200, body: GENERATED_INSPECT_REPORT}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
    "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: SOURCE_PATH, blueprint: BLUEPRINT, blueprintHash: BLUEPRINT_HASH}}),
};

// Mantine's Stepper.Step packs the step number/icon + label + description into one <button>, so its
// accessible name is a concatenation -- an exact-match query on just the label never matches. Same
// convention as every other Stepper-driving workflow test in this suite (see e.g.
// ProjectDashboardPage.simulationWorkflow.test.tsx's own stepperStep helper). The "Validate" step's
// label alone also collides with the page-level "Validate" NavTab button, so it (and "Apply", for the
// same reason should another top-level surface ever add one) always disambiguates with its own
// description text.
function stepperStep(label: string, description?: string): RegExp {
    return description === undefined ? new RegExp(label) : new RegExp(`${label}.*${description}`);
}

async function goToMechanicsEditorTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
    await user.click(screen.getByRole("button", {name: "Mechanics Editor"}));
    await screen.findByLabelText("Reels");
}

describe("ProjectDashboardPage - Mechanics Editor workflow", () => {
    // jsdom has no layout engine and doesn't implement Element.scrollIntoView -- Mantine's Combobox
    // (used by the "Free games scatter symbol" Select) calls it when keyboard-navigating options.
    beforeAll(() => {
        Element.prototype.scrollIntoView = jest.fn();
    });


    it("edits layout/symbols, win model, free games, and bet modes, then validates and applies", async () => {
        const user = userEvent.setup();
        const okValidation: StudioBlueprintValidationView = {status: "ok", warnings: []};
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: okValidation}),
            "/api/project/blueprint/apply": () => ({ok: true, status: 200, body: {status: "ok", blueprintHash: "sha256:applied", warnings: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToMechanicsEditorTab(user);

        // Step 1: Layout & symbols -- edit a symbol id.
        const symbolInput = screen.getByLabelText("Symbol 1 id");
        await user.clear(symbolInput);
        await user.type(symbolInput, "AA");
        await user.tab();

        // Step 2: Win model & paytable -- switch to Ways.
        await user.click(screen.getByRole("button", {name: stepperStep("Win model & paytable")}));
        await user.click(screen.getByRole("radio", {name: "Ways"}));

        // Step 3: Mechanics & features -- enable free games against the "S" scatter.
        await user.click(screen.getByRole("button", {name: stepperStep("Mechanics & features")}));
        await user.click(screen.getByRole("switch", {name: "Enable scatter-triggered free games"}));
        // Mantine's Select combobox: open it, then pick the (only) option via keyboard rather than
        // clicking a floating-positioned option node, which jsdom doesn't lay out.
        await user.click(screen.getByLabelText("Free games scatter symbol"));
        await user.keyboard("{ArrowDown}{Enter}");
        await user.type(screen.getByLabelText("Match count"), "3");
        await user.type(screen.getByLabelText("Free games awarded"), "10");
        await user.click(screen.getByRole("button", {name: "Add award"}));

        // Step 4: Bet modes -- add one.
        await user.click(screen.getByRole("button", {name: stepperStep("Bet modes")}));
        await user.type(screen.getByLabelText("New bet mode id"), "buy-bonus");
        await user.click(screen.getByRole("button", {name: "Add bet mode"}));

        // Step 5: Validate.
        await user.click(screen.getByRole("button", {name: stepperStep("Validate", "Errors & warnings")}));
        await user.click(screen.getByRole("button", {name: "Run validation"}));
        await screen.findByText("No issues found.");

        // Step 6: Apply.
        await user.click(screen.getByRole("button", {name: stepperStep("Apply", "Save & rebuild")}));
        await user.click(screen.getByRole("button", {name: "Apply"}));
        await user.click(await screen.findByRole("button", {name: "Confirm"}));

        expect(await screen.findByText(/up to date/)).toBeInTheDocument();

        const applyCalls = calls.filter((call) => call.url === "/api/project/blueprint/apply");
        expect(applyCalls).toHaveLength(1);
        const appliedBody = JSON.parse(applyCalls[0].init?.body ?? "{}");
        expect(appliedBody.expectedHash).toBe(BLUEPRINT_HASH);
        expect(appliedBody.blueprint.symbols).toEqual(["AA", "B", "S"]);
        expect(appliedBody.blueprint.winModel).toEqual({type: "ways"});
        expect(appliedBody.blueprint.mechanics.freeGames).toEqual({scatterSymbol: "S", awardsByCount: {3: 10}});
        expect(appliedBody.blueprint.betModes).toEqual([{id: "buy-bonus"}]);
    });

    it("shows a validation error for an invalid config and blocks Apply", async () => {
        const user = userEvent.setup();
        const invalidValidation: StudioBlueprintValidationView = {
            status: "invalid",
            errors: [{code: "blueprint-mechanics-freegames-missing-scatter", severity: "error", message: '"mechanics.freeGames.scatterSymbol" must be a non-empty symbol id.'}],
            warnings: [],
        };
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: invalidValidation}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToMechanicsEditorTab(user);

        await user.click(screen.getByRole("button", {name: stepperStep("Mechanics & features")}));
        await user.click(screen.getByRole("switch", {name: "Enable scatter-triggered free games"}));

        await user.click(screen.getByRole("button", {name: stepperStep("Validate", "Errors & warnings")}));
        await user.click(screen.getByRole("button", {name: "Run validation"}));

        expect(await screen.findByText(/must be a non-empty symbol id/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: stepperStep("Apply", "Save & rebuild")}));
        expect(screen.getByRole("button", {name: "Apply"})).toBeDisabled();
    });

    it("preserves in-progress edits when switching between steps", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({...BASE_ROUTES});

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToMechanicsEditorTab(user);

        const symbolInput = screen.getByLabelText("Symbol 1 id");
        await user.clear(symbolInput);
        await user.type(symbolInput, "ZZ");
        await user.tab();

        await user.click(screen.getByRole("button", {name: stepperStep("Bet modes")}));
        expect(screen.getByText("Available bets")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: stepperStep("Layout & symbols")}));
        expect(screen.getByLabelText("Symbol 1 id")).toHaveValue("ZZ");
    });

    it("does not offer a non-functional 'forces free games' bet-mode control", async () => {
        // BetMode has no field promising engine behavior nothing in the runtime actually delivers
        // (see BetMode.ts's own doc comment) -- the editor must not offer a control for one either,
        // in addition to a bet mode row only ever committing id/label/costMultiplier.
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({...BASE_ROUTES});

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToMechanicsEditorTab(user);
        await user.click(screen.getByRole("button", {name: stepperStep("Bet modes")}));
        await user.type(screen.getByLabelText("New bet mode id"), "buy-bonus");
        await user.click(screen.getByRole("button", {name: "Add bet mode"}));

        expect(screen.queryByText(/forces free games/i)).not.toBeInTheDocument();
        expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
        expect(calls.every((call) => !(call.init?.body ?? "").includes("forcesFreeGames"))).toBe(true);
    });

    it("discards a draft back to the originally loaded blueprint", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({...BASE_ROUTES});

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToMechanicsEditorTab(user);

        const symbolInput = screen.getByLabelText("Symbol 1 id");
        await user.clear(symbolInput);
        await user.type(symbolInput, "ZZ");
        await user.tab();

        await user.click(screen.getByRole("button", {name: stepperStep("Apply", "Save & rebuild")}));
        expect(screen.getByRole("button", {name: "Discard draft"})).not.toBeDisabled();
        await user.click(screen.getByRole("button", {name: "Discard draft"}));

        await user.click(screen.getByRole("button", {name: stepperStep("Layout & symbols")}));
        expect(screen.getByLabelText("Symbol 1 id")).toHaveValue("A");
    });

    it("shows the server's error on a failed Apply, never marks the draft clean, and still lets Discard work", async () => {
        const user = userEvent.setup();
        // The atomic build-then-commit rollback itself (a build/commit failure never leaving the
        // project's source or generated output ahead of one another) is verified directly against the
        // real filesystem in applyGameBlueprintToProject.test.ts -- this only covers what the frontend
        // itself must do with a failed Apply: show the error, never mark the draft clean, and let
        // Discard still work afterward.
        const okValidation: StudioBlueprintValidationView = {status: "ok", warnings: []};
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: okValidation}),
            "/api/project/blueprint/apply": () => ({ok: true, status: 200, body: {status: "error", error: "Disk full."}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToMechanicsEditorTab(user);

        const symbolInput = screen.getByLabelText("Symbol 1 id");
        await user.clear(symbolInput);
        await user.type(symbolInput, "ZZ");
        await user.tab();

        await user.click(screen.getByRole("button", {name: stepperStep("Validate", "Errors & warnings")}));
        await user.click(screen.getByRole("button", {name: "Run validation"}));
        await screen.findByText("No issues found.");

        await user.click(screen.getByRole("button", {name: stepperStep("Apply", "Save & rebuild")}));
        await user.click(screen.getByRole("button", {name: "Apply"}));
        await user.click(await screen.findByRole("button", {name: "Confirm"}));

        expect(await screen.findByText("Disk full.")).toBeInTheDocument();
        expect(screen.queryByText(/up to date/)).not.toBeInTheDocument();
        expect(calls.filter((call) => call.url === "/api/project/blueprint/apply")).toHaveLength(1);

        await user.click(screen.getByRole("button", {name: "Discard draft"}));
        await user.click(screen.getByRole("button", {name: stepperStep("Layout & symbols")}));
        expect(screen.getByLabelText("Symbol 1 id")).toHaveValue("A");
    });

    it("refuses to apply and makes no writes when the source blueprint changed on disk since it was loaded", async () => {
        // Conflict detection is now entirely server-side (see applyGameBlueprintToProject.test.ts for
        // the actual hash-check-then-stage-then-commit behavior) -- this only covers the frontend's own
        // handling of a "conflict" response: showing the message, never marking the draft clean, and
        // never making a second, separate write call of its own.
        const user = userEvent.setup();
        const okValidation: StudioBlueprintValidationView = {status: "ok", warnings: []};
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: okValidation}),
            "/api/project/blueprint/apply": () => ({ok: false, status: 409, body: {status: "conflict", currentHash: "sha256:external"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToMechanicsEditorTab(user);

        const symbolInput = screen.getByLabelText("Symbol 1 id");
        await user.clear(symbolInput);
        await user.type(symbolInput, "ZZ");
        await user.tab();

        await user.click(screen.getByRole("button", {name: stepperStep("Validate", "Errors & warnings")}));
        await user.click(screen.getByRole("button", {name: "Run validation"}));
        await screen.findByText("No issues found.");

        await user.click(screen.getByRole("button", {name: stepperStep("Apply", "Save & rebuild")}));
        await user.click(screen.getByRole("button", {name: "Apply"}));
        await user.click(await screen.findByRole("button", {name: "Confirm"}));

        expect(await screen.findByText(/changed on disk since it was loaded here/)).toBeInTheDocument();
        expect(screen.queryByText(/up to date/)).not.toBeInTheDocument();

        // Exactly one write attempt, and exactly one load (the tab's own initial one) -- confirms the
        // client no longer does its own separate load-then-compare round trip before applying.
        expect(calls.filter((call) => call.url === "/api/project/blueprint/apply")).toHaveLength(1);
        expect(calls.filter((call) => call.url === "/api/home/blueprints/load")).toHaveLength(1);
    });

    it("ignores a stale validate response once a newer one has resolved", async () => {
        const user = userEvent.setup();
        let resolveFirst: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        let validateCallCount = 0;
        const okValidation: StudioBlueprintValidationView = {status: "ok", warnings: []};
        const invalidValidation: StudioBlueprintValidationView = {
            status: "invalid",
            errors: [{code: "blueprint-symbols-invalid", severity: "error", message: "stale response -- must never appear"}],
            warnings: [],
        };
        const fetchImpl: FetchLike = (url, init) => {
            if (url in BASE_ROUTES) {
                const routed = BASE_ROUTES[url]({url, init});
                return jsonResponse(routed.body, routed.status);
            }
            if (url === "/api/home/blueprints/validate") {
                validateCallCount += 1;
                if (validateCallCount === 1) {
                    return new Promise((res) => {
                        resolveFirst = res;
                    });
                }
                return jsonResponse(okValidation);
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToMechanicsEditorTab(user);

        await user.click(screen.getByRole("button", {name: stepperStep("Validate", "Errors & warnings")}));
        await user.click(screen.getByRole("button", {name: "Run validation"}));

        // An edit invalidates the in-flight validate request (revision changed) and frees the guard, so
        // a fresh Run validation click starts a genuinely new request rather than being blocked.
        await user.click(screen.getByRole("button", {name: stepperStep("Layout & symbols")}));
        const symbolInput = screen.getByLabelText("Symbol 1 id");
        await user.clear(symbolInput);
        await user.type(symbolInput, "ZZ");
        await user.tab();
        await user.click(screen.getByRole("button", {name: stepperStep("Validate", "Errors & warnings")}));
        await user.click(screen.getByRole("button", {name: "Run validation"}));

        await screen.findByText("No issues found.");

        resolveFirst?.(await jsonResponse(invalidValidation));
        await new Promise((resolveTimeout) => {
            setTimeout(resolveTimeout, 50);
        });

        expect(screen.queryByText(/stale response -- must never appear/)).not.toBeInTheDocument();
    });

    it("clears all mechanics-editor state when the project switches", async () => {
        const user = userEvent.setup();
        const {fetchImpl: fetchImplA} = createRoutedFakeFetch({...BASE_ROUTES});

        const first = renderRoutedApp({fetchImpl: fetchImplA, initialEntries: ["/project/overview"]});
        await goToMechanicsEditorTab(user);
        const symbolInput = screen.getByLabelText("Symbol 1 id");
        await user.clear(symbolInput);
        await user.type(symbolInput, "ZZ");
        await user.tab();
        expect(screen.getByLabelText("Symbol 1 id")).toHaveValue("ZZ");

        first.unmount();

        const {fetchImpl: fetchImplB} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/b", game: {id: "b", name: "B", version: "1.0.0"}}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/b", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl: fetchImplB, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "B"});
        await user.click(screen.getByRole("button", {name: "Mechanics Editor"}));

        // Project B wasn't built from a tracked source blueprint (generated: false) -- the tab must show
        // its own unsupported state, with no trace of project A's edits (a stale remount would instead
        // show the previous, already-loaded "ZZ" symbol form).
        expect(await screen.findByText(/wasn't built from a tracked source blueprint/)).toBeInTheDocument();
        expect(screen.queryByLabelText("Symbol 1 id")).not.toBeInTheDocument();
    });

    // Regression test for a bug AdvancedDisclosure's always-mounted-content fix (see its own doc
    // comment) exposed: BlueprintJsonPanel's Textarea is uncontrolled (defaultValue, read via a ref on
    // Apply), which only stays correct if the panel remounts fresh every time the blueprint changes.
    // Without that, "Show advanced details" would keep showing the blueprint exactly as it was at
    // first load, and clicking "Apply JSON" against that stale text would silently revert the user's
    // own form edits.
    it("keeps the raw blueprint JSON panel in sync with form edits instead of showing what the blueprint looked like at first load", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch(BASE_ROUTES);

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToMechanicsEditorTab(user);

        await user.click(screen.getByRole("button", {name: "Show advanced details (raw blueprint JSON)"}));
        const jsonTextarea = screen.getByLabelText("Blueprint JSON") as HTMLTextAreaElement;
        expect(jsonTextarea.value).toContain('"A"');
        expect(jsonTextarea.value).not.toContain('"AA"');

        const symbolInput = screen.getByLabelText("Symbol 1 id");
        await user.clear(symbolInput);
        await user.type(symbolInput, "AA");
        await user.tab();

        // The panel (still open) must reflect the edit -- not the pre-edit "A" it was mounted with.
        expect(screen.getByLabelText("Blueprint JSON")).not.toBe(jsonTextarea);
        expect((screen.getByLabelText("Blueprint JSON") as HTMLTextAreaElement).value).toContain('"AA"');
    });

    // MechanicsEditorTab is conditionally *mounted* (only while activeTab === "mechanicsEditor"), so
    // switching to any other Project Dashboard tab used to discard an unapplied draft with zero warning
    // -- unlike Home's guided Blueprint Editor, which has a full navigation-blocking guard for exactly
    // this. A plain confirm() is the proportionate fix (not a second copy of that whole guard system).
    describe("warns before losing an unapplied draft", () => {
        async function makeADirtyEdit(user: ReturnType<typeof userEvent.setup>): Promise<void> {
            const symbolInput = screen.getByLabelText("Symbol 1 id");
            await user.clear(symbolInput);
            await user.type(symbolInput, "AA");
            await user.tab();
            expect(screen.getByLabelText("Symbol 1 id")).toHaveValue("AA");
        }

        it("asks for confirmation before switching to another tab, and Cancel keeps the draft in place", async () => {
            const user = userEvent.setup();
            const {fetchImpl} = createRoutedFakeFetch(BASE_ROUTES);

            renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
            await goToMechanicsEditorTab(user);
            await makeADirtyEdit(user);

            await user.click(screen.getByRole("button", {name: "Overview"}));
            expect(await screen.findByRole("button", {name: "Leave"})).toBeInTheDocument();

            await user.click(screen.getByRole("button", {name: "Stay"}));
            // Mantine's Modal unmounts its content only after its own closing transition -- the button
            // can briefly still be in the DOM right after the click.
            await waitFor(() => expect(screen.queryByRole("button", {name: "Leave"})).not.toBeInTheDocument());
            expect(screen.getByLabelText("Symbol 1 id")).toHaveValue("AA");
            expect(screen.getByRole("button", {name: "Overview"})).not.toHaveAttribute("aria-current");
        });

        it("navigates away and discards the draft once the user confirms", async () => {
            const user = userEvent.setup();
            const {fetchImpl} = createRoutedFakeFetch(BASE_ROUTES);

            renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
            await goToMechanicsEditorTab(user);
            await makeADirtyEdit(user);

            await user.click(screen.getByRole("button", {name: "Overview"}));
            await user.click(await screen.findByRole("button", {name: "Leave"}));

            expect(await screen.findByRole("button", {name: "Re-run Inspect"})).toBeInTheDocument();
            expect(screen.queryByLabelText("Symbol 1 id")).not.toBeInTheDocument();
        });

        it("does not ask for confirmation switching tabs once the draft is clean again (freshly loaded, no edits)", async () => {
            const user = userEvent.setup();
            const {fetchImpl} = createRoutedFakeFetch(BASE_ROUTES);

            renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
            await goToMechanicsEditorTab(user);

            await user.click(screen.getByRole("button", {name: "Overview"}));
            expect(screen.queryByRole("button", {name: "Leave"})).not.toBeInTheDocument();
            expect(await screen.findByRole("button", {name: "Re-run Inspect"})).toBeInTheDocument();
        });

        it("asks for confirmation before closing the project while the draft is unapplied", async () => {
            const user = userEvent.setup();
            const {fetchImpl} = createRoutedFakeFetch({
                ...BASE_ROUTES,
                "/api/projects/close": () => ({ok: true, status: 200, body: {context: {status: "empty"}}}),
            });

            renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
            await goToMechanicsEditorTab(user);
            await makeADirtyEdit(user);

            await user.click(screen.getByRole("button", {name: "Close project"}));
            expect(await screen.findByText(/unapplied Mechanics Editor draft/)).toBeInTheDocument();

            await user.click(screen.getByRole("button", {name: "Confirm"}));
            expect(await screen.findByRole("heading", {name: "POKIE Studio"})).toBeInTheDocument();
        });

        // MechanicsEditorTab is conditionally *mounted* only while activeTab === "mechanicsEditor" --
        // clicking a different NavTabs entry was already guarded, but browser Back/Forward (and any
        // other in-app navigate() call) bypasses that entirely, going straight through the router. This
        // reuses useNavigationBlockerConfirm (the same mechanism useDesignNavigationGuard already uses
        // for a dirty Home Design & Build draft), not a tab-specific workaround -- see
        // ProjectDashboardPage's own doc comment on why.
        it("blocks browser Back navigation while the draft is unapplied, and Stay keeps it in place", async () => {
            const user = userEvent.setup();
            const {fetchImpl} = createRoutedFakeFetch(BASE_ROUTES);

            const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
            await goToMechanicsEditorTab(user);
            await makeADirtyEdit(user);

            router.navigate(-1);
            expect(await screen.findByRole("button", {name: "Leave"})).toBeInTheDocument();

            await user.click(screen.getByRole("button", {name: "Stay"}));
            await waitFor(() => expect(screen.queryByRole("button", {name: "Leave"})).not.toBeInTheDocument());
            expect(screen.getByLabelText("Symbol 1 id")).toHaveValue("AA");
            expect(router.state.location.pathname).toBe("/project/mechanicsEditor");
        });

        it("lets Back navigation through and discards the draft once the user confirms Leave", async () => {
            const user = userEvent.setup();
            const {fetchImpl} = createRoutedFakeFetch(BASE_ROUTES);

            const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
            await goToMechanicsEditorTab(user);
            await makeADirtyEdit(user);

            router.navigate(-1);
            await user.click(await screen.findByRole("button", {name: "Leave"}));

            expect(await screen.findByRole("button", {name: "Re-run Inspect"})).toBeInTheDocument();
            expect(screen.queryByLabelText("Symbol 1 id")).not.toBeInTheDocument();
            expect(router.state.location.pathname).toBe("/project/overview");
        });

        // The instant Leave/Confirm is chosen (whether that was a Back-navigation prompt or the tab-click
        // one), isMechanicsEditorDirty must be cleared -- otherwise a *later*, unrelated Close project
        // would still warn about a draft the user already explicitly agreed to lose.
        it(
            "clears the dirty flag once Back navigation is confirmed, so a later Close project shows no ghost 'unapplied draft' warning",
            async () => {
                const user = userEvent.setup();
                const {fetchImpl} = createRoutedFakeFetch({
                    ...BASE_ROUTES,
                    "/api/projects/close": () => ({ok: true, status: 200, body: {context: {status: "empty"}}}),
                });

                const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
                await goToMechanicsEditorTab(user);
                await makeADirtyEdit(user);

                router.navigate(-1);
                await user.click(await screen.findByRole("button", {name: "Leave"}));
                await screen.findByRole("button", {name: "Re-run Inspect"});

                await user.click(screen.getByRole("button", {name: "Close project"}));
                // No risks left at all -- closes immediately, no confirmation modal of any kind.
                expect(screen.queryByText(/unapplied Mechanics Editor draft/)).not.toBeInTheDocument();
                expect(await screen.findByRole("heading", {name: "POKIE Studio"})).toBeInTheDocument();
            },
            // This chains more sequential steps (tab switch, dirty edit, Back nav, confirm, tab
            // unmount/remount, Close project, a second navigate) than any other test in this file -- the
            // project's global 15000ms testTimeout leaves too little headroom under concurrent Jest
            // workers, same reasoning as happyPath.test.tsx's own explicit per-test timeout.
            30000,
        );

        // A project can simultaneously have an unapplied Mechanics Editor draft *and* an active
        // operation (here, a running Runtime server) -- the close warning must name both risks, not
        // silently pick one over the other.
        it("names both risks when the draft is unapplied and another operation is active at the same time", async () => {
            const user = userEvent.setup();
            const {fetchImpl} = createRoutedFakeFetch({
                ...BASE_ROUTES,
                "/api/project/runtime/start": () => ({
                    ok: true,
                    status: 200,
                    body: {
                        status: "running",
                        host: "127.0.0.1",
                        port: 4123,
                        baseUrl: "http://127.0.0.1:4123",
                        debug: false,
                        repositoryMode: "memory",
                        startedAt: "2026-01-01T00:00:00.000Z",
                    },
                }),
            });

            renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
            await screen.findByRole("heading", {name: "A"});
            await user.click(screen.getByRole("button", {name: "Runtime"}));
            await user.click(screen.getByRole("button", {name: "Start"}));
            await waitFor(() => expect(screen.getByText(/running at/)).toBeInTheDocument());

            await user.click(screen.getByRole("button", {name: "Mechanics Editor"}));
            await makeADirtyEdit(user);

            await user.click(screen.getByRole("button", {name: "Close project"}));
            expect(
                await screen.findByText(
                    /This project has an unapplied Mechanics Editor draft and an active simulation, replay, deployment, or running runtime\./,
                ),
            ).toBeInTheDocument();
        });

        // A failed close must never be silently treated like a successful one -- the draft was never
        // actually discarded, so every other way of leaving Mechanics Editor (a tab click here) has to
        // keep asking for confirmation exactly as it did before Close project was ever attempted.
        it("keeps the dirty-navigation guard active after a failed Close project", async () => {
            const user = userEvent.setup();
            const {fetchImpl} = createRoutedFakeFetch({
                ...BASE_ROUTES,
                "/api/projects/close": () => ({ok: false, status: 500, body: {error: "disk write failed"}}),
            });

            renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
            await goToMechanicsEditorTab(user);
            await makeADirtyEdit(user);

            await user.click(screen.getByRole("button", {name: "Close project"}));
            await user.click(await screen.findByRole("button", {name: "Confirm"}));
            expect(await screen.findByText(/Couldn't close the project/)).toBeInTheDocument();

            await user.click(screen.getByRole("button", {name: "Overview"}));
            expect(await screen.findByRole("button", {name: "Leave"})).toBeInTheDocument();

            await user.click(screen.getByRole("button", {name: "Stay"}));
            await waitFor(() => expect(screen.queryByRole("button", {name: "Leave"})).not.toBeInTheDocument());
            expect(screen.getByLabelText("Symbol 1 id")).toHaveValue("AA");
        });

        // While closeProject()'s own request is still in flight, the draft is exactly as unapplied as it
        // was before the click -- nothing has actually been discarded yet -- so an attempt to leave via
        // some other route in the meantime must still be caught by the guard, not slip through a window
        // where the flag was cleared eagerly.
        it("keeps the draft protected while Close project is still pending", async () => {
            const user = userEvent.setup();
            const fetchImpl: FetchLike = (url, init) => {
                if (url in BASE_ROUTES) {
                    const routed = BASE_ROUTES[url]({url, init});
                    return jsonResponse(routed.body, routed.status);
                }
                if (url === "/api/projects/close") {
                    return new Promise(() => {
                        // Deliberately never resolves -- this test only cares about the guard's behavior
                        // while the close request is still pending.
                    });
                }
                return Promise.reject(new Error(`unexpected fetch ${url}`));
            };

            renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
            await goToMechanicsEditorTab(user);
            await makeADirtyEdit(user);

            await user.click(screen.getByRole("button", {name: "Close project"}));
            await user.click(await screen.findByRole("button", {name: "Confirm"}));

            await user.click(screen.getByRole("button", {name: "Overview"}));
            expect(await screen.findByRole("button", {name: "Leave"})).toBeInTheDocument();

            await user.click(screen.getByRole("button", {name: "Stay"}));
            await waitFor(() => expect(screen.queryByRole("button", {name: "Leave"})).not.toBeInTheDocument());
            expect(screen.getByLabelText("Symbol 1 id")).toHaveValue("AA");
        });
    });
});
