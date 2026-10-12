import type {GameBlueprint, WeightedOutcomeLibrary} from "@fromstan/pokie";

export type AuthoredAwardCase = "missing-symbol" | "missing-count" | "zero" | "positive";

/** Literal intake for public packages; reachable variants for validated adapters. */
export function authoritativePaytableBlueprint(kind: AuthoredAwardCase, bet = 1, reachable = false): GameBlueprint {
    const missingCount = kind === "missing-count";
    const screen = missingCount ? ["A", "A", "A", "B", "B"] : ["B", "B", "B"];
    let paytable: GameBlueprint["paytable"] = {A: {3: 5}};
    if (missingCount) {
        paytable = {A: {5: 10}, B: {5: 2}};
    } else if (kind !== "missing-symbol") {
        paytable = {A: {3: 5}, B: {3: kind === "zero" ? 0 : 2}};
    }
    return {
        manifest: {id: `authored-${kind}`, name: `Authored ${kind}`, version: "1.0.0"},
        reels: screen.length, rows: 1, symbols: ["A", "B"], wilds: [], scatters: [],
        paylines: [screen.map(() => 0)], availableBets: [bet],
        reelStrips: reachable ? screen.map(() => ["A", "B"]) : screen.map(symbol => [symbol]),
        paytable,
    };
}

/** Independent eight-grid expectation, deliberately no runtime payout lookup. */
export function expectAuthoritativeEightOutcomes(library: WeightedOutcomeLibrary, bet: number): void {
    expect(library.outcomes).toHaveLength(8);
    const screens = new Set<string>();
    let totalWin = 0;
    for (const {weight, artifact} of library.outcomes) {
        const symbols = artifact.screen.map(reel => reel[0]).join("");
        screens.add(symbols);
        const multiplier = symbols === "AAA" ? 5 : 0;
        expect(weight).toBe(1);
        expect(artifact.stake).toBe(bet);
        expect(artifact.totalWin).toBe(multiplier * bet);
        expect(artifact.payoutMultiplier).toBeCloseTo(multiplier, 12);
        expect(artifact.wins).toHaveLength(multiplier > 0 ? 1 : 0);
        expect(artifact.steps.flatMap(step => step.wins)).toEqual(artifact.wins);
        for (const win of artifact.wins) expect(win).toMatchObject({symbolId: "A", winAmount: 5 * bet});
        totalWin += weight * artifact.totalWin;
    }
    expect(screens).toEqual(new Set(["AAA", "AAB", "ABA", "ABB", "BAA", "BAB", "BBA", "BBB"]));
    expect(totalWin).toBe(5 * bet);
}
