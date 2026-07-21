import {
    MinimumCountHoldAndWinTrigger,
    SumWithMultiplierHoldAndWinPayoutAggregator,
    SymbolsCombination,
    SymbolSetHoldAndWinCollector,
    VideoSlotWithHoldAndWinSession,
    WinEvaluationResult,
    type BuildableFromSessionState,
    type ConvertableToSessionState,
    type VideoSlotSessionHandling,
    type VideoSlotWithHoldAndWinSessionState,
} from "pokie";

// A scripted, fully-controllable VideoSlotSessionHandling double: play() advances through a fixed sequence
// of grids (repeating the last one if the script runs out), decrementing credits by the bet each time —
// mirroring real GameSessionHandling accounting closely enough for these tests without needing a full
// VideoSlotSession/random combinations generator stack. Also implements ConvertableToSessionState/
// BuildableFromSessionState (capturing just {credits}) so the decorator's own "base?: unknown" nesting
// convention (see VideoSlotWithHoldAndWinSessionState) has something real to exercise.
class ScriptedFakeVideoSlotSession implements VideoSlotSessionHandling<string>, ConvertableToSessionState<{credits: number}>, BuildableFromSessionState<{credits: number}> {
    private readonly grids: string[][][];
    private cursor = -1;
    private credits: number;
    private readonly bet: number;
    private readonly reelsNumber: number;
    private readonly reelsSymbolsNumber: number;

    constructor(grids: string[][][], options: {credits?: number; bet?: number} = {}) {
        this.grids = grids;
        this.credits = options.credits ?? 1000;
        this.bet = options.bet ?? 1;
        this.reelsNumber = grids[0].length;
        this.reelsSymbolsNumber = grids[0][0].length;
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
        throw new Error("not used by VideoSlotWithHoldAndWinSession tests");
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
        throw new Error("not used by VideoSlotWithHoldAndWinSession tests");
    }

    public getLinesPatterns(): never {
        throw new Error("not used by VideoSlotWithHoldAndWinSession tests");
    }
}

const valueEffect = {kind: "value" as const, amount: 10};

const allBlank = (): string[][] => [
    ["X", "X"],
    ["X", "X"],
    ["X", "X"],
];

// A 5-spin script exercised by several tests below: spin 1 triggers (3 C's), spins 2/4/5 collect nothing,
// spin 3 collects one new C (resetting respins), spin 5 exhausts the (initialRespins: 2) budget and
// completes the feature with 4 locked C's worth 10 each (payout 40).
function fiveSpinScript(): string[][][] {
    const triggerGrid = allBlank();
    triggerGrid[0][0] = "C";
    triggerGrid[1][0] = "C";
    triggerGrid[2][0] = "C";

    const respinWithNewCollect = allBlank();
    respinWithNewCollect[0][1] = "C";

    return [triggerGrid, allBlank(), respinWithNewCollect, allBlank(), allBlank()];
}

function createDecorator(baseSession: VideoSlotSessionHandling<string>): VideoSlotWithHoldAndWinSession<string> {
    return new VideoSlotWithHoldAndWinSession<string>(
        baseSession,
        2,
        new SymbolSetHoldAndWinCollector<string>({C: valueEffect}),
        new MinimumCountHoldAndWinTrigger<string>(3),
        new SumWithMultiplierHoldAndWinPayoutAggregator<string>(),
    );
}

describe("VideoSlotWithHoldAndWinSession", () => {
    it("trigger: a base spin landing enough collectible symbols activates the feature and reports a zero stake going forward", () => {
        const base = new ScriptedFakeVideoSlotSession(fiveSpinScript());
        const session = createDecorator(base);

        expect(session.getStakeAmount()).toBe(session.getBet()); // before playing, a normal paid spin
        expect(session.getSimulationCategory()).toBe("base");

        session.play();

        expect(session.isHoldAndWinActive()).toBe(true);
        expect(session.getHoldAndWinRespinsRemaining()).toBe(2);
        expect(session.getStakeAmount()).toBe(0);
        expect(session.getSimulationCategory()).toBe("holdAndWin");
    });

    it("locking: respins render accumulated locked positions on top of the freshly generated grid via getSymbolsCombination()", () => {
        const base = new ScriptedFakeVideoSlotSession(fiveSpinScript());
        const session = createDecorator(base);

        session.play(); // trigger: locks (0,0), (1,0), (2,0)
        session.play(); // blank respin — grid itself has no C at all this spin

        const matrix = session.getSymbolsCombination().toMatrix();
        expect(matrix[0][0]).toBe("C");
        expect(matrix[1][0]).toBe("C");
        expect(matrix[2][0]).toBe("C");
    });

    it("respin reset on new collect: locking a new symbol mid-feature resets respinsRemaining back to the configured initial value", () => {
        const base = new ScriptedFakeVideoSlotSession(fiveSpinScript());
        const session = createDecorator(base);

        session.play(); // trigger, respins = 2
        session.play(); // blank, respins = 1
        expect(session.getHoldAndWinRespinsRemaining()).toBe(1);

        session.play(); // new collect at (0,1), respins reset to 2
        expect(session.getHoldAndWinRespinsRemaining()).toBe(2);
        expect(session.getLockedHoldAndWinSymbols()).toHaveLength(4);
    });

    it("termination and payout: the feature completes once respins run out, pays out the aggregated locked value once, and reverts to a normal paid spin", () => {
        const base = new ScriptedFakeVideoSlotSession(fiveSpinScript(), {credits: 1000, bet: 1});
        const session = createDecorator(base);
        const creditsBeforeFeature = session.getCreditsAmount();

        for (let i = 0; i < 5; i++) {
            session.play();
        }

        expect(session.isHoldAndWinActive()).toBe(false);
        expect(session.getHoldAndWinRespinsRemaining()).toBe(0);
        expect(session.getHoldAndWinPayout()).toBe(40); // 4 locked C's * 10 each
        // 5 spins total (1 charged trigger + 4 free respins) plus the aggregated payout.
        expect(session.getCreditsAmount()).toBe(creditsBeforeFeature - 1 + 40);
        expect(session.getStakeAmount()).toBe(session.getBet());
        expect(session.getSimulationCategory()).toBe("base");
    });

    it("restore: a freshly constructed decorator wrapping a fresh base session resumes exactly where a captured mid-feature state left off, including the wrapped session's own nested state", () => {
        const grids = fiveSpinScript();
        const liveBase = new ScriptedFakeVideoSlotSession(grids, {credits: 500, bet: 1});
        const live = createDecorator(liveBase);
        live.play(); // trigger
        live.play(); // blank respin
        live.play(); // new collect, respins reset

        const captured: VideoSlotWithHoldAndWinSessionState<string> = live.toSessionState();
        // Only the trigger spin ever actually charges (499); every respin since restores credits to their
        // pre-play value before this handler's own logic runs (see HoldAndWinRoundHandler), so credits stay
        // pinned at 499 through both of the two respins played so far.
        expect(captured.base).toEqual({credits: 499});

        const restoredBase = new ScriptedFakeVideoSlotSession(grids.slice(3), {credits: 0, bet: 1}); // deliberately different starting credits
        const restored = createDecorator(restoredBase);
        restored.fromSessionState(captured);

        expect(restored.isHoldAndWinActive()).toBe(true);
        expect(restored.getHoldAndWinRespinsRemaining()).toBe(2);
        expect(restored.getLockedHoldAndWinSymbols()).toEqual(live.getLockedHoldAndWinSymbols());
        expect(restored.getCreditsAmount()).toBe(499); // nested base state actually restored, not the fresh session's own 0

        restored.play(); // blank respin (grids[3]) — respins 2 -> 1
        restored.play(); // blank respin (grids[4]) — respins 1 -> 0, completes

        expect(restored.isHoldAndWinActive()).toBe(false);
        expect(restored.getHoldAndWinPayout()).toBe(40);
    });

    it("deterministic replay: capturing mid-feature and resuming on a fresh instance reproduces the exact same final outcome as an uninterrupted run", () => {
        const scriptForA = fiveSpinScript();
        const scriptForB = fiveSpinScript(); // identical script, independent array instances

        const sessionA = createDecorator(new ScriptedFakeVideoSlotSession(scriptForA, {credits: 1000, bet: 1}));
        for (let i = 0; i < 5; i++) {
            sessionA.play();
        }

        const liveB = createDecorator(new ScriptedFakeVideoSlotSession(scriptForB, {credits: 1000, bet: 1}));
        liveB.play();
        liveB.play();
        liveB.play();
        const midState = liveB.toSessionState();

        const sessionC = createDecorator(new ScriptedFakeVideoSlotSession(scriptForB.slice(3), {credits: 1000, bet: 1}));
        sessionC.fromSessionState(midState);
        sessionC.play();
        sessionC.play();

        expect(sessionC.getLockedHoldAndWinSymbols()).toEqual(sessionA.getLockedHoldAndWinSymbols());
        expect(sessionC.getHoldAndWinPayout()).toBe(sessionA.getHoldAndWinPayout());
        expect(sessionC.getCreditsAmount()).toBe(sessionA.getCreditsAmount());
    });

    it("board-full termination reached purely through play(): locking every remaining cell ends the feature immediately even with respins left", () => {
        const triggerGrid = allBlank();
        triggerGrid[0][0] = "C";
        triggerGrid[1][0] = "C";
        triggerGrid[2][0] = "C";
        const fillGrid = allBlank();
        fillGrid[0][1] = "C";
        fillGrid[1][1] = "C";
        fillGrid[2][1] = "C";

        const base = new ScriptedFakeVideoSlotSession([triggerGrid, fillGrid], {credits: 1000, bet: 1});
        const session = new VideoSlotWithHoldAndWinSession<string>(
            base,
            10, // generous respins — board-full must win the race, not respin exhaustion
            new SymbolSetHoldAndWinCollector<string>({C: valueEffect}),
            new MinimumCountHoldAndWinTrigger<string>(3),
            new SumWithMultiplierHoldAndWinPayoutAggregator<string>(),
        );

        session.play();
        session.play();

        expect(session.isHoldAndWinActive()).toBe(false);
        expect(session.getLockedHoldAndWinSymbols()).toHaveLength(6);
        expect(session.getHoldAndWinPayout()).toBe(60);
    });
});
