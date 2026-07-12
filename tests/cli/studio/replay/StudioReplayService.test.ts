import {GameSessionHandling, loadPokieGame, PokieGame, PokieGameManifest} from "pokie";
import path from "path";
import {InMemoryStudioReplayRepository} from "../../../../cli/studio/replay/InMemoryStudioReplayRepository.js";
import {StudioReplayService} from "../../../../cli/studio/replay/StudioReplayService.js";

// FNV-1a, same hashing trick the "playable-game" fixture uses to turn a --seed string into a
// deterministic 32-bit int.
function hashSeed(seed: string | undefined): number {
    let hash = 0x811c9dc5;
    for (const char of String(seed ?? "")) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

type SessionWithScreen = GameSessionHandling & {getSymbolsCombination(): {toMatrix(): unknown[][]}};

// Genuinely seed-dependent: the same seed always plays out the exact same way; a different seed
// plays out differently. Used for the reproducibility tests.
function createSeedAwareFakeGame(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: (context) => {
            const seedValue = hashSeed(context?.seed === undefined ? undefined : String(context.seed));
            let credits = 1000;
            let bet = 1;
            let round = 0;
            let winAmount = 0;
            let screen: unknown[][] = [["-"]];
            const session: SessionWithScreen = {
                getCreditsAmount: () => credits,
                setCreditsAmount: (value: number) => {
                    credits = value;
                },
                getBet: () => bet,
                setBet: (value: number) => {
                    bet = value;
                },
                getAvailableBets: () => [1],
                canPlayNextGame: () => true,
                play: () => {
                    round++;
                    const symbol = (seedValue + round) % 5;
                    winAmount = symbol === 0 ? bet * 10 : 0;
                    screen = [[`sym-${symbol}-round-${round}`]];
                    credits = credits - bet + winAmount;
                },
                getWinAmount: () => winAmount,
                getSymbolsCombination: () => ({toMatrix: () => screen}),
            };
            return session;
        },
    };
}

// Ignores whatever seed it's given entirely — always plays out exactly the same way.
function createSeedIgnoringFakeGame(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            let credits = 1000;
            let bet = 1;
            let round = 0;
            let winAmount = 0;
            const session: SessionWithScreen = {
                getCreditsAmount: () => credits,
                setCreditsAmount: (value: number) => {
                    credits = value;
                },
                getBet: () => bet,
                setBet: (value: number) => {
                    bet = value;
                },
                getAvailableBets: () => [1],
                canPlayNextGame: () => true,
                play: () => {
                    round++;
                    winAmount = round % 3 === 0 ? bet * 4 : 0;
                    credits = credits - bet + winAmount;
                },
                getWinAmount: () => winAmount,
                getSymbolsCombination: () => ({toMatrix: () => [["fixed"]]}),
            };
            return session;
        },
    };
}

// No getSymbolsCombination() at all — the base GameSessionHandling contract has no screen accessor.
function createFakeGameWithoutScreen(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            let credits = 1000;
            const bet = 1;
            let winAmount = 0;
            return {
                getCreditsAmount: () => credits,
                setCreditsAmount: (value: number) => {
                    credits = value;
                },
                getBet: () => bet,
                setBet: () => undefined,
                getAvailableBets: () => [1],
                canPlayNextGame: () => true,
                play: () => {
                    winAmount = 0;
                    credits -= bet;
                },
                getWinAmount: () => winAmount,
            };
        },
    };
}

describe("StudioReplayService", () => {
    const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

    it("records a replay for a deterministic game and returns the full descriptor", async () => {
        const service = new StudioReplayService(new InMemoryStudioReplayRepository(), () => Promise.resolve(createSeedAwareFakeGame(manifest)));

        const result = await service.run("/a", {round: 5, seed: "demo"});

        expect(result.status).toBe("ok");
        if (result.status !== "ok") {
            return;
        }
        expect(result.record.projectRoot).toBe("/a");
        expect(result.record.descriptor.game).toEqual(manifest);
        expect(result.record.descriptor.round).toBe(5);
        expect(result.record.descriptor.seed).toBe("demo");
        expect(result.record.descriptor.totalBet).toBe(5);
        expect(result.record.descriptor.screen).toEqual([[expect.stringContaining("round-5")]]);
    });

    it("produces the exact same descriptor for the same seed/round (reproducibility)", async () => {
        const service = new StudioReplayService(new InMemoryStudioReplayRepository(), () => Promise.resolve(createSeedAwareFakeGame(manifest)));

        const first = await service.run("/a", {round: 10, seed: "reproducible"});
        const second = await service.run("/a", {round: 10, seed: "reproducible"});

        if (first.status !== "ok" || second.status !== "ok") {
            throw new Error("expected both replays to succeed");
        }
        expect(second.record.descriptor).toEqual({...first.record.descriptor, timestamp: second.record.descriptor.timestamp});
        expect(second.record.descriptor.totalWin).toBe(first.record.descriptor.totalWin);
        expect(second.record.descriptor.screen).toEqual(first.record.descriptor.screen);
    });

    it("produces a different result for a different seed", async () => {
        const service = new StudioReplayService(new InMemoryStudioReplayRepository(), () => Promise.resolve(createSeedAwareFakeGame(manifest)));

        const first = await service.run("/a", {round: 10, seed: "seed-one"});
        const second = await service.run("/a", {round: 10, seed: "seed-two"});

        if (first.status !== "ok" || second.status !== "ok") {
            throw new Error("expected both replays to succeed");
        }
        expect(second.record.descriptor.screen).not.toEqual(first.record.descriptor.screen);
    });

    it("still succeeds for a game that ignores the seed entirely", async () => {
        const service = new StudioReplayService(new InMemoryStudioReplayRepository(), () => Promise.resolve(createSeedIgnoringFakeGame(manifest)));

        const first = await service.run("/a", {round: 6, seed: "any-seed"});
        const second = await service.run("/a", {round: 6, seed: "a-completely-different-seed"});

        if (first.status !== "ok" || second.status !== "ok") {
            throw new Error("expected both replays to succeed");
        }
        // The seed itself is still recorded verbatim even though the game ignored it...
        expect(first.record.descriptor.seed).toBe("any-seed");
        // ...but the actual outcome is identical either way, since the game never reads it.
        expect(second.record.descriptor.totalWin).toBe(first.record.descriptor.totalWin);
        expect(second.record.descriptor.screen).toEqual(first.record.descriptor.screen);
    });

    it("records screen: null for a session without getSymbolsCombination()", async () => {
        const service = new StudioReplayService(new InMemoryStudioReplayRepository(), () => Promise.resolve(createFakeGameWithoutScreen(manifest)));

        const result = await service.run("/a", {round: 3});

        expect(result.status).toBe("ok");
        if (result.status !== "ok") {
            return;
        }
        expect(result.record.descriptor.screen).toBeNull();
    });

    it("returns a safe error result (no stack trace) when loading the game fails", async () => {
        const service = new StudioReplayService(
            new InMemoryStudioReplayRepository(),
            () => Promise.reject(new Error("Cannot find module './dist/index.js'")),
        );

        const result = await service.run("/a", {round: 3});

        expect(result).toEqual({status: "error", error: "Cannot find module './dist/index.js'"});
    });

    it("returns a safe error result when the session throws mid-replay", async () => {
        const throwingGame: PokieGame = {
            getManifest: () => manifest,
            createSession: () => ({
                getCreditsAmount: () => 1000,
                setCreditsAmount: () => undefined,
                getBet: () => 1,
                setBet: () => undefined,
                getAvailableBets: () => [1],
                canPlayNextGame: () => true,
                play: () => {
                    throw new Error("session blew up");
                },
                getWinAmount: () => 0,
            }),
        };
        const service = new StudioReplayService(new InMemoryStudioReplayRepository(), () => Promise.resolve(throwingGame));

        const result = await service.run("/a", {round: 3});

        expect(result).toEqual({status: "error", error: "session blew up"});
    });

    it("returns a safe error result for an invalid round rejected by ReplayRecorder itself", async () => {
        // ReplayRecorder.record() itself also validates round >= 1 — this exercises that path
        // directly (StudioServer's own validateReplayRequest is a separate, earlier check).
        const service = new StudioReplayService(new InMemoryStudioReplayRepository(), () => Promise.resolve(createSeedAwareFakeGame(manifest)));

        const result = await service.run("/a", {round: 0 as unknown as number});

        expect(result.status).toBe("error");
    });

    describe("getReplay / listReplays", () => {
        it("retrieves a previously recorded replay by id", async () => {
            const service = new StudioReplayService(new InMemoryStudioReplayRepository(), () => Promise.resolve(createSeedAwareFakeGame(manifest)));
            const result = await service.run("/a", {round: 3, seed: "demo"});
            if (result.status !== "ok") {
                throw new Error("expected replay to succeed");
            }

            expect(service.getReplay("/a", result.record.id)).toEqual(result.record);
        });

        it("returns undefined for an unknown id", () => {
            const service = new StudioReplayService();

            expect(service.getReplay("/a", "does-not-exist")).toBeUndefined();
        });

        it("returns undefined (not a leak) when the id belongs to a different project", async () => {
            const service = new StudioReplayService(new InMemoryStudioReplayRepository(), () => Promise.resolve(createSeedAwareFakeGame(manifest)));
            const result = await service.run("/a", {round: 3});
            if (result.status !== "ok") {
                throw new Error("expected replay to succeed");
            }

            expect(service.getReplay("/b", result.record.id)).toBeUndefined();
        });

        it("lists a project's replays with the expected summary fields", async () => {
            const service = new StudioReplayService(new InMemoryStudioReplayRepository(), () => Promise.resolve(createSeedAwareFakeGame(manifest)));
            await service.run("/a", {round: 3, seed: "demo"});

            const entries = service.listReplays("/a");

            expect(entries).toHaveLength(1);
            expect(entries[0]).toMatchObject({game: manifest, round: 3, seed: "demo"});
            expect(typeof entries[0].totalBet).toBe("number");
            expect(typeof entries[0].timestamp).toBe("number");
        });

        it("never lists another project's replays", async () => {
            const service = new StudioReplayService(new InMemoryStudioReplayRepository(), () => Promise.resolve(createSeedAwareFakeGame(manifest)));
            await service.run("/a", {round: 3});

            expect(service.listReplays("/b")).toEqual([]);
        });
    });
});

describe("StudioReplayService (integration, real loadPokieGame + fixture game package)", () => {
    const fixtureRoot = path.join(__dirname, "..", "..", "fixtures", "playable-game");

    it("produces a real, reproducible replay against a real fixture game", async () => {
        const service = new StudioReplayService(new InMemoryStudioReplayRepository(), loadPokieGame);

        const first = await service.run(fixtureRoot, {round: 10, seed: "demo"});
        const second = await service.run(fixtureRoot, {round: 10, seed: "demo"});

        if (first.status !== "ok" || second.status !== "ok") {
            throw new Error("expected both replays to succeed");
        }
        expect(first.record.descriptor.game).toEqual({id: "playable-game", name: "Playable Game", version: "1.0.0"});
        expect(second.record.descriptor.totalBet).toBe(first.record.descriptor.totalBet);
        expect(second.record.descriptor.totalWin).toBe(first.record.descriptor.totalWin);
        expect(second.record.descriptor.screen).toEqual(first.record.descriptor.screen);
    });

    it("returns a clear error for an invalid packageRoot", async () => {
        const service = new StudioReplayService(new InMemoryStudioReplayRepository(), loadPokieGame);

        const result = await service.run(path.join(__dirname, "does-not-exist"), {round: 3});

        expect(result.status).toBe("error");
        if (result.status === "error") {
            expect(result.error).toContain("package.json");
        }
    });
});
