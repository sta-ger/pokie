import {screen} from "@testing-library/react";
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
    "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: SOURCE_PATH, blueprint: BLUEPRINT}}),
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
            "/api/home/blueprints/save": () => ({ok: true, status: 200, body: {status: "ok", path: SOURCE_PATH}}),
            "/api/home/blueprints/build": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    projectRoot: PROJECT_ROOT,
                    manifest: GAME,
                    createdFiles: ["src/generated/index.js"],
                    buildInfo: GENERATED_INSPECT_REPORT.buildInfo,
                    unchanged: false,
                    warnings: [],
                },
            }),
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

        const saveCall = calls.find((call) => call.url === "/api/home/blueprints/save");
        const buildCall = calls.find((call) => call.url === "/api/home/blueprints/build");
        expect(saveCall).toBeDefined();
        expect(buildCall).toBeDefined();
        const savedBody = JSON.parse(saveCall?.init?.body ?? "{}");
        expect(savedBody.path).toBe(SOURCE_PATH);
        expect(savedBody.overwrite).toBe(true);
        expect(savedBody.blueprint.symbols).toEqual(["AA", "B", "S"]);
        expect(savedBody.blueprint.winModel).toEqual({type: "ways"});
        expect(savedBody.blueprint.mechanics.freeGames).toEqual({scatterSymbol: "S", awardsByCount: {3: 10}});
        expect(savedBody.blueprint.betModes).toEqual([{id: "buy-bonus"}]);
        const builtBody = JSON.parse(buildCall?.init?.body ?? "{}");
        expect(builtBody.outDir).toBe(PROJECT_ROOT);
        expect(builtBody.sourcePath).toBe(SOURCE_PATH);
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

    it("leaves the draft intact and shows an error when Apply's build fails", async () => {
        const user = userEvent.setup();
        const okValidation: StudioBlueprintValidationView = {status: "ok", warnings: []};
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: okValidation}),
            "/api/home/blueprints/save": () => ({ok: true, status: 200, body: {status: "ok", path: SOURCE_PATH}}),
            "/api/home/blueprints/build": () => ({ok: true, status: 200, body: {status: "error", error: "Disk full."}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToMechanicsEditorTab(user);

        await user.click(screen.getByRole("button", {name: stepperStep("Validate", "Errors & warnings")}));
        await user.click(screen.getByRole("button", {name: "Run validation"}));
        await screen.findByText("No issues found.");

        await user.click(screen.getByRole("button", {name: stepperStep("Apply", "Save & rebuild")}));
        await user.click(screen.getByRole("button", {name: "Apply"}));
        await user.click(await screen.findByRole("button", {name: "Confirm"}));

        expect(await screen.findByText("Disk full.")).toBeInTheDocument();
        expect(screen.queryByText(/up to date/)).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: stepperStep("Layout & symbols")}));
        expect(screen.getByLabelText("Symbol 1 id")).toHaveValue("A");
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
});
