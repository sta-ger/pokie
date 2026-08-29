import {
    BetModeDefinition,
    BetModesConfig,
    estimateExactOutcomeSpaceSize,
    GameBlueprint,
    GamePackageGenerator,
    generateExactWeightedOutcomeLibrary,
    generateSampledWeightedOutcomeLibrary,
    generateWeightedOutcomeLibrary,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleWriter,
    PokieGame,
    prepareOutcomeLibraryGeneration,
    prepareOutcomeLibraryGenerationFromEstimate,
    preflightOutcomeLibraryGenerationFromEstimate,
    streamExactWeightedOutcomes,
    WeightedOutcomeLibraryGenerationCancelledError,
    WeightedOutcomeLibraryGenerationError,
    VideoSlotSession,
    VideoSlotWithBetModesSession,
} from "pokie";
import {buildAlternateFixtureGame, buildFixtureConfig, buildFixtureGame, buildUnplayableFixtureGame, buildUnsupportedFixtureGame} from "./GenerateTestFixtures.js";
import fs from "fs";
import os from "os";
import path from "path";

function outcomeById(outcomes: readonly {id: string; weight: number; artifact: {screen?: unknown}}[], weight: number) {
    return outcomes.filter((outcome) => outcome.weight === weight);
}

describe("generateExactWeightedOutcomeLibrary", () => {
    it("estimates the exact reel-stop space upfront without enumerating", () => {
        const estimate = estimateExactOutcomeSpaceSize(buildFixtureGame());

        expect(estimate.reelsNumber).toBe(2);
        expect(estimate.reelsSymbolsNumber).toBe(1);
        expect(estimate.reelSizes).toEqual([3, 2]);
        expect(estimate.totalOutcomeSpaceSize).toBe(BigInt(6));
    });

    it("uses one preflight decision for the legacy bounded and explicit sampled strategies", () => {
        const estimate = estimateExactOutcomeSpaceSize(buildFixtureGame());

        expect(preflightOutcomeLibraryGenerationFromEstimate(estimate, {maxExactOutcomeSpaceSize: BigInt(5)})).toMatchObject({
            strategy: "bounded-coverage",
            requiresSampledOptIn: true,
            expectedRawWork: BigInt(0),
        });
        expect(preflightOutcomeLibraryGenerationFromEstimate(estimate, {
            generation: "sampled",
            maxExactOutcomeSpaceSize: BigInt(5),
            sample: {sampleSize: BigInt(4), seed: "same-seed"},
        })).toMatchObject({
            strategy: "bounded-coverage",
            requiresSampledOptIn: false,
            expectedRawWork: BigInt(4),
        });
    });

    it("executes the canonical domain request identically to the legacy sampled adapter", async () => {
        const game = buildFixtureGame();
        const request = {
            libraryId: "canonical-sample",
            game,
            pokieVersion: "test",
            generation: "sampled" as const,
            sample: {sampleSize: BigInt(4), seed: "canonical-seed"},
        };

        const [canonical, legacy] = await Promise.all([
            generateWeightedOutcomeLibrary(request),
            generateSampledWeightedOutcomeLibrary({
                libraryId: request.libraryId,
                game,
                pokieVersion: request.pokieVersion,
                sampled: request.sample,
            }),
        ]);

        expect(canonical.library).toEqual(legacy.library);
        expect({...canonical.diagnostics, generatedAt: "normalized"}).toEqual({...legacy.diagnostics, generatedAt: "normalized"});
    });

    it("fails closed for a game that never implemented createExactEnumerationSession", () => {
        expect.assertions(2);
        try {
            estimateExactOutcomeSpaceSize(buildUnsupportedFixtureGame());
        } catch (error) {
            expect(error).toBeInstanceOf(WeightedOutcomeLibraryGenerationError);
            expect((error as WeightedOutcomeLibraryGenerationError).getCode()).toBe("weighted-outcome-library-generation-unsupported");
        }
    });

    it("preserves a named compatibility policy in canonical generator provenance", async () => {
        const result = await generateWeightedOutcomeLibrary({
            libraryId: "managed-policy-provenance",
            game: buildFixtureGame(),
            pokieVersion: "test",
            compatibilityPolicyVersion: "managed-v1",
        });

        expect(result.diagnostics).toMatchObject({
            compatibilityPolicyVersion: "managed-v1",
            // The raw-library diagnostics are the provenance copied into a
            // Studio/managed bundle mode, so the policy is independently
            // reconstructable without consulting the original adapter.
            maxExactOutcomeSpaceSize: 20_000_000,
        });
    });

    it("derives loaded configuration provenance and rejects an incompatible caller assertion in the shared request", async () => {
        const game: PokieGame = {...buildFixtureGame(), getConfigHash: () => "sha256:loaded-config"};
        const result = await generateWeightedOutcomeLibrary({
            libraryId: "resolved-config",
            game,
            pokieVersion: "test",
        });

        expect(result.diagnostics.configHash).toBe("sha256:loaded-config");
        expect(result.library.outcomes.every((outcome) => outcome.artifact.provenance.configHash === "sha256:loaded-config")).toBe(true);
        expect(() => prepareOutcomeLibraryGeneration({
            libraryId: "resolved-config",
            game,
            pokieVersion: "test",
            configHash: "sha256:caller-assertion",
        })).toThrow("The supplied configuration identity does not match the loaded game");
    });

    it("binds publication destination into the same resolved preflight consumed by every producer", () => {
        const prepared = prepareOutcomeLibraryGeneration({
            libraryId: "bound-destination",
            game: buildFixtureGame(),
            pokieVersion: "test",
            outputDestination: "  /tmp/outcome-library  ",
        });

        expect(prepared.outputDestination).toBe("/tmp/outcome-library");
        expect(prepared.preflight.destination).toEqual({path: "/tmp/outcome-library"});
    });

    it("owns resolved publication safety in the prepared request, including an explicit sidecar policy", () => {
        const source = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-generation-source-"));
        const sibling = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-generation-destination-"));
        const occupied = path.join(sibling, "occupied.json");
        fs.writeFileSync(occupied, "sentinel");
        try {
            const request = {libraryId: "destination-safety", game: buildFixtureGame(), pokieVersion: "test"};
            expect(() => prepareOutcomeLibraryGeneration({
                ...request,
                outputDestination: path.join(source, "generated.json"),
                outputDestinationSafety: {sourcePath: source, kind: "file", requireAvailable: true},
            })).toThrow(/source itself or lies inside source/i);
            expect(() => prepareOutcomeLibraryGeneration({
                ...request,
                outputDestination: occupied,
                outputDestinationSafety: {sourcePath: source, kind: "file", requireAvailable: true},
            })).toThrow(/already exists and is not available/i);

            const prepared = prepareOutcomeLibraryGeneration({
                ...request,
                outputDestination: path.join(source, "managed-sidecar"),
                outputDestinationSafety: {sourcePath: source, kind: "directory", allowWithinSource: true},
            });
            expect(prepared.preflight.destination).toEqual({
                path: path.join(source, "managed-sidecar"),
                safety: {sourcePath: source, kind: "directory", allowWithinSource: true},
            });
        } finally {
            fs.rmSync(source, {recursive: true, force: true});
            fs.rmSync(sibling, {recursive: true, force: true});
        }
    });

    it("owns project-relative destination resolution and escape safety in the prepared request", () => {
        const project = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-generation-project-"));
        try {
            const request = {
                libraryId: "project-destination",
                game: buildFixtureGame(),
                pokieVersion: "test",
                outputDestinationSafety: {basePath: project, requireWithinBase: true, allowWithinSource: true},
            };
            expect(prepareOutcomeLibraryGeneration({...request, outputDestination: "generated/library"}).preflight.destination?.path)
                .toBe(path.join(project, "generated/library"));
            expect(() => prepareOutcomeLibraryGeneration({...request, outputDestination: "../outside"}))
                .toThrow(/outside its permitted publication root/i);
        } finally {
            fs.rmSync(project, {recursive: true, force: true});
        }
    });

    it("binds CLI-style supplied estimates through the same loaded configuration and destination preparation", () => {
        const game: PokieGame = {...buildFixtureGame(), getConfigHash: () => "sha256:loaded-config"};
        const prepared = prepareOutcomeLibraryGenerationFromEstimate({
            reelsNumber: 2,
            reelsSymbolsNumber: 1,
            reelSizes: [3, 2],
            totalOutcomeSpaceSize: BigInt(6),
        }, {
            libraryId: "cli-preflight",
            game,
            pokieVersion: "test",
            configHash: "sha256:loaded-config",
            outputDestination: " /tmp/cli-outcome-library ",
        });

        expect(prepared.configHash).toBe("sha256:loaded-config");
        expect(prepared.preflight.destination).toEqual({path: "/tmp/cli-outcome-library"});
        expect(() => prepareOutcomeLibraryGenerationFromEstimate(prepared.preflight.estimate, {
            libraryId: "cli-preflight",
            game,
            pokieVersion: "test",
            configHash: "sha256:wrong-assertion",
        })).toThrow("The supplied configuration identity does not match the loaded game");
    });

    it("validates shared request identities and exact cap before either preflight or execution", () => {
        const request = {libraryId: "fixture-lib", game: buildFixtureGame(), pokieVersion: "test"};

        for (const invalid of [
            {...request, libraryId: " "},
            {...request, mode: " "},
            {...request, stake: 0},
            {...request, maxExactOutcomeSpaceSize: BigInt(0)},
        ]) {
            expect(() => prepareOutcomeLibraryGeneration(invalid)).toThrow(WeightedOutcomeLibraryGenerationError);
        }
    });

    it("exactly enumerates, dedupes, and sums weights straight off the real calculation path", async () => {
        const result = await generateExactWeightedOutcomeLibrary({
            libraryId: "fixture-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            now: () => new Date("2026-01-01T00:00:00.000Z"),
        });

        expect(result.diagnostics.strategy).toBe("exact");
        expect(result.diagnostics.algorithm).toBe("pokie-exact-reel-enumeration-v1");
        expect(result.diagnostics.totalOutcomeSpaceSize).toBe(6);
        expect(result.diagnostics.sampledRawCount).toBe(6);
        expect(result.diagnostics.seed).toBeUndefined();
        expect(result.diagnostics.pokieVersion).toBe("1.3.0");
        expect(result.diagnostics.game.id).toBe("fixture-slot");
        expect(result.diagnostics.generatedAt).toBe("2026-01-01T00:00:00.000Z");

        const {library} = result;
        expect(library.libraryId).toBe("fixture-lib");
        // 4 distinct grids: (A,A) w=2, (A,B) w=2, (B,A) w=1, (B,B) w=1 -- see GenerateTestFixtures's own doc
        // comment for the hand-computed combinatorics.
        expect(library.outcomes).toHaveLength(4);
        expect(library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(6);
        expect(outcomeById(library.outcomes, 2)).toHaveLength(2);
        expect(outcomeById(library.outcomes, 1)).toHaveLength(2);

        // Exactly one winning grid -- (A,A), weight 2, paying the configured 5x bet.
        const winners = library.outcomes.filter((outcome) => outcome.artifact.payoutMultiplier > 0);
        expect(winners).toHaveLength(1);
        expect(winners[0].weight).toBe(2);
        expect(winners[0].artifact.payoutMultiplier).toBe(5);
        expect(winners[0].artifact.screen).toEqual([["A"], ["A"]]);
        expect(winners[0].artifact.provenance.game.id).toBe("fixture-slot");
        expect(winners[0].artifact.provenance.pokieVersion).toBe("1.3.0");

        // Deterministic, content-derived ids -- rebuilding from the exact same math data reproduces them.
        const again = await generateExactWeightedOutcomeLibrary({libraryId: "fixture-lib", game: buildFixtureGame(), pokieVersion: "1.3.0"});
        expect(again.library.outcomes.map((outcome) => outcome.id)).toEqual(library.outcomes.map((outcome) => outcome.id));
    });

    it("threads betMode/stake/configHash through to every generated artifact", async () => {
        const {library} = await generateExactWeightedOutcomeLibrary({
            libraryId: "fixture-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            betMode: "buy-bonus",
            stake: 2,
            configHash: "sha256:deadbeef",
        });

        for (const outcome of library.outcomes) {
            expect(outcome.artifact.betMode).toBe("buy-bonus");
            expect(outcome.artifact.stake).toBe(2);
            expect(outcome.artifact.provenance.configHash).toBe("sha256:deadbeef");
        }
    });

    it("selects the requested supported bet mode on every exact-enumeration session before calculating its outcomes", async () => {
        const selectedModeIds: string[] = [];
        const config = buildFixtureConfig();
        const game: PokieGame = {
            getManifest: () => ({id: "mode-selecting-fixture-slot", name: "Mode Selecting Fixture Slot", version: "1.0.0"}),
            createSession: () =>
                new VideoSlotWithBetModesSession(
                    new VideoSlotSession<string>(config),
                    new BetModesConfig([new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 1.25})], "base"),
                ),
            createExactEnumerationSession: (combinationsGenerator) => {
                const session = new VideoSlotWithBetModesSession(
                    new VideoSlotSession<string>(config, combinationsGenerator),
                    new BetModesConfig([new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 1.25})], "base"),
                );
                const setBetMode = session.setBetMode.bind(session);
                session.setBetMode = (modeId: string) => {
                    selectedModeIds.push(modeId);
                    setBetMode(modeId);
                };
                return session;
            },
        };

        const result = await generateExactWeightedOutcomeLibrary({
            libraryId: "fixture-lib",
            game,
            pokieVersion: "1.3.0",
            betMode: "ante",
            selectBetMode: true,
        });

        expect(selectedModeIds).toEqual(Array(result.library.outcomes.length).fill("ante"));
        expect(result.library.outcomes.every((outcome) => outcome.artifact.betMode === "ante")).toBe(true);
    });

    it("rejects an exact session without bet-mode selection with an actionable error when selection was requested", async () => {
        const options = {
            libraryId: "fixture-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            betMode: "ante",
            selectBetMode: true,
        };

        await expect(generateExactWeightedOutcomeLibrary(options)).rejects.toMatchObject({
            name: "WeightedOutcomeLibraryGenerationError",
            code: "weighted-outcome-library-generation-bet-mode-unsupported",
            message: expect.stringContaining('cannot exactly enumerate bet mode "ante" because its exact-enumeration session does not support bet-mode selection'),
        });
    });

    it("fails closed when the space exceeds maxOutcomeSpaceSize and bounded was not requested", async () => {
        await expect(
            generateExactWeightedOutcomeLibrary({
                libraryId: "fixture-lib",
                game: buildFixtureGame(),
                pokieVersion: "1.3.0",
                maxOutcomeSpaceSize: BigInt(3),
            }),
        ).rejects.toMatchObject({name: "WeightedOutcomeLibraryGenerationError"});

        try {
            await generateExactWeightedOutcomeLibrary({
                libraryId: "fixture-lib",
                game: buildFixtureGame(),
                pokieVersion: "1.3.0",
                maxOutcomeSpaceSize: BigInt(3),
            });
            fail("expected generation to reject");
        } catch (error) {
            expect((error as WeightedOutcomeLibraryGenerationError).getCode()).toBe("weighted-outcome-library-generation-space-exceeded");
            expect((error as WeightedOutcomeLibraryGenerationError).message).toContain("--sample <n> --seed <string>");
            expect((error as WeightedOutcomeLibraryGenerationError).message).toContain("pokie build <project> --target outcomeLibrary");
        }
    });

    it("never silently downgrades -- a space within maxOutcomeSpaceSize is always exact even when bounded is set", async () => {
        const result = await generateExactWeightedOutcomeLibrary({
            libraryId: "fixture-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            bounded: {sampleSize: BigInt(2), seed: "unused"},
        });

        expect(result.diagnostics.strategy).toBe("exact");
        expect(result.diagnostics.sampledRawCount).toBe(6);
    });

    it("directly performs the requested deterministic sampled draws even when exact enumeration is affordable", async () => {
        const options = {
            libraryId: "fixture-sample-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            sampled: {sampleSize: BigInt(10), seed: "direct-sample-seed"},
        };

        const result = await generateSampledWeightedOutcomeLibrary(options);
        expect(result.diagnostics.strategy).toBe("bounded-coverage");
        expect(result.diagnostics.sampledRawCount).toBe(10);
        expect(result.diagnostics.seed).toBe("direct-sample-seed");
        expect(result.library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(10);

        const repeat = await generateSampledWeightedOutcomeLibrary({...options, game: buildFixtureGame()});
        expect(repeat.library.outcomes).toEqual(result.library.outcomes);

        const otherSeed = await generateSampledWeightedOutcomeLibrary({...options, game: buildFixtureGame(), sampled: {...options.sampled, seed: "other-seed"}});
        expect(otherSeed.diagnostics.seed).toBe("other-seed");
        expect(otherSeed.library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(10);
        expect(otherSeed.library.outcomes).not.toEqual(result.library.outcomes);
    });

    it("rejects an invalid sampled limit with the public CLI recovery path", async () => {
        await expect(
            generateSampledWeightedOutcomeLibrary({
                libraryId: "fixture-sample-lib",
                game: buildFixtureGame(),
                pokieVersion: "1.3.0",
                sampled: {sampleSize: BigInt(0), seed: "invalid-limit"},
            }),
        ).rejects.toMatchObject({
            code: "weighted-outcome-library-generation-invalid-sample-size",
            message: expect.stringContaining("--sample <n> --seed <string>"),
        });
    });

    it("uses an explicitly-labelled, reproducible bounded-coverage sample once the caller opts in past the cap", async () => {
        const options = {
            libraryId: "fixture-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            maxOutcomeSpaceSize: BigInt(3),
            bounded: {sampleSize: BigInt(10), seed: "coverage-seed"},
        };

        const result = await generateExactWeightedOutcomeLibrary(options);
        expect(result.diagnostics.strategy).toBe("bounded-coverage");
        expect(result.diagnostics.seed).toBe("coverage-seed");
        expect(result.diagnostics.totalOutcomeSpaceSize).toBe(6);
        expect(result.diagnostics.sampledRawCount).toBe(10);
        expect(result.library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(10);

        // Reproducible: the same seed draws the exact same sample.
        const repeat = await generateExactWeightedOutcomeLibrary({...options, game: buildFixtureGame()});
        expect(repeat.library.outcomes.map((outcome) => ({id: outcome.id, weight: outcome.weight}))).toEqual(
            result.library.outcomes.map((outcome) => ({id: outcome.id, weight: outcome.weight})),
        );
    });

    // heapUsedLimitBytes/getHeapUsedBytes are consulted at accumulateUniqueGridWeights's own YIELD_EVERY
    // cadence (5000 raw combinations) -- fixture-slot's own exact space is far too small (6) to ever reach
    // that boundary, so these two tests use a bounded-coverage sample sized past it instead (sampling with
    // replacement works from any reel-size product, however small) purely to prove the options are threaded
    // through the real public API, not to re-test the guard's own internal behavior (see
    // accumulateUniqueGridWeights.test.ts for that).
    it("threads a custom heapUsedLimitBytes/getHeapUsedBytes through generateExactWeightedOutcomeLibrary and fails closed once crossed", async () => {
        const options = {
            libraryId: "fixture-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            maxOutcomeSpaceSize: BigInt(3),
            bounded: {sampleSize: BigInt(6000), seed: "heap-guard"},
            heapUsedLimitBytes: 1_000,
            getHeapUsedBytes: () => 2_000,
        };

        await expect(generateExactWeightedOutcomeLibrary(options)).rejects.toMatchObject({name: "WeightedOutcomeLibraryGenerationError"});

        try {
            await generateExactWeightedOutcomeLibrary({...options, game: buildFixtureGame()});
            throw new Error("expected generation to reject");
        } catch (error) {
            expect((error as WeightedOutcomeLibraryGenerationError).getCode()).toBe("weighted-outcome-library-generation-memory-exceeded");
        }
    });

    it("stays unaffected by a custom heapUsedLimitBytes/getHeapUsedBytes pair that never crosses the limit", async () => {
        const result = await generateExactWeightedOutcomeLibrary({
            libraryId: "fixture-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            maxOutcomeSpaceSize: BigInt(3),
            bounded: {sampleSize: BigInt(6000), seed: "heap-guard-ok"},
            heapUsedLimitBytes: 1_000_000_000,
            getHeapUsedBytes: () => 10,
        });

        expect(result.diagnostics.sampledRawCount).toBe(6000);
    });

    // A signal test double whose own "aborted" getter flips to true only after "count" reads -- lets a test
    // cancel a sweep after a specific number of raw tuples were already processed, without depending on
    // accumulateUniqueGridWeights's own YIELD_EVERY progress cadence (far coarser than this fixture's total
    // raw space of 6).
    function abortAfterReads(count: number): AbortSignal {
        let reads = 0;
        return {
            get aborted() {
                reads++;
                return reads > count;
            },
        } as unknown as AbortSignal;
    }

    it("resumes a cancelled exact sweep, via its own checkpoint, into a complete library identical to an uninterrupted run", async () => {
        expect.assertions(9);

        let cancelled: WeightedOutcomeLibraryGenerationCancelledError | undefined;
        try {
            await generateExactWeightedOutcomeLibrary({
                libraryId: "fixture-lib",
                game: buildFixtureGame(),
                pokieVersion: "1.3.0",
                signal: abortAfterReads(3),
            });
            fail("expected generation to be cancelled");
        } catch (error) {
            expect(error).toBeInstanceOf(WeightedOutcomeLibraryGenerationCancelledError);
            cancelled = error as WeightedOutcomeLibraryGenerationCancelledError;
        }

        // Cancelled partway through -- neither the full raw space nor zero progress -- and carrying real,
        // already-accumulated grid weights forward (not just the raw sweep position).
        expect(cancelled?.processedRawIndex).toBe(BigInt(3));
        expect(cancelled?.progressTotal).toBe(BigInt(6));
        expect(cancelled?.checkpoint.grids.size).toBeGreaterThan(0);

        const resumed = await generateExactWeightedOutcomeLibrary({
            libraryId: "fixture-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            resumeFrom: cancelled?.checkpoint,
            now: () => new Date("2026-01-01T00:00:00.000Z"),
        });

        // The merged, resumed result is honestly a complete exact sweep -- never a partial shard mislabeled
        // "exact".
        expect(resumed.diagnostics.strategy).toBe("exact");
        expect(resumed.diagnostics.totalOutcomeSpaceSize).toBe(6);
        expect(resumed.diagnostics.sampledRawCount).toBe(6);
        expect(resumed.library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(6);

        const uninterrupted = await generateExactWeightedOutcomeLibrary({
            libraryId: "fixture-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            now: () => new Date("2026-01-01T00:00:00.000Z"),
        });

        // Same outcome ids, weights, and full artifacts as an uninterrupted sweep over the whole space.
        expect(resumed.library.outcomes).toEqual(uninterrupted.library.outcomes);
    });

    it("fails closed when resumeFrom's checkpoint comes from a different source that merely shares the same outcome-space size", async () => {
        expect.assertions(2);

        let cancelled: WeightedOutcomeLibraryGenerationCancelledError | undefined;
        try {
            await generateExactWeightedOutcomeLibrary({
                libraryId: "fixture-lib",
                game: buildFixtureGame(),
                pokieVersion: "1.3.0",
                signal: abortAfterReads(3),
            });
            fail("expected generation to be cancelled");
        } catch (error) {
            cancelled = error as WeightedOutcomeLibraryGenerationCancelledError;
        }

        // buildAlternateFixtureGame() shares the exact same reel layout/outcome-space size (6) as
        // buildFixtureGame(), so progressTotal alone would match -- but it's a genuinely different game, so
        // its own sourceEnumerationId must not match the checkpoint's, and generation must fail closed rather
        // than silently merging one game's accumulated grid weights into another's "exact" library.
        try {
            await generateExactWeightedOutcomeLibrary({
                libraryId: "fixture-lib",
                game: buildAlternateFixtureGame(),
                pokieVersion: "1.3.0",
                resumeFrom: cancelled?.checkpoint,
            });
            fail("expected generation to reject");
        } catch (error) {
            expect(error).toBeInstanceOf(WeightedOutcomeLibraryGenerationError);
            expect((error as WeightedOutcomeLibraryGenerationError).getCode()).toBe("weighted-outcome-library-generation-checkpoint-mismatch");
        }
    });

    it("fails closed when resumeFrom's checkpoint doesn't match this run's own outcome space", async () => {
        await expect(
            generateExactWeightedOutcomeLibrary({
                libraryId: "fixture-lib",
                game: buildFixtureGame(),
                pokieVersion: "1.3.0",
                resumeFrom: {processedRawIndex: BigInt(3), progressTotal: BigInt(999), grids: new Map(), sourceEnumerationId: "irrelevant"},
            }),
        ).rejects.toMatchObject({name: "WeightedOutcomeLibraryGenerationError"});

        try {
            await generateExactWeightedOutcomeLibrary({
                libraryId: "fixture-lib",
                game: buildFixtureGame(),
                pokieVersion: "1.3.0",
                resumeFrom: {processedRawIndex: BigInt(3), progressTotal: BigInt(999), grids: new Map(), sourceEnumerationId: "irrelevant"},
            });
            fail("expected generation to reject");
        } catch (error) {
            expect((error as WeightedOutcomeLibraryGenerationError).getCode()).toBe("weighted-outcome-library-generation-checkpoint-mismatch");
        }
    });

    it("cancels via AbortSignal and reports a resumable raw index", async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(
            generateExactWeightedOutcomeLibrary({
                libraryId: "fixture-lib",
                game: buildFixtureGame(),
                pokieVersion: "1.3.0",
                signal: controller.signal,
            }),
        ).rejects.toBeInstanceOf(WeightedOutcomeLibraryGenerationCancelledError);

        try {
            await generateExactWeightedOutcomeLibrary({
                libraryId: "fixture-lib",
                game: buildFixtureGame(),
                pokieVersion: "1.3.0",
                signal: controller.signal,
            });
            fail("expected generation to reject");
        } catch (error) {
            const cancelled = error as WeightedOutcomeLibraryGenerationCancelledError;
            expect(cancelled.processedRawIndex).toBe(BigInt(0));
            expect(cancelled.progressTotal).toBe(BigInt(6));
        }
    });

    it("reports progress at least once for a small sweep", async () => {
        const onProgress = jest.fn();
        await generateExactWeightedOutcomeLibrary({
            libraryId: "fixture-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            onProgress,
        });

        expect(onProgress).toHaveBeenCalledWith(BigInt(6), BigInt(6));
    });

    it("fails closed when createExactEnumerationSession returns a session that cannot afford one round", async () => {
        await expect(
            generateExactWeightedOutcomeLibrary({libraryId: "fixture-lib", game: buildUnplayableFixtureGame(), pokieVersion: "1.3.0"}),
        ).rejects.toMatchObject({name: "WeightedOutcomeLibraryGenerationError"});
    });

    it("streams straight into OutcomeLibraryBundleWriter as a mode's own outcome source, with no second calculation path", async () => {
        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-generate-bundle-test-"));
        fs.rmdirSync(outDir);
        try {
            const writer = new OutcomeLibraryBundleWriter("1.3.0");
            const result = await writer.writeToDirectory(
                [{modeName: "base", libraryId: "fixture-lib", outcomes: streamExactWeightedOutcomes({libraryId: "fixture-lib", game: buildFixtureGame(), pokieVersion: "1.3.0"})}],
                outDir,
            );

            expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
            expect(result.manifest?.modes[0].outcomeCount).toBe(4);
            expect(result.manifest?.modes[0].totalWeight).toBe(6);

            const reader = new OutcomeLibraryBundleReader();
            const library = await reader.readLibrary(outDir, "base");
            expect(library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(6);
        } finally {
            fs.rmSync(outDir, {recursive: true, force: true});
        }
    });

    // Integration: proves the public producer works against a real "pokie build" package -- loaded
    // exactly the way loadPokieGame() would, via require() of its built dist/index.js -- not just a
    // hand-built test double (see GenerateTestFixtures.ts). renderBuiltGameModule.ts wires
    // createExactEnumerationSession() onto every generated package with finite paid-spin reel stops,
    // driving the exact same createSession() construction its live paid spins use.
    describe("against a real generated \"pokie build\" package", () => {
        let cwd: string;

        beforeEach(() => {
            cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-generate-exact-enum-test-"));
        });

        afterEach(() => {
            fs.rmSync(cwd, {recursive: true, force: true});
        });

        // Same hand-computable math model as GenerateTestFixtures's buildFixtureGame() (2 reels, 1 row,
        // reel 0 = ["A","A","B"], reel 1 = ["A","B"], a 2-of-a-kind "A" pays 5x bet) -- but built and
        // loaded through the real "pokie build" -> require() pipeline instead of a hand-built PokieGame.
        function buildRealFiniteSlotGame(cwd: string): PokieGame {
            const blueprint: GameBlueprint = {
                manifest: {id: "exact-enum-real-slot", name: "Exact Enum Real Slot", version: "1.0.0"},
                reels: 2,
                rows: 1,
                symbols: ["A", "B"],
                paytable: {A: {2: 5}},
                reelStrips: [
                    ["A", "A", "B"],
                    ["A", "B"],
                ],
            };
            const result = new GamePackageGenerator("1.3.0").generate(blueprint, cwd);
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require(path.join(result.projectRoot, "dist", "index.js")) as PokieGame;
        }

        it("implements createExactEnumerationSession and generates an exact library, driven by the real generated session/win-calculation runtime", async () => {
            const game = buildRealFiniteSlotGame(cwd);
            expect(typeof game.createExactEnumerationSession).toBe("function");

            const result = await generateExactWeightedOutcomeLibrary({
                libraryId: "real-slot-lib",
                game,
                pokieVersion: "1.3.0",
                now: () => new Date("2026-01-01T00:00:00.000Z"),
            });

            expect(result.diagnostics.strategy).toBe("exact");
            expect(result.diagnostics.algorithm).toBe("pokie-exact-reel-enumeration-v1");
            expect(result.diagnostics.totalOutcomeSpaceSize).toBe(6);
            expect(result.diagnostics.sampledRawCount).toBe(6);
            expect(result.diagnostics.pokieVersion).toBe("1.3.0");
            expect(result.diagnostics.game).toEqual({id: "exact-enum-real-slot", name: "Exact Enum Real Slot", version: "1.0.0"});
            expect(result.diagnostics.generatedAt).toBe("2026-01-01T00:00:00.000Z");

            const {library} = result;
            // 4 distinct grids: (A,A) w=2, (A,B) w=2, (B,A) w=1, (B,B) w=1 -- exact total weight 6,
            // matching the raw 3*2 reel-stop space exactly (see GenerateTestFixtures's own comment).
            expect(library.outcomes).toHaveLength(4);
            expect(library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(6);

            const winners = library.outcomes.filter((outcome) => outcome.artifact.payoutMultiplier > 0);
            expect(winners).toHaveLength(1);
            expect(winners[0].weight).toBe(2);
            expect(winners[0].artifact.payoutMultiplier).toBe(5);
            expect(winners[0].artifact.screen).toEqual([["A"], ["A"]]);
            // Runtime-derived artifact provenance -- comes straight off the real generated package's own
            // manifest, not restated/guessed by the generator.
            expect(winners[0].artifact.provenance.game).toEqual({id: "exact-enum-real-slot", name: "Exact Enum Real Slot", version: "1.0.0"});
            expect(winners[0].artifact.provenance.pokieVersion).toBe("1.3.0");
        });

        it("enumerates a real generated free-games entry spin and preserves its feature trigger", async () => {
            const blueprint: GameBlueprint = {
                manifest: {id: "exact-enum-freegames-slot", name: "Exact Enum Free Games Slot", version: "1.0.0"},
                reels: 3,
                rows: 1,
                symbols: ["S"],
                scatters: ["S"],
                paytable: {S: {3: 2}},
                mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 10}}},
                reelStrips: [
                    ["S"],
                    ["S"],
                    ["S"],
                ],
            };
            const result = new GamePackageGenerator("1.3.0").generate(blueprint, cwd);
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const game = require(path.join(result.projectRoot, "dist", "index.js")) as PokieGame;

            expect(typeof game.createExactEnumerationSession).toBe("function");

            const {library, diagnostics} = await generateExactWeightedOutcomeLibrary({libraryId: "freegames-lib", game, pokieVersion: "1.3.0"});

            expect(diagnostics.strategy).toBe("exact");
            expect(diagnostics.totalOutcomeSpaceSize).toBe(1);
            expect(library.outcomes).toHaveLength(1);
            expect(library.outcomes[0].artifact.stake).toBeGreaterThan(0);
            expect(library.outcomes[0].artifact.featureEvents).toEqual([{type: "freeGamesTriggered", data: {count: 10}}]);
        });
    });
});
