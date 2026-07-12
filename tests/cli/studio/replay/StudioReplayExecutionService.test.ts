import {GameSessionHandling, loadPokieGame, PokieGame, PokieGameManifest, ReplayRecorder} from "pokie";
import path from "path";
import {InMemoryStudioReplayRepository} from "../../../../cli/studio/replay/InMemoryStudioReplayRepository.js";
import {StudioReplayExecutionService} from "../../../../cli/studio/replay/StudioReplayExecutionService.js";
import type {StudioReplayJobView} from "../../../../cli/studio/replay/StudioReplayJobView.js";

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

// Genuinely seed-dependent: the same seed always plays out the exact same way; a different seed plays
// out differently. Used for the reproducibility tests. `failOnRound` (optional) makes the session
// throw on a specific round, for the mid-replay failure test.
function createSeedAwareFakeGame(manifest: PokieGameManifest, options: {failOnRound?: number} = {}): PokieGame {
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
                    if (options.failOnRound !== undefined && round === options.failOnRound) {
                        throw new Error(`fake session failed on round ${round}`);
                    }
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

function flushMacrotask(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

async function waitForTerminal(service: StudioReplayExecutionService, projectRoot: string, id: string): Promise<StudioReplayJobView> {
    for (let i = 0; i < 2000; i++) {
        const job = service.getStatus(projectRoot, id);
        if (job && job.status !== "queued" && job.status !== "running") {
            return job;
        }
        await flushMacrotask();
    }
    throw new Error("Timed out waiting for the replay to reach a terminal state.");
}

// A controllable substitute for the real setImmediate-based yieldToEventLoop: each call queues its own
// resolver rather than resolving immediately, so a test can precisely pause the chunk loop between
// chunks, inspect intermediate progress, then release it one step at a time. Same helper as
// StudioSimulationService.test.ts's own createControlledYield.
function createControlledYield(): {yieldToEventLoop: () => Promise<void>; pendingCount: () => number; release: () => void} {
    const pending: Array<() => void> = [];
    return {
        yieldToEventLoop: () =>
            new Promise<void>((resolve) => {
                pending.push(resolve);
            }),
        pendingCount: () => pending.length,
        release: () => {
            const resolve = pending.shift();
            resolve?.();
        },
    };
}

describe("StudioReplayExecutionService", () => {
    const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

    it("returns a queued job immediately, before any round is played (POST never blocks)", () => {
        let roundsPlayed = 0;
        const game: PokieGame = {
            getManifest: () => manifest,
            createSession: () => ({
                getCreditsAmount: () => 1000,
                setCreditsAmount: () => undefined,
                getBet: () => 1,
                setBet: () => undefined,
                getAvailableBets: () => [1],
                canPlayNextGame: () => true,
                play: () => {
                    roundsPlayed++;
                },
                getWinAmount: () => 0,
            }),
        };
        const service = new StudioReplayExecutionService(new InMemoryStudioReplayRepository(), () => Promise.resolve(game));

        const result = service.start("/a", {round: 100_000});

        expect(result.status).toBe("created");
        if (result.status !== "created") {
            return;
        }
        expect(result.job.status).toBe("queued");
        expect(result.job.completedRounds).toBe(0);
        // Nothing has actually played yet — start() returns before run()'s first `await` settles.
        expect(roundsPlayed).toBe(0);
    });

    it("runs a small replay to completion and produces the full descriptor", async () => {
        const service = new StudioReplayExecutionService(
            new InMemoryStudioReplayRepository(),
            () => Promise.resolve(createSeedAwareFakeGame(manifest)),
        );

        const result = service.start("/a", {round: 5, seed: "demo"});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, "/a", result.job.id);

        expect(job.status).toBe("completed");
        expect(job.completedRounds).toBe(5);
        expect(job.descriptor?.game).toEqual(manifest);
        expect(job.descriptor?.round).toBe(5);
        expect(job.descriptor?.seed).toBe("demo");
        expect(job.descriptor?.totalBet).toBe(5);
        expect(job.descriptor?.screen).toEqual([[expect.stringContaining("round-5")]]);
    });

    it("produces the exact same descriptor for the same seed/round (reproducibility)", async () => {
        const service = new StudioReplayExecutionService(
            new InMemoryStudioReplayRepository(),
            () => Promise.resolve(createSeedAwareFakeGame(manifest)),
        );

        const firstStart = service.start("/a", {round: 10, seed: "reproducible"});
        if (firstStart.status !== "created") {
            throw new Error("expected job to be created");
        }
        const first = await waitForTerminal(service, "/a", firstStart.job.id);

        const secondStart = service.start("/a", {round: 10, seed: "reproducible"});
        if (secondStart.status !== "created") {
            throw new Error("expected job to be created");
        }
        const second = await waitForTerminal(service, "/a", secondStart.job.id);

        expect(second.descriptor).toEqual({
            ...first.descriptor,
            timestamp: second.descriptor?.timestamp,
            durationMs: second.descriptor?.durationMs,
        });
    });

    it("produces a different result for a different seed", async () => {
        const service = new StudioReplayExecutionService(
            new InMemoryStudioReplayRepository(),
            () => Promise.resolve(createSeedAwareFakeGame(manifest)),
        );

        const firstStart = service.start("/a", {round: 10, seed: "seed-one"});
        if (firstStart.status !== "created") {
            throw new Error("expected job to be created");
        }
        const first = await waitForTerminal(service, "/a", firstStart.job.id);

        const secondStart = service.start("/a", {round: 10, seed: "seed-two"});
        if (secondStart.status !== "created") {
            throw new Error("expected job to be created");
        }
        const second = await waitForTerminal(service, "/a", secondStart.job.id);

        expect(second.descriptor?.screen).not.toEqual(first.descriptor?.screen);
    });

    it("still succeeds for a game that ignores the seed entirely", async () => {
        const service = new StudioReplayExecutionService(
            new InMemoryStudioReplayRepository(),
            () => Promise.resolve(createSeedIgnoringFakeGame(manifest)),
        );

        const firstStart = service.start("/a", {round: 6, seed: "any-seed"});
        if (firstStart.status !== "created") {
            throw new Error("expected job to be created");
        }
        const first = await waitForTerminal(service, "/a", firstStart.job.id);

        const secondStart = service.start("/a", {round: 6, seed: "a-completely-different-seed"});
        if (secondStart.status !== "created") {
            throw new Error("expected job to be created");
        }
        const second = await waitForTerminal(service, "/a", secondStart.job.id);

        // The seed itself is still recorded verbatim even though the game ignored it...
        expect(first.descriptor?.seed).toBe("any-seed");
        // ...but the actual outcome is identical either way, since the game never reads it.
        expect(second.descriptor?.totalWin).toBe(first.descriptor?.totalWin);
        expect(second.descriptor?.screen).toEqual(first.descriptor?.screen);
    });

    it("records screen: null for a session without getSymbolsCombination()", async () => {
        const service = new StudioReplayExecutionService(
            new InMemoryStudioReplayRepository(),
            () => Promise.resolve(createFakeGameWithoutScreen(manifest)),
        );

        const result = service.start("/a", {round: 3});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, "/a", result.job.id);

        expect(job.descriptor?.screen).toBeNull();
    });

    it("fails the job with a safe error message (no stack trace) when loading the game throws", async () => {
        const service = new StudioReplayExecutionService(
            new InMemoryStudioReplayRepository(),
            () => Promise.reject(new Error("Cannot find module './dist/index.js'")),
        );

        const result = service.start("/a", {round: 3});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, "/a", result.job.id);

        expect(job.status).toBe("failed");
        expect(job.error).toBe("Cannot find module './dist/index.js'");
        expect(job.completedRounds).toBe(0);
    });

    it("fails the job with a safe error message when the session throws mid-replay", async () => {
        const service = new StudioReplayExecutionService(
            new InMemoryStudioReplayRepository(),
            () => Promise.resolve(createSeedAwareFakeGame(manifest, {failOnRound: 7})),
            5, // chunkSize — round 7 falls inside the second chunk
        );

        const result = service.start("/a", {round: 100});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, "/a", result.job.id);

        expect(job.status).toBe("failed");
        expect(job.error).toBe("fake session failed on round 7");
        expect(JSON.stringify(job)).not.toContain("\\n    at ");
    });

    it("progresses in chunks, yielding to the event loop between each, without recreating the session", async () => {
        const gate = createControlledYield();
        let sessionsCreated = 0;
        const game: PokieGame = {
            getManifest: () => manifest,
            createSession: () => {
                sessionsCreated++;
                let round = 0;
                return {
                    getCreditsAmount: () => 1000,
                    setCreditsAmount: () => undefined,
                    getBet: () => 1,
                    setBet: () => undefined,
                    getAvailableBets: () => [1],
                    canPlayNextGame: () => true,
                    play: () => {
                        round++;
                    },
                    getWinAmount: () => (round % 5 === 0 ? 1 : 0),
                };
            },
        };
        const service = new StudioReplayExecutionService(
            new InMemoryStudioReplayRepository(),
            () => Promise.resolve(game),
            10, // chunkSize
            undefined,
            gate.yieldToEventLoop,
        );

        const result = service.start("/a", {round: 25});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        await flushMacrotask();
        expect(gate.pendingCount()).toBe(1); // paused right after the first chunk (10 rounds)
        expect(service.getStatus("/a", result.job.id)?.completedRounds).toBe(10);
        expect(service.getStatus("/a", result.job.id)?.status).toBe("running");

        gate.release();
        await flushMacrotask();
        expect(service.getStatus("/a", result.job.id)?.completedRounds).toBe(20);

        gate.release();
        await flushMacrotask();
        const job = await waitForTerminal(service, "/a", result.job.id);

        expect(job.status).toBe("completed");
        expect(job.completedRounds).toBe(25);
        expect(sessionsCreated).toBe(1); // the same session was reused for every chunk
    });

    it("returns undefined for an unknown replay id", () => {
        const service = new StudioReplayExecutionService();

        expect(service.getStatus("/a", "does-not-exist")).toBeUndefined();
    });

    it("returns undefined (not a leak) when the id belongs to a different project", async () => {
        const service = new StudioReplayExecutionService(
            new InMemoryStudioReplayRepository(),
            () => Promise.resolve(createSeedAwareFakeGame(manifest)),
        );
        const result = service.start("/a", {round: 3});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        await waitForTerminal(service, "/a", result.job.id);

        expect(service.getStatus("/b", result.job.id)).toBeUndefined();
    });

    it("rejects starting a second replay for the same projectRoot with a conflict", () => {
        const service = new StudioReplayExecutionService(
            new InMemoryStudioReplayRepository(),
            () =>
                new Promise(() => {
                    // never resolves — keeps the first job "queued" forever
                }),
        );

        const first = service.start("/a", {round: 1000});
        if (first.status !== "created") {
            throw new Error("expected the first job to be created");
        }
        const second = service.start("/a", {round: 500});

        expect(second).toEqual({status: "conflict", activeJobId: first.job.id});
    });

    it("allows a new replay for a different projectRoot while one is active", () => {
        const service = new StudioReplayExecutionService(
            new InMemoryStudioReplayRepository(),
            () =>
                new Promise(() => {
                    // never resolves
                }),
        );

        const first = service.start("/a", {round: 1000});
        const second = service.start("/b", {round: 1000});

        expect(first.status).toBe("created");
        expect(second.status).toBe("created");
    });

    it("allows starting a new replay for the same projectRoot once the previous one has completed", async () => {
        const service = new StudioReplayExecutionService(
            new InMemoryStudioReplayRepository(),
            () => Promise.resolve(createSeedAwareFakeGame(manifest)),
        );

        const first = service.start("/a", {round: 5});
        if (first.status !== "created") {
            throw new Error("expected job to be created");
        }
        await waitForTerminal(service, "/a", first.job.id);

        const second = service.start("/a", {round: 5});

        expect(second.status).toBe("created");
    });

    it("cancels a queued/running replay between chunks, stopping further progress", async () => {
        const gate = createControlledYield();
        const service = new StudioReplayExecutionService(
            new InMemoryStudioReplayRepository(),
            () => Promise.resolve(createSeedAwareFakeGame(manifest)),
            10, // chunkSize
            undefined,
            gate.yieldToEventLoop,
        );

        const result = service.start("/a", {round: 25});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        await flushMacrotask();
        expect(gate.pendingCount()).toBe(1); // paused right after the first chunk (10 rounds)
        expect(service.getStatus("/a", result.job.id)?.completedRounds).toBe(10);

        // Cancellation can only take effect between chunks (see StudioReplayExecutionService.run()'s
        // own doc comment) — cancel() requests it (aborting the controller) but the record only
        // actually transitions to "cancelled" once the paused chunk loop notices, after release().
        const cancelled = service.cancel("/a", result.job.id);
        expect(cancelled?.status).toBe("running");

        gate.release();
        await flushMacrotask();

        const job = service.getStatus("/a", result.job.id);
        expect(job?.status).toBe("cancelled");
        // No further chunk ran after the cancel was observed.
        expect(job?.completedRounds).toBe(10);
        expect(job?.descriptor).toBeUndefined();
    });

    it("is idempotent when cancelling an already-terminal replay", async () => {
        const service = new StudioReplayExecutionService(
            new InMemoryStudioReplayRepository(),
            () => Promise.resolve(createSeedAwareFakeGame(manifest)),
        );

        const result = service.start("/a", {round: 5});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        await waitForTerminal(service, "/a", result.job.id);

        const cancelled = service.cancel("/a", result.job.id);

        expect(cancelled?.status).toBe("completed");
    });

    it("returns undefined when cancelling an unknown replay id", () => {
        const service = new StudioReplayExecutionService();

        expect(service.cancel("/a", "does-not-exist")).toBeUndefined();
    });

    it("returns undefined (not a leak) when cancelling an id that belongs to a different project", () => {
        const service = new StudioReplayExecutionService(
            new InMemoryStudioReplayRepository(),
            () =>
                new Promise(() => {
                    // never resolves
                }),
        );
        const result = service.start("/a", {round: 1000});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }

        expect(service.cancel("/b", result.job.id)).toBeUndefined();
    });

    it("cancelAll() stops every active replay across every project", async () => {
        const gate = createControlledYield();
        const service = new StudioReplayExecutionService(
            new InMemoryStudioReplayRepository(),
            () => Promise.resolve(createSeedAwareFakeGame(manifest)),
            10,
            undefined,
            gate.yieldToEventLoop,
        );

        const first = service.start("/a", {round: 25});
        const second = service.start("/b", {round: 25});
        if (first.status !== "created" || second.status !== "created") {
            throw new Error("expected both jobs to be created");
        }
        await flushMacrotask();

        service.cancelAll();
        gate.release();
        gate.release();
        await flushMacrotask();

        expect(service.getStatus("/a", first.job.id)?.status).toBe("cancelled");
        expect(service.getStatus("/b", second.job.id)?.status).toBe("cancelled");
    });

    describe("listJobs", () => {
        it("lists a project's replays with the expected summary fields", async () => {
            const service = new StudioReplayExecutionService(
                new InMemoryStudioReplayRepository(),
                () => Promise.resolve(createSeedAwareFakeGame(manifest)),
            );
            const result = service.start("/a", {round: 3, seed: "demo"});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }
            await waitForTerminal(service, "/a", result.job.id);

            const entries = service.listJobs("/a");

            expect(entries).toHaveLength(1);
            expect(entries[0]).toMatchObject({status: "completed", game: manifest, round: 3, seed: "demo"});
            expect(typeof entries[0].totalBet).toBe("number");
            expect(typeof entries[0].startedAt).toBe("string");
        });

        it("includes a still-running replay in the list, with its game known once loaded", async () => {
            const gate = createControlledYield();
            const service = new StudioReplayExecutionService(
                new InMemoryStudioReplayRepository(),
                () => Promise.resolve(createSeedAwareFakeGame(manifest)),
                10,
                undefined,
                gate.yieldToEventLoop,
            );
            const result = service.start("/a", {round: 25});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }
            await flushMacrotask();

            const entries = service.listJobs("/a");

            expect(entries).toHaveLength(1);
            expect(entries[0]).toMatchObject({status: "running", game: manifest, completedRounds: 10});
        });

        it("never lists another project's replays", async () => {
            const service = new StudioReplayExecutionService(
                new InMemoryStudioReplayRepository(),
                () => Promise.resolve(createSeedAwareFakeGame(manifest)),
            );
            const result = service.start("/a", {round: 3});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }
            await waitForTerminal(service, "/a", result.job.id);

            expect(service.listJobs("/b")).toEqual([]);
        });
    });

    describe("getDownload", () => {
        it("returns the descriptor for a completed replay", async () => {
            const service = new StudioReplayExecutionService(
                new InMemoryStudioReplayRepository(),
                () => Promise.resolve(createSeedAwareFakeGame(manifest)),
            );
            const result = service.start("/a", {round: 3, seed: "demo"});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }
            const job = await waitForTerminal(service, "/a", result.job.id);

            expect(service.getDownload("/a", result.job.id)).toEqual({status: "ok", descriptor: job.descriptor});
        });

        it("returns not-found for an unknown id", () => {
            const service = new StudioReplayExecutionService();

            expect(service.getDownload("/a", "does-not-exist")).toEqual({status: "not-found"});
        });

        it("returns not-found (not a leak) when the id belongs to a different project", async () => {
            const service = new StudioReplayExecutionService(
                new InMemoryStudioReplayRepository(),
                () => Promise.resolve(createSeedAwareFakeGame(manifest)),
            );
            const result = service.start("/a", {round: 3});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }
            await waitForTerminal(service, "/a", result.job.id);

            expect(service.getDownload("/b", result.job.id)).toEqual({status: "not-found"});
        });

        it("returns not-ready for a queued/running replay", () => {
            const service = new StudioReplayExecutionService(
                new InMemoryStudioReplayRepository(),
                () =>
                    new Promise(() => {
                        // never resolves — keeps the job "queued"
                    }),
            );
            const result = service.start("/a", {round: 10});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }

            expect(service.getDownload("/a", result.job.id)).toEqual({status: "not-ready", jobStatus: "queued"});
        });

        it("returns not-ready for a failed replay", async () => {
            const service = new StudioReplayExecutionService(
                new InMemoryStudioReplayRepository(),
                () => Promise.reject(new Error("boom")),
            );
            const result = service.start("/a", {round: 10});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }
            await waitForTerminal(service, "/a", result.job.id);

            expect(service.getDownload("/a", result.job.id)).toEqual({status: "not-ready", jobStatus: "failed"});
        });

        it("returns not-ready for a cancelled replay", async () => {
            const gate = createControlledYield();
            const service = new StudioReplayExecutionService(
                new InMemoryStudioReplayRepository(),
                () => Promise.resolve(createSeedAwareFakeGame(manifest)),
                10,
                undefined,
                gate.yieldToEventLoop,
            );
            const result = service.start("/a", {round: 25});
            if (result.status !== "created") {
                throw new Error("expected job to be created");
            }
            await flushMacrotask();
            service.cancel("/a", result.job.id);
            gate.release();
            await flushMacrotask();

            expect(service.getDownload("/a", result.job.id)).toEqual({status: "not-ready", jobStatus: "cancelled"});
        });
    });
});

describe("StudioReplayExecutionService (integration, real loadPokieGame + fixture game package)", () => {
    const fixtureRoot = path.join(__dirname, "..", "..", "fixtures", "playable-game");

    it("produces a real, reproducible replay against a real fixture game", async () => {
        const service = new StudioReplayExecutionService(new InMemoryStudioReplayRepository(), loadPokieGame);

        const firstStart = service.start(fixtureRoot, {round: 10, seed: "demo"});
        if (firstStart.status !== "created") {
            throw new Error("expected job to be created");
        }
        const first = await waitForTerminal(service, fixtureRoot, firstStart.job.id);

        const secondStart = service.start(fixtureRoot, {round: 10, seed: "demo"});
        if (secondStart.status !== "created") {
            throw new Error("expected job to be created");
        }
        const second = await waitForTerminal(service, fixtureRoot, secondStart.job.id);

        expect(first.descriptor?.game).toEqual({id: "playable-game", name: "Playable Game", version: "1.0.0"});
        expect(second.descriptor?.totalBet).toBe(first.descriptor?.totalBet);
        expect(second.descriptor?.totalWin).toBe(first.descriptor?.totalWin);
        expect(second.descriptor?.screen).toEqual(first.descriptor?.screen);
    });

    it("produces exactly the same descriptor ReplayRecorder itself would, chunked or not", async () => {
        // Small chunkSize so a real round count genuinely spans several chunks/yields, proving the
        // chunked loop's sequence of played rounds is identical to ReplayRecorder's own single
        // uninterrupted loop for the same seed/round.
        const service = new StudioReplayExecutionService(new InMemoryStudioReplayRepository(), loadPokieGame, 4);

        const result = service.start(fixtureRoot, {round: 37, seed: "compare-me"});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, fixtureRoot, result.job.id);

        const game = await loadPokieGame(fixtureRoot);
        const directDescriptor = new ReplayRecorder().record({game, round: 37, seed: "compare-me"});

        expect(job.descriptor).toEqual({...directDescriptor, timestamp: job.descriptor?.timestamp, durationMs: job.descriptor?.durationMs});
    });

    it("returns a clear error for an invalid packageRoot", async () => {
        const service = new StudioReplayExecutionService(new InMemoryStudioReplayRepository(), loadPokieGame);

        const result = service.start(path.join(__dirname, "does-not-exist"), {round: 3});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, path.join(__dirname, "does-not-exist"), result.job.id);

        expect(job.status).toBe("failed");
        expect(job.error).toContain("package.json");
    });
});
