import {transactionalRoundGame} from "../v2/fixtures/TransactionalRoundGame.js";
import {createOverscanGame} from "../v2/fixtures/OverscanGame.js";
import {GameSessionHandling, loadPokieGame, PokieGame, PokieGameContext, PokieGameManifest, ReplayRecorder, SessionRuntime} from "@fromstan/pokie";
import path from "path";

function createFakeSession(): GameSessionHandling & {getSymbolsCombination(): {toMatrix(): string[][]}} {
    let credits = 1000;
    const bet = 1;
    let round = 0;
    let winAmount = 0;

    return {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: () => undefined,
        getAvailableBets: () => [1],
        canPlayNextGame: () => credits >= bet,
        play: () => {
            round++;
            winAmount = round % 5 === 0 ? bet * 10 : 0;
            credits = credits - bet + winAmount;
        },
        getWinAmount: () => winAmount,
        getSymbolsCombination: () => ({toMatrix: () => [[`round-${round}`]]}),
    };
}

function createFakeGame(manifest: PokieGameManifest): PokieGame & {createdWith?: PokieGameContext} {
    return {
        getManifest: () => manifest,
        createSession(context) {
            this.createdWith = context;
            return createFakeSession();
        },
    };
}

describe("ReplayRecorder", () => {
    const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

    it("throws for a non-positive round", () => {
        const recorder = new ReplayRecorder();

        expect(() => recorder.record({game: createFakeGame(manifest), round: 0})).toThrow(/round must be a positive integer/);
    });

    it("creates the session with the given seed forwarded as context", () => {
        const game = createFakeGame(manifest);
        const recorder = new ReplayRecorder();

        recorder.record({game, seed: "demo", round: 1});

        expect(game.createdWith).toEqual({seed: "demo"});
    });

    it("creates the session without a context when no seed is given", () => {
        const game = createFakeGame(manifest);
        const recorder = new ReplayRecorder();

        recorder.record({game, round: 1});

        expect(game.createdWith).toBeUndefined();
    });

    it("maps the manifest id/name/version into the descriptor's game field", () => {
        const recorder = new ReplayRecorder();

        const descriptor = recorder.record({game: createFakeGame(manifest), round: 1});

        expect(descriptor.game).toEqual({id: "sample-slot", name: "Sample Slot", version: "0.1.0"});
    });

    it("defaults seed to null when not given, and passes it through otherwise", () => {
        const recorder = new ReplayRecorder();

        const withoutSeed = recorder.record({game: createFakeGame(manifest), round: 1});
        const withSeed = recorder.record({game: createFakeGame(manifest), seed: "demo", round: 1});

        expect(withoutSeed.seed).toBeNull();
        expect(withSeed.seed).toBe("demo");
    });

    it("plays forward to the requested round, accumulating totalBet/totalWin along the way", () => {
        const recorder = new ReplayRecorder();

        const descriptor = recorder.record({game: createFakeGame(manifest), round: 5});

        expect(descriptor.round).toBe(5);
        expect(descriptor.totalBet).toBe(5);
        expect(descriptor.totalWin).toBe(10);
    });

    it("captures the screen via getSymbolsCombination() when the session exposes it", () => {
        const recorder = new ReplayRecorder();

        const descriptor = recorder.record({game: createFakeGame(manifest), round: 3});

        expect(descriptor.screen).toEqual([["round-3"]]);
    });

    it("returns a null screen when the session does not expose getSymbolsCombination()", () => {
        const game: PokieGame = {
            getManifest: () => manifest,
            createSession: () => {
                let credits = 1000;
                const bet = 1;
                return {
                    getCreditsAmount: () => credits,
                    setCreditsAmount: (value: number) => {
                        credits = value;
                    },
                    getBet: () => bet,
                    setBet: () => undefined,
                    getAvailableBets: () => [1],
                    canPlayNextGame: () => credits >= bet,
                    play: () => {
                        credits -= bet;
                    },
                    getWinAmount: () => 0,
                };
            },
        };
        const recorder = new ReplayRecorder();

        const descriptor = recorder.record({game, round: 1});

        expect(descriptor.screen).toBeNull();
    });

    it("records a non-negative durationMs and a timestamp", () => {
        const recorder = new ReplayRecorder();
        const before = Date.now();

        const descriptor = recorder.record({game: createFakeGame(manifest), round: 1});

        expect(descriptor.durationMs).toBeGreaterThanOrEqual(0);
        expect(descriptor.timestamp).toBeGreaterThanOrEqual(before);
    });

    it("fails explicitly instead of fabricating an unreachable target round", () => {
        const stoppingGame: PokieGame = {
            getManifest: () => manifest,
            createSession: () => {
                let played = false;
                return {
                    getCreditsAmount: () => 1,
                    setCreditsAmount: () => undefined,
                    getBet: () => 1,
                    setBet: () => undefined,
                    getAvailableBets: () => [1],
                    canPlayNextGame: () => !played,
                    play: () => {
                        played = true;
                    },
                    getWinAmount: () => 0,
                };
            },
        };

        expect(() => new ReplayRecorder().record({game: stoppingGame, round: 2})).toThrow(/target round 2 is unreachable/i);
    });
});

describe("ReplayRecorder (integration, real loadPokieGame + fixture game package)", () => {
    const fixtureRoot = path.join(__dirname, "..", "cli", "fixtures", "playable-game");

    it("replays a real game package's round deterministically for a given seed", async () => {
        const game = await loadPokieGame(fixtureRoot);
        const recorder = new ReplayRecorder();

        const first = recorder.record({game, seed: "demo", round: 3});
        const second = recorder.record({game, seed: "demo", round: 3});

        // timestamp/durationMs are wall-clock and expected to vary between runs; sessionId is also
        // expected to vary since record() mints a brand-new session identity every call (see
        // ReplayDescriptor.sessionId's own doc comment) -- everything else that describes the round
        // itself must match exactly for the same seed + round.
        const {timestamp: firstTimestamp, durationMs: firstDurationMs, sessionId: firstSessionId, ...firstStable} = first;
        const {timestamp: secondTimestamp, durationMs: secondDurationMs, sessionId: secondSessionId, ...secondStable} = second;
        expect(firstStable).toEqual(secondStable);
        expect(firstTimestamp).toBeGreaterThan(0);
        expect(secondTimestamp).toBeGreaterThan(0);
        expect(firstDurationMs).toBeGreaterThanOrEqual(0);
        expect(secondDurationMs).toBeGreaterThanOrEqual(0);
        expect(firstSessionId).not.toBe(secondSessionId);
        expect(first.game).toEqual({id: "playable-game", name: "Playable Game", version: "1.0.0"});
        expect(first.round).toBe(3);
        expect(Array.isArray(first.screen)).toBe(true);
    });

    it("produces a different screen for a different seed", async () => {
        const game = await loadPokieGame(fixtureRoot);
        const recorder = new ReplayRecorder();

        const demo = recorder.record({game, seed: "demo", round: 3});
        const other = recorder.record({game, seed: "another-seed", round: 3});

        expect(demo.screen).not.toEqual(other.screen);
    });
});

describe("fractional logical replay payout", () => {
    it.each([0.05, 7.5, 1e-7].flatMap(bet => [false, true].map(deferred => ({bet, deferred}))))("preserves awards at $bet (deferred=$deferred)", ({bet, deferred}) => {
        const model = deferred ? createOverscanGame({
            manifest: {id: "fractional-bank", name: "Fractional bank", version: "1"},
            reels: 3, rows: 1, availableBets: [0.05, 7.5, 1e-7], symbols: ["A", "S"], wilds: [], scatters: ["S"],
            paylines: [[0, 0, 0]], paytable: {A: {"3": 2}}, reelStrips: Array.from({length: 3}, () => ["A"]),
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {"3": 2}}},
            betModes: [{id: "base", runtimeType: "base", isDefault: true}, {id: "buy", runtimeType: "buyFeature", costMultiplier: 5, forcedFreeGames: 3}],
        }) : transactionalRoundGame();
        const entry = {kind: "spin" as const, bet, ...(deferred ? {mode: "buy"} : {})};
        const session = model.createSession({seed: "7"});
        session.setCreditsAmount(bet * 20);
        const reference = new SessionRuntime(session).execute({...entry, roundId: "reference", delivery: "composite"});
        if (reference.status !== "played" || !reference.logicalRound) throw new Error("Missing logical reference");
        const descriptor = new ReplayRecorder().record({game: model, seed: "7", round: 1, unit: "logical-round", entryCommands: [entry]});
        const actual = descriptor.logicalRound!;
        expect(actual.subrounds.map(step => step.win)).toEqual(reference.logicalRound.subrounds.map(step => step.win));
        for (const [index, step] of actual.subrounds.entries()) expect(Math.abs(step.payout - reference.logicalRound.subrounds[index].payout)).toBeLessThan(bet * 1e-10);
        expect(Math.abs(actual.totalPayout - actual.totalWin)).toBeLessThan(bet * 1e-10);
        if (deferred) {
            expect(actual.subrounds[1].payout).toBe(0);
            expect(actual.subrounds[0].payout).toBe(0);
            expect(actual.subrounds[actual.cursor - 1].payout).toBe(actual.totalWin);
        }
    });
});
