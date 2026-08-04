import {act, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const GAME_MODEL_PROJECTION_BODY = {
    basics: {status: "available", data: GAME},
    layout: {status: "available", data: {reels: 3, rows: 3, winModel: {type: "lines"}, paylineCount: 1}},
    symbols: {status: "available", data: [{id: "A", isWild: false, isScatter: false}]},
    reels: {status: "available", data: {generationMode: "default"}},
    paytable: {status: "available", data: [{symbolId: "A", matchCount: 3, payout: 5}]},
    betsAndModes: {status: "available", data: {availableBets: [1], betModes: []}},
    mechanics: {status: "available", data: {}},
};

const BASE_ROUTES: Record<string, (call: FakeCall) => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({
        ok: true,
        status: 200,
        body: {status: "loaded", projectRoot: PROJECT_ROOT, game: GAME, type: "blueprint", capabilities: ["blueprint.build"]},
    }),
    "/api/project/inspect": () => ({ok: true, status: 200, body: GENERATED_INSPECT_REPORT}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
    "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: SOURCE_PATH, blueprint: BLUEPRINT, blueprintHash: BLUEPRINT_HASH}}),
    "/api/project/gameModel": () => ({ok: true, status: 200, body: GAME_MODEL_PROJECTION_BODY}),
};

// `delay: null` -- MechanicsEditorTab's own debounced auto-validate (a real setTimeout, see its doc
// comment) must never race a still-in-progress multi-step userEvent interaction (e.g. a Switch's
// pointerdown/mouseup pair, each a real, separately-awaited step): userEvent's own default per-step
// delay is real wall-clock time too, so under contention (many suites running concurrently) the debounce
// could otherwise fire and re-render mid-interaction, tripping React's "don't read a released synthetic
// event's currentTarget" guard. `delay: null` collapses userEvent's own steps to as-fast-as-possible,
// removing that side of the race -- this suite can't switch to fake timers instead, the same reason
// BlueprintEditorPage.reelStripModeler.test.tsx's own real-timer tests can't (see its doc comment).
function setupUser(): ReturnType<typeof userEvent.setup> {
    return userEvent.setup({delay: null});
}

async function goToGameModelTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
    await user.click(screen.getByRole("button", {name: "Game Model"}));
}

async function enterEditMode(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await goToGameModelTab(user);
    await user.click(await screen.findByRole("button", {name: "Edit"}));
    // Not `findByLabelText("Reels")`: SectionedFormEditor's own "Reels" tab (kept mounted, see
    // Tabs.Panel's own permanent `aria-labelledby`) is itself a second, ambiguous label match for
    // "Reels" for as long as that tab's own validation status stays neutral (not yet validated) --
    // resolved the instant a real validate result lands (StatusBadge then adds "valid"/"N error(s)" to
    // the tab's own accessible name). The "Game basics" tab is always exactly that text regardless.
    await screen.findByRole("tab", {name: "Game basics"});
}

// P3-POLISH-17: Blueprint's own Game Model tab is read-only by default (the same unified
// GameModelProjection view an introspectable-but-not-editable package/WASM project gets), with an
// "Edit" action that switches to a guided editor built from the exact same components/domain operations
// as the Home "Design Game" editor (SectionedFormEditor, plus WinModelSelector/FreeGamesFieldset/
// BetModesEditor for the fields Design Game doesn't cover) -- see MechanicsEditorTab's own doc comment.
// Saving returns straight to the read-only view and reloads its projection.
describe("ProjectDashboardPage - Game Model workflow (Blueprint projects, editable)", () => {
    // jsdom has no layout engine and doesn't implement Element.scrollIntoView -- Mantine's Combobox
    // (used by the "Free games scatter symbol" Select) calls it when keyboard-navigating options.
    beforeAll(() => {
        Element.prototype.scrollIntoView = jest.fn();
    });

    it("renders the read-only viewer with an Edit action, no edit fields, Save changes, or Cancel action", async () => {
        const user = setupUser();
        const {fetchImpl} = createRoutedFakeFetch({...BASE_ROUTES});

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);

        expect(await screen.findByText("Id: a")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Edit"})).toBeInTheDocument();
        expect(screen.queryByText(/Read-only/)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Save changes"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Cancel"})).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Reels")).not.toBeInTheDocument();
    });

    it("edits layout/symbols, win model, free games, and bet modes, then saves and returns to the read-only view with a reloaded projection", async () => {
        const user = setupUser();
        const okValidation: StudioBlueprintValidationView = {status: "ok", warnings: []};
        let gameModelCalls = 0;
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/gameModel": () => {
                gameModelCalls += 1;
                return {
                    ok: true,
                    status: 200,
                    body: gameModelCalls === 1 ? GAME_MODEL_PROJECTION_BODY : {...GAME_MODEL_PROJECTION_BODY, basics: {status: "available", data: {...GAME, name: "A (edited)"}}},
                };
            },
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: okValidation}),
            "/api/project/blueprint/apply": () => ({ok: true, status: 200, body: {status: "ok", blueprintHash: "sha256:applied", warnings: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await enterEditMode(user);

        // Game basics/Layout/Symbols/Reels/Paytable/Bets -- the exact same SectionedFormEditor Design
        // Game's own guided editor uses.
        await user.click(screen.getByRole("tab", {name: /Symbols/}));
        const symbolInput = screen.getByLabelText("Symbol 1 id");
        await user.clear(symbolInput);
        await user.type(symbolInput, "AA");
        await user.tab();

        // Win model & mechanics -- fields SectionedFormEditor doesn't cover, unique to this tab.
        await user.click(screen.getByRole("radio", {name: "Ways"}));
        await user.click(screen.getByRole("switch", {name: "Enable scatter-triggered free games"}));
        await user.click(screen.getByLabelText("Free games scatter symbol"));
        await user.keyboard("{ArrowDown}{Enter}");
        // PaytableEditor (kept mounted off-screen by SectionedFormEditor's own Tabs) has an identically
        // labeled "Match count" field of its own -- scope to the Free games fieldset to disambiguate.
        const freeGamesSection = within(screen.getByRole("group", {name: "Free games"}));
        await user.type(freeGamesSection.getByLabelText("Match count"), "3");
        await user.type(freeGamesSection.getByLabelText("Free games awarded"), "10");
        await user.click(freeGamesSection.getByRole("button", {name: "Add award"}));

        // Bet modes -- also unique to this tab.
        await user.type(screen.getByLabelText("New bet mode id"), "buy-bonus");
        await user.click(screen.getByRole("button", {name: "Add bet mode"}));

        // Save changes stays disabled until the debounced auto-validate reports "ok".
        await waitFor(() => expect(screen.getByRole("button", {name: "Save changes"})).toBeEnabled());

        await user.click(screen.getByRole("button", {name: "Save changes"}));

        // Back to the read-only view, straight away -- no intervening "Applied" screen.
        expect(await screen.findByText("Id: a")).toBeInTheDocument();
        expect(await screen.findByText("Name: A (edited)")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Edit"})).toBeInTheDocument();
        expect(screen.queryByLabelText("Reels")).not.toBeInTheDocument();

        const applyCalls = calls.filter((call) => call.url === "/api/project/blueprint/apply");
        expect(applyCalls).toHaveLength(1);
        const appliedBody = JSON.parse(applyCalls[0].init?.body ?? "{}");
        expect(appliedBody.expectedHash).toBe(BLUEPRINT_HASH);
        expect(appliedBody.blueprint.symbols).toEqual(["AA", "B", "S"]);
        expect(appliedBody.blueprint.winModel).toEqual({type: "ways"});
        expect(appliedBody.blueprint.mechanics.freeGames).toEqual({scatterSymbol: "S", awardsByCount: {3: 10}});
        expect(appliedBody.blueprint.betModes).toEqual([{id: "buy-bonus"}]);

        // The projection reloaded (cache invalidation) -- called once for the initial view, once more
        // after Save changes returned to it.
        expect(gameModelCalls).toBe(2);
    });

    it("keeps Save changes disabled for an invalid configuration and shows the validation error inline", async () => {
        const user = setupUser();
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
        await enterEditMode(user);

        await user.click(screen.getByRole("switch", {name: "Enable scatter-triggered free games"}));

        await waitFor(() => expect(screen.getByText(/must be a non-empty symbol id/)).toBeInTheDocument());
        expect(screen.getByRole("button", {name: "Save changes"})).toBeDisabled();
    });

    it("Cancel with no unsaved changes returns to the read-only view immediately, without confirming", async () => {
        const user = setupUser();
        const {fetchImpl} = createRoutedFakeFetch({...BASE_ROUTES});

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await enterEditMode(user);

        await user.click(screen.getByRole("button", {name: "Cancel"}));

        expect(await screen.findByRole("button", {name: "Edit"})).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Reels")).not.toBeInTheDocument();
    });

    it("Cancel with unsaved changes confirms before discarding them and returning to the read-only view", async () => {
        const user = setupUser();
        const {fetchImpl} = createRoutedFakeFetch({...BASE_ROUTES});

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await enterEditMode(user);

        await user.click(screen.getByRole("tab", {name: /Symbols/}));
        const symbolInput = screen.getByLabelText("Symbol 1 id");
        await user.clear(symbolInput);
        await user.type(symbolInput, "ZZ");
        await user.tab();

        await user.click(screen.getByRole("button", {name: "Cancel"}));
        await user.click(await screen.findByRole("button", {name: "Confirm"}));

        expect(await screen.findByRole("button", {name: "Edit"})).toBeInTheDocument();
        expect(screen.queryByLabelText("Reels")).not.toBeInTheDocument();
    });

    // P3-POLISH-17 (review fix): leaving Edit mode -- Cancel here, but the same fix covers Save's own
    // return to "view" -- must cancel the pending debounced auto-validate, not just stop rendering it.
    // Before this fix, MechanicsEditorTab's own auto-validate effect returned early on `mode !== "edit"`
    // without clearing autoValidateTimerRef, so a still-pending debounce (scheduled by an edit made
    // shortly before Cancel) kept its setTimeout alive and fired handleValidate() afterwards, against
    // the (unchanged, since Cancel never reverts it) discarded draft -- sending a real validate request
    // for it well after the read-only view had already been restored.
    //
    // Fake timers, scoped to this one test (not setupUser's own real-timer default the rest of this
    // suite relies on -- see its doc comment): racing the real 600ms debounce against this suite's own
    // multi-step confirm-dialog interaction (findByRole polling + Mantine's Modal mount) is unreliable
    // under load, since that round trip alone routinely takes longer than 600ms -- a real-timer wait
    // can't reliably tell a fixed debounce (canceled before it fires) apart from an unfixed one (fired
    // and just happened to win the race). `advanceTimers: jest.advanceTimersByTime` keeps user-event's
    // own internal waits working against the same fake clock, so time only ever moves when this test
    // explicitly advances it -- the debounce genuinely cannot fire on its own, fixed or not, making the
    // final explicit advance the only thing that could possibly trigger it.
    it("Cancel of a dirty draft, made before the debounce fires, never lets it fire afterwards", async () => {
        jest.useFakeTimers({doNotFake: ["queueMicrotask"]});
        try {
            const user = userEvent.setup({delay: null, advanceTimers: jest.advanceTimersByTime});
            const okValidation: StudioBlueprintValidationView = {status: "ok", warnings: []};
            const {fetchImpl, calls} = createRoutedFakeFetch({...BASE_ROUTES, "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: okValidation})});

            renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
            await enterEditMode(user);

            await user.click(screen.getByRole("tab", {name: /Symbols/}));
            const symbolInput = screen.getByLabelText("Symbol 1 id");
            await user.clear(symbolInput);
            await user.type(symbolInput, "ZZ");
            await user.tab();

            // Cancel before the fake clock has advanced anywhere near AUTO_VALIDATE_DEBOUNCE_MS (600ms)
            // -- this "ZZ" edit's own pending debounce has not fired yet.
            await user.click(screen.getByRole("button", {name: "Cancel"}));
            await user.click(await screen.findByRole("button", {name: "Confirm"}));
            expect(await screen.findByRole("button", {name: "Edit"})).toBeInTheDocument();
            expect(calls.filter((call) => call.url === "/api/home/blueprints/validate")).toHaveLength(0);

            // Now advance well past the debounce window -- if leaving Edit mode had not canceled it,
            // this is what would let it (incorrectly) fire.
            act(() => {
                jest.advanceTimersByTime(700);
            });

            expect(calls.filter((call) => call.url === "/api/home/blueprints/validate")).toHaveLength(0);
        } finally {
            jest.useRealTimers();
        }
    });

    it("guards navigating away from an unsaved edit, the same way the rest of Project Dashboard's dirty-navigation guards work", async () => {
        const user = setupUser();
        const {fetchImpl} = createRoutedFakeFetch({...BASE_ROUTES});

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await enterEditMode(user);

        await user.click(screen.getByRole("tab", {name: /Symbols/}));
        const symbolInput = screen.getByLabelText("Symbol 1 id");
        await user.clear(symbolInput);
        await user.type(symbolInput, "ZZ");
        await user.tab();

        await user.click(screen.getByRole("button", {name: "Overview"}));
        expect(await screen.findByText("You have unsaved changes in Game Model. Leave and lose them?")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Leave"}));
        await waitFor(() => expect(screen.queryByLabelText("Reels")).not.toBeInTheDocument());
    });

    it("shows a subject-specific recovery message, never the raw backend text, when loading the project's source blueprint for editing fails", async () => {
        const user = setupUser();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "load-error", error: `ENOENT: no such file or directory, open '${SOURCE_PATH}'`}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);
        await user.click(await screen.findByRole("button", {name: "Edit"}));

        expect(await screen.findByText("The project's source blueprint could not be found. Check the path and try again.")).toBeInTheDocument();
        expect(screen.queryByText(/ENOENT/)).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Cancel"}));
        expect(await screen.findByRole("button", {name: "Edit"})).toBeInTheDocument();
    });

    it("shows a subject-specific recovery message, never the raw backend text, when the validation request itself fails (not a domain validation result)", async () => {
        const user = setupUser();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/home/blueprints/validate": () => {
                throw new Error("Failed to fetch");
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await enterEditMode(user);

        expect(await screen.findByText("This validation request could not be completed. Try again, and check the Studio server logs if the problem persists.")).toBeInTheDocument();
        expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Save changes"})).toBeDisabled();
    });

    it("shows a subject-specific recovery message, never the raw backend text, when Save changes conflicts with a since-changed source", async () => {
        const user = setupUser();
        const okValidation: StudioBlueprintValidationView = {status: "ok", warnings: []};
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: okValidation}),
            "/api/project/blueprint/apply": () => ({ok: true, status: 409, body: {status: "conflict", currentHash: "sha256:changed-on-disk"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await enterEditMode(user);

        await waitFor(() => expect(screen.getByRole("button", {name: "Save changes"})).toBeEnabled());
        await user.click(screen.getByRole("button", {name: "Save changes"}));

        expect(await screen.findByText(/changed on disk since it was loaded here/)).toBeInTheDocument();
        // Still in Edit mode -- a failed save never silently returns to the (now stale) read-only view.
        expect(screen.getByLabelText("Reels")).toBeInTheDocument();
    });

    it("preserves an in-progress, not-yet-added bet mode id across a re-render, and reports a duplicate id as Invalid without adding a second row", async () => {
        const user = setupUser();
        const {fetchImpl} = createRoutedFakeFetch({...BASE_ROUTES});

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await enterEditMode(user);

        await user.type(screen.getByLabelText("New bet mode id"), "buy-bonus");
        await user.click(screen.getByRole("button", {name: "Add bet mode"}));
        expect(screen.getByLabelText("Bet mode 1 id")).toHaveValue("buy-bonus");
        expect(screen.getByText("Unsaved changes -- use Save changes above to save them to the project.")).toBeInTheDocument();

        await user.type(screen.getByLabelText("New bet mode id"), "buy-bonus");
        expect(screen.getByText(/^Invalid -- "buy-bonus" is already used by another bet mode/)).toBeInTheDocument();
        expect(screen.queryByLabelText("Bet mode 2 id")).not.toBeInTheDocument();
    });
});

// P3-POLISH-16/17: Game Model is read-only, via GameModelView's own server/core-owned projection (GET
// /api/project/gameModel -- see buildGameModelProjection in "pokie" core / buildProjectGameModel.ts in
// cli/studio), for every project that can view it at all. An introspectable-but-not-editable package/
// WASM project goes through the exact same unified viewer as a Blueprint project's own read-only default
// above -- the only difference is that it never gets an Edit action, since it has no editable source of
// its own Studio can write back to.
describe("ProjectDashboardPage - Game Model (read-only, introspectable-but-not-editable projects)", () => {
    const READ_ONLY_GAME = {id: "b", name: "B", version: "1.0.0"};
    const READ_ONLY_ROUTES = {
        "/api/project/context": () => ({
            ok: true,
            status: 200,
            body: {status: "loaded", projectRoot: "/games/b", game: READ_ONLY_GAME, type: "tsPackage", capabilities: ["runtime.execute"]},
        }),
        "/api/project/reports": () => ({ok: true, status: 200, body: []}),
        "/api/project/replays": () => ({ok: true, status: 200, body: []}),
        "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
        "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
    };

    async function goToReadOnlyGameModelTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
        await screen.findByRole("heading", {name: "B"});
        await user.click(screen.getByRole("button", {name: "Game Model"}));
    }

    it("renders every section straight off the server-owned projection for a tracked-source tsPackage project, with no Edit control anywhere", async () => {
        const user = setupUser();
        const {fetchImpl} = createRoutedFakeFetch({
            ...READ_ONLY_ROUTES,
            "/api/project/inspect": () => ({
                ok: true,
                status: 200,
                body: {
                    packageRoot: "/games/b",
                    valid: true,
                    generated: true,
                    buildInfo: {
                        schemaVersion: 1,
                        generatedBy: "pokie build",
                        pokieVersion: "1.3.0",
                        generatedAt: "2026-01-01T00:00:00.000Z",
                        blueprintHash: "sha256:blueprint",
                        source: "/games/b-source/blueprint.json",
                        game: READ_ONLY_GAME,
                    },
                },
            }),
            "/api/project/gameModel": () => ({
                ok: true,
                status: 200,
                body: {
                    basics: {status: "available", data: READ_ONLY_GAME},
                    layout: {status: "available", data: {reels: 3, rows: 3, winModel: {type: "lines"}, paylineCount: 1}},
                    symbols: {status: "available", data: [{id: "A", isWild: false, isScatter: false}]},
                    reels: {status: "available", data: {generationMode: "default"}},
                    paytable: {status: "available", data: [{symbolId: "A", matchCount: 3, payout: 5}]},
                    betsAndModes: {status: "available", data: {availableBets: [1], betModes: []}},
                    mechanics: {status: "available", data: {}},
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReadOnlyGameModelTab(user);

        expect(await screen.findByText("Id: b")).toBeInTheDocument();
        expect(screen.getByText("Reels: 3")).toBeInTheDocument();
        expect(screen.getByText("Generation mode: Default (uniform across symbols)")).toBeInTheDocument();
        expect(screen.getByText(/Read-only/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Edit"})).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Reels")).not.toBeInTheDocument();
    });

    it("shows an explicit per-section \"Not available\" diagnostic for a project whose game model is only partially introspectable (generated, but no tracked source recorded)", async () => {
        const user = setupUser();
        const reason = "This project's build record has no tracked source blueprint path on record, so this section can't be shown here.";
        const {fetchImpl} = createRoutedFakeFetch({
            ...READ_ONLY_ROUTES,
            "/api/project/inspect": () => ({
                ok: true,
                status: 200,
                body: {
                    packageRoot: "/games/b",
                    valid: true,
                    generated: true,
                    buildInfo: {
                        schemaVersion: 1,
                        generatedBy: "pokie build",
                        pokieVersion: "1.3.0",
                        generatedAt: "2026-01-01T00:00:00.000Z",
                        blueprintHash: "sha256:blueprint",
                        game: READ_ONLY_GAME,
                    },
                },
            }),
            "/api/project/gameModel": () => ({
                ok: true,
                status: 200,
                body: {
                    basics: {status: "available", data: READ_ONLY_GAME},
                    layout: {status: "unavailable", reason},
                    symbols: {status: "unavailable", reason},
                    reels: {status: "unavailable", reason},
                    paytable: {status: "unavailable", reason},
                    betsAndModes: {status: "unavailable", reason},
                    mechanics: {status: "unavailable", reason},
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReadOnlyGameModelTab(user);

        expect(await screen.findByText("Id: b")).toBeInTheDocument();
        expect(screen.getAllByText(/Not available — This project's build record has no tracked source/).length).toBe(6);
        expect(screen.queryByRole("button", {name: "Edit"})).not.toBeInTheDocument();
    });

    // A generated build target that also emits a WASM artifact carries the same "generated" provenance and
    // the same GameModelProjection shape as any other introspectable-but-not-editable package (see
    // ProjectDashboardPage's own canViewGameModel doc comment) -- POKIE's own ProjectType.wasm is reserved
    // for a project *resolved as* a bare WASM build target, which carries no capability and can't be opened
    // as a project at all yet (see src/project/ProjectType.ts's own doc comment); a compatible, openable
    // WASM-producing build is a tsPackage from Studio's perspective, exercised the same way as the two
    // fixtures above.
    it("renders a compatible read-only WASM-producing project's game model the same truthful way", async () => {
        const user = setupUser();
        const {fetchImpl} = createRoutedFakeFetch({
            ...READ_ONLY_ROUTES,
            "/api/project/inspect": () => ({
                ok: true,
                status: 200,
                body: {
                    packageRoot: "/games/b",
                    valid: true,
                    generated: true,
                    buildInfo: {
                        schemaVersion: 1,
                        generatedBy: "pokie build --target wasm",
                        pokieVersion: "1.3.0",
                        generatedAt: "2026-01-01T00:00:00.000Z",
                        blueprintHash: "sha256:blueprint",
                        source: "/games/b-source/blueprint.json",
                        game: READ_ONLY_GAME,
                    },
                },
            }),
            "/api/project/gameModel": () => ({
                ok: true,
                status: 200,
                body: {
                    basics: {status: "available", data: READ_ONLY_GAME},
                    layout: {status: "available", data: {reels: 3, rows: 3, winModel: {type: "lines"}, paylineCount: 0}},
                    symbols: {status: "available", data: []},
                    reels: {status: "available", data: {generationMode: "default"}},
                    paytable: {status: "available", data: []},
                    betsAndModes: {status: "available", data: {availableBets: [], betModes: []}},
                    mechanics: {status: "available", data: {}},
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReadOnlyGameModelTab(user);

        expect(await screen.findByText("Id: b")).toBeInTheDocument();
        expect(screen.getByText("Reels: 3")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Edit"})).not.toBeInTheDocument();
    });

    it("shows a subject-specific recovery message, never the raw backend text, when loading the project's game model fails", async () => {
        const user = setupUser();
        const {fetchImpl} = createRoutedFakeFetch({
            ...READ_ONLY_ROUTES,
            "/api/project/inspect": () => ({
                ok: true,
                status: 200,
                body: {
                    packageRoot: "/games/b",
                    valid: true,
                    generated: true,
                    buildInfo: {
                        schemaVersion: 1,
                        generatedBy: "pokie build",
                        pokieVersion: "1.3.0",
                        generatedAt: "2026-01-01T00:00:00.000Z",
                        blueprintHash: "sha256:blueprint",
                        source: "/games/b-source/blueprint.json",
                        game: READ_ONLY_GAME,
                    },
                },
            }),
            "/api/project/gameModel": () => ({ok: false, status: 500, body: {error: "Studio server crashed unexpectedly"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReadOnlyGameModelTab(user);

        expect(
            await screen.findByText("The project's game model could not be completed. Try again, and check the Studio server logs if the problem persists."),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Studio server crashed unexpectedly/)).not.toBeInTheDocument();
    });
});
