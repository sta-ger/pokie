import {
    HoldAndWinRoundHandler,
    MinimumCountHoldAndWinTrigger,
    SumWithMultiplierHoldAndWinPayoutAggregator,
    SymbolsCombination,
    SymbolSetHoldAndWinCollector,
    WinEvaluationResult,
    type LockedHoldAndWinSymbol,
    type VideoSlotWithHoldAndWinSessionHandling,
} from "pokie";

// A fully-controllable VideoSlotWithHoldAndWinSessionHandling double: HoldAndWinRoundHandler only ever
// reads getSymbolsCombination()/getBet()/getReelsNumber()/getReelsSymbolsNumber()/getCreditsAmount() and the
// HoldAndWinStateDetermining/Setting getters/setters — every other VideoSlotSessionHandling member is
// structurally required but never exercised by these tests, so it's stubbed minimally.
class FakeHoldAndWinSession implements VideoSlotWithHoldAndWinSessionHandling<string> {
    private grid: string[][];
    private credits: number;
    private readonly bet: number;
    private readonly reelsNumber: number;
    private readonly reelsSymbolsNumber: number;
    private active = false;
    private lockedSymbols: readonly LockedHoldAndWinSymbol<string>[] = [];
    private respinsRemaining = 0;
    private payout = 0;

    constructor(grid: string[][], options: {credits?: number; bet?: number} = {}) {
        this.grid = grid;
        this.credits = options.credits ?? 1000;
        this.bet = options.bet ?? 1;
        this.reelsNumber = grid.length;
        this.reelsSymbolsNumber = grid[0]?.length ?? 0;
    }

    public setGrid(grid: string[][]): void {
        this.grid = grid;
    }

    public isHoldAndWinActive(): boolean {
        return this.active;
    }

    public setHoldAndWinActive(value: boolean): void {
        this.active = value;
    }

    public getLockedHoldAndWinSymbols(): readonly LockedHoldAndWinSymbol<string>[] {
        return this.lockedSymbols;
    }

    public setLockedHoldAndWinSymbols(value: readonly LockedHoldAndWinSymbol<string>[]): void {
        this.lockedSymbols = value;
    }

    public getHoldAndWinRespinsRemaining(): number {
        return this.respinsRemaining;
    }

    public setHoldAndWinRespinsRemaining(value: number): void {
        this.respinsRemaining = value;
    }

    public getHoldAndWinPayout(): number {
        return this.payout;
    }

    public setHoldAndWinPayout(value: number): void {
        this.payout = value;
    }

    public getCreditsAmount(): number {
        return this.credits;
    }

    public setCreditsAmount(value: number): void {
        this.credits = value;
    }

    public getBet(): number {
        return this.bet;
    }

    public setBet(): void {
        /* not used by HoldAndWinRoundHandler */
    }

    public canPlayNextGame(): boolean {
        return true;
    }

    public play(): void {
        /* grid is scripted directly via setGrid() */
    }

    public getWinAmount(): number {
        return 0;
    }

    public getWinningLines(): Record<string, never> {
        return {};
    }

    public getWinningScatters(): Record<string, never> {
        return {};
    }

    public getLinesWinning(): number {
        return 0;
    }

    public getScattersWinning(): number {
        return 0;
    }

    public getWinEvaluationResult(): WinEvaluationResult<string> {
        return new WinEvaluationResult<string>();
    }

    public getAvailableBets(): number[] {
        return [this.bet];
    }

    public getSymbolsCombination(): SymbolsCombination<string> {
        return new SymbolsCombination<string>().fromMatrix(this.grid);
    }

    public getPaytable(): never {
        throw new Error("not used by HoldAndWinRoundHandler tests");
    }

    public getAvailableSymbols(): string[] {
        return [];
    }

    public getReelsNumber(): number {
        return this.reelsNumber;
    }

    public getReelsSymbolsNumber(): number {
        return this.reelsSymbolsNumber;
    }

    public isSymbolScatter(): boolean {
        return false;
    }

    public isSymbolWild(): boolean {
        return false;
    }

    public getSymbolsSequences(): never[] {
        return [];
    }

    public getWildSymbols(): string[] {
        return [];
    }

    public getScatterSymbols(): string[] {
        return [];
    }

    public getLinesDefinitions(): never {
        throw new Error("not used by HoldAndWinRoundHandler tests");
    }

    public getLinesPatterns(): never {
        throw new Error("not used by HoldAndWinRoundHandler tests");
    }
}

const valueEffect = {kind: "value" as const, amount: 10};

// 3 reels x 2 rows = 6 cells total, so "board full" is reachable within a handful of collects.
const allBlank = (): string[][] => [
    ["X", "X"],
    ["X", "X"],
    ["X", "X"],
];

describe("HoldAndWinRoundHandler", () => {
    function createHandler(initialRespins: number) {
        return new HoldAndWinRoundHandler<string>(
            initialRespins,
            new SymbolSetHoldAndWinCollector<string>({C: valueEffect}),
            new MinimumCountHoldAndWinTrigger<string>(3),
            new SumWithMultiplierHoldAndWinPayoutAggregator<string>(),
        );
    }

    it("trigger: a base spin below the configured minimum count does not activate the feature", () => {
        const handler = createHandler(2);
        const grid = allBlank();
        grid[0][0] = "C";
        grid[1][0] = "C"; // only 2 collectible symbols, minimum is 3
        const session = new FakeHoldAndWinSession(grid);

        handler.afterRoundPlayed(session, session.getCreditsAmount());

        expect(session.isHoldAndWinActive()).toBe(false);
        expect(session.getLockedHoldAndWinSymbols()).toHaveLength(0);
        expect(session.getHoldAndWinRespinsRemaining()).toBe(0);
    });

    it("trigger: a base spin meeting the configured minimum count activates the feature with the configured initial respins", () => {
        const handler = createHandler(2);
        const grid = allBlank();
        grid[0][0] = "C";
        grid[1][0] = "C";
        grid[2][0] = "C";
        const session = new FakeHoldAndWinSession(grid);
        const creditsBefore = session.getCreditsAmount();

        handler.afterRoundPlayed(session, creditsBefore);

        expect(session.isHoldAndWinActive()).toBe(true);
        expect(session.getHoldAndWinRespinsRemaining()).toBe(2);
        expect(session.getCreditsAmount()).toBe(creditsBefore); // the triggering spin's own credits are left untouched
    });

    it("locking: locked positions/symbols/effects exactly match what was newly collected, in position order", () => {
        const handler = createHandler(3);
        const grid = allBlank();
        grid[0][0] = "C";
        grid[1][1] = "C";
        grid[2][0] = "C";
        const session = new FakeHoldAndWinSession(grid);

        handler.afterRoundPlayed(session, session.getCreditsAmount());

        expect(session.getLockedHoldAndWinSymbols()).toEqual([
            {position: [0, 0], symbolId: "C", effect: valueEffect},
            {position: [1, 1], symbolId: "C", effect: valueEffect},
            {position: [2, 0], symbolId: "C", effect: valueEffect},
        ]);
    });

    it("reset: a respin that newly locks at least one symbol resets respinsRemaining back to the configured initial value", () => {
        const handler = createHandler(3);
        const triggerGrid = allBlank();
        triggerGrid[0][0] = "C";
        triggerGrid[1][0] = "C";
        triggerGrid[2][0] = "C";
        const session = new FakeHoldAndWinSession(triggerGrid);
        handler.afterRoundPlayed(session, session.getCreditsAmount());

        // Burn two respins with no new collect first.
        session.setGrid(allBlank());
        handler.afterRoundPlayed(session, session.getCreditsAmount());
        handler.afterRoundPlayed(session, session.getCreditsAmount());
        expect(session.getHoldAndWinRespinsRemaining()).toBe(1);

        // A new lock resets back to the configured initial value, not "+1".
        const respinGrid = allBlank();
        respinGrid[0][1] = "C";
        session.setGrid(respinGrid);
        handler.afterRoundPlayed(session, session.getCreditsAmount());

        expect(session.getHoldAndWinRespinsRemaining()).toBe(3);
        expect(session.getLockedHoldAndWinSymbols()).toHaveLength(4);
    });

    it("decrement: a respin with no new collect decrements respinsRemaining by exactly 1", () => {
        const handler = createHandler(3);
        const triggerGrid = allBlank();
        triggerGrid[0][0] = "C";
        triggerGrid[1][0] = "C";
        triggerGrid[2][0] = "C";
        const session = new FakeHoldAndWinSession(triggerGrid);
        handler.afterRoundPlayed(session, session.getCreditsAmount());

        session.setGrid(allBlank());
        handler.afterRoundPlayed(session, session.getCreditsAmount());

        expect(session.getHoldAndWinRespinsRemaining()).toBe(2);
        expect(session.isHoldAndWinActive()).toBe(true);
    });

    it("a live respin's own incidental win is discarded, not paid out directly", () => {
        const handler = createHandler(3);
        const triggerGrid = allBlank();
        triggerGrid[0][0] = "C";
        triggerGrid[1][0] = "C";
        triggerGrid[2][0] = "C";
        const session = new FakeHoldAndWinSession(triggerGrid);
        handler.afterRoundPlayed(session, session.getCreditsAmount());

        const creditsBeforeRespin = session.getCreditsAmount();
        session.setCreditsAmount(creditsBeforeRespin + 9999); // simulate the base game's own paytable crediting something
        session.setGrid(allBlank());
        handler.afterRoundPlayed(session, creditsBeforeRespin);

        expect(session.getCreditsAmount()).toBe(creditsBeforeRespin);
    });

    it("termination: respins exhausted (no new collect) completes the feature and pays out the aggregated locked value", () => {
        const handler = createHandler(1);
        const triggerGrid = allBlank();
        triggerGrid[0][0] = "C";
        triggerGrid[1][0] = "C";
        triggerGrid[2][0] = "C";
        const session = new FakeHoldAndWinSession(triggerGrid);
        const creditsBefore = session.getCreditsAmount();
        handler.afterRoundPlayed(session, creditsBefore);
        expect(session.getHoldAndWinRespinsRemaining()).toBe(1);

        session.setGrid(allBlank());
        handler.afterRoundPlayed(session, session.getCreditsAmount());

        expect(session.isHoldAndWinActive()).toBe(false);
        expect(session.getHoldAndWinRespinsRemaining()).toBe(0);
        expect(session.getHoldAndWinPayout()).toBe(30); // 3 locked C's * 10 each
        expect(session.getCreditsAmount()).toBe(creditsBefore + 30);
    });

    it("termination: the board filling completely ends the feature immediately, even mid-respin with respins still remaining", () => {
        const handler = createHandler(10); // respins deliberately generous — board-full must win the race
        const triggerGrid = allBlank();
        triggerGrid[0][0] = "C";
        triggerGrid[1][0] = "C";
        triggerGrid[2][0] = "C"; // 3 locked, 3 cells left in a 6-cell board
        const session = new FakeHoldAndWinSession(triggerGrid);
        handler.afterRoundPlayed(session, session.getCreditsAmount());

        const fillGrid = allBlank();
        fillGrid[0][1] = "C";
        fillGrid[1][1] = "C";
        fillGrid[2][1] = "C"; // fills every remaining cell in one respin
        session.setGrid(fillGrid);
        const creditsBeforeFinalRespin = session.getCreditsAmount();
        handler.afterRoundPlayed(session, creditsBeforeFinalRespin);

        expect(session.getLockedHoldAndWinSymbols()).toHaveLength(6);
        expect(session.isHoldAndWinActive()).toBe(false);
        expect(session.getHoldAndWinRespinsRemaining()).toBe(0);
        expect(session.getHoldAndWinPayout()).toBe(60); // 6 locked C's * 10 each
    });

    it("termination: a trigger spin that alone fills the board completes without ever needing a respin", () => {
        const handler = createHandler(5);
        const fullGrid: string[][] = [
            ["C", "C"],
            ["C", "C"],
            ["C", "C"],
        ]; // all 6 cells collectible on the very first (triggering) spin
        const session = new FakeHoldAndWinSession(fullGrid);

        handler.afterRoundPlayed(session, session.getCreditsAmount());

        expect(session.isHoldAndWinActive()).toBe(false);
        expect(session.getLockedHoldAndWinSymbols()).toHaveLength(6);
        expect(session.getHoldAndWinPayout()).toBe(60);
    });

    it("beforeRoundPlayed clears a completed feature's stale payout/locked symbols before a fresh, unrelated round", () => {
        const handler = createHandler(1);
        const triggerGrid = allBlank();
        triggerGrid[0][0] = "C";
        triggerGrid[1][0] = "C";
        triggerGrid[2][0] = "C";
        const session = new FakeHoldAndWinSession(triggerGrid);
        handler.afterRoundPlayed(session, session.getCreditsAmount());
        session.setGrid(allBlank());
        handler.afterRoundPlayed(session, session.getCreditsAmount()); // completes, payout = 30
        expect(session.getHoldAndWinPayout()).toBe(30);

        handler.beforeRoundPlayed(session);

        expect(session.getHoldAndWinPayout()).toBe(0);
        expect(session.getLockedHoldAndWinSymbols()).toHaveLength(0);
    });

    it("beforeRoundPlayed is a no-op while the feature is still active", () => {
        const handler = createHandler(3);
        const triggerGrid = allBlank();
        triggerGrid[0][0] = "C";
        triggerGrid[1][0] = "C";
        triggerGrid[2][0] = "C";
        const session = new FakeHoldAndWinSession(triggerGrid);
        handler.afterRoundPlayed(session, session.getCreditsAmount());
        const lockedBefore = session.getLockedHoldAndWinSymbols();

        handler.beforeRoundPlayed(session);

        expect(session.getLockedHoldAndWinSymbols()).toBe(lockedBefore);
        expect(session.isHoldAndWinActive()).toBe(true);
    });
});
