import {fireEvent, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {GameModelProjection} from "../../../../../../cli/studio-client/src/api/types";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";
import {createLargeGameModelProjection, createLargeReelStripModelerBlueprint} from "../../testUtils/largeStudioProjectFixture";

const GAME = {id: "a", name: "A", version: "1.0.0"};

const BASE_ROUTES: Record<string, (call: FakeCall) => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/a", game: GAME, type: "blueprint", capabilities: ["blueprint.build"]}}),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
};

const UNAVAILABLE_PROJECTION_FIXTURES: Omit<GameModelProjection, "basics"> = {
    layout: {status: "unavailable", reason: "no tracked source"},
    symbols: {status: "unavailable", reason: "no tracked source"},
    reels: {status: "unavailable", reason: "no tracked source"},
    paytable: {status: "unavailable", reason: "no tracked source"},
    betsAndModes: {status: "unavailable", reason: "no tracked source"},
    mechanics: {status: "unavailable", reason: "no tracked source"},
    limits: {status: "unavailable", reason: "no tracked source"},
};

function fullProjection(): GameModelProjection {
    return {
        basics: {status: "available", data: {id: "a", name: "A", version: "1.0.0"}},
        layout: {status: "available", data: {reels: 3, rows: 3, winModel: {type: "lines"}, paylineCount: 1}},
        symbols: {status: "available", data: [{id: "A", isWild: true, isScatter: false}]},
        reels: {
            status: "available",
            data: {
                generationMode: "reelStrips",
                gameWindow: {reels: 1, rows: 1, wrapsAround: true, grid: [[{symbolId: "A", isWild: true, isScatter: false}]]},
                reels: [
                    {
                        reelIndex: 0,
                        source: "literal",
                        positions: [{index: 0, symbolId: "A", isWild: true, isScatter: false, locked: false, stackSize: 1}],
                        analysis: {
                            length: 1,
                            symbolCounts: {A: 1},
                            symbolFrequencies: {A: 1},
                            minimumCircularDistances: {A: 1},
                            maximumCircularDistances: {A: 1},
                            maximumConsecutiveOccurrences: {A: 1},
                        },
                    },
                ],
            },
        },
        paytable: {status: "available", data: [{symbolId: "A", matchCount: 3, payout: 5}]},
        betsAndModes: {status: "available", data: {availableBets: [1, 2], betModes: []}},
        mechanics: {status: "available", data: {}},
        limits: {status: "available", data: {minBet: 1, maxBet: 2}},
    };
}

function projectionWithVisibleSymbol(id: string): GameModelProjection {
    const projection = fullProjection();
    projection.symbols = {status: "available", data: [{id, isWild: true, isScatter: false}]};
    return projection;
}

function projectionWithSampledReels(id: string): GameModelProjection {
    const projection = projectionWithVisibleSymbol(id);
    if (projection.reels.status === "available") {
        projection.reels = {...projection.reels, data: {...projection.reels.data, generationMode: "symbolWeights"}};
    }
    return projection;
}

function jsonResponse(body: unknown) {
    return {ok: true, status: 200, json: () => Promise.resolve(body)};
}

async function goToGameModelTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
    await user.click(screen.getByRole("button", {name: "Game Model"}));
}

describe("ProjectDashboardPage - Game Model tab", () => {
    it("keeps a 1,800-stop production model bounded while every reel position remains inspectable", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/gameModel": () => ({ok: true, status: 200, body: createLargeGameModelProjection()}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);

        await user.click(screen.getByRole("tab", {name: "Full strips"}));
        expect(await screen.findAllByText("Showing positions 0–99 of 300.")).toHaveLength(6);
        // Six full-strip tables are present, but each table has a 100-row rendering window rather
        // than mounting all 1,800 stops at once.
        await user.click(screen.getAllByRole("button", {name: "Next 100"})[0]);
        expect(screen.getByText("Showing positions 100–199 of 300.")).toBeInTheDocument();
        expect(screen.getAllByText("100").length).toBeGreaterThan(0);
    });

    it("keeps the Reel Strip Modeler's 300-stop reel editor bounded while later reels and stops remain reachable", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/gameModel": () => ({ok: true, status: 200, body: createLargeGameModelProjection()}),
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/a", blueprint: createLargeReelStripModelerBlueprint(), blueprintHash: "large-hash"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);

        const reels = sectionFieldset("Reels");
        await user.click(within(reels).getByRole("button", {name: "Edit"}));
        expect(await within(reels).findByText("Per-reel (Reel Strip Modeler)")).toBeInTheDocument();
        expect(within(reels).getAllByRole("button", {name: /^Select reel [1-6]$/})).toHaveLength(6);

        // Selecting the final reel takes the normal modeler path, but only its first 100 literal
        // symbols mount; the other 1,700 stops remain unrendered until the user pages to them.
        await user.click(within(reels).getByRole("button", {name: "Select reel 6"}));
        expect(within(reels).getByText("Showing symbols 1–100 of 300.")).toBeInTheDocument();
        expect(within(reels).getAllByRole("textbox", {name: /Reel 6 symbol/})).toHaveLength(100);

        await user.click(within(reels).getByRole("button", {name: "Next 100 symbols"}));
        await user.click(within(reels).getByRole("button", {name: "Next 100 symbols"}));
        expect(within(reels).getByText("Showing symbols 201–300 of 300.")).toBeInTheDocument();
        expect(within(reels).getByRole("textbox", {name: "Reel 6 symbol 300"})).toHaveValue("S16");
    });

    it("renders every section of a full projection, straight off GET /api/project/gameModel", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/gameModel": () => ({ok: true, status: 200, body: fullProjection()}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);

        expect(await screen.findByText("Id: a")).toBeInTheDocument();
        expect(screen.getByText("Reels: 3")).toBeInTheDocument();
        expect(screen.getByText("A · wild")).toBeInTheDocument();
        expect(screen.getByText("Available bets: 1, 2")).toBeInTheDocument();
        expect(screen.getByText("Bet range: 1 – 2")).toBeInTheDocument();
    });

    it("shows each section's own truthful 'Not available' reason, never inventing data, when the project has no tracked game model", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/gameModel": () => ({
                ok: true,
                status: 200,
                body: {basics: {status: "unavailable", reason: "This project's package could not be inspected."}, ...UNAVAILABLE_PROJECTION_FIXTURES},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);

        expect(await screen.findByText("Not available — This project's package could not be inspected.")).toBeInTheDocument();
        expect(screen.getAllByText("Not available — no tracked source").length).toBeGreaterThan(0);
        expect(screen.queryByText("Id: a")).not.toBeInTheDocument();
    });

    it("shows a recovery message, never a raw stack trace, when the fetch itself fails", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/gameModel": () => ({ok: false, status: 500, body: {error: "boom"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);

        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the game model");
    });
});

// Edit Mode: covers GameModelTab's own Edit/Save/Cancel for an editable Blueprint Project (a
// "blueprint" project always carries exactly BLUEPRINT_BUILD_CAPABILITY -- see
// PROJECT_TYPE_CAPABILITIES in src/project/ProjectCapabilities.ts -- which BASE_ROUTES' own
// "/api/project/context" fixture above already grants). Editing reuses the exact same
// /api/home/blueprints/load|validate|save endpoints the guided Design Game editor uses.
const RAW_BLUEPRINT = {
    manifest: {id: "a", name: "A", version: "1.0.0"},
    reels: 1,
    rows: 1,
    symbols: ["A"],
    wilds: ["A"],
    scatters: [],
    paylines: [],
    paytable: [],
    availableBets: [1],
    reelStrips: [["A"]],
};

// A section's own Edit/Save/Cancel controls sit inside that section's own `<fieldset>` (the legend
// includes the action once GameModelTab passes `edit`, wrapped in its own `<span>` -- see
// PageSection.tsx) -- scoping every query to it is what lets these tests tell "Symbols" own Edit button
// apart from "Layout"'s, "Paytable"'s, etc., all sharing the same accessible name.
function sectionFieldset(legend: string): HTMLElement {
    const fieldset = screen.getByText(legend, {selector: "span"}).closest("fieldset");
    if (!fieldset) {
        throw new Error(`No fieldset found for section "${legend}"`);
    }
    return fieldset as HTMLElement;
}

describe("ProjectDashboardPage - Game Model tab editing", () => {
    it("offers Edit on every section with a canonical field editor, including Mechanics, but never on Limits (a derived value, not its own field)", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/gameModel": () => ({ok: true, status: 200, body: fullProjection()}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);

        expect(await screen.findAllByRole("button", {name: "Edit"})).toHaveLength(7);
        expect(screen.getByText("Mechanics", {selector: "span"})).toBeInTheDocument();
        expect(screen.queryByText("Limits", {selector: "span"})).not.toBeInTheDocument();
        // Still there, just as plain (non-editable) legend text.
        expect(screen.getByText("Limits")).toBeInTheDocument();
    });

    it("Edit -> mutate -> Save loads the real tracked source, validates, atomically writes it, and View Mode then shows the saved truth", async () => {
        const user = userEvent.setup();
        let gameModelCalls = 0;
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/gameModel": () => {
                gameModelCalls += 1;
                const projection = fullProjection();
                if (gameModelCalls > 1) {
                    projection.symbols = {status: "available", data: [{id: "A", isWild: true, isScatter: false}, {id: "B", isWild: false, isScatter: false}]};
                }
                return {ok: true, status: 200, body: projection};
            },
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/a", blueprint: RAW_BLUEPRINT, blueprintHash: "h1"}}),
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
            "/api/home/blueprints/save": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/a", blueprintHash: "h2"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);

        const symbols = sectionFieldset("Symbols");
        await user.click(within(symbols).getByRole("button", {name: "Edit"}));

        await within(symbols).findByLabelText("New symbol id");
        await user.type(within(symbols).getByLabelText("New symbol id"), "B");
        await user.click(within(symbols).getByRole("button", {name: "Add symbol"}));

        await user.click(within(symbols).getByRole("button", {name: "Save"}));

        expect(await within(symbols).findByRole("button", {name: "Edit"})).toBeInTheDocument();
        expect(within(symbols).getByText("B")).toBeInTheDocument();

        const saveCall = calls.find((call) => call.url === "/api/home/blueprints/save");
        expect(saveCall).toBeDefined();
        expect(JSON.parse(saveCall!.init!.body!)).toMatchObject({path: "/games/a", overwrite: true});
        expect(gameModelCalls).toBeGreaterThanOrEqual(2);
    });

    it("keeps the post-save projection when an earlier refresh resolves afterward", async () => {
        const user = userEvent.setup();
        let gameModelCalls = 0;
        let resolvePreSaveRefresh: ((response: ReturnType<typeof jsonResponse>) => void) | undefined;
        let resolveSave: ((response: ReturnType<typeof jsonResponse>) => void) | undefined;
        const rawBlueprint = {...RAW_BLUEPRINT, symbols: ["WILD"], wilds: ["WILD"]};
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/project/gameModel") {
                gameModelCalls += 1;
                if (gameModelCalls === 1) {
                    return Promise.resolve(jsonResponse(projectionWithSampledReels("WILD")));
                }
                if (gameModelCalls === 2) {
                    return new Promise((resolve) => {
                        resolvePreSaveRefresh = resolve;
                    });
                }
                return Promise.resolve(jsonResponse(projectionWithVisibleSymbol("WILD_FINAL")));
            }
            if (path === "/api/home/blueprints/load") {
                return Promise.resolve(jsonResponse({status: "ok", path: "/games/a", blueprint: rawBlueprint, blueprintHash: "h1"}));
            }
            if (path === "/api/home/blueprints/validate") {
                return Promise.resolve(jsonResponse({status: "ok", warnings: []}));
            }
            if (path === "/api/home/blueprints/save") {
                return new Promise((resolve) => {
                    resolveSave = resolve;
                });
            }
            const route = BASE_ROUTES[path];
            if (route !== undefined) {
                const response = route({url, init});
                return Promise.resolve(jsonResponse(response.body));
            }
            return Promise.reject(new Error(`No fake route registered for ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);

        const symbols = sectionFieldset("Symbols");
        await user.click(within(symbols).getByRole("button", {name: "Edit"}));
        await within(symbols).findByLabelText("New symbol id");
        await user.type(within(symbols).getByLabelText("New symbol id"), "WILD_FINAL");
        await user.click(within(symbols).getByRole("button", {name: "Add symbol"}));
        await user.click(within(symbols).getByRole("button", {name: "Save"}));
        await waitFor(() => expect(resolveSave).toBeDefined());

        // New sample starts a refresh while the write is pending. It describes the pre-save source
        // and deliberately resolves last, after Save's own refresh has rendered WILD_FINAL.
        await user.click(screen.getByRole("button", {name: "New sample"}));
        await waitFor(() => expect(resolvePreSaveRefresh).toBeDefined());
        resolveSave?.(jsonResponse({status: "ok", path: "/games/a", blueprintHash: "h2"}));

        expect(await screen.findByText("WILD_FINAL · wild")).toBeInTheDocument();
        resolvePreSaveRefresh?.(jsonResponse(projectionWithVisibleSymbol("WILD")));
        await waitFor(() => expect(screen.getByText("WILD_FINAL · wild")).toBeInTheDocument());
        expect(screen.queryByText("WILD · wild")).not.toBeInTheDocument();
    });

    it("keeps a saved renamed symbol's canonical id visible when its persisted PNG artwork has an older label", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/gameModel": () => ({ok: true, status: 200, body: projectionWithVisibleSymbol("WILD_FINAL")}),
            "/api/project/symbol-artwork": () => ({ok: true, status: 200, body: {artwork: {WILD_FINAL: "assets/symbols/wild.png"}}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);

        expect(await screen.findByText("WILD_FINAL · wild")).toBeInTheDocument();
        expect(screen.getByRole("img", {name: "WILD_FINAL"})).toHaveAttribute("src", "/api/project/symbol-artwork?path=assets%2Fsymbols%2Fwild.png");
    });

    // Covers the completeness gap this step fixes: Mechanics (GameBlueprintMechanics.freeGames) used to
    // have no field editor anywhere in Studio (see GameModelSections.tsx's own doc comment) -- this
    // proves Edit -> add free games -> set scatter symbol -> add an award -> Save really does reach the
    // same atomic whole-blueprint write every other section's Save already uses, and View Mode then
    // shows the saved truth.
    it("Edit -> mutate -> Save on Mechanics adds scatter-triggered free games and atomically writes the whole blueprint", async () => {
        const user = userEvent.setup();
        const rawBlueprintWithScatter = {...RAW_BLUEPRINT, symbols: ["A", "S"], scatters: ["S"]};
        let gameModelCalls = 0;
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/gameModel": () => {
                gameModelCalls += 1;
                const projection = fullProjection();
                if (gameModelCalls > 1) {
                    projection.mechanics = {status: "available", data: {freeGames: {scatterSymbol: "S", awardsByCount: {"3": 10}}}};
                }
                return {ok: true, status: 200, body: projection};
            },
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/a", blueprint: rawBlueprintWithScatter, blueprintHash: "h1"}}),
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
            "/api/home/blueprints/save": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/a", blueprintHash: "h2"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);

        const mechanics = sectionFieldset("Mechanics");
        await user.click(within(mechanics).getByRole("button", {name: "Edit"}));

        await user.click(await within(mechanics).findByRole("button", {name: "Add free games"}));
        await user.click(within(mechanics).getByRole("combobox", {name: "Scatter symbol"}));
        // Mantine's own dropdown positioning never settles to visible under jsdom's layout-less
        // environment (its Popover stays "display: none" even once opened -- a jsdom limitation, not a
        // real hidden state), so the option is targeted directly with fireEvent rather than a visibility-
        // checking userEvent.click; the option element itself is real and already in the DOM (see
        // ProjectDashboardPage.playWorkflow.test.tsx's own "Symbol" chooser for the same pattern).
        fireEvent.click(await screen.findByRole("option", {name: "S", hidden: true}));
        await user.type(within(mechanics).getByLabelText("New match count"), "3");
        await user.type(within(mechanics).getByLabelText("New free games awarded"), "10");
        await user.click(within(mechanics).getByRole("button", {name: "Add award"}));

        await user.click(within(mechanics).getByRole("button", {name: "Save"}));

        expect(await within(mechanics).findByRole("button", {name: "Edit"})).toBeInTheDocument();
        expect(within(mechanics).getByText(/scatter symbol: S/)).toBeInTheDocument();
        expect(within(mechanics).getByText(/3x → 10 free games/)).toBeInTheDocument();

        const saveCall = calls.find((call) => call.url === "/api/home/blueprints/save");
        expect(saveCall).toBeDefined();
        const savedBody = JSON.parse(saveCall!.init!.body!) as {blueprint: {mechanics?: unknown}};
        expect(savedBody.blueprint.mechanics).toEqual({freeGames: {scatterSymbol: "S", awardsByCount: {"3": 10}}});
        expect(gameModelCalls).toBeGreaterThanOrEqual(2);
    });

    it("Edit -> mutate -> Save on Bets & Modes persists a real bet mode instead of presenting a read-only placeholder", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/gameModel": () => ({ok: true, status: 200, body: fullProjection()}),
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/a", blueprint: RAW_BLUEPRINT, blueprintHash: "h1"}}),
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
            "/api/home/blueprints/save": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/a", blueprintHash: "h2"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);
        const bets = sectionFieldset("Bets & Modes");
        await user.click(within(bets).getByRole("button", {name: "Edit"}));
        await user.click(await within(bets).findByRole("button", {name: "Add bet mode"}));
        const id = within(bets).getByLabelText("Bet mode 1 id");
        await user.clear(id);
        await user.type(id, "base");
        fireEvent.blur(id);
        await user.click(within(bets).getByRole("button", {name: "Save"}));

        await within(bets).findByRole("button", {name: "Edit"});
        const saved = calls.find((call) => call.url === "/api/home/blueprints/save");
        expect(JSON.parse(saved!.init!.body!).blueprint.betModes).toEqual([{id: "base", label: "Mode 1"}]);
    });

    it("Save includes an available-bet edit committed by the field blur that triggered it", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/gameModel": () => ({ok: true, status: 200, body: fullProjection()}),
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/a", blueprint: RAW_BLUEPRINT, blueprintHash: "h1"}}),
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
            "/api/home/blueprints/save": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/a", blueprintHash: "h2"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);
        const bets = sectionFieldset("Bets & Modes");
        await user.click(within(bets).getByRole("button", {name: "Edit"}));
        await user.clear(await within(bets).findByLabelText("Bet 1"));
        await user.type(within(bets).getByLabelText("Bet 1"), "11");
        await user.click(within(bets).getByRole("button", {name: "Save"}));

        await within(bets).findByRole("button", {name: "Edit"});
        const saved = calls.find((call) => call.url === "/api/home/blueprints/save");
        expect(JSON.parse(saved!.init!.body!).blueprint.availableBets).toEqual([11]);
    });

    it("Save runs validateBlueprint first -- an invalid draft is never written, and the errors show inline", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/gameModel": () => ({ok: true, status: 200, body: fullProjection()}),
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/a", blueprint: RAW_BLUEPRINT, blueprintHash: "h1"}}),
            "/api/home/blueprints/validate": () => ({
                ok: true,
                status: 200,
                body: {status: "invalid", errors: [{code: "blueprint-symbols-empty", severity: "error", message: "Symbols must not be empty."}], warnings: []},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);

        const symbols = sectionFieldset("Symbols");
        await user.click(within(symbols).getByRole("button", {name: "Edit"}));
        await within(symbols).findByLabelText("New symbol id");

        await user.click(within(symbols).getByRole("button", {name: "Save"}));

        expect(await within(symbols).findByText(/Symbols must not be empty\./)).toBeInTheDocument();
        // Still editing -- Save/Cancel are showing, not a lone Edit button.
        expect(within(symbols).getByRole("button", {name: "Save"})).toBeInTheDocument();
        expect(within(symbols).getByRole("button", {name: "Cancel"})).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/blueprints/save")).toBe(false);
    });

    it("Cancel with unsaved edits confirms before discarding them, reverting to the last-loaded truth", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/gameModel": () => ({ok: true, status: 200, body: fullProjection()}),
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/a", blueprint: RAW_BLUEPRINT, blueprintHash: "h1"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);

        const symbols = sectionFieldset("Symbols");
        await user.click(within(symbols).getByRole("button", {name: "Edit"}));
        await within(symbols).findByLabelText("New symbol id");
        await user.type(within(symbols).getByLabelText("New symbol id"), "B");
        await user.click(within(symbols).getByRole("button", {name: "Add symbol"}));
        expect(within(symbols).getByDisplayValue("B")).toBeInTheDocument();

        await user.click(within(symbols).getByRole("button", {name: "Cancel"}));

        expect(await screen.findByText("Discard your unsaved changes to this section?")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Confirm"}));

        expect(await within(symbols).findByRole("button", {name: "Edit"})).toBeInTheDocument();
        expect(within(symbols).queryByText("B")).not.toBeInTheDocument();
        expect(within(symbols).getByText("A · wild")).toBeInTheDocument();
    });

    it("blocks navigating away from the Game Model tab while a section edit is dirty, same as any other unsaved-changes guard", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/gameModel": () => ({ok: true, status: 200, body: fullProjection()}),
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/a", blueprint: RAW_BLUEPRINT, blueprintHash: "h1"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);

        const symbols = sectionFieldset("Symbols");
        await user.click(within(symbols).getByRole("button", {name: "Edit"}));
        await within(symbols).findByLabelText("New symbol id");
        await user.type(within(symbols).getByLabelText("New symbol id"), "B");
        await user.click(within(symbols).getByRole("button", {name: "Add symbol"}));

        await user.click(screen.getByRole("button", {name: "Overview"}));

        expect(await screen.findByText("You have unsaved changes to this game model section. Leave and lose them?")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Stay"}));

        await waitFor(() => expect(screen.queryByText("You have unsaved changes to this game model section. Leave and lose them?")).not.toBeInTheDocument());
        expect(within(symbols).getByDisplayValue("B")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Overview"}));
        await screen.findByText("You have unsaved changes to this game model section. Leave and lose them?");
        await user.click(screen.getByRole("button", {name: "Leave"}));

        expect(await screen.findByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page");
    });
});
