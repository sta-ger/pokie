import {GameSessionHandling, loadPokieGame, PokieGame, PokieGameContext, PokieGameManifest, ReplayRecorder} from "pokie";
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
    const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

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

        expect(descriptor.game).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});
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
});

describe("ReplayRecorder (integration, real loadPokieGame + fixture game package)", () => {
    const fixtureRoot = path.join(__dirname, "..", "cli", "fixtures", "playable-game");

    it("replays a real game package's round deterministically for a given seed", async () => {
        const game = await loadPokieGame(fixtureRoot);
        const recorder = new ReplayRecorder();

        const first = recorder.record({game, seed: "demo", round: 3});
        const second = recorder.record({game, seed: "demo", round: 3});

        // timestamp/durationMs are wall-clock and expected to vary between runs; everything else
        // that describes the round itself must match exactly for the same seed + round.
        const {timestamp: firstTimestamp, durationMs: firstDurationMs, ...firstStable} = first;
        const {timestamp: secondTimestamp, durationMs: secondDurationMs, ...secondStable} = second;
        expect(firstStable).toEqual(secondStable);
        expect(firstTimestamp).toBeGreaterThan(0);
        expect(secondTimestamp).toBeGreaterThan(0);
        expect(firstDurationMs).toBeGreaterThanOrEqual(0);
        expect(secondDurationMs).toBeGreaterThanOrEqual(0);
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
