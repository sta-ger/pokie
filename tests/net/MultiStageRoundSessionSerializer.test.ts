import {GameSession, GameSessionConfig, GameSessionHandling, MultiStageRoundSessionSerializer} from "pokie";

function roundtripThroughJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

// A minimal concrete subclass exercising the generic base directly — not tied to cascades or
// video slots at all, proving the base is a genuinely reusable foundation for any "one round is a
// sequence of stages" mechanic (requirement: a universal base, not a cascade-specific one).
type FakeStage = {label: string};

class FakeMultiStageSerializer extends MultiStageRoundSessionSerializer<GameSessionHandling, FakeStage> {
    protected getStages(): FakeStage[] {
        return [{label: "first"}, {label: "second"}];
    }
}

describe("MultiStageRoundSessionSerializer", () => {
    it("attaches stages on top of the base serializer's own round data", () => {
        const session = new GameSession(new GameSessionConfig());
        session.play();

        const serializer = new FakeMultiStageSerializer({
            getInitialData: (s: GameSessionHandling) => ({credits: s.getCreditsAmount(), bet: s.getBet(), availableBets: s.getAvailableBets()}),
            getRoundData: (s: GameSessionHandling) => ({credits: s.getCreditsAmount(), bet: s.getBet()}),
        });

        const roundData = serializer.getRoundData(session);
        expect(roundData.stages).toEqual([{label: "first"}, {label: "second"}]);
        expect(roundData.credits).toBe(session.getCreditsAmount());
        expect(roundData.bet).toBe(session.getBet());
    });

    it("attaches stages on top of the base serializer's own initial data too", () => {
        const session = new GameSession(new GameSessionConfig());

        const serializer = new FakeMultiStageSerializer({
            getInitialData: (s: GameSessionHandling) => ({credits: s.getCreditsAmount(), bet: s.getBet(), availableBets: s.getAvailableBets()}),
            getRoundData: (s: GameSessionHandling) => ({credits: s.getCreditsAmount(), bet: s.getBet()}),
        });

        const initialData = serializer.getInitialData(session);
        expect(initialData.stages).toEqual([{label: "first"}, {label: "second"}]);
        expect(initialData.availableBets).toEqual(session.getAvailableBets());
        expect(roundtripThroughJson(initialData)).toEqual(initialData);
    });
});
