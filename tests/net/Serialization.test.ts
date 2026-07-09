import {
    GameSession,
    GameSessionConfig,
    GameSessionSerializer,
    SymbolsCombination,
    VideoSlotConfig,
    VideoSlotSession,
    VideoSlotSessionSerializer,
    VideoSlotWinCalculator,
    VideoSlotWithFreeGamesSession,
    VideoSlotWithFreeGamesSessionSerializer,
} from "pokie";

// A JSON round trip drops functions, class prototypes, and `undefined` values — the same coercion
// a real HTTP/JSON.stringify boundary applies. Comparing before/after with toEqual (not toBe)
// verifies the payload survives that boundary unchanged rather than merely "looking" plain.
function roundtripThroughJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value: unknown): boolean {
    return typeof value === "object" && value !== null && value.constructor === Object;
}

describe("GameSessionSerializer", () => {
    test("round and initial payloads survive a JSON roundtrip unchanged", () => {
        const session = new GameSession(new GameSessionConfig());
        session.play();

        const serializer = new GameSessionSerializer();
        const roundData = serializer.getRoundData(session);
        const initialData = serializer.getInitialData(session);

        expect(roundtripThroughJson(roundData)).toEqual(roundData);
        expect(roundtripThroughJson(initialData)).toEqual(initialData);
    });
});

describe("VideoSlotSessionSerializer", () => {
    function buildWinningSession(): VideoSlotSession {
        const config = new VideoSlotConfig();
        const winCalculator = new VideoSlotWinCalculator(config);
        const generator = {
            generateSymbolsCombination: (): SymbolsCombination<string> =>
                new SymbolsCombination<string>().fromMatrix([
                    ["A", "A", "A"],
                    ["A", "K", "Q"],
                    ["A", "K", "Q"],
                    ["K", "Q", "J"],
                    ["Q", "J", "10"],
                ]),
        };
        return new VideoSlotSession(config, generator, winCalculator);
    }

    test("a winning round's payload (including winEvaluationResult and legacy win maps) roundtrips through JSON unchanged", () => {
        const session = buildWinningSession();
        session.play();
        expect(session.getWinAmount()).toBeGreaterThan(0);

        const serializer = new VideoSlotSessionSerializer();
        const roundData = serializer.getRoundData(session);
        const initialData = serializer.getInitialData(session);

        expect(roundtripThroughJson(roundData)).toEqual(roundData);
        expect(roundtripThroughJson(initialData)).toEqual(initialData);
    });

    test("nested win entries are plain data, not class instances, both before and after the roundtrip", () => {
        const session = buildWinningSession();
        session.play();

        const roundData = new VideoSlotSessionSerializer().getRoundData(session);
        expect(Object.keys(roundData.winningLines ?? {}).length).toBeGreaterThan(0);

        Object.values(roundData.winningLines ?? {}).forEach((line) => expect(isPlainObject(line)).toBe(true));
        expect(roundData.winEvaluationResult?.lineWins.every(isPlainObject)).toBe(true);

        const afterRoundtrip = roundtripThroughJson(roundData);
        Object.values(afterRoundtrip.winningLines ?? {}).forEach((line) => expect(isPlainObject(line)).toBe(true));
    });

    test("win-type fields are genuinely conditional: absent (not an empty object) when that win type didn't occur", () => {
        const config = new VideoSlotConfig();
        const winCalculator = new VideoSlotWinCalculator(config);
        const generator = {
            generateSymbolsCombination: (): SymbolsCombination<string> =>
                new SymbolsCombination<string>().fromMatrix([
                    ["Q", "J", "10"],
                    ["J", "9", "Q"],
                    ["10", "Q", "J"],
                    ["9", "10", "Q"],
                    ["J", "Q", "9"],
                ]),
        };
        const session = new VideoSlotSession(config, generator, winCalculator);
        session.play();
        expect(session.getWinAmount()).toBe(0);

        const roundData = new VideoSlotSessionSerializer().getRoundData(session);
        expect(roundData.winningLines).toBeUndefined();
        expect(roundData.winningScatters).toBeUndefined();
        expect(roundData.winningClusters).toBeUndefined();
        expect(roundData.winningValues).toBeUndefined();
        expect(roundData.winningWays).toBeUndefined();

        // a JSON roundtrip must not resurrect these as empty objects, nor leave stray `undefined` keys
        const serialized = JSON.stringify(roundData);
        expect(serialized).not.toContain("winningLines");
        expect(serialized).not.toContain("undefined");
    });
});

describe("VideoSlotWithFreeGamesSessionSerializer", () => {
    test("free-games fields are always-present numbers that roundtrip through JSON unchanged", () => {
        const session = new VideoSlotWithFreeGamesSession();
        session.play();

        const serializer = new VideoSlotWithFreeGamesSessionSerializer();
        const roundData = serializer.getRoundData(session);
        const initialData = serializer.getInitialData(session);

        expect(typeof roundData.freeGamesNum).toBe("number");
        expect(typeof roundData.freeGamesSum).toBe("number");
        expect(typeof roundData.freeGamesBank).toBe("number");
        expect(typeof roundData.wonFreeGamesNumber).toBe("number");

        expect(roundtripThroughJson(roundData)).toEqual(roundData);
        expect(roundtripThroughJson(initialData)).toEqual(initialData);

        const serializedRound = JSON.stringify(roundData);
        const serializedInitial = JSON.stringify(initialData);
        expect(serializedRound).not.toContain("undefined");
        expect(serializedInitial).not.toContain("undefined");
    });
});
