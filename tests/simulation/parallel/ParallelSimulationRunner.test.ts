import {
    GameSessionHandling,
    ParallelSimulationRunner,
    PokieGame,
    PokieGameManifest,
    SimulationCancelledError,
    SimulationWorkerCoordinator,
    SimulationWorkerCoordinatorRunOptions,
    SimulationWorkerRequest,
    SimulationWorkerResult,
} from "pokie";

const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

function createFakeSession(seed?: string): GameSessionHandling {
    let credits = 1_000_000;
    const bet = 1;
    let round = 0;
    let winAmount = 0;
    // Deterministic per "seed" (or a fixed pattern when unseeded) so two runs with the same seed
    // produce identical statistics — good enough to exercise reproducibility without a real RNG.
    const winEveryNth = seed === undefined ? 5 : (Math.abs(hashCode(seed)) % 4) + 2;

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
            round++;
            winAmount = round % winEveryNth === 0 ? bet * 10 : 0;
            credits = credits - bet + winAmount;
        },
        getWinAmount: () => winAmount,
    };
}

function hashCode(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
    return hash;
}

function createFakeGame(): PokieGame & {createdWith: (PokieGameContext | undefined)[]} {
    const createdWith: (PokieGameContext | undefined)[] = [];
    return {
        getManifest: () => manifest,
        createSession(context) {
            createdWith.push(context);
            return createFakeSession(context?.seed as string | undefined);
        },
        createdWith,
    };
}

type PokieGameContext = {seed?: string | number};

describe("ParallelSimulationRunner (workers=1, in-process)", () => {
    test("plays every requested round using the injected loadGame, without any worker entry point", async () => {
        const game = createFakeGame();
        const runner = new ParallelSimulationRunner("/fake/root", 100, {
            loadGame: () => Promise.resolve(game),
        });

        const result = await runner.run();

        expect(result.workers).toBe(1);
        expect(result.statistics.rounds).toBe(100);
        expect(result.manifest).toEqual(manifest);
        expect(game.createdWith).toEqual([undefined]);
    });

    test("passes the seed through to createSession unchanged (identity derivation)", async () => {
        const game = createFakeGame();
        const runner = new ParallelSimulationRunner("/fake/root", 10, {
            seed: "demo",
            loadGame: () => Promise.resolve(game),
        });

        await runner.run();

        expect(game.createdWith).toEqual([{seed: "demo"}]);
    });

    test("two runs with the same seed produce identical statistics (deterministic)", async () => {
        const runOnce = async () => {
            const game = createFakeGame();
            const runner = new ParallelSimulationRunner("/fake/root", 500, {
                seed: "reproducible",
                loadGame: () => Promise.resolve(game),
            });
            return (await runner.run()).statistics;
        };

        const first = await runOnce();
        const second = await runOnce();

        expect(second).toEqual(first);
    });

    test("chunkSize defaults to the full round count — no progress callback fires mid-run", async () => {
        const game = createFakeGame();
        const progressCalls: number[] = [];
        const runner = new ParallelSimulationRunner("/fake/root", 50, {
            loadGame: () => Promise.resolve(game),
            onProgress: (n) => progressCalls.push(n),
        });

        await runner.run();

        // A single chunk still reports one progress call (after the only chunk finishes) — the point
        // is that it's exactly one call for the whole run, not one per round or per small batch.
        expect(progressCalls).toEqual([50]);
    });

    test("a smaller chunkSize reports progress incrementally and yields between chunks", async () => {
        const game = createFakeGame();
        const progressCalls: number[] = [];
        let yieldCount = 0;
        const runner = new ParallelSimulationRunner("/fake/root", 25, {
            loadGame: () => Promise.resolve(game),
            chunkSize: 10,
            onProgress: (n) => progressCalls.push(n),
            yieldToEventLoop: () => {
                yieldCount++;
                return Promise.resolve();
            },
        });

        await runner.run();

        expect(progressCalls).toEqual([10, 20, 25]);
        // Yields between chunks, not after the last one.
        expect(yieldCount).toBe(2);
    });

    test("an already-aborted signal rejects with SimulationCancelledError before doing any work", async () => {
        const controller = new AbortController();
        controller.abort();
        const game = createFakeGame();
        const runner = new ParallelSimulationRunner("/fake/root", 100, {
            loadGame: () => Promise.resolve(game),
            signal: controller.signal,
        });

        await expect(runner.run()).rejects.toBeInstanceOf(SimulationCancelledError);
        expect(game.createdWith).toEqual([]);
    });

    test("aborting between chunks stops the run and rejects with SimulationCancelledError", async () => {
        const game = createFakeGame();
        const controller = new AbortController();
        let chunksCompleted = 0;
        const runner = new ParallelSimulationRunner("/fake/root", 30, {
            loadGame: () => Promise.resolve(game),
            chunkSize: 10,
            onProgress: () => {
                chunksCompleted++;
                if (chunksCompleted === 1) {
                    controller.abort();
                }
            },
            signal: controller.signal,
        });

        await expect(runner.run()).rejects.toBeInstanceOf(SimulationCancelledError);
        expect(chunksCompleted).toBe(1);
    });

    test("rejects a non-integer/out-of-range workers value with a clear validation error", async () => {
        const game = createFakeGame();
        const makeRunner = (workers: number) =>
            new ParallelSimulationRunner("/fake/root", 10, {loadGame: () => Promise.resolve(game), workers});

        await expect(makeRunner(0).run()).rejects.toThrow(/workers.*integer between 1 and/i);
        await expect(makeRunner(2.5).run()).rejects.toThrow(/workers.*integer between 1 and/i);
        await expect(makeRunner(10_000).run()).rejects.toThrow(/workers.*integer between 1 and/i);
    });
});

// workers>1 tests below all inject a fake SimulationWorkerCoordinator (via createWorkerCoordinator) to
// exercise ParallelSimulationRunner's own orchestration logic (round splitting, seed derivation,
// progress aggregation, error/signal propagation) without spawning a single real OS thread — real
// worker threads are covered by tests/simulation/parallel/simulationWorkerEntry.test.ts (the worker
// entry point in isolation) and the npm tarball smoke test (tests/packaging/npmPackSmoke.test.ts),
// which is also the one place that exercises ParallelSimulationRunner's own *default* worker entry
// resolution for real — that default only ever resolves to a real file inside an actual built dist/
// tree (see src/simulation/parallel/internal/defaultWorkerEntryUrl.ts), which ts-jest's source-only
// module resolution can't provide.
describe("ParallelSimulationRunner (workers>1, via injected coordinator)", () => {
    function makeAccumulatorSnapshot(rounds: number) {
        return {
            rounds,
            hitCount: 0,
            totalBet: rounds,
            totalPayout: 0,
            maxWin: 0,
            meanPayout: 0,
            meanSquareDelta: 0,
            meanReturnRatio: 0,
            meanReturnRatioSquareDelta: 0,
            payoutHistogram: {},
        };
    }

    function makeFakeCoordinator(
        handleRun: (requests: SimulationWorkerRequest[], options: SimulationWorkerCoordinatorRunOptions) => Promise<SimulationWorkerResult[]>,
    ): SimulationWorkerCoordinator {
        return {run: handleRun} as unknown as SimulationWorkerCoordinator;
    }

    test("passes workerEntryUrl through to createWorkerCoordinator unchanged — undefined when not given, so the coordinator falls back to its own default", async () => {
        let receivedUrl: URL | undefined = new URL("file:///should-be-overwritten");
        const runner = new ParallelSimulationRunner("/fake/root", 10, {
            workers: 2,
            createWorkerCoordinator: (workerEntryUrl) => {
                receivedUrl = workerEntryUrl;
                return makeFakeCoordinator((requests) =>
                    Promise.resolve(
                        requests.map((request) => ({
                            workerIndex: request.workerIndex,
                            manifest,
                            accumulator: makeAccumulatorSnapshot(request.rounds),
                            roundsCompleted: request.rounds,
                        })),
                    ),
                );
            },
        });

        await runner.run();

        expect(receivedUrl).toBeUndefined();
    });

    test("splits rounds across workers and derives per-worker seeds, then merges the results", async () => {
        let capturedRequests: SimulationWorkerRequest[] = [];
        const runner = new ParallelSimulationRunner("/fake/root", 10, {
            seed: "demo",
            workers: 4,
            createWorkerCoordinator: () =>
                makeFakeCoordinator((requests) => {
                    capturedRequests = requests;
                    return Promise.resolve(
                        requests.map((request) => ({
                            workerIndex: request.workerIndex,
                            manifest,
                            accumulator: makeAccumulatorSnapshot(request.rounds),
                            roundsCompleted: request.rounds,
                        })),
                    );
                }),
        });

        const result = await runner.run();

        expect(capturedRequests).toHaveLength(4);
        expect(capturedRequests.map((r) => r.rounds).sort((a, b) => b - a)).toEqual([3, 3, 2, 2]);
        expect(new Set(capturedRequests.map((r) => r.seed)).size).toBe(4); // every worker gets a distinct seed
        expect(result.workers).toBe(4);
        expect(result.statistics.rounds).toBe(10);
        expect(result.manifest).toEqual(manifest);
    });

    test("never spawns a worker for a zero-round share (rounds < workers)", async () => {
        let capturedRequests: SimulationWorkerRequest[] = [];
        const runner = new ParallelSimulationRunner("/fake/root", 2, {
            workers: 5,
            createWorkerCoordinator: () =>
                makeFakeCoordinator((requests) => {
                    capturedRequests = requests;
                    return Promise.resolve(
                        requests.map((request) => ({
                            workerIndex: request.workerIndex,
                            manifest,
                            accumulator: makeAccumulatorSnapshot(request.rounds),
                            roundsCompleted: request.rounds,
                        })),
                    );
                }),
        });

        const result = await runner.run();

        expect(capturedRequests).toHaveLength(2);
        expect(result.statistics.rounds).toBe(2);
    });

    test("propagates a coordinator failure (e.g. a worker failure) as-is", async () => {
        const failure = new Error("worker 2 failed: package load error");
        const runner = new ParallelSimulationRunner("/fake/root", 10, {
            workers: 3,
            createWorkerCoordinator: () => makeFakeCoordinator(() => Promise.reject(failure)),
        });

        await expect(runner.run()).rejects.toBe(failure);
    });

    test("forwards an AbortSignal through to the coordinator", async () => {
        const controller = new AbortController();
        let receivedSignal: AbortSignal | undefined;
        const runner = new ParallelSimulationRunner("/fake/root", 10, {
            workers: 2,
            signal: controller.signal,
            createWorkerCoordinator: () =>
                makeFakeCoordinator((requests, options) => {
                    receivedSignal = options.signal;
                    return Promise.resolve(
                        requests.map((request) => ({
                            workerIndex: request.workerIndex,
                            manifest,
                            accumulator: makeAccumulatorSnapshot(request.rounds),
                            roundsCompleted: request.rounds,
                        })),
                    );
                }),
        });

        await runner.run();

        expect(receivedSignal).toBe(controller.signal);
    });

    test("reports aggregate progress across workers as each one reports in", async () => {
        const progressUpdates: number[] = [];
        const runner = new ParallelSimulationRunner("/fake/root", 10, {
            workers: 2,
            onProgress: (n) => progressUpdates.push(n),
            createWorkerCoordinator: () =>
                makeFakeCoordinator((requests, options) => {
                    options.onProgress?.({workerIndex: 0, roundsCompleted: 3});
                    options.onProgress?.({workerIndex: 1, roundsCompleted: 2});
                    options.onProgress?.({workerIndex: 0, roundsCompleted: 5});
                    return Promise.resolve(
                        requests.map((request) => ({
                            workerIndex: request.workerIndex,
                            manifest,
                            accumulator: makeAccumulatorSnapshot(request.rounds),
                            roundsCompleted: request.rounds,
                        })),
                    );
                }),
        });

        await runner.run();

        expect(progressUpdates).toEqual([3, 5, 7]);
    });
});

describe("ParallelSimulationRunner betModeId (workers=1, in-process)", () => {
    function createBetModeAwareFakeGame(): PokieGame & {selectedModesSeen: string[]} {
        const selectedModesSeen: string[] = [];
        return {
            getManifest: () => manifest,
            selectedModesSeen,
            createSession() {
                let credits = 1_000_000;
                let bet = 1;
                let round = 0;
                let winAmount = 0;
                let currentMode = "base";
                const modes: Record<string, number> = {base: 1, ante: 1.25};

                return {
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
                    getBetModeId: () => currentMode,
                    setBetMode: (modeId: string) => {
                        if (!(modeId in modes)) {
                            throw new Error(`unknown mode ${modeId}`);
                        }
                        currentMode = modeId;
                        selectedModesSeen.push(modeId);
                    },
                    getStakeAmount: () => bet * modes[currentMode],
                    play: () => {
                        round++;
                        winAmount = round % 5 === 0 ? bet * 10 : 0;
                        credits = credits - bet * modes[currentMode] + winAmount;
                    },
                    getWinAmount: () => winAmount,
                } as unknown as GameSessionHandling;
            },
        };
    }

    test("without betModeId, the session's mode is never touched", async () => {
        const game = createBetModeAwareFakeGame();
        const runner = new ParallelSimulationRunner("/fake/root", 20, {loadGame: () => Promise.resolve(game)});

        const result = await runner.run();

        expect(game.selectedModesSeen).toEqual([]);
        expect(result.betMode).toBeUndefined();
    });

    test("with betModeId, the mode is (re-)selected before every round and echoed back on the result", async () => {
        const game = createBetModeAwareFakeGame();
        const runner = new ParallelSimulationRunner("/fake/root", 20, {
            loadGame: () => Promise.resolve(game),
            betModeId: "ante",
        });

        const result = await runner.run();

        expect(game.selectedModesSeen.every((mode) => mode === "ante")).toBe(true);
        expect(game.selectedModesSeen.length).toBe(20);
        expect(result.betMode).toBe("ante");
        // ante's 1.25x actually drove the session's own getStakeAmount() reporting, reflected in the
        // (stake-based, since betModeId was set) breakdown -- never recomputed by the runner itself.
        expect(result.breakdown!.base.totalBet).toBeCloseTo(1.25 * 20, 10);
    });

    // Regression: a caller who explicitly asked to lock this run to a bet mode must never get back a
    // report for a plain base-game run silently mislabeled with the requested mode.
    test("betModeId against a game/session that doesn't support bet modes at all fails clearly, not silently as base", async () => {
        const game: PokieGame = {
            getManifest: () => manifest,
            createSession: () => createFakeSession(),
        };
        const runner = new ParallelSimulationRunner("/fake/root", 20, {
            loadGame: () => Promise.resolve(game),
            betModeId: "ante",
        });

        await expect(runner.run()).rejects.toThrow(/does not support bet mode selection/);
        await expect(runner.run()).rejects.toThrow(/"ante"/);
    });
});
