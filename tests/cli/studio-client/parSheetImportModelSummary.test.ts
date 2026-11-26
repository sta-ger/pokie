import {describeParSheetImportModelSummary} from "../../../cli/studio-client/src/domain/parSheetImportModelSummary.js";

const current = {
    info: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"},
    reels: 5,
    rows: 3,
    symbols: ["A", "K", "Q", "J"],
    paylines: [[0, 0, 0, 0, 0]],
    paytable: {A: {3: 8}},
    reelStrips: [["A", "K", "Q", "J", "J"]],
    availableBets: [1, 2, 5],
};

const imported = {
    info: {id: "free-games-scope", name: "Free Games Scope", version: "0.1.0"},
    reels: 5,
    rows: 3,
    symbols: ["A", "K", "Q", "J", "S"],
    paylines: [
        [0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1],
    ],
    paytable: {A: {3: 8}, K: {3: 6}},
    reelStrips: [
        ["A", "K", "Q", "J", "J", "S"],
        ["K", "Q", "A", "J", "J", "S"],
    ],
    availableBets: [1, 5],
    mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 10, 4: 15, 5: 20}}},
};

describe("PAR import model summary", () => {
    it("shows the current and imported model in readable values, including exact free-game counts", () => {
        const rows = describeParSheetImportModelSummary(current, imported);
        expect(rows.find((row) => row.key === "game")).toMatchObject({
            kind: "identity",
            current: "starter-slot v0.1.0 — Starter Slot",
            imported: "free-games-scope v0.1.0 — Free Games Scope",
            changed: true,
        });
        expect(rows.filter((row) => row.kind === "math").map((row) => row.key)).toEqual([
            "layout",
            "symbols",
            "reels",
            "paytable",
            "bets",
            "freeGames",
        ]);
        expect(rows.find((row) => row.key === "reels")).toMatchObject({
            current: "1 manual reel(s), 5 stop(s)",
            imported: "2 manual reel(s), 12 stop(s)",
        });
        expect(rows.find((row) => row.key === "freeGames")?.imported).toContain(
            "Scatter S; 3 → 10, 4 → 15, 5 → 20 (exact scatter counts; unlisted counts award 0)",
        );
    });

    it("marks nothing as different when the imported model equals the current draft", () => {
        expect(describeParSheetImportModelSummary(imported, imported).every((row) => !row.changed)).toBe(true);
    });

    it("flags a changed payout even when the paytable keeps the same row count", () => {
        const changed = {...imported, paytable: {A: {3: 9}, K: {3: 6}}};
        const paytable = describeParSheetImportModelSummary(imported, changed).find((row) => row.key === "paytable");
        expect(paytable).toMatchObject({
            current: "2 payout row(s)",
            imported: "2 payout row(s)",
            changed: true,
            detail: "Payout multipliers differ.",
        });
    });

    it("names the first changed reel when the reel counts are identical", () => {
        const changed = {
            ...imported,
            reelStrips: [
                ["A", "K", "Q", "J", "J", "S"],
                ["K", "Q", "A", "J", "J", "X"],
            ],
        };
        const reels = describeParSheetImportModelSummary(imported, changed).find((row) => row.key === "reels");
        expect(reels).toMatchObject({
            current: "2 manual reel(s), 12 stop(s)",
            imported: "2 manual reel(s), 12 stop(s)",
            changed: true,
        });
        expect(reels?.detail).toContain("Reel 2:");
        expect(reels?.detail).toContain("K Q A J J S");
    });

    it("includes a cap in the free-games summary and explains a cap-only change", () => {
        const capped = {
            ...imported,
            mechanics: {freeGames: {...imported.mechanics.freeGames, maxFreeGames: 50}},
        };
        const rows = describeParSheetImportModelSummary(imported, capped);
        expect(rows.find((row) => row.key === "freeGames")?.imported).toContain("cap 50 free games per feature");
        expect(rows.find((row) => row.key === "freeGames")?.detail).toBe(
            "Free-games cap: no cap → 50 free games.",
        );
    });
});
