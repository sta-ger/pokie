import {addFreeGames, applyScatterFreeGamesSetup, payingScatterSymbols, readFreeGames, repeatSelectedReelStrips, replaceReelStripSymbols, setFreeGamesMaxFreeGames} from "../../../cli/studio-client/src/domain/blueprintFormOps.js";

describe("Studio blueprint form operations", () => {
    it("starts free games with the engine's exact 3/4/5 scatter defaults", () => {
        const blueprint: Record<string, unknown> = {
            scatters: ["S"],
            mechanics: {},
        };

        addFreeGames(blueprint);

        expect(blueprint.mechanics).toEqual({
            freeGames: {
                scatterSymbol: "S",
                awardsByCount: {3: 10, 4: 15, 5: 20},
            },
        });
    });

    it("reads and clears the optional hard free-games cap without changing the awards", () => {
        const blueprint: Record<string, unknown> = {
            scatters: ["S"],
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 2}, maxFreeGames: 25}},
        };

        expect(readFreeGames(blueprint)).toEqual({scatterSymbol: "S", awardsByCount: {3: 2}, maxFreeGames: 25});
        setFreeGamesMaxFreeGames(blueprint, undefined);
        expect(readFreeGames(blueprint)).toEqual({scatterSymbol: "S", awardsByCount: {3: 2}});
        expect(blueprint.mechanics).toEqual({freeGames: {scatterSymbol: "S", awardsByCount: {3: 2}}});

        setFreeGamesMaxFreeGames(blueprint, 50);
        expect(readFreeGames(blueprint)?.maxFreeGames).toBe(50);
    });

    it("adds a scatter symbol, its reels and free games in one atomic setup", () => {
        const blueprint: Record<string, unknown> = {
            symbols: ["A", "K", "Q", "J"],
            scatters: [],
            paytable: {A: {3: 8}, K: {3: 6}, Q: {3: 4}, J: {3: 1}},
            reelStrips: [
                ["A", "K", "Q", "J", "A"],
                ["K", "Q", "A", "J", "K"],
                ["Q", "K", "J", "A", "Q"],
                ["K", "J", "Q", "A", "K"],
                ["J", "Q", "K", "A", "J"],
            ],
            mechanics: {},
        };

        applyScatterFreeGamesSetup(blueprint, "S", [0, 2, 4], {3: 1, 4: 2, 5: 3});

        expect(blueprint.symbols).toEqual(["A", "K", "Q", "J", "S"]);
        expect(blueprint.scatters).toEqual(["S"]);
        expect(blueprint.reelStrips).toEqual([
            ["A", "K", "Q", "S", "A"],
            ["K", "Q", "A", "J", "K"],
            ["Q", "K", "S", "A", "Q"],
            ["K", "J", "Q", "A", "K"],
            ["J", "Q", "K", "A", "S"],
        ]);
        expect(blueprint.mechanics).toEqual({
            freeGames: {
                scatterSymbol: "S",
                awardsByCount: {3: 1, 4: 2, 5: 3},
            },
        });
    });

    it("keeps an existing hard cap when the guided scatter setup updates awards", () => {
        const blueprint: Record<string, unknown> = {
            symbols: ["A", "K", "Q", "J"],
            scatters: ["S"],
            reelStrips: [
                ["A", "K", "Q", "J", "A"],
                ["K", "Q", "A", "J", "K"],
                ["Q", "K", "A", "J", "Q"],
                ["K", "J", "Q", "A", "K"],
                ["J", "Q", "K", "A", "J"],
            ],
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 1}, maxFreeGames: 40}},
        };

        applyScatterFreeGamesSetup(blueprint, "S", [0, 2, 4], {3: 2, 4: 4, 5: 6});

        expect(readFreeGames(blueprint)).toMatchObject({maxFreeGames: 40, awardsByCount: {3: 2, 4: 4, 5: 6}});
    });

    it("can set or remove the hard cap as part of the guided scatter setup", () => {
        const blueprint: Record<string, unknown> = {
            symbols: ["A", "K", "Q", "J"],
            scatters: [],
            reelStrips: [["A", "K", "Q", "J"]],
            mechanics: {},
        };

        applyScatterFreeGamesSetup(blueprint, "S", [0], {3: 10, 4: 15, 5: 20}, {maxFreeGames: 50});
        expect(readFreeGames(blueprint)).toMatchObject({
            maxFreeGames: 50,
            awardsByCount: {3: 10, 4: 15, 5: 20},
        });

        applyScatterFreeGamesSetup(blueprint, "S", [0], {3: 10, 4: 15, 5: 20}, {maxFreeGames: undefined});
        expect(readFreeGames(blueprint)).toEqual({scatterSymbol: "S", awardsByCount: {3: 10, 4: 15, 5: 20}});
    });

    it("repeats only selected literal reels to the requested minimum length", () => {
        const blueprint: Record<string, unknown> = {
            reelStrips: [
                ["A", "K", "Q", "J", "A"],
                ["K", "Q", "A", "J", "K"],
                ["Q", "K", "J", "A", "Q"],
            ],
        };

        repeatSelectedReelStrips(blueprint, [0, 2], 10);

        expect(blueprint.reelStrips).toEqual([
            ["A", "K", "Q", "J", "A", "A", "K", "Q", "J", "A"],
            ["K", "Q", "A", "J", "K"],
            ["Q", "K", "J", "A", "Q", "Q", "K", "J", "A", "Q"],
        ]);
    });

    it("reports only scatters that also have paytable entries", () => {
        const blueprint: Record<string, unknown> = {
            scatters: ["Q", "S"],
            paytable: {Q: {3: 4, 4: 8}, S: {}},
        };

        expect(payingScatterSymbols(blueprint)).toEqual(["Q"]);
    });

    it("replaces one literal reel from a pasted list without touching the other reels", () => {
        const blueprint: Record<string, unknown> = {
            reelStrips: [
                ["A", "K", "Q"],
                ["A", "K", "Q"],
            ],
        };

        replaceReelStripSymbols(blueprint, 1, ["A", "A", "J", "S"]);

        expect(blueprint.reelStrips).toEqual([
            ["A", "K", "Q"],
            ["A", "A", "J", "S"],
        ]);
    });
});
