import {capturePokieSessionState, GameSessionHandling, GameSessionSerializing} from "pokie";

function createFakeSession(): GameSessionHandling {
    return {
        getCreditsAmount: () => 1000,
        setCreditsAmount: () => undefined,
        getBet: () => 5,
        setBet: () => undefined,
        getAvailableBets: () => [5],
        canPlayNextGame: () => true,
        play: () => undefined,
        getWinAmount: () => 0,
    };
}

describe("capturePokieSessionState", () => {
    it("omits serializedPayload entirely when no serializer is given", () => {
        const state = capturePokieSessionState(undefined, createFakeSession());

        expect("serializedPayload" in state).toBe(false);
    });

    it("captures the serializer's getInitialData output as serializedPayload when a serializer is given", () => {
        const session = createFakeSession();
        const payload = {credits: 1000, bet: 5, availableBets: [5], extra: "game-specific"};
        const serializer: GameSessionSerializing = {
            getInitialData: () => payload,
            getRoundData: () => {
                throw new Error("not used in this test");
            },
        };

        const state = capturePokieSessionState(undefined, session, serializer);

        expect(state.serializedPayload).toEqual(payload);
    });
});
