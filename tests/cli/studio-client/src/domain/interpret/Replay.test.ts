import {
    describeReplayCapabilities,
    describeReplayComparison,
    describeReplayEntryStatus,
    describeReplayList,
    describeReplayProgress,
    describeReplayReproducibility,
    describeReplayResult,
    describeLoadedReplay,
    describeStudioRoundOperation,
    describeStudioRoundSource,
    isReplayActive,
    isReplayListEntryReproducible,
    isReplayTerminal,
    type ComparableReplayResult,
} from "../../../../../../cli/studio-client/src/domain/interpret/Replay";
import type {
    ReplayDescriptor,
    RoundArtifactJson,
    StudioReplayJobView,
    StudioReplayListEntry,
    StudioRuntimeSessionView,
} from "../../../../../../cli/studio-client/src/api/types";

function createDescriptor(overrides: Partial<ReplayDescriptor> = {}): ReplayDescriptor {
    return {
        sessionId: "session-1",
        game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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
        provenance: {game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}, pokieVersion: "1.0.0"},
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
        game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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
            sessionId: "session-1",
            game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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

    it("identifies the recorded/reference and recreated sides with their own identity, seed, version/hash, time, and completeness", () => {
        const artifact = createArtifact({debug: {reelStops: [1, 2, 3]}});
        const expected = createComparable({
            artifact,
            stateBefore: {win: 0},
            stateAfter: {win: 5},
            identity: {label: "pasted replay artifact, round 42", seed: "demo", timestamp: 1735707845000},
        });
        const reproduced = createComparable({
            artifact,
            stateBefore: {win: 0},
            stateAfter: {win: 5},
            identity: {label: "replay session session-9, replay job job-9", seed: "demo", timestamp: 1735707900000},
        });

        const result = describeReplayComparison(expected, reproduced);

        expect(result.recorded).toEqual({
            role: "recorded",
            label: "Recorded / reference",
            identities: "pasted replay artifact, round 42",
            seed: "demo",
            versionHash: "sample-slot v0.1.0, hash sha256:fixed-for-tests",
            timestamp: new Date(1735707845000).toLocaleString(),
            completeness: "Full -- artifact, state, and RNG/reel-stop trace all recorded.",
        });
        expect(result.recreated).toEqual({
            role: "recreated",
            label: "Recreated",
            identities: "replay session session-9, replay job job-9",
            seed: "demo",
            versionHash: "sample-slot v0.1.0, hash sha256:fixed-for-tests",
            timestamp: new Date(1735707900000).toLocaleString(),
            completeness: "Full -- artifact, state, and RNG/reel-stop trace all recorded.",
        });
    });

    it("still identifies both sides (with an honest 'not recorded'/'unknown' fallback) when identity is never supplied or comparison is unavailable", () => {
        const result = describeReplayComparison({artifact: undefined}, createComparable());

        expect(result.status).toBe("unavailable");
        expect(result.recorded).toEqual({
            role: "recorded",
            label: "Recorded / reference",
            identities: "(identity not recorded)",
            seed: "(none)",
            versionHash: "(not recorded)",
            timestamp: "(unknown)",
            completeness: "Minimal -- no round artifact recorded for this side.",
        });
        expect(result.recreated.role).toBe("recreated");
        expect(result.recreated.completeness).toBe("Partial -- round artifact recorded, but no session state captured.");
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

describe("describeReplayReproducibility", () => {
    const CURRENT_GAME = {id: "sample-slot", version: "0.1.0"};
    // A fully-captured artifact: state before/after plus an explicit RNG/reel-stop trace -- the shape
    // an "exact" record needs to satisfy every reproducibility input, not just seed/version.
    const EXACT_ARTIFACT = createArtifact({debug: {reelStops: [1, 2, 3]}});
    const EXACT_STATE = {stateBefore: {win: 0}, stateAfter: {win: 5}};

    it("is ready for an exact record: seed present, game id/version matching the currently loaded project, state and RNG trace both captured", () => {
        expect(describeReplayReproducibility({seed: "demo", artifact: EXACT_ARTIFACT, ...EXACT_STATE}, CURRENT_GAME)).toEqual({status: "ready"});
    });

    it("is ready when there's no artifact at all to check version/state/RNG against, as long as a seed is present", () => {
        expect(describeReplayReproducibility({seed: "demo"}, CURRENT_GAME)).toEqual({status: "ready"});
    });

    it("is ready when the currently loaded project's game is unknown yet (never blocks on an absent check)", () => {
        expect(describeReplayReproducibility({seed: "demo", artifact: EXACT_ARTIFACT, ...EXACT_STATE}, undefined)).toEqual({status: "ready"});
    });

    it("blocks an imported record with no seed, naming the seed as the concrete missing input, with a remediation path", () => {
        const gate = describeReplayReproducibility({artifact: EXACT_ARTIFACT, ...EXACT_STATE}, CURRENT_GAME);

        expect(gate.status).toBe("blocked");
        expect(gate).toMatchObject({
            reason: expect.stringContaining("no recorded seed"),
            remediation: expect.stringContaining("seed"),
        });
    });

    it("blocks a record with a blank seed the same as a missing one", () => {
        const gate = describeReplayReproducibility({seed: "   ", artifact: EXACT_ARTIFACT, ...EXACT_STATE}, CURRENT_GAME);

        expect(gate.status).toBe("blocked");
    });

    it("blocks a version-mismatched record, naming both the recorded and currently loaded game/version, with a remediation path", () => {
        const artifact = createArtifact({provenance: {game: {id: "sample-slot", name: "Sample Slot", version: "0.2.0"}, pokieVersion: "1.0.0"}});

        const gate = describeReplayReproducibility({seed: "demo", artifact}, CURRENT_GAME);

        expect(gate.status).toBe("blocked");
        expect(gate).toMatchObject({
            reason: expect.stringContaining("v0.2.0"),
            remediation: expect.stringContaining("0.2.0"),
        });
    });

    it("blocks a record whose game id itself differs (not just the version) from the currently loaded project", () => {
        const artifact = createArtifact({provenance: {game: {id: "other-slot", name: "Other Slot", version: "0.1.0"}, pokieVersion: "1.0.0"}});

        const gate = describeReplayReproducibility({seed: "demo", artifact}, CURRENT_GAME);

        expect(gate.status).toBe("blocked");
    });

    it("blocks a record whose artifact has no provenance.game at all, naming provenance as the concrete missing input, with a remediation path", () => {
        const artifact = createArtifact() as RoundArtifactJson;
        // Simulates a hand-trimmed/pasted artifact JSON missing the required provenance.game field.
        Reflect.deleteProperty(artifact.provenance, "game");

        const gate = describeReplayReproducibility({seed: "demo", artifact, ...EXACT_STATE}, CURRENT_GAME);

        expect(gate.status).toBe("blocked");
        expect(gate).toMatchObject({
            reason: expect.stringContaining("no recorded game id/version provenance"),
            remediation: expect.stringContaining("provenance.game"),
        });
    });

    it("blocks a record whose artifact carries a game id but no version, the same as provenance missing entirely", () => {
        const artifact = createArtifact({provenance: {game: {id: "sample-slot", name: "Sample Slot", version: ""}, pokieVersion: "1.0.0"}});

        const gate = describeReplayReproducibility({seed: "demo", artifact, ...EXACT_STATE}, CURRENT_GAME);

        expect(gate.status).toBe("blocked");
        expect(gate).toMatchObject({reason: expect.stringContaining("no recorded game id/version provenance")});
    });

    it("blocks a record missing provenance.game even when no project is currently loaded (unlike the version-mismatch check, this never needs a loaded project to matter)", () => {
        const artifact = createArtifact() as RoundArtifactJson;
        // Simulates a hand-trimmed/pasted artifact JSON missing the required provenance.game field.
        Reflect.deleteProperty(artifact.provenance, "game");

        const gate = describeReplayReproducibility({seed: "demo", artifact, ...EXACT_STATE}, undefined);

        expect(gate.status).toBe("blocked");
        expect(gate).toMatchObject({reason: expect.stringContaining("no recorded game id/version provenance")});
    });

    it("checks the seed before the version, reporting the seed issue when both are absent/mismatched", () => {
        const artifact = createArtifact({provenance: {game: {id: "other-slot", name: "Other Slot", version: "0.2.0"}, pokieVersion: "1.0.0"}});

        const gate = describeReplayReproducibility({artifact}, CURRENT_GAME);

        expect(gate.status).toBe("blocked");
        expect(gate).toMatchObject({reason: expect.stringContaining("no recorded seed")});
    });

    it("blocks an incomplete record missing session state, naming state as the concrete missing input, with a remediation path", () => {
        const gate = describeReplayReproducibility({seed: "demo", artifact: EXACT_ARTIFACT}, CURRENT_GAME);

        expect(gate.status).toBe("blocked");
        expect(gate).toMatchObject({
            reason: expect.stringContaining("no recorded session state"),
            remediation: expect.stringContaining("stateBefore"),
        });
    });

    it("blocks an incomplete record with only stateBefore captured (a partial pair), the same as state missing entirely", () => {
        const gate = describeReplayReproducibility({seed: "demo", artifact: EXACT_ARTIFACT, stateBefore: {win: 0}}, CURRENT_GAME);

        expect(gate.status).toBe("blocked");
        expect(gate).toMatchObject({reason: expect.stringContaining("no recorded session state")});
    });

    it("is bestEffort (not blocked) for a record missing only its RNG/reel-stop trace -- Reproduce stays offered, but explicitly non-verifiable", () => {
        const artifact = createArtifact(); // no debug at all
        const gate = describeReplayReproducibility({seed: "demo", artifact, ...EXACT_STATE}, CURRENT_GAME);

        expect(gate.status).toBe("bestEffort");
        expect(gate).toMatchObject({
            reason: expect.stringContaining("no recorded RNG/reel-stop trace"),
        });
        expect(gate).toMatchObject({reason: expect.stringContaining("best-effort")});
        expect("remediation" in gate).toBe(false);
    });

    it("is bestEffort for a record whose debug data exists but carries no explicit reelStops field", () => {
        const artifact = createArtifact({debug: {rngEngine: "engine-a"}});
        const gate = describeReplayReproducibility({seed: "demo", artifact, ...EXACT_STATE}, CURRENT_GAME);

        expect(gate.status).toBe("bestEffort");
        expect(gate).toMatchObject({reason: expect.stringContaining("no recorded RNG/reel-stop trace")});
    });

    it("checks state before RNG trace, reporting the state issue when both are absent", () => {
        const artifact = createArtifact(); // no debug, no state
        const gate = describeReplayReproducibility({seed: "demo", artifact}, CURRENT_GAME);

        expect(gate.status).toBe("blocked");
        expect(gate).toMatchObject({reason: expect.stringContaining("no recorded session state")});
    });

    it("checks seed and version before state/RNG completeness", () => {
        expect(describeReplayReproducibility({artifact: createArtifact()}, CURRENT_GAME)).toMatchObject({reason: expect.stringContaining("no recorded seed")});

        const mismatched = createArtifact({provenance: {game: {id: "sample-slot", name: "Sample Slot", version: "0.2.0"}, pokieVersion: "1.0.0"}});
        expect(describeReplayReproducibility({seed: "demo", artifact: mismatched}, CURRENT_GAME)).toMatchObject({reason: expect.stringContaining("v0.2.0")});
    });
});

describe("describeReplayList", () => {
    it("reports empty for no entries", () => {
        expect(describeReplayList([])).toEqual({status: "empty"});
    });

    it("wraps a non-empty list of entries with distinct ids as loaded, unchanged", () => {
        const entries = [createListEntry({id: "replay-1", round: 1}), createListEntry({id: "replay-2", round: 2, status: "running"})];

        expect(describeReplayList(entries)).toEqual({status: "loaded", entries});
    });

    it("canonically deduplicates entries sharing the same job id, keeping only the newest (first) occurrence", () => {
        const newest = {...createListEntry({id: "retry-1", status: "completed"})};
        const olderDuplicateRow = {...createListEntry({id: "retry-1", status: "running"})};

        expect(describeReplayList([newest, olderDuplicateRow])).toEqual({status: "loaded", entries: [newest]});
    });

    it("never collapses two distinct replay sessions/jobs that happen to share the same game, round, and seed", () => {
        const firstAttempt = createListEntry({id: "retry-1", status: "failed"});
        const secondAttempt = createListEntry({id: "retry-2", status: "completed"});

        expect(describeReplayList([secondAttempt, firstAttempt])).toEqual({status: "loaded", entries: [secondAttempt, firstAttempt]});
    });

    it("does not dedupe entries with no recorded seed -- each is its own distinct attempt with a distinct id", () => {
        const entries = [createListEntry({id: "a", seed: undefined}), createListEntry({id: "b", seed: undefined})];

        expect(describeReplayList(entries)).toEqual({status: "loaded", entries});
    });

    it("does not dedupe entries with no known game yet", () => {
        const entries = [createListEntry({id: "a", game: undefined}), createListEntry({id: "b", game: undefined})];

        expect(describeReplayList(entries)).toEqual({status: "loaded", entries});
    });

    it("does not dedupe entries that share a round/seed but differ in game id or version", () => {
        const sameGame = createListEntry({id: "a"});
        const differentId = createListEntry({id: "b", game: {id: "other-slot", name: "Other Slot", version: "0.1.0"}});
        const differentVersion = createListEntry({id: "c", game: {id: "sample-slot", name: "Sample Slot", version: "0.2.0"}});

        expect(describeReplayList([sameGame, differentId, differentVersion])).toEqual({
            status: "loaded",
            entries: [sameGame, differentId, differentVersion],
        });
    });
});

describe("describeReplayEntryStatus", () => {
    it("maps every StudioReplayStatus to a plain, honest-about-recreation label", () => {
        expect(describeReplayEntryStatus("queued")).toBe("Queued to reproduce");
        expect(describeReplayEntryStatus("running")).toBe("Reproducing…");
        expect(describeReplayEntryStatus("completed")).toBe("Reproduced");
        expect(describeReplayEntryStatus("failed")).toBe("Reproduction failed");
        expect(describeReplayEntryStatus("cancelled")).toBe("Reproduction cancelled");
    });
});

describe("isReplayListEntryReproducible", () => {
    it("is true for an entry with a recorded, non-blank seed", () => {
        expect(isReplayListEntryReproducible(createListEntry({seed: "demo"}))).toBe(true);
    });

    it("is false for an entry with no recorded seed -- reproducing it would create a differently-seeded session, not recreate this round", () => {
        expect(isReplayListEntryReproducible(createListEntry({seed: undefined}))).toBe(false);
    });

    it("is false for an entry with a blank seed", () => {
        expect(isReplayListEntryReproducible(createListEntry({seed: "   "}))).toBe(false);
    });
});

describe("describeReplayCapabilities", () => {
    it("Session Spin: inspectable and exportable, never reproducible or comparable -- it's the actual recorded result, nothing to reproduce it against", () => {
        const capabilities = describeReplayCapabilities({source: "spin", hasResult: true, hasComparisonTarget: false, canExport: true});

        expect(capabilities.inspectable.status).toBe("available");
        expect(capabilities.reproducible).toMatchObject({status: "unavailable", reason: expect.stringContaining("nothing to reproduce")});
        expect(capabilities.comparable.status).toBe("unavailable");
        expect(capabilities.exportable.status).toBe("available");
    });

    it("Recreate from seed / Recent Simulation: not inspectable until a result exists, always reproducible, never comparable", () => {
        const beforeRun = describeReplayCapabilities({source: "seedRound", hasResult: false, hasComparisonTarget: false, canExport: false});
        expect(beforeRun.inspectable.status).toBe("unavailable");
        expect(beforeRun.reproducible.status).toBe("available");
        expect(beforeRun.comparable.status).toBe("unavailable");
        expect(beforeRun.exportable.status).toBe("unavailable");

        const afterRun = describeReplayCapabilities({source: "simulation", hasResult: true, hasComparisonTarget: false, canExport: true});
        expect(afterRun.inspectable.status).toBe("available");
        expect(afterRun.exportable.status).toBe("available");
    });

    it("Replay Artifact: reproducible/comparable follow the reproducibility gate and comparison outcome", () => {
        const ready = describeReplayCapabilities({
            source: "artifact",
            hasResult: true,
            reproducibility: {status: "ready"},
            hasComparisonTarget: true,
            canExport: true,
        });
        expect(ready.reproducible.status).toBe("available");
        expect(ready.comparable).toMatchObject({status: "available", reason: expect.stringContaining("once reproduced")});

        const bestEffort = describeReplayCapabilities({
            source: "artifact",
            hasResult: true,
            reproducibility: {status: "bestEffort", reason: "no RNG trace"},
            hasComparisonTarget: true,
            canExport: false,
        });
        expect(bestEffort.reproducible).toEqual({status: "bestEffort", reason: "no RNG trace"});

        const blocked = describeReplayCapabilities({
            source: "artifact",
            hasResult: true,
            reproducibility: {status: "blocked", reason: "no seed", remediation: "add a seed"},
            hasComparisonTarget: false,
            canExport: false,
        });
        expect(blocked.reproducible).toEqual({status: "unavailable", reason: "no seed"});
        expect(blocked.comparable).toMatchObject({status: "unavailable", reason: expect.stringContaining("No round artifact")});

        const matched = describeReplayCapabilities({
            source: "artifact",
            hasResult: true,
            hasComparisonTarget: true,
            comparison: {status: "match", dimensions: {} as never},
            canExport: true,
        });
        expect(matched.comparable).toMatchObject({status: "available", reason: expect.stringContaining("Verified -- matches")});

        const partial = describeReplayCapabilities({
            source: "artifact",
            hasResult: true,
            hasComparisonTarget: true,
            comparison: {status: "partial", dimensions: {} as never},
            canExport: true,
        });
        expect(partial.comparable.status).toBe("bestEffort");

        const unavailable = describeReplayCapabilities({
            source: "artifact",
            hasResult: true,
            hasComparisonTarget: true,
            comparison: {status: "unavailable", unavailableReason: "malformed", dimensions: {} as never},
            canExport: true,
        });
        expect(unavailable.comparable).toEqual({status: "unavailable", reason: "malformed"});
    });
});

describe("describeLoadedReplay", () => {
    function createSpin(overrides: Partial<StudioRuntimeSessionView> = {}): StudioRuntimeSessionView {
        return {
            sessionId: "session-1",
            game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
            credits: 100,
            studioRound: 3,
            studioRequestId: "req-1",
            studioRecordedAt: "2026-01-01T00:00:00.000Z",
            studioSource: "live",
            ...overrides,
        };
    }

    it("labels a live spin as Recorded, never Recreated, with no seed tracked per spin", () => {
        const card = describeLoadedReplay({source: "spin", spin: createSpin(), canExport: true});

        expect(card.source).toBe("Recorded -- live spin");
        expect(card.identities).toContain("session-1");
        expect(card.identities).toContain("round 3");
        expect(card.identities).toContain("request req-1");
        expect(card.capabilities.reproducible.status).toBe("unavailable");
    });

    it("labels a pre-generated spin distinctly from a live one", () => {
        const card = describeLoadedReplay({source: "spin", spin: createSpin({studioSource: "pre-generated"}), canExport: true});

        expect(card.source).toBe("Recorded -- pre-generated spin");
    });

    it("labels a recorded simulation-sample spin truthfully, never falling back to live spin", () => {
        const card = describeLoadedReplay({source: "spin", spin: createSpin({studioSource: "simulation-sample"}), canExport: true});

        expect(card.source).toBe("Recorded -- Recent Simulation reproduction");
    });

    it("reports spin completeness from whether a debug bundle was captured", () => {
        const noDebug = describeLoadedReplay({source: "spin", spin: createSpin(), canExport: true});
        expect(noDebug.completeness).toContain("Minimal");

        const withScreen = describeLoadedReplay({source: "spin", spin: createSpin({screen: [["cherry"]]}), canExport: true});
        expect(withScreen.completeness).toContain("Partial");

        const withDebug = describeLoadedReplay({
            source: "spin",
            spin: createSpin({debug: {stateAfter: {win: 0}}}),
            canExport: true,
        });
        expect(withDebug.completeness).toContain("Full");
    });

    it("labels every fresh-forward source as Recreated, never Recorded", () => {
        const seedRoundCard = describeLoadedReplay({source: "seedRound", target: {round: 1, seed: "demo"}, canExport: false});
        expect(seedRoundCard.source).toBe("Recreated -- recreate from seed");

        const simulationCard = describeLoadedReplay({source: "simulation", target: {round: 1, seed: "demo"}, canExport: false});
        expect(simulationCard.source).toBe("Recreated -- recent simulation");
    });

    it("shows no identities/timestamp yet for a configured-but-not-reproduced target, then the replay session/job once reproduced", () => {
        const beforeRun = describeLoadedReplay({source: "seedRound", target: {round: 5, seed: "demo"}, currentGame: {id: "a", version: "1.0.0"}, canExport: false});
        expect(beforeRun.identities).toBe("(assigned once reproduced)");
        expect(beforeRun.timestamp).toBe("(not yet reproduced)");
        expect(beforeRun.completeness).toContain("Not yet run");

        const result = {
            id: "job-1",
            sessionId: "sess-1",
            game: {id: "a", name: "A", version: "1.0.0"},
            round: 5,
            seed: "demo",
            totalBet: 1,
            totalWin: 0,
            timestamp: 1735707845000,
            durationMs: 5,
        };
        const afterRun = describeLoadedReplay({source: "seedRound", target: {round: 5, seed: "demo"}, result, canExport: true});
        expect(afterRun.identities).toBe("replay session sess-1, replay job job-1");
        expect(afterRun.completeness).toContain("Partial -- round-level result only");
    });

    it("labels a Replay Artifact as Recorded/reference before reproduction, then Recreated (naming the recorded artifact) once a result exists", () => {
        const beforeRun = describeLoadedReplay({
            source: "artifact",
            expected: {seed: "demo", artifact: createArtifact()},
            reproducibility: {status: "ready"},
            canExport: false,
        });
        expect(beforeRun.source).toBe("Recorded -- replay artifact (reference, not yet reproduced)");
        expect(beforeRun.source).not.toContain("Recreated");

        const result = {
            id: "job-1",
            sessionId: "sess-1",
            game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
            round: 5,
            seed: "demo",
            totalBet: 1,
            totalWin: 0,
            timestamp: 1735707845000,
            durationMs: 5,
        };
        const afterRun = describeLoadedReplay({
            source: "artifact",
            expected: {seed: "demo", artifact: createArtifact()},
            reproducibility: {status: "ready"},
            result,
            canExport: true,
        });
        expect(afterRun.source).toContain("Recreated");
        expect(afterRun.source).toContain("recorded replay artifact");
        expect(afterRun.identities).toBe("replay session sess-1, replay job job-1");
    });

    it("shows the artifact's own hash alongside game/version once recorded", () => {
        const card = describeLoadedReplay({
            source: "artifact",
            expected: {seed: "demo", artifact: createArtifact({debug: {reelStops: [1, 2, 3]}})},
            reproducibility: {status: "ready"},
            canExport: false,
        });

        expect(card.versionHash).toBe("sample-slot v0.1.0, hash sha256:fixed-for-tests");
    });
});

describe("describeStudioRoundSource", () => {
    it("names the Replay tab's Recent Simulation as a simulation-sample's source, never Unknown or live spin", () => {
        expect(describeStudioRoundSource("simulation-sample")).toBe("Replay tab -- Recent Simulation");
    });

    it("falls back to Unknown only for a genuinely unrecognized source", () => {
        expect(describeStudioRoundSource(undefined)).toBe("Unknown");
    });
});

describe("describeStudioRoundOperation", () => {
    it("names a simulation-sample's operation truthfully, never Unknown", () => {
        expect(describeStudioRoundOperation("simulation-sample")).toBe("Simulation sample");
    });

    it("falls back to Unknown only for a genuinely unrecognized operation", () => {
        expect(describeStudioRoundOperation(undefined)).toBe("Unknown");
    });
});
