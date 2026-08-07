import {screen} from "@testing-library/react";
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
