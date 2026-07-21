import {
    AccumulatingJackpotPool,
    AggregateSimulationRunner,
    FixedJackpotPool,
    PercentageOfBetJackpotContributor,
    SingleTierJackpotAwarding,
    SymbolCountJackpotTrigger,
    SymbolsCombination,
    VideoSlotWithJackpotSession,
    WinEvaluationResult,
    type BuildableFromSessionState,
    type ConvertableToSessionState,
    type JackpotPoolRepresenting,
    type StakeAmountDetermining,
    type VideoSlotSessionHandling,
    type VideoSlotWithJackpotSessionState,
} from "pokie";

// A scripted, fully-controllable VideoSlotSessionHandling double: play() advances through a fixed sequence
// of grids, decrementing credits by the bet each round — mirroring real GameSessionHandling accounting
// closely enough for these tests without needing a full random combinations generator stack. Also implements
// ConvertableToSessionState/BuildableFromSessionState (capturing just {credits}) so
// VideoSlotWithJackpotSession's own "base?: unknown" nesting has something real to exercise.
class ScriptedFakeVideoSlotSession implements VideoSlotSessionHandling<string>, ConvertableToSessionState<{credits: number}>, BuildableFromSessionState<{credits: number}> {
    private readonly grids: string[][][];
    private cursor = -1;
    private credits: number;
    private readonly bet: number;

    constructor(grids: string[][][], options: {credits?: number; bet?: number} = {}) {
        this.grids = grids;
        this.credits = options.credits ?? 1000;
        this.bet = options.bet ?? 1;
    }

    public toSessionState(): {credits: number} {
        return {credits: this.credits};
    }

    public fromSessionState(value: {credits: number}): this {
        this.credits = value.credits;
        return this;
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
        /* not exercised by these tests */
    }

    public canPlayNextGame(): boolean {
        return this.credits >= this.bet;
    }

    public play(): void {
        if (!this.canPlayNextGame()) {
            return;
        }
        this.credits -= this.bet;
        this.cursor = Math.min(this.cursor + 1, this.grids.length - 1);
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
        const grid = this.grids[Math.max(this.cursor, 0)];
        return new SymbolsCombination<string>().fromMatrix(grid);
    }

    public getPaytable(): never {
        throw new Error("not used by VideoSlotWithJackpotSession tests");
    }

    public getAvailableSymbols(): string[] {
        return [];
    }

    public getReelsNumber(): number {
        return this.grids[0].length;
    }

    public getReelsSymbolsNumber(): number {
        return this.grids[0][0].length;
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
        throw new Error("not used by VideoSlotWithJackpotSession tests");
    }

    public getLinesPatterns(): never {
        throw new Error("not used by VideoSlotWithJackpotSession tests");
    }
}

// A variant that ALSO implements StakeAmountDetermining, reporting a scripted stake independent of the
// nominal bet — stands in for a session already wrapped in some other zero-stake-round mechanic (e.g. Hold
// & Win, free games) that VideoSlotWithJackpotSession must stay transparent to.
class ScriptedStakeAwareFakeVideoSlotSession extends ScriptedFakeVideoSlotSession implements StakeAmountDetermining {
    private readonly stakes: number[];
    // Unlike the grid cursor (which points at the round that *just* played, read after play()),
    // getStakeAmount()'s own contract is "what the *next* play() will charge" (see StakeAmountDetermining's
    // own doc comment) — so this must be readable *before* play() runs, starting at index 0 (round 1's own
    // stake) and only advancing once that round has actually played.
    private stakeCursor = 0;

    constructor(grids: string[][][], stakes: number[], options: {credits?: number; bet?: number} = {}) {
        super(grids, options);
        this.stakes = stakes;
    }

    public override play(): void {
        super.play();
        this.stakeCursor = Math.min(this.stakeCursor + 1, this.stakes.length - 1);
    }

    public getStakeAmount(): number {
        return this.stakes[this.stakeCursor];
    }
}

const allBlank = (): string[][] => [
    ["X", "X"],
    ["X", "X"],
];

function createDecorator(
    baseSession: VideoSlotSessionHandling<string>,
    pools: readonly JackpotPoolRepresenting[] = [new FixedJackpotPool("mini", 500)],
    minimumCount = 3,
) {
    return new VideoSlotWithJackpotSession<string>(
        baseSession,
        pools,
        new PercentageOfBetJackpotContributor(0.1),
        new SymbolCountJackpotTrigger<string>("J", minimumCount),
        new SingleTierJackpotAwarding<string>("J"),
    );
}

describe("VideoSlotWithJackpotSession", () => {
    it("contribution: every real-stake round grows the configured pool, whether or not it triggers", () => {
        const pool = new AccumulatingJackpotPool("grand", 1000);
        const base = new ScriptedFakeVideoSlotSession([allBlank(), allBlank(), allBlank()], {credits: 1000, bet: 10});
        const session = createDecorator(base, [pool]);

        session.play();
        session.play();
        session.play();

        expect(pool.getValue()).toBe(1000 + 3 * 1); // 10% of bet 10 = 1 per round
        expect(session.getJackpotLastRoundOutcome()).toEqual({kind: "ordinary"});
    });

    it("trigger + award: a symbol-triggered round wins the jackpot, and getWinAmount() combines the base win with it", () => {
        const winningGrid = [
            ["J", "X"],
            ["J", "X"],
            ["J", "X"],
        ];
        const pool = new FixedJackpotPool("mini", 500);
        const base = new ScriptedFakeVideoSlotSession([winningGrid], {credits: 1000, bet: 10});
        const session = createDecorator(base, [pool]);
        const creditsBefore = session.getCreditsAmount();

        session.play();

        expect(session.getJackpotLastRoundOutcome()).toMatchObject({kind: "awarded", poolId: "mini", amount: 500});
        expect(session.getWinAmount()).toBe(500); // base win was 0, jackpot alone
        expect(session.getWinEvaluationResult().getTotalWin()).toBe(500);
        expect(session.getCreditsAmount()).toBe(creditsBefore - session.getBet() + 500);
    });

    it("no-award: the pool keeps growing across many non-triggering rounds without ever paying out", () => {
        const pool = new AccumulatingJackpotPool("grand", 1000);
        const grids = [allBlank(), allBlank(), allBlank(), allBlank()];
        const base = new ScriptedFakeVideoSlotSession(grids, {credits: 1000, bet: 10});
        const session = createDecorator(base, [pool]);

        for (let i = 0; i < grids.length; i++) {
            session.play();
        }

        expect(pool.getValue()).toBe(1000 + grids.length * 1);
        expect(session.getJackpotLastRoundOutcome()).toEqual({kind: "ordinary"});
        expect(session.getWinAmount()).toBe(0);
    });

    it("restore/replay: a freshly constructed decorator wrapping a fresh base session and a fresh pool resumes the pool's own accumulated value and the wrapped session's own state", () => {
        const grids = [allBlank(), allBlank(), allBlank()];
        const liveBase = new ScriptedFakeVideoSlotSession(grids, {credits: 1000, bet: 10});
        const livePool = new AccumulatingJackpotPool("grand", 1000);
        const live = createDecorator(liveBase, [livePool]);
        live.play();
        live.play();

        const captured: VideoSlotWithJackpotSessionState = live.toSessionState();
        expect(captured.pools).toEqual({grand: {value: 1002}});
        expect(captured.base).toEqual({credits: 980});

        const restoredPool = new AccumulatingJackpotPool("grand", 1000); // fresh, un-grown
        const restoredBase = new ScriptedFakeVideoSlotSession(grids.slice(2), {credits: 0, bet: 10}); // deliberately different
        const restored = createDecorator(restoredBase, [restoredPool]);
        restored.fromSessionState(captured);

        expect(restoredPool.getValue()).toBe(1002);
        expect(restored.getCreditsAmount()).toBe(980);

        restored.play(); // continues the script from where "live" left off

        expect(restoredPool.getValue()).toBe(1003);
    });

    it("deterministic replay: capturing mid-accumulation and resuming on a fresh instance reproduces the exact same final outcome as an uninterrupted run", () => {
        const winningGrid = [
            ["J", "X"],
            ["J", "X"],
            ["J", "X"],
        ];
        const scriptA = [allBlank(), allBlank(), winningGrid];
        const scriptB = [allBlank(), allBlank(), winningGrid];

        const poolA = new AccumulatingJackpotPool("grand", 1000);
        const sessionA = createDecorator(new ScriptedFakeVideoSlotSession(scriptA, {credits: 1000, bet: 10}), [poolA]);
        sessionA.play();
        sessionA.play();
        sessionA.play();

        const poolB = new AccumulatingJackpotPool("grand", 1000);
        const liveB = createDecorator(new ScriptedFakeVideoSlotSession(scriptB, {credits: 1000, bet: 10}), [poolB]);
        liveB.play();
        const midState = liveB.toSessionState();

        const poolC = new AccumulatingJackpotPool("grand", 1000);
        const sessionC = createDecorator(new ScriptedFakeVideoSlotSession(scriptB.slice(1), {credits: 1000, bet: 10}), [poolC]);
        sessionC.fromSessionState(midState);
        sessionC.play();
        sessionC.play();

        expect(sessionC.getJackpotLastRoundOutcome()).toEqual(sessionA.getJackpotLastRoundOutcome());
        expect(sessionC.getCreditsAmount()).toBe(sessionA.getCreditsAmount());
        expect(poolC.getValue()).toBe(poolA.getValue());
    });

    it("simulation attribution: the overall accumulator correctly includes the jackpot award, and getJackpotAwardCount()/getJackpotTotalAwarded() give correct, un-lagged jackpot-specific statistics after the run", () => {
        const winningGrid = [
            ["J", "X"],
            ["J", "X"],
            ["J", "X"],
        ];
        const grids = [allBlank(), allBlank(), winningGrid];
        const pool = new FixedJackpotPool("mini", 500);
        const base = new ScriptedFakeVideoSlotSession(grids, {credits: 1000, bet: 10});
        const session = createDecorator(base, [pool]);

        const runner = new AggregateSimulationRunner(session, 3);
        const accumulator = runner.run();

        expect(accumulator.getStatistics().totalPayout).toBe(500); // the one jackpot award, nothing else won
        expect(session.getJackpotAwardCount()).toBe(1);
        expect(session.getJackpotTotalAwarded()).toBe(500);

        // Deliberately NOT attributed to a "jackpot" breakdown category (see
        // VideoSlotWithJackpotSession.getSimulationCategory()'s own doc comment on why that would silently
        // misattribute the win to the *next* round instead) — every round here still correctly falls
        // through to the ordinary stake-based "base" category, exactly as it would without jackpot involved
        // at all, and the total win still lands in the right place (the overall accumulator above).
        const breakdown = runner.getBreakdownStatistics();
        expect(breakdown).toBeDefined();
        expect(breakdown?.jackpot).toBeUndefined();
        expect(breakdown?.base).toMatchObject({rounds: 3, totalWin: 500});
    });

    it("stacking transparency: getStakeAmount() forwards the wrapped session's own zero-stake signal, and jackpot never contributes during that round", () => {
        const pool = new AccumulatingJackpotPool("grand", 1000);
        const grids = [allBlank(), allBlank()];
        const base = new ScriptedStakeAwareFakeVideoSlotSession(grids, [10, 0], {credits: 1000, bet: 10}); // 2nd round reports a zero stake
        const session = createDecorator(base, [pool]);

        expect(session.getStakeAmount()).toBe(10); // forwarded from the wrapped session, before the first round
        session.play(); // real-money round, contributes
        expect(pool.getValue()).toBe(1001);

        expect(session.getStakeAmount()).toBe(0); // forwarded again, before the second round
        session.play(); // zero-stake round — must not contribute
        expect(pool.getValue()).toBe(1001);
    });
});
