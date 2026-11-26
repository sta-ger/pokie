import {MathDefinitionDiffer} from "../../src/diff/MathDefinitionDiffer.js";
import type {MathDefinitionSnapshot} from "../../src/diff/MathDefinitionDiff.js";

function snapshot(infoName: string, payout: number): MathDefinitionSnapshot {
    const model = {
        info: {id: "test-game", name: infoName, version: "1.0.0", author: "Valera"},
        reels: 5,
        rows: 3,
        symbols: ["A"],
        paytable: {A: {3: payout}},
        reelStrips: [["A", "A", "A", "A", "A"]],
        availableBets: [1],
        maxWinPolicy: {type: "none", authority: "test", scope: "paid-entry"},
    } as unknown as MathDefinitionSnapshot["effective"];
    return {
        identity: {kind: "blueprint"},
        support: "partial",
        effective: model,
        authored: model,
        fields: [],
        diagnostics: [],
        limits: [],
    };
}

describe("MathDefinitionDiffer classifications", () => {
    it("does not count game metadata changes as mathematical differences", () => {
        const diff = new MathDefinitionDiffer().diff(snapshot("Starter Slot", 8), snapshot("Renamed Slot", 8));
        const metadata = diff.changes.find((change) => change.path === "/info/name");
        expect(metadata).toBeDefined();
        expect(metadata?.mathematical).toBe(false);
        expect(diff.changes.some((change) => change.mathematical)).toBe(false);
    });

    it("still counts a paytable payout change as mathematical", () => {
        const diff = new MathDefinitionDiffer().diff(snapshot("Starter Slot", 8), snapshot("Starter Slot", 12));
        const payout = diff.changes.find((change) => change.path === "/paytable/A/3");
        expect(payout).toBeDefined();
        expect(payout?.mathematical).toBe(true);
    });
});
