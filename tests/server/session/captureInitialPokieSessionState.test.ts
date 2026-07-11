import {captureInitialPokieSessionState, GameSessionHandling, GameSessionSerializing} from "pokie";

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

describe("captureInitialPokieSessionState", () => {
    it("omits initialPayload entirely when no serializer is given", () => {
        const state = captureInitialPokieSessionState(undefined, createFakeSession());

        expect("initialPayload" in state).toBe(false);
        expect("roundPayload" in state).toBe(false);
    });

    it("captures the serializer's getInitialData output as initialPayload when a serializer is given", () => {
        const session = createFakeSession();
        const payload = {credits: 1000, bet: 5, availableBets: [5], extra: "game-specific"};
        const serializer: GameSessionSerializing = {
            getInitialData: () => payload,
            getRoundData: () => {
                throw new Error("not used in this test");
            },
        };

        const state = captureInitialPokieSessionState(undefined, session, serializer);

        expect(state.initialPayload).toEqual(payload);
        expect("roundPayload" in state).toBe(false);
    });

    it("omits initialDebugPayload when the serializer doesn't implement getInitialDebugData", () => {
        const serializer: GameSessionSerializing = {
            getInitialData: () => ({credits: 1000, bet: 5, availableBets: [5]}),
            getRoundData: () => {
                throw new Error("not used in this test");
            },
        };

        const state = captureInitialPokieSessionState(undefined, createFakeSession(), serializer);

        expect("initialDebugPayload" in state).toBe(false);
    });

    it("captures the serializer's getInitialDebugData output as initialDebugPayload when implemented", () => {
        const debugPayload = {rngSeed: "seed-1"};
        const serializer: GameSessionSerializing = {
            getInitialData: () => ({credits: 1000, bet: 5, availableBets: [5]}),
            getRoundData: () => {
                throw new Error("not used in this test");
            },
            getInitialDebugData: () => debugPayload,
        };

        const state = captureInitialPokieSessionState(undefined, createFakeSession(), serializer);

        expect(state.initialDebugPayload).toEqual(debugPayload);
    });
});
