import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {GameModelProjection} from "../../../../../../cli/studio-client/src/api/types";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const GAME = {id: "a", name: "A", version: "1.0.0"};

const BASE_ROUTES: Record<string, (call: FakeCall) => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/a", game: GAME, type: "blueprint", capabilities: ["blueprint.build"]}}),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
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

async function goToGameModelTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
    await user.click(screen.getByRole("button", {name: "Game Model"}));
}

describe("ProjectDashboardPage - Game Model tab", () => {
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
    it("offers Edit only on the sections with a canonical field editor, never on Mechanics/Limits", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/gameModel": () => ({ok: true, status: 200, body: fullProjection()}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToGameModelTab(user);

        expect(await screen.findAllByRole("button", {name: "Edit"})).toHaveLength(6);
        expect(screen.queryByText("Mechanics", {selector: "span"})).not.toBeInTheDocument();
        expect(screen.queryByText("Limits", {selector: "span"})).not.toBeInTheDocument();
        // Still there, just as plain (non-editable) legend text.
        expect(screen.getByText("Mechanics")).toBeInTheDocument();
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

    it("stops an already-running runtime after a successful section save -- its materialization is invalidated, not silently left stale", async () => {
        const user = userEvent.setup();
        let runtimeStatus: "running" | "stopped" = "running";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime": () =>
                runtimeStatus === "running"
                    ? {
                        ok: true,
                        status: 200,
                        body: {status: "running", host: "127.0.0.1", port: 4000, baseUrl: "http://127.0.0.1:4000", playerUrl: "http://127.0.0.1:4000/player", debug: false, repositoryMode: "memory", startedAt: "2026-01-01T00:00:00.000Z"},
                    }
                    : {ok: true, status: 200, body: {status: "stopped"}},
            "/api/project/runtime/stop": () => {
                runtimeStatus = "stopped";
                return {ok: true, status: 200, body: {status: "stopped"}};
            },
            "/api/project/gameModel": () => ({ok: true, status: 200, body: fullProjection()}),
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
        await within(symbols).findByRole("button", {name: "Edit"});

        await waitFor(() => expect(calls.some((call) => call.url === "/api/project/runtime/stop" && call.init?.method === "POST")).toBe(true));
    });
});
