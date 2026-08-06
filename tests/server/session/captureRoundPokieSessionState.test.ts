import {
    buildSessionCapturePolicy,
    captureRoundPokieSessionState,
    GameSessionHandling,
    GameSessionSerializing,
    PokieSessionState,
    RoundArtifactProvenance,
    SymbolsCombination,
    VideoSlotConfig,
    VideoSlotSessionHandling,
    VideoSlotWinCalculator,
    WinEvaluationResult,
} from "pokie";

const provenance: RoundArtifactProvenance = {
    game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
    pokieVersion: "1.3.0",
};

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

function winEvaluationResultWithWin(): WinEvaluationResult<string> {
    const config = new VideoSlotConfig();
    const winCalculator = new VideoSlotWinCalculator(config);
    const symbols = new SymbolsCombination<string>().fromMatrix([
        ["A", "A", "A"],
        ["A", "K", "Q"],
        ["A", "K", "Q"],
        ["K", "Q", "J"],
        ["Q", "J", "10"],
    ]);
    winCalculator.calculateWin(config.getAvailableBets()[0], symbols);
    return winCalculator.getWinEvaluationResult();
}

// A fake covering both plain GameSessionHandling (what captureBaseSessionState itself needs —
// getBet/getWinAmount) and the additional VideoSlotSessionHandling shape (getSymbolsCombination/
// getWinEvaluationResult) buildRoundArtifactFromSession requires — the "full" capture-policy tests
// below need a session real enough to build a genuine RoundArtifact from, not just a placeholder.
function createFakeVideoSlotSession(): GameSessionHandling & VideoSlotSessionHandling<string> {
    const screen = [["A", "A", "A"]];
    return {
        ...createFakeSession(),
        getBet: () => 5,
        getWinAmount: () => 100,
        getSymbolsCombination: () => ({toMatrix: () => screen}),
        getWinEvaluationResult: () => winEvaluationResultWithWin(),
    } as unknown as GameSessionHandling & VideoSlotSessionHandling<string>;
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

    it("omits roundDebugPayload, and stops carrying initialDebugPayload forward, when the policy's captureDebugPayloads is false", () => {
        const initialDebugPayload = {rngSeed: "seed-initial"};
        const previousState: PokieSessionState = {bet: 5, win: 0, initialDebugPayload};
        const serializer: GameSessionSerializing = {
            getInitialData: () => {
                throw new Error("not used in this test");
            },
            getRoundData: () => ({credits: 1000, bet: 5, win: 10}),
            getRoundDebugData: () => ({rngSeed: "seed-round", reelStops: [1, 2, 3]}),
        };

        const state = captureRoundPokieSessionState(
            undefined,
            createFakeSession(),
            previousState,
            serializer,
            buildSessionCapturePolicy("partial", false),
        );

        expect("roundDebugPayload" in state).toBe(false);
        expect("initialDebugPayload" in state).toBe(false);
    });

    describe("SessionCapturePolicy stamping", () => {
        it("defaults to the legacy partial policy (with debug payloads captured) when none is given", () => {
            const state = captureRoundPokieSessionState(undefined, createFakeSession(), emptyPreviousState);

            expect(state.capturePolicy).toEqual({version: 1, mode: "partial", captureDebugPayloads: true});
        });

        it("stamps whatever explicit policy the caller supplies, verbatim", () => {
            const policy = buildSessionCapturePolicy("full", false);

            const state = captureRoundPokieSessionState(undefined, createFakeVideoSlotSession(), emptyPreviousState, undefined, policy, {
                roundId: "r1",
                provenance,
            });

            expect(state.capturePolicy).toEqual(policy);
        });
    });

    describe('mode: "partial" (production default) — never builds a RoundArtifact, even for a video-slot-shaped session', () => {
        it("leaves roundArtifact and roundArtifactUnavailableReason both unset", () => {
            const state = captureRoundPokieSessionState(
                undefined,
                createFakeVideoSlotSession(),
                emptyPreviousState,
                undefined,
                buildSessionCapturePolicy("partial", true),
                {roundId: "r1", provenance},
            );

            expect("roundArtifact" in state).toBe(false);
            expect("roundArtifactUnavailableReason" in state).toBe(false);
        });
    });

    describe('mode: "full" (Studio/dev posture) — builds a complete RoundArtifact off the runtime-produced session state', () => {
        it("builds a RoundArtifact carrying screen/wins/steps/provenance/betMode/stake straight off the session's own win evaluation", () => {
            const session = createFakeVideoSlotSession();
            const state = captureRoundPokieSessionState(
                undefined,
                session,
                emptyPreviousState,
                undefined,
                buildSessionCapturePolicy("full", true),
                {roundId: "round-1", provenance, stake: 5, command: "spin", credits: 995},
            );

            expect(state.roundArtifactUnavailableReason).toBeUndefined();
            const artifact = state.roundArtifact;
            expect(artifact).toBeDefined();
            expect(artifact!.roundId).toBe("round-1");
            expect(artifact!.provenance).toEqual(provenance);
            expect(artifact!.stake).toBe(5);
            expect(artifact!.screen).toEqual([["A", "A", "A"]]);
            expect(artifact!.steps).toHaveLength(1);
            expect(artifact!.wins.length).toBeGreaterThan(0);
            expect(artifact!.totalWin).toBeGreaterThan(0);
        });

        it("carries command/credits/before-after state summaries, and the merged debug payload, in the artifact's own debug bag", () => {
            const previousState: PokieSessionState = {bet: 5, win: 0, screen: [["seed"]]};
            const serializer: GameSessionSerializing = {
                getInitialData: () => ({availableBets: [5], credits: 1000, bet: 5}),
                getRoundData: () => ({credits: 995, bet: 5}),
                getRoundDebugData: () => ({rngSeed: "seed-round"}),
            };

            const state = captureRoundPokieSessionState(
                undefined,
                createFakeVideoSlotSession(),
                previousState,
                serializer,
                buildSessionCapturePolicy("full", true),
                {roundId: "round-2", provenance, stake: 5, command: "spin", credits: 995},
            );

            const debug = state.roundArtifact!.debug as Record<string, unknown>;
            expect(debug.command).toBe("spin");
            expect(debug.credits).toBe(995);
            expect(debug.stateBefore).toEqual({bet: 5, win: 0, screen: [["seed"]]});
            expect(debug.stateAfter).toEqual({bet: 5, win: 100, screen: [["A", "A", "A"]]});
            expect(debug.debugPayloads).toEqual({rngSeed: "seed-round"});
        });

        it("omits debugPayloads from the artifact's debug bag when captureDebugPayloads is false, even though the serializer has debug data", () => {
            const serializer: GameSessionSerializing = {
                getInitialData: () => ({availableBets: [5], credits: 1000, bet: 5}),
                getRoundData: () => ({credits: 1000, bet: 5}),
                getRoundDebugData: () => ({rngSeed: "seed-round"}),
            };

            const state = captureRoundPokieSessionState(
                undefined,
                createFakeVideoSlotSession(),
                emptyPreviousState,
                serializer,
                buildSessionCapturePolicy("full", false),
                {roundId: "round-3", provenance},
            );

            expect("roundDebugPayload" in state).toBe(false);
            const debug = state.roundArtifact!.debug as Record<string, unknown>;
            expect("debugPayloads" in debug).toBe(false);
        });

        it('records an honest roundArtifactUnavailableReason, never a fabricated artifact, when the session is not video-slot shaped', () => {
            const state = captureRoundPokieSessionState(
                undefined,
                createFakeSession(),
                emptyPreviousState,
                undefined,
                buildSessionCapturePolicy("full", true),
                {roundId: "round-4", provenance},
            );

            expect(state.roundArtifact).toBeUndefined();
            expect(state.roundArtifactUnavailableReason).toEqual(expect.stringContaining("VideoSlotSessionHandling"));
        });

        it("records an honest roundArtifactUnavailableReason when no RoundArtifactCaptureRequest was supplied at all", () => {
            const state = captureRoundPokieSessionState(
                undefined,
                createFakeVideoSlotSession(),
                emptyPreviousState,
                undefined,
                buildSessionCapturePolicy("full", true),
            );

            expect(state.roundArtifact).toBeUndefined();
            expect(state.roundArtifactUnavailableReason).toEqual(expect.stringContaining("RoundArtifactCaptureRequest"));
        });
    });

    describe("reading a legacy partial record (captured before SessionCapturePolicy existed)", () => {
        it("never invents capturePolicy/roundArtifact fields for a previous state that never had them — only this call's own fresh capture gets them", () => {
            const legacyPreviousState: PokieSessionState = {bet: 5, win: 0, screen: [["legacy"]]};
            expect("capturePolicy" in legacyPreviousState).toBe(false);
            expect("roundArtifact" in legacyPreviousState).toBe(false);

            const state = captureRoundPokieSessionState(undefined, createFakeSession(), legacyPreviousState);

            // The freshly captured state is stamped with the default (partial) policy, as documented —
            // but nothing about the legacy previousState itself was ever read for, or influenced, that.
            expect(state.capturePolicy).toEqual({version: 1, mode: "partial", captureDebugPayloads: true});
            expect("roundArtifact" in state).toBe(false);
        });
    });
});
