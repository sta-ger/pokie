import {
    SessionRuntime,
    AbstractVideoSlotSessionDecorator,
    CascadeGridTransformer,
    CascadeResult,
    CascadeResultProviding,
    CascadeSessionSerializer,
    CascadingSpinResolver,
    SymbolsCombination,
    SymbolsCombinationDescribing,
    VideoSlotConfig,
    VideoSlotSession,
    VideoSlotSessionHandling,
    VideoSlotWinCalculator,
} from "@fromstan/pokie";

function roundtripThroughJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

// A minimal stand-in for a custom game that wires CascadingSpinResolver into its own play(), the
// pattern CascadeResultProviding/CascadeSessionSerializer exist for — no built-in "cascade session"
// class ships with this framework (see CascadeResultProviding's own doc comment). Delegates
// everything else to a real VideoSlotSession via AbstractVideoSlotSessionDecorator.
class TestCascadeSession
    extends AbstractVideoSlotSessionDecorator<string>
    implements CascadeResultProviding<string> {
    private readonly resolver: CascadingSpinResolver<string>;
    private cascadeResult: CascadeResult<string> | undefined;

    constructor(baseSession: VideoSlotSessionHandling<string>, resolver: CascadingSpinResolver<string>) {
        super(baseSession);
        this.resolver = resolver;
    }

    public override play(): void {
        this.baseSession.play();
        const initialScreen = this.baseSession.getSymbolsCombination().toMatrix();
        this.cascadeResult = this.resolver.resolve(initialScreen, this.getBet());
    }

    public override getSymbolsCombination(): SymbolsCombinationDescribing<string> {
        if (!this.cascadeResult) {
            return this.baseSession.getSymbolsCombination();
        }
        return new SymbolsCombination<string>().fromMatrix(this.cascadeResult.getFinalScreen());
    }

    public override getWinAmount(): number {
        return this.cascadeResult ? this.cascadeResult.getTotalCascadeWin() : this.baseSession.getWinAmount();
    }

    public getCascadeResult(): CascadeResult<string> {
        if (!this.cascadeResult) {
            throw new Error("Call play() before getCascadeResult().");
        }
        return this.cascadeResult;
    }
}

function buildCascadeSession(initialScreen: string[][], refillSymbols: string[][]): TestCascadeSession {
    const config = new VideoSlotConfig();
    config.setReelsNumber(initialScreen.length);
    config.setReelsSymbolsNumber(initialScreen[0].length);
    const pipeline = new VideoSlotWinCalculator(config).getWinEvaluationPipeline();
    const generator = {
        generateSymbolsCombination: (): SymbolsCombination<string> =>
            new SymbolsCombination<string>().fromMatrix(initialScreen),
    };
    const baseSession = new VideoSlotSession(config, generator, new VideoSlotWinCalculator(config));
    const resolver = new CascadingSpinResolver(
        pipeline,
        config,
        {getRefillSymbols: (): string[][] => refillSymbols},
        new CascadeGridTransformer(),
    );
    return new TestCascadeSession(baseSession, resolver);
}

describe("CascadeSessionSerializer", () => {
    it("serializes a winning cascade's stages, screens, and total win", () => {
        const session = buildCascadeSession(
            [
                ["A", "A", "A"],
                ["A", "K", "Q"],
                ["A", "K", "Q"],
            ],
            [["K"], ["Q"], ["J"]],
        );
        session.play();

        const serializer = new CascadeSessionSerializer<string>();
        const roundData = serializer.getRoundData(session);

        expect(roundData.initialScreen).toEqual([
            ["A", "A", "A"],
            ["A", "K", "Q"],
            ["A", "K", "Q"],
        ]);
        expect(roundData.finalScreen).toEqual([
            ["K", "A", "A"],
            ["Q", "K", "Q"],
            ["J", "K", "Q"],
        ]);
        expect(roundData.stages).toHaveLength(1);
        expect(roundData.stages[0].removedPositions.length).toBeGreaterThan(0);
        expect(roundData.stages[0].refillSymbols).toEqual([["K"], ["Q"], ["J"]]);
        expect(roundData.stages[0].screen).toEqual([
            ["A", "A", "A"],
            ["A", "K", "Q"],
            ["A", "K", "Q"],
        ]);
        expect(roundData.stages[0].winEvaluationResult.totalWin).toBeGreaterThan(0);
        expect(roundData.totalCascadeWin).toBe(roundData.stages[0].winEvaluationResult.totalWin);
        expect(roundData.totalWin).toBe(roundData.totalCascadeWin);

        expect(roundtripThroughJson(roundData)).toEqual(roundData);
    });

    it("reports an empty stages array (not omitted) for a round with no cascades", () => {
        const session = buildCascadeSession(
            [
                ["Q", "J", "10"],
                ["J", "9", "Q"],
                ["10", "Q", "J"],
            ],
            [["A"], ["A"], ["A"]],
        );
        session.play();

        const roundData = new CascadeSessionSerializer<string>().getRoundData(session);

        expect(roundData.stages).toEqual([]);
        expect(roundData.totalCascadeWin).toBe(0);
        expect(roundtripThroughJson(roundData)).toEqual(roundData);
    });

    it("getInitialData includes the same round fields plus the base video-slot initial descriptors", () => {
        const session = buildCascadeSession(
            [
                ["A", "A", "A"],
                ["A", "K", "Q"],
                ["A", "K", "Q"],
            ],
            [["K"], ["Q"], ["J"]],
        );
        session.play();

        const initialData = new CascadeSessionSerializer<string>().getInitialData(session);

        expect(initialData.stages).toHaveLength(1);
        expect(Array.isArray(initialData.availableSymbols)).toBe(true);
        expect(typeof initialData.paytable).toBe("object");
        expect(roundtripThroughJson(initialData)).toEqual(initialData);
    });
});

it("stepwise cascade delivery reads saved evaluated stages without refilling again", () => {
    const a = buildCascadeSession([["A", "A", "A"], ["A", "A", "A"], ["A", "A", "A"]], [["K", "Q", "J"], ["Q", "J", "K"], ["J", "K", "Q"]]);
    const b = buildCascadeSession([["A", "A", "A"], ["A", "A", "A"], ["A", "A", "A"]], [["K", "Q", "J"], ["Q", "J", "K"], ["J", "K", "Q"]]);
    const runtime = new SessionRuntime(a);
    const play = jest.spyOn(a, "play");
    let result = runtime.execute({kind: "spin", roundId: "cascade", delivery: "stepwise"});
    const composite = new SessionRuntime(b).execute({kind: "spin", roundId: "cascade", delivery: "composite"});
    expect(result.status).toBe("played");
    while (result.status === "played" && result.logicalRound?.status === "pending") {
        const command = {kind: "spin" as const, delivery: "stepwise" as const, continuation: {roundId: "cascade", cursor: result.logicalRound.deliveryCursor}};
        result = runtime.execute(command);
        expect(runtime.execute(command)).toEqual(result);
    }
    expect(play).toHaveBeenCalledTimes(1);
    expect(composite.status).toBe("played");
    if (result.status !== "played" || composite.status !== "played") throw new Error("Cascade failed");
    expect(result.logicalRound?.subrounds).toEqual(composite.logicalRound?.subrounds.map(step => ({...step, command: {...step.command, delivery: "stepwise"}})));
    expect(result.logicalRound?.totalStake).toBe(composite.logicalRound?.totalStake);
    expect(result.logicalRound?.totalWin).toBe(composite.logicalRound?.totalWin);
    expect(a.getSymbolsCombination().toMatrix()).toEqual(b.getSymbolsCombination().toMatrix());
    const serializer = new CascadeSessionSerializer();
    const captured = serializer.getRoundData(a);
    captured.stages[0].screen[0][0] = "mutated";
    expect(serializer.getRoundData(a).stages[0].screen[0][0]).toBe("A");
    expect(play).toHaveBeenCalledTimes(1);
});
