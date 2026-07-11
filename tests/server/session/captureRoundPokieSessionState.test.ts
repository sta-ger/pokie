import {captureRoundPokieSessionState, GameSessionHandling, GameSessionSerializing, PokieSessionState} from "pokie";

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

const emptyPreviousState: PokieSessionState = {bet: 5, win: 0};

describe("captureRoundPokieSessionState", () => {
    it("omits roundPayload entirely when no serializer is given", () => {
        const state = captureRoundPokieSessionState(undefined, createFakeSession(), emptyPreviousState);

        expect("roundPayload" in state).toBe(false);
    });

    it("captures the serializer's getRoundData output as roundPayload when a serializer is given", () => {
        const session = createFakeSession();
        const payload = {credits: 1000, bet: 5, win: 0, extra: "round-specific"};
        const serializer: GameSessionSerializing = {
            getInitialData: () => {
                throw new Error("not used in this test");
            },
            getRoundData: () => payload,
        };

        const state = captureRoundPokieSessionState(undefined, session, emptyPreviousState, serializer);

        expect(state.roundPayload).toEqual(payload);
    });

    it("carries the previous state's initialPayload forward unchanged", () => {
        const initialPayload = {availableSymbols: ["A", "B"], paytable: {}};
        const previousState: PokieSessionState = {bet: 5, win: 0, initialPayload};
        const serializer: GameSessionSerializing = {
            getInitialData: () => {
                throw new Error("not used in this test");
            },
            getRoundData: () => ({credits: 1000, bet: 5, win: 10}),
        };

        const state = captureRoundPokieSessionState(undefined, createFakeSession(), previousState, serializer);

        expect(state.initialPayload).toBe(initialPayload);
        expect(state.roundPayload).toEqual({credits: 1000, bet: 5, win: 10});
    });

    it("leaves initialPayload unset when the previous state never had one", () => {
        const state = captureRoundPokieSessionState(undefined, createFakeSession(), emptyPreviousState);

        expect("initialPayload" in state).toBe(false);
    });

    it("omits roundDebugPayload when the serializer doesn't implement getRoundDebugData", () => {
        const serializer: GameSessionSerializing = {
            getInitialData: () => {
                throw new Error("not used in this test");
            },
            getRoundData: () => ({credits: 1000, bet: 5, win: 0}),
        };

        const state = captureRoundPokieSessionState(undefined, createFakeSession(), emptyPreviousState, serializer);

        expect("roundDebugPayload" in state).toBe(false);
    });

    it("captures the serializer's getRoundDebugData output as roundDebugPayload when implemented", () => {
        const debugPayload = {rngSeed: "seed-round", reelStops: [1, 2, 3]};
        const serializer: GameSessionSerializing = {
            getInitialData: () => {
                throw new Error("not used in this test");
            },
            getRoundData: () => ({credits: 1000, bet: 5, win: 0}),
            getRoundDebugData: () => debugPayload,
        };

        const state = captureRoundPokieSessionState(undefined, createFakeSession(), emptyPreviousState, serializer);

        expect(state.roundDebugPayload).toEqual(debugPayload);
    });

    it("carries the previous state's initialDebugPayload forward unchanged", () => {
        const initialDebugPayload = {rngSeed: "seed-initial"};
        const previousState: PokieSessionState = {bet: 5, win: 0, initialDebugPayload};
        const serializer: GameSessionSerializing = {
            getInitialData: () => {
                throw new Error("not used in this test");
            },
            getRoundData: () => ({credits: 1000, bet: 5, win: 10}),
        };

        const state = captureRoundPokieSessionState(undefined, createFakeSession(), previousState, serializer);

        expect(state.initialDebugPayload).toBe(initialDebugPayload);
    });
});
