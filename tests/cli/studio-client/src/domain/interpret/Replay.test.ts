import {
    describeReplayComparison,
    describeReplayList,
    describeReplayProgress,
    describeReplayResult,
    isReplayActive,
    isReplayTerminal,
    type ComparableReplayResult,
} from "../../../../../../cli/studio-client/src/domain/interpret/Replay";
import type {ReplayDescriptor, RoundArtifactJson, StudioReplayJobView, StudioReplayListEntry} from "../../../../../../cli/studio-client/src/api/types";

function createDescriptor(overrides: Partial<ReplayDescriptor> = {}): ReplayDescriptor {
    return {
        game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        seed: "demo",
        round: 42,
        totalBet: 420,
        totalWin: 100,
        screen: [
            ["cherry", "lemon"],
            ["bell", "seven"],
        ],
        timestamp: 1735707845000,
        durationMs: 5,
        ...overrides,
    };
}

function createJob(overrides: Partial<StudioReplayJobView> = {}): StudioReplayJobView {
    return {
        id: "replay-1",
        status: "queued",
        round: 42,
        seed: "demo",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedRounds: 0,
        durationMs: 0,
        ...overrides,
    };
}

function createArtifact(overrides: Partial<RoundArtifactJson> = {}): RoundArtifactJson {
    return {
        schemaVersion: 1,
        roundId: "replay:demo:5",
        provenance: {game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"}, pokieVersion: "1.0.0"},
        betMode: "base",
        stake: 1,
        totalWin: 5,
        payoutMultiplier: 5,
        screen: [["cherry", "lemon"]],
        steps: [
            {
                index: 0,
                screen: [["cherry", "lemon"]],
                totalWin: 5,
                wins: [{type: "line", id: "w1", symbolId: "cherry", winAmount: 5, winningPositions: [[0, 0]], multiplierBreakdown: [], metadata: {}}],
            },
        ],
        wins: [{type: "line", id: "w1", symbolId: "cherry", winAmount: 5, winningPositions: [[0, 0]], multiplierBreakdown: [], metadata: {}}],
        hash: "sha256:fixed-for-tests",
        ...overrides,
    };
}

function createComparable(overrides: Partial<ComparableReplayResult> = {}): ComparableReplayResult {
    return {artifact: createArtifact(), ...overrides};
}

function createListEntry(overrides: Partial<StudioReplayListEntry> = {}): StudioReplayListEntry {
    return {
        id: "replay-1",
        status: "completed",
        game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        round: 42,
        seed: "demo",
        completedRounds: 42,
        totalBet: 420,
        totalWin: 100,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
        durationMs: 5,
        ...overrides,
    };
}

describe("describeReplayProgress", () => {
    it("computes a percent from completedRounds/round", () => {
        const job = createJob({status: "running", completedRounds: 21, round: 42, durationMs: 10});

        expect(describeReplayProgress(job)).toEqual({
            status: "running",
            completedRounds: 21,
            round: 42,
            percent: 50,
            durationMs: 10,
            error: undefined,
        });
    });

    it("caps percent at 100", () => {
        const job = createJob({status: "completed", completedRounds: 42, round: 42});

        expect(describeReplayProgress(job).percent).toBe(100);
    });

    it("reports 0 percent when round is 0", () => {
        const job = createJob({round: 0, completedRounds: 0});

        expect(describeReplayProgress(job).percent).toBe(0);
    });

    it("carries the job's own safe error message for a failed replay", () => {
        const job = createJob({status: "failed", error: "boom"});

        expect(describeReplayProgress(job).error).toBe("boom");
    });
});

describe("isReplayActive / isReplayTerminal", () => {
    it("treats queued/running as active, not terminal", () => {
        expect(isReplayActive(createJob({status: "queued"}))).toBe(true);
        expect(isReplayActive(createJob({status: "running"}))).toBe(true);
        expect(isReplayTerminal(createJob({status: "queued"}))).toBe(false);
        expect(isReplayTerminal(createJob({status: "running"}))).toBe(false);
    });

    it("treats completed/failed/cancelled as terminal, not active", () => {
        for (const status of ["completed", "failed", "cancelled"] as const) {
            expect(isReplayTerminal(createJob({status}))).toBe(true);
            expect(isReplayActive(createJob({status}))).toBe(false);
        }
    });
});

describe("describeReplayResult", () => {
    it("flattens the descriptor's fields alongside the replay id", () => {
        const job = createJob({status: "completed", descriptor: createDescriptor()});

        expect(describeReplayResult(job)).toEqual({
            id: "replay-1",
            game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            round: 42,
            seed: "demo",
            totalBet: 420,
            totalWin: 100,
            screen: [
                ["cherry", "lemon"],
                ["bell", "seven"],
            ],
            timestamp: 1735707845000,
            durationMs: 5,
        });
    });

    it("returns undefined when the job has no descriptor yet (queued/running/failed/cancelled)", () => {
        expect(describeReplayResult(createJob({status: "running"}))).toBeUndefined();
        expect(describeReplayResult(createJob({status: "failed", error: "boom"}))).toBeUndefined();
    });

    it("leaves screen undefined when the descriptor's screen is null", () => {
        const job = createJob({status: "completed", descriptor: createDescriptor({screen: null})});

        expect(describeReplayResult(job)?.screen).toBeUndefined();
    });

    it("stringifies non-string screen cells", () => {
        const job = createJob({
            status: "completed",
            descriptor: createDescriptor({screen: [[{symbol: "wild"}, 7, true, null]]}),
        });

        expect(describeReplayResult(job)?.screen).toEqual([['{"symbol":"wild"}', "7", "true", ""]]);
    });

    it("preserves a null seed", () => {
        const job = createJob({status: "completed", descriptor: createDescriptor({seed: null})});

        expect(describeReplayResult(job)?.seed).toBeNull();
    });

    it("passes stateBefore/stateAfter through when present", () => {
        const job = createJob({
            status: "completed",
            descriptor: createDescriptor({stateBefore: {bet: 1, win: 0}, stateAfter: {bet: 1, win: 5}}),
        });

        expect(describeReplayResult(job)?.stateBefore).toEqual({bet: 1, win: 0});
        expect(describeReplayResult(job)?.stateAfter).toEqual({bet: 1, win: 5});
    });

    it("leaves stateBefore/stateAfter undefined when the descriptor doesn't have them", () => {
        const job = createJob({status: "completed", descriptor: createDescriptor()});

        expect(describeReplayResult(job)?.stateBefore).toBeUndefined();
        expect(describeReplayResult(job)?.stateAfter).toBeUndefined();
    });
});

describe("describeReplayComparison", () => {
    it("reports a full match when every dimension is identical", () => {
        const artifact = createArtifact({debug: {reelStops: [1, 2, 3]}});
        const expected = createComparable({artifact, stateBefore: {win: 0}, stateAfter: {win: 5}});
        const reproduced = createComparable({artifact, stateBefore: {win: 0}, stateAfter: {win: 5}});

        const result = describeReplayComparison(expected, reproduced);

        expect(result.status).toBe("match");
        for (const dimension of Object.values(result.dimensions)) {
            expect(dimension.status).toBe("match");
        }
    });

    it("flags exactly the screen dimension as a mismatch when only the screen differs", () => {
        const expected = createComparable();
        const reproduced = createComparable({artifact: createArtifact({screen: [["lemon", "lemon"]]})});

        const result = describeReplayComparison(expected, reproduced);

        expect(result.status).toBe("mismatch");
        expect(result.dimensions.screen.status).toBe("mismatch");
        expect(result.dimensions.wins.status).toBe("match");
        expect(result.dimensions.totalPayout.status).toBe("match");
        expect(result.dimensions.steps.status).toBe("match");
    });

    it("flags exactly the wins dimension when the wins array differs (not just its length)", () => {
        const expected = createComparable();
        const differentWin = {type: "line", id: "w1", symbolId: "lemon", winAmount: 5, winningPositions: [[0, 0]], multiplierBreakdown: [], metadata: {}};
        const reproduced = createComparable({artifact: createArtifact({wins: [differentWin]})});

        const result = describeReplayComparison(expected, reproduced);

        expect(result.status).toBe("mismatch");
        expect(result.dimensions.wins.status).toBe("mismatch");
        expect(result.dimensions.screen.status).toBe("match");
    });

    it("flags exactly the totalPayout dimension when totalWin differs, with the specific values in the detail", () => {
        const expected = createComparable();
        const reproduced = createComparable({artifact: createArtifact({totalWin: 9})});

        const result = describeReplayComparison(expected, reproduced);

        expect(result.status).toBe("mismatch");
        expect(result.dimensions.totalPayout).toEqual({status: "mismatch", detail: "Total payout differs (expected 5, got 9)."});
    });

    it("flags exactly the steps dimension when an intermediate step differs but round-level wins/screen still coincide", () => {
        const expected = createComparable({
            artifact: createArtifact({
                steps: [
                    {index: 0, screen: [["cherry", "lemon"]], totalWin: 0, wins: []},
                    {
                        index: 1,
                        screen: [["cherry", "lemon"]],
                        totalWin: 5,
                        wins: [{type: "line", id: "w1", symbolId: "cherry", winAmount: 5, winningPositions: [[0, 0]], multiplierBreakdown: [], metadata: {}}],
                    },
                ],
            }),
        });
        const reproduced = createComparable({
            artifact: createArtifact({
                steps: [
                    {
                        index: 0,
                        screen: [["cherry", "lemon"]],
                        totalWin: 5,
                        wins: [{type: "line", id: "w1", symbolId: "cherry", winAmount: 5, winningPositions: [[0, 0]], multiplierBreakdown: [], metadata: {}}],
                    },
                ],
            }),
        });

        const result = describeReplayComparison(expected, reproduced);

        expect(result.status).toBe("mismatch");
        expect(result.dimensions.steps.status).toBe("mismatch");
        expect(result.dimensions.screen.status).toBe("match");
        expect(result.dimensions.wins.status).toBe("match");
    });

    it("flags exactly the featureEvents dimension when they differ, treating absence on both sides as an empty match", () => {
        const expected = createComparable();
        const reproduced = createComparable({artifact: createArtifact({featureEvents: [{type: "freeGamesTriggered"}]})});

        expect(describeReplayComparison(expected, expected).dimensions.featureEvents.status).toBe("match");
        expect(describeReplayComparison(expected, reproduced).dimensions.featureEvents.status).toBe("mismatch");
    });

    it("reports unavailable with the exact expected wording and every dimension unavailable when the expected artifact is malformed", () => {
        const expected = createComparable({artifactWarnings: ['"steps" must be an array.']});
        const reproduced = createComparable();

        const result = describeReplayComparison(expected, reproduced);

        expect(result.status).toBe("unavailable");
        expect(result.unavailableReason).toBe(
            'Replay succeeded, but the expected artifact is malformed, so deterministic comparison is unavailable: "steps" must be an array.',
        );
        for (const dimension of Object.values(result.dimensions)) {
            expect(dimension.status).toBe("unavailable");
        }
    });

    it("reports unavailable when the expected or reproduced side simply has no artifact at all", () => {
        expect(describeReplayComparison({artifact: undefined}, createComparable()).status).toBe("unavailable");
        expect(describeReplayComparison(createComparable(), {artifact: undefined}).status).toBe("unavailable");
    });

    it("never crashes on a missing/malformed field even without artifactWarnings set (defense in depth)", () => {
        const malformedExpected = {artifact: {...createArtifact(), wins: undefined} as unknown as RoundArtifactJson};

        expect(() => describeReplayComparison(malformedExpected, createComparable())).not.toThrow();
        const result = describeReplayComparison(malformedExpected, createComparable());
        expect(result.dimensions.wins.status).toBe("unavailable");
        expect(result.dimensions.screen.status).toBe("match");
    });

    describe("state and RNG/reel-stop dimensions", () => {
        it("matches when state/debug are present and identical on both sides", () => {
            const withDebug = createArtifact({debug: {reelStops: [1, 2, 3]}});
            const expected = createComparable({artifact: withDebug, stateBefore: {win: 0}, stateAfter: {win: 5}});
            const reproduced = createComparable({artifact: withDebug, stateBefore: {win: 0}, stateAfter: {win: 5}});

            const result = describeReplayComparison(expected, reproduced);

            expect(result.dimensions.state.status).toBe("match");
            expect(result.dimensions.rngReelStops.status).toBe("match");
            expect(result.status).toBe("match");
        });

        it("mismatches when state/debug are present on both sides but differ", () => {
            const expected = createComparable({
                artifact: createArtifact({debug: {reelStops: [1, 2, 3]}}),
                stateBefore: {win: 0},
                stateAfter: {win: 5},
            });
            const reproduced = createComparable({
                artifact: createArtifact({debug: {reelStops: [4, 5, 6]}}),
                stateBefore: {win: 0},
                stateAfter: {win: 9},
            });

            const result = describeReplayComparison(expected, reproduced);

            expect(result.dimensions.state.status).toBe("mismatch");
            expect(result.dimensions.rngReelStops.status).toBe("mismatch");
            expect(result.status).toBe("mismatch");
        });

        it("reports partial (not mismatch) when state/debug are missing on one side, with the other core dimensions still matching", () => {
            const expected = createComparable({stateBefore: {win: 0}, stateAfter: {win: 5}}); // no debug
            const reproduced = createComparable(); // no state, no debug either

            const result = describeReplayComparison(expected, reproduced);

            expect(result.status).toBe("partial");
            expect(result.dimensions.state.status).toBe("unavailable");
            expect(result.dimensions.rngReelStops.status).toBe("unavailable");
            expect(result.dimensions.screen.status).toBe("match");
            expect(result.dimensions.wins.status).toBe("match");
            expect(result.dimensions.totalPayout.status).toBe("match");
            expect(result.dimensions.steps.status).toBe("match");
            expect(result.dimensions.featureEvents.status).toBe("match");
        });

        it("never treats missing optional data as a mismatch, only as unavailable", () => {
            const expected = createComparable();
            const reproduced = createComparable();

            const result = describeReplayComparison(expected, reproduced);

            expect(result.dimensions.state.status).toBe("unavailable");
            expect(result.dimensions.rngReelStops.status).toBe("unavailable");
            expect(result.status).toBe("partial");
            expect(result.status).not.toBe("mismatch");
        });

        it("ignores an arbitrary unstable debug field (e.g. a timestamp/engine name) that differs between sides -- rngReelStops still matches on the explicit reelStops data", () => {
            const expected = createComparable({
                artifact: createArtifact({debug: {reelStops: [1, 2, 3], capturedAt: "2026-01-01T00:00:00.000Z", rngEngine: "engine-a"}}),
                stateBefore: {win: 0},
                stateAfter: {win: 5},
            });
            const reproduced = createComparable({
                artifact: createArtifact({debug: {reelStops: [1, 2, 3], capturedAt: "2026-06-01T12:34:56.000Z", rngEngine: "engine-b"}}),
                stateBefore: {win: 0},
                stateAfter: {win: 5},
            });

            const result = describeReplayComparison(expected, reproduced);

            expect(result.dimensions.rngReelStops).toEqual({status: "match"});
            expect(result.status).toBe("match");
        });

        it("marks rngReelStops unavailable (not mismatch) when debug exists on both sides but neither has an explicit reelStops field", () => {
            const expected = createComparable({artifact: createArtifact({debug: {rngEngine: "engine-a", trace: [1, 2, 3]}})});
            const reproduced = createComparable({artifact: createArtifact({debug: {rngEngine: "engine-b", trace: [9, 8, 7]}})});

            const result = describeReplayComparison(expected, reproduced);

            expect(result.dimensions.rngReelStops.status).toBe("unavailable");
            expect(result.status).not.toBe("mismatch");
        });

        it("marks rngReelStops unavailable when reelStops is present on only one side, without affecting the other dimensions", () => {
            const expected = createComparable({artifact: createArtifact({debug: {reelStops: [1, 2, 3]}})});
            const reproduced = createComparable({artifact: createArtifact()}); // no debug at all

            const result = describeReplayComparison(expected, reproduced);

            expect(result.dimensions.rngReelStops.status).toBe("unavailable");
            expect(result.dimensions.screen.status).toBe("match");
            expect(result.status).toBe("partial");
        });

        it("still reports a genuine mismatch when only the explicit reelStops data itself differs", () => {
            const expected = createComparable({artifact: createArtifact({debug: {reelStops: [1, 2, 3], rngEngine: "same-engine"}})});
            const reproduced = createComparable({artifact: createArtifact({debug: {reelStops: [4, 5, 6], rngEngine: "same-engine"}})});

            const result = describeReplayComparison(expected, reproduced);

            expect(result.dimensions.rngReelStops).toEqual({status: "mismatch", detail: "RNG/reel-stop data differs."});
            expect(result.status).toBe("mismatch");
        });
    });
});

describe("describeReplayList", () => {
    it("reports empty for no entries", () => {
        expect(describeReplayList([])).toEqual({status: "empty"});
    });

    it("wraps a non-empty list as loaded, unchanged", () => {
        const entries = [createListEntry({id: "replay-1"}), createListEntry({id: "replay-2", status: "running"})];

        expect(describeReplayList(entries)).toEqual({status: "loaded", entries});
    });
});
