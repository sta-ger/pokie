import {
    AccumulatingJackpotPool,
    FixedJackpotPool,
    JackpotRoundHandler,
    NoJackpotTrigger,
    SingleTierJackpotAwarding,
    SymbolCountJackpotTrigger,
    SymbolsCombination,
    ValueWinComponent,
    WinEvaluationResult,
    WinningValue,
    type JackpotPoolRepresenting,
    type JackpotPoolStatisticsSnapshot,
    type JackpotRoundOutcome,
    type VideoSlotWithJackpotSessionHandling,
} from "pokie";

// A fully-controllable VideoSlotWithJackpotSessionHandling double: JackpotRoundHandler only ever reads
// getSymbolsCombination()/getBet()/getCreditsAmount() and the JackpotStateDetermining/Setting getters/
// setters — every other VideoSlotSessionHandling member is structurally required but never exercised by
// these tests, so it's stubbed minimally.
class FakeJackpotSession implements VideoSlotWithJackpotSessionHandling<string> {
    private grid: string[][];
    private credits: number;
    private readonly bet: number;
    private readonly pools: readonly JackpotPoolRepresenting[];
    private lastRoundOutcome: JackpotRoundOutcome<string> = {kind: "ordinary"};
    private poolStatistics: Readonly<Record<string, JackpotPoolStatisticsSnapshot>> = {};

    constructor(grid: string[][], pools: readonly JackpotPoolRepresenting[], options: {credits?: number; bet?: number} = {}) {
        this.grid = grid;
        this.pools = pools;
        this.credits = options.credits ?? 1000;
        this.bet = options.bet ?? 1;
    }

    public setGrid(grid: string[][]): void {
        this.grid = grid;
    }

    public getJackpotPools(): readonly JackpotPoolRepresenting[] {
        return this.pools;
    }

    public getJackpotLastRoundOutcome(): JackpotRoundOutcome<string> {
        return this.lastRoundOutcome;
    }

    public setJackpotLastRoundOutcome(value: JackpotRoundOutcome<string>): void {
        this.lastRoundOutcome = value;
    }

    public getJackpotPoolStatistics(): Readonly<Record<string, JackpotPoolStatisticsSnapshot>> {
        return this.poolStatistics;
    }

    public setJackpotPoolStatistics(value: Readonly<Record<string, JackpotPoolStatisticsSnapshot>>): void {
        this.poolStatistics = value;
    }

    public getJackpotAwardCount(): number {
        return Object.values(this.poolStatistics).reduce((sum, stats) => sum + stats.awardCount, 0);
    }

    public getJackpotTotalAwarded(): number {
        return Object.values(this.poolStatistics).reduce((sum, stats) => sum + stats.totalAwarded, 0);
    }

    public getJackpotTotalContributed(): number {
        return Object.values(this.poolStatistics).reduce((sum, stats) => sum + stats.totalContributed, 0);
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
        /* not used by JackpotRoundHandler */
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
        throw new Error("not used by JackpotRoundHandler tests");
    }

    public getAvailableSymbols(): string[] {
        return [];
    }

    public getReelsNumber(): number {
        return this.grid.length;
    }

    public getReelsSymbolsNumber(): number {
        return this.grid[0]?.length ?? 0;
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
        throw new Error("not used by JackpotRoundHandler tests");
    }

    public getLinesPatterns(): never {
        throw new Error("not used by JackpotRoundHandler tests");
    }
}

const noWin = (): WinEvaluationResult<string> => new WinEvaluationResult<string>();

function winOf(amount: number): WinEvaluationResult<string> {
    return new WinEvaluationResult<string>({valueWins: [new ValueWinComponent<string>(new WinningValue<string>("K", [[0, 0]], amount))]});
}

describe("JackpotRoundHandler", () => {
    it("contribution: every configured pool grows by the contributor's own amount for a real-stake round, whether or not it triggers", () => {
        const mini = new AccumulatingJackpotPool("mini", 100);
        const grand = new AccumulatingJackpotPool("grand", 1000);
        const handler = new JackpotRoundHandler<string>(
            {computeContribution: () => 5},
            new NoJackpotTrigger<string>(),
            new SingleTierJackpotAwarding<string>(),
        );
        const session = new FakeJackpotSession([["X"]], [mini, grand]);

        handler.afterRoundPlayed(session, 1, noWin());

        expect(mini.getValue()).toBe(105);
        expect(grand.getValue()).toBe(1005);
    });

    it("contribution: a zero-stake round never grows any pool", () => {
        const pool = new AccumulatingJackpotPool("mini", 100);
        const handler = new JackpotRoundHandler<string>({computeContribution: () => 5}, new NoJackpotTrigger<string>(), new SingleTierJackpotAwarding<string>());
        const session = new FakeJackpotSession([["X"]], [pool]);

        handler.afterRoundPlayed(session, 0, noWin());

        expect(pool.getValue()).toBe(100);
    });

    it("contribution: a non-positive computed contribution is never applied", () => {
        const pool = new AccumulatingJackpotPool("mini", 100);
        const handler = new JackpotRoundHandler<string>({computeContribution: () => 0}, new NoJackpotTrigger<string>(), new SingleTierJackpotAwarding<string>());
        const session = new FakeJackpotSession([["X"]], [pool]);

        handler.afterRoundPlayed(session, 1, noWin());

        expect(pool.getValue()).toBe(100);
    });

    it("trigger: eligibility not met (symbol count below threshold) reports 'ordinary', no award", () => {
        const pool = new FixedJackpotPool("mini", 500);
        const handler = new JackpotRoundHandler<string>(
            {computeContribution: () => 0},
            new SymbolCountJackpotTrigger<string>("J", 3),
            new SingleTierJackpotAwarding<string>(),
        );
        const grid = [
            ["J", "X"],
            ["J", "X"],
            ["X", "X"],
        ]; // only 2 J's, threshold is 3
        const session = new FakeJackpotSession(grid, [pool]);
        const creditsBefore = session.getCreditsAmount();

        handler.afterRoundPlayed(session, 1, noWin());

        expect(session.getJackpotLastRoundOutcome()).toEqual({kind: "ordinary"});
        expect(session.getCreditsAmount()).toBe(creditsBefore);
    });

    it("trigger: no pools configured at all never triggers, regardless of the trigger strategy", () => {
        const handler = new JackpotRoundHandler<string>(
            {computeContribution: () => 0},
            {isTriggered: () => true}, // would otherwise always trigger
            new SingleTierJackpotAwarding<string>(),
        );
        const session = new FakeJackpotSession([["J"]], []);

        handler.afterRoundPlayed(session, 1, noWin());

        expect(session.getJackpotLastRoundOutcome()).toEqual({kind: "ordinary"});
    });

    it("award: a triggered round resolves the award, credits it, and reports a coherent 'awarded' outcome", () => {
        const pool = new FixedJackpotPool("mini", 500);
        const handler = new JackpotRoundHandler<string>(
            {computeContribution: () => 0},
            new SymbolCountJackpotTrigger<string>("J", 3),
            new SingleTierJackpotAwarding<string>("J"),
        );
        const grid = [
            ["J", "X"],
            ["J", "X"],
            ["J", "X"],
        ];
        const session = new FakeJackpotSession(grid, [pool]);
        const creditsBefore = session.getCreditsAmount();

        handler.afterRoundPlayed(session, 1, noWin());

        expect(session.getJackpotLastRoundOutcome()).toMatchObject({kind: "awarded", poolId: "mini", amount: 500, symbolId: "J", baseWinAmount: 0});
        expect(session.getCreditsAmount()).toBe(creditsBefore + 500);
        expect(session.getJackpotAwardCount()).toBe(1);
        expect(session.getJackpotTotalAwarded()).toBe(500);
    });

    it("statistics: getJackpotAwardCount()/getJackpotTotalAwarded() accumulate correctly across multiple awards, and stay untouched by non-triggering rounds", () => {
        const pool = new FixedJackpotPool("mini", 500);
        const handler = new JackpotRoundHandler<string>(
            {computeContribution: () => 0},
            new SymbolCountJackpotTrigger<string>("J", 3),
            new SingleTierJackpotAwarding<string>("J"),
        );
        const winningGrid = [
            ["J", "X"],
            ["J", "X"],
            ["J", "X"],
        ];
        const session = new FakeJackpotSession(winningGrid, [pool]);

        handler.afterRoundPlayed(session, 1, noWin());
        expect(session.getJackpotAwardCount()).toBe(1);
        expect(session.getJackpotTotalAwarded()).toBe(500);

        session.setGrid([["X", "X"]]); // no J's — never triggers
        handler.afterRoundPlayed(session, 1, noWin());
        expect(session.getJackpotAwardCount()).toBe(1); // unchanged
        expect(session.getJackpotTotalAwarded()).toBe(500); // unchanged

        session.setGrid(winningGrid);
        handler.afterRoundPlayed(session, 1, noWin());
        expect(session.getJackpotAwardCount()).toBe(2);
        expect(session.getJackpotTotalAwarded()).toBe(1000);
    });

    it("award: baseWinAmount reflects the wrapped session's own real win for the same round, combined alongside the jackpot", () => {
        const pool = new FixedJackpotPool("mini", 500);
        const handler = new JackpotRoundHandler<string>(
            {computeContribution: () => 0},
            new SymbolCountJackpotTrigger<string>("J", 3),
            new SingleTierJackpotAwarding<string>("J"),
        );
        const grid = [
            ["J", "X"],
            ["J", "X"],
            ["J", "X"],
        ];
        const session = new FakeJackpotSession(grid, [pool]);

        handler.afterRoundPlayed(session, 1, winOf(42));

        expect(session.getJackpotLastRoundOutcome()).toMatchObject({kind: "awarded", amount: 500, baseWinAmount: 42});
    });

    it("no-award: an eligible session with pools configured but a trigger that never fires always reports 'ordinary'", () => {
        const pool = new AccumulatingJackpotPool("grand", 1000);
        const handler = new JackpotRoundHandler<string>(
            {computeContribution: () => 5},
            new NoJackpotTrigger<string>(),
            new SingleTierJackpotAwarding<string>(),
        );
        const session = new FakeJackpotSession([["J", "J", "J"]], [pool]);

        handler.afterRoundPlayed(session, 1, noWin());

        expect(session.getJackpotLastRoundOutcome()).toEqual({kind: "ordinary"});
        expect(pool.getValue()).toBe(1005); // contribution still happened even without an award
    });

    it("backward compatible: afterRoundPlayed(session, stake) without the optional 3rd argument still works, degrading baseWinAmount to 0", () => {
        const pool = new FixedJackpotPool("mini", 500);
        const handler = new JackpotRoundHandler<string>(
            {computeContribution: () => 0},
            new SymbolCountJackpotTrigger<string>("J", 3),
            new SingleTierJackpotAwarding<string>("J"),
        );
        const grid = [
            ["J", "X"],
            ["J", "X"],
            ["J", "X"],
        ];
        const session = new FakeJackpotSession(grid, [pool]);

        handler.afterRoundPlayed(session, 1); // no 3rd argument at all

        expect(session.getJackpotLastRoundOutcome()).toMatchObject({kind: "awarded", amount: 500, baseWinAmount: 0});
    });
});
