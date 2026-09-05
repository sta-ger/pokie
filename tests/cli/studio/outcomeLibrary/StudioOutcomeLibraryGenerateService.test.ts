import {
    ArtifactConversionPlan,
    DEFAULT_BOUNDED_OUTCOME_LIBRARY_SAMPLE_SIZE,
    DEFAULT_BOUNDED_OUTCOME_LIBRARY_SEED,
    DEFAULT_MAX_EXACT_OUTCOME_SPACE_SIZE,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleWriter,
    OUTCOME_LIBRARY_GENERATION_COMPATIBILITY_VERSION,
    PokieGame,
    WeightedOutcomeLibraryGenerationCancelledError,
    generateWeightedOutcomeLibrary,
} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {StudioOutcomeLibraryGenerateService} from "../../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.js";
import {buildAlternateFixtureGame, buildFixtureGame, buildUnsupportedFixtureGame} from "../../../weightedoutcome/generate/GenerateTestFixtures.js";

const POKIE_VERSION = "9.9.9";

const plannedOutcomeLibrary: ArtifactConversionPlan = {
    status: "planned",
    source: {kind: "tsPackage", capabilities: ["outcome-library-generate"]},
    target: {kind: "outcomeLibrary", capabilities: ["outcome-library-read"]},
    steps: [{kind: "generateOutcomeLibrary", choice: "materialize", estimatedWork: "generate", input: {kind: "tsPackage", capabilities: []}, output: {kind: "outcomeLibrary", capabilities: []}}],
    preflight: {destinationKind: "directory", estimatedWork: "generate", losses: [], oneWay: false},
};

// Real generateExactWeightedOutcomeLibrary/estimateExactOutcomeSpaceSize/OutcomeLibraryBundleWriter/Reader
// against a real temp directory -- same discipline as OutcomeLibraryGenerateWorkflow.integration.test.ts,
// scaled down to this service's own unit-test lane by using GenerateTestFixtures' tiny, hand-computable
// fixture game (6 raw reel-stop combinations, 4 distinct grids) instead of a full "pokie build" package on
// disk (this service never calls loadPokieGame() itself in production -- see its own `loadGame` seam --
// so there's nothing to gain from also building a real package here).
describe("StudioOutcomeLibraryGenerateService", () => {
    let projectRoot: string;

    beforeEach(() => {
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-outcomelibrary-generate-"));
    });

    afterEach(() => {
        fs.rmSync(projectRoot, {recursive: true, force: true});
    });

    function service(pokieVersion: string = POKIE_VERSION, game: PokieGame = buildFixtureGame()): StudioOutcomeLibraryGenerateService {
        // The runtime seam deliberately does not turn this temporary directory
        // into a recognized package. Supply the already-prepared package plan
        // that production obtains from the resolver so these tests exercise
        // generation rather than fabricated source recognition.
        return new StudioOutcomeLibraryGenerateService(
            pokieVersion,
            () => Promise.resolve(game),
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            {prepare: () => Promise.resolve(plannedOutcomeLibrary)},
        );
    }

    describe("estimate", () => {
        it("plans a managed Studio Blueprint source through the same recognized artifact route as its runtime", async () => {
            const blueprintPath = path.join(projectRoot, "blueprint.json");
            fs.writeFileSync(blueprintPath, JSON.stringify({
                manifest: {id: "studio-starter", name: "Studio Starter", version: "1.0.0"},
                reels: 2,
                rows: 1,
                symbols: ["A", "B"],
                paytable: {A: {2: 5}},
                reelStrips: [["A", "A", "B"], ["A", "B"]],
                availableBets: [1],
            }));

            const studio = new StudioOutcomeLibraryGenerateService(
                POKIE_VERSION,
                () => Promise.resolve(buildFixtureGame()),
            );
            const result = await studio.estimate(blueprintPath, {});

            expect(result).toMatchObject({
                status: "ok",
                plan: {
                    status: "planned",
                    source: {kind: "blueprint", canonicalLocation: blueprintPath},
                    target: {kind: "outcomeLibrary", canonicalLocation: path.join(projectRoot, "outcomelibrary")},
                },
            });
            if (result.status !== "ok") throw new Error("Expected a recognized managed Blueprint plan.");
            await expect(studio.generate(blueprintPath, {preflightToken: result.preflightToken})).resolves.toMatchObject({
                status: "ok",
                plan: {status: "planned", source: {kind: "blueprint", canonicalLocation: blueprintPath}},
            });
        });

        it("rejects every WASM sidecar state before registry, estimate, generation, or a package load", async () => {
            const wasmPath = path.join(projectRoot, "component.wasm");
            const sidecar = `${wasmPath}.pokie-wasm.json`;
            const loadGame = jest.fn(() => Promise.resolve(buildFixtureGame()));
            const svc = new StudioOutcomeLibraryGenerateService(
                POKIE_VERSION, loadGame, undefined, undefined, undefined, undefined, undefined, undefined,
                undefined, undefined, undefined, undefined, {prepare: () => Promise.resolve(plannedOutcomeLibrary)},
            );
            fs.writeFileSync(wasmPath, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
            const compatible = {
                schemaVersion: "1.0.0", component: {id: "fixture", version: "1.0.0"},
                serialization: {session: "session", play: "play", state: "state"}, host: {rng: "rng", services: []}, capabilities: [],
            };
            const cases: readonly [string, string | undefined, RegExp][] = [
                ["compatible", JSON.stringify(compatible), /cannot generate an Outcome Library/],
                ["missing", undefined, /no compatible PokieWasmComponentManifest sidecar/],
                ["malformed", "{", /sidecar at/],
                ["incompatible", JSON.stringify({...compatible, schemaVersion: "2.0.0"}), /not compatible with this POKIE build/],
            ];
            for (const [, contents, expected] of cases) {
                if (contents === undefined) fs.rmSync(sidecar, {force: true});
                else fs.writeFileSync(sidecar, contents);
                await expect(svc.estimate(wasmPath, {})).resolves.toMatchObject({status: "load-error", error: expect.stringMatching(expected)});
                await expect(svc.generate(wasmPath, {})).resolves.toMatchObject({status: "load-error", error: expect.stringMatching(expected)});
                await expect(svc.registry(wasmPath)).resolves.toMatchObject({status: "load-error", error: expect.stringMatching(expected)});
            }
            expect(loadGame).not.toHaveBeenCalled();
        });

        it("does not classify a package directory named .wasm as a component", () => {
            const packageDirectory = path.join(projectRoot, "game.wasm");
            fs.mkdirSync(packageDirectory);

            expect(service().wasmBoundaryDiagnostic(packageDirectory)).toBeUndefined();
        });

        it("does not advertise a planner result when the runtime cannot be loaded", async () => {
            const unavailable: ArtifactConversionPlan = {
                ...plannedOutcomeLibrary,
                status: "unavailable",
                steps: [],
                diagnostic: {
                    code: "missing-capability",
                    failedEdge: {from: "tsPackage", to: "outcomeLibrary"},
                    message: "No verified runtime is available.",
                    recovery: "Build a verified package.",
                },
            };
            const loadGame = jest.fn(() => Promise.reject(new Error("runtime must load before a destination-aware preflight")));
            const svc = new StudioOutcomeLibraryGenerateService(
                POKIE_VERSION,
                loadGame,
                undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
                {prepare: () => Promise.resolve(unavailable)},
            );

            await expect(svc.estimate(projectRoot, {})).resolves.toMatchObject({status: "load-error"});
            expect(loadGame).toHaveBeenCalledWith(projectRoot);
        });

        it("carries the server planner decision through estimate and generation", async () => {
            const planning = {prepare: jest.fn(() => Promise.resolve(plannedOutcomeLibrary))};
            const svc = new StudioOutcomeLibraryGenerateService(
                POKIE_VERSION,
                () => Promise.resolve(buildFixtureGame()),
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                planning,
            );

            const estimate = await svc.estimate(projectRoot, {});
            const generated = await svc.generate(projectRoot, {});

            expect(estimate).toMatchObject({status: "ok", plan: plannedOutcomeLibrary});
            expect(generated).toMatchObject({status: "ok", plan: plannedOutcomeLibrary});
            expect(planning.prepare).toHaveBeenNthCalledWith(1, projectRoot, "outcomeLibrary", path.join(projectRoot, "outcomelibrary"), {generationSemantics: "exact"});
            expect(planning.prepare).toHaveBeenNthCalledWith(2, projectRoot, "outcomeLibrary", path.join(projectRoot, "outcomelibrary"), {generationSemantics: "exact"});
        });

        it("publishes a managed Blueprint retry when cancellation recovery's destination probe cannot re-recognize the source", async () => {
            const blueprintPath = path.join(projectRoot, "blueprint.json");
            fs.writeFileSync(blueprintPath, "{}");
            const destination = path.join(projectRoot, "outcomelibrary");
            const managedBlueprintPlan: ArtifactConversionPlan = {
                ...plannedOutcomeLibrary,
                source: {
                    kind: "blueprint",
                    canonicalLocation: blueprintPath,
                    capabilities: ["blueprint.build", "outcomeLibrary.generate"],
                },
                target: {
                    kind: "outcomeLibrary",
                    canonicalLocation: destination,
                    capabilities: ["outcome-library-read"],
                },
            };
            const unavailableSourcePlan: ArtifactConversionPlan = {
                ...managedBlueprintPlan,
                status: "unavailable",
                steps: [],
                diagnostic: {
                    code: "unrecognized-source",
                    failedEdge: {from: "tsPackage", to: "outcomeLibrary"},
                    message: "This Studio source is not an independently recognized POKIE artifact and cannot be used for conversion planning.",
                    recovery: "Open or generate a recognized POKIE Outcome Library bundle, then retry the action.",
                },
            };
            let plannerCalls = 0;
            const planning = {prepare: jest.fn(() => {
                plannerCalls += 1;
                // Both visible preflights recognize the managed Blueprint.
                // A publication-time source re-probe reproduces the resolver
                // race that must not invalidate the already bound retry.
                return Promise.resolve(plannerCalls < 3 ? managedBlueprintPlan : unavailableSourcePlan);
            })};
            let generationCalls = 0;
            const svc = new StudioOutcomeLibraryGenerateService(
                POKIE_VERSION,
                () => Promise.resolve(buildFixtureGame()),
                undefined,
                (request) => {
                    generationCalls += 1;
                    if (generationCalls === 1) {
                        throw new WeightedOutcomeLibraryGenerationCancelledError(BigInt(1), BigInt(6), new Map(), "fixture-enumeration");
                    }
                    return generateWeightedOutcomeLibrary(request);
                },
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                planning,
            );

            const initialPreflight = await svc.estimate(blueprintPath, {generation: "exact"});
            expect(initialPreflight.status).toBe("ok");
            if (initialPreflight.status !== "ok") return;
            await expect(svc.generate(blueprintPath, {generation: "exact", preflightToken: initialPreflight.preflightToken})).resolves.toMatchObject({
                status: "cancelled",
                plan: managedBlueprintPlan,
            });

            const refreshedPreflight = await svc.estimate(blueprintPath, {generation: "exact"});
            expect(refreshedPreflight.status).toBe("ok");
            if (refreshedPreflight.status !== "ok") return;

            // HTTP validates a displayed token before creating its job. That
            // boundary must retain the refreshed managed Blueprint identity
            // too: a third source-planner probe is the cancellation/retry
            // failure this regression covers.
            const binding = svc.getPreflightBinding(refreshedPreflight.preflightToken);
            expect(binding).toBeDefined();
            if (binding === undefined) return;
            await expect(svc.validatePreflightBinding(
                blueprintPath,
                {generation: "exact", preflightToken: refreshedPreflight.preflightToken},
                binding,
            )).resolves.toBeUndefined();

            const generated = await svc.generate(blueprintPath, {generation: "exact", preflightToken: refreshedPreflight.preflightToken});

            expect(generated).toMatchObject({status: "ok", plan: managedBlueprintPlan});
            expect(fs.existsSync(path.join(destination, "manifest.json"))).toBe(true);
            // Initial/refreshed preflights own recognition; publication uses
            // the token-bound source and destination rather than re-planning.
            expect(planning.prepare).toHaveBeenCalledTimes(2);
        });

        it("rejects a caller-owned destination introduced after a token-bound Blueprint preflight without publishing or registering it", async () => {
            const blueprintPath = path.join(projectRoot, "blueprint.json");
            fs.writeFileSync(blueprintPath, "{}");
            const destination = path.join(projectRoot, "outcomelibrary");
            const managedBlueprintPlan: ArtifactConversionPlan = {
                ...plannedOutcomeLibrary,
                source: {
                    kind: "blueprint",
                    canonicalLocation: blueprintPath,
                    capabilities: ["blueprint.build", "outcomeLibrary.generate"],
                },
                target: {
                    kind: "outcomeLibrary",
                    canonicalLocation: destination,
                    capabilities: ["outcome-library-read"],
                },
            };
            const writer = {writeToDirectory: jest.fn()} as unknown as OutcomeLibraryBundleWriter<string>;
            const bundleReader = {
                readManifest: jest.fn(() => Promise.resolve({modes: []})),
            } as unknown as OutcomeLibraryBundleReader<string>;
            const svc = new StudioOutcomeLibraryGenerateService(
                POKIE_VERSION,
                () => Promise.resolve(buildFixtureGame()),
                undefined,
                (request) => {
                    fs.mkdirSync(destination);
                    fs.writeFileSync(path.join(destination, "caller-owned.txt"), "do not replace");
                    return generateWeightedOutcomeLibrary(request);
                },
                writer,
                bundleReader,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                {prepare: () => Promise.resolve(managedBlueprintPlan)},
            );

            const preflight = await svc.estimate(blueprintPath, {generation: "exact"});
            expect(preflight.status).toBe("ok");
            if (preflight.status !== "ok") return;

            await expect(svc.generate(blueprintPath, {generation: "exact", preflightToken: preflight.preflightToken})).resolves.toMatchObject({
                status: "load-error",
                error: expect.stringContaining("already exists and is not empty"),
                plan: managedBlueprintPlan,
            });
            expect(writer.writeToDirectory).not.toHaveBeenCalled();
            expect(fs.readFileSync(path.join(destination, "caller-owned.txt"), "utf-8")).toBe("do not replace");
            expect(fs.existsSync(path.join(projectRoot, ".pokie", "outcome-library-registry.json"))).toBe(false);
        });

        it("keeps legacy bounded generation below the cap exact in the prepared plan", async () => {
            const planning = {prepare: jest.fn(() => Promise.resolve(plannedOutcomeLibrary))};
            const svc = new StudioOutcomeLibraryGenerateService(
                POKIE_VERSION,
                () => Promise.resolve(buildFixtureGame()),
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                planning,
            );

            await svc.generate(projectRoot, {bounded: {sampleSize: BigInt(2), seed: "fixture-seed"}});

            expect(planning.prepare).toHaveBeenCalledWith(projectRoot, "outcomeLibrary", path.join(projectRoot, "outcomelibrary"), {generationSemantics: "exact"});
        });

        it("reports the exact strategy for a small fixture game", async () => {
            const result = await service().estimate(projectRoot, {});
            expect(result).toMatchObject({
                status: "ok",
                strategy: "exact",
                requiresBounded: false,
                totalOutcomeSpaceSize: 6,
                defaults: {
                    compatibilityVersion: OUTCOME_LIBRARY_GENERATION_COMPATIBILITY_VERSION,
                    maxExactOutcomeSpaceSize: Number(DEFAULT_MAX_EXACT_OUTCOME_SPACE_SIZE),
                    boundedSample: {
                        sampleSize: Number(DEFAULT_BOUNDED_OUTCOME_LIBRARY_SAMPLE_SIZE),
                        seed: DEFAULT_BOUNDED_OUTCOME_LIBRARY_SEED,
                    },
                },
            });
        });

        it("reports bounded-coverage as required once maxOutcomeSpaceSize is set below the space size", async () => {
            const result = await service().estimate(projectRoot, {maxOutcomeSpaceSize: BigInt(2)});
            expect(result).toMatchObject({status: "ok", strategy: "bounded-coverage", requiresBounded: true});
        });

        it("uses the same explicit sampled request for Studio preflight and execution", async () => {
            const sampled = {sampleSize: BigInt(2), seed: "shared-request-seed"};
            const svc = service();
            const estimate = await svc.estimate(projectRoot, {generation: "sampled", sample: sampled});
            const generated = await svc.generate(projectRoot, {generation: "sampled", sample: sampled});

            expect(estimate).toMatchObject({status: "ok", strategy: "bounded-coverage", requiresBounded: false, expectedRawWork: 2, sampleSize: 2, seed: "shared-request-seed"});
            expect(generated).toMatchObject({status: "ok", generator: {strategy: "bounded-coverage", seed: "shared-request-seed"}});
        });

        it("fails closed when a resumed checkpoint's bound source changes", async () => {
            let currentGame: PokieGame = buildFixtureGame();
            const svc = new StudioOutcomeLibraryGenerateService(
                POKIE_VERSION,
                () => Promise.resolve(currentGame),
                undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
                {prepare: () => Promise.resolve(plannedOutcomeLibrary)},
            );
            const request = {generation: "exact" as const, outDir: "outcomelibrary"};
            const preflight = await svc.estimate(projectRoot, request);
            expect(preflight.status).toBe("ok");
            if (preflight.status !== "ok") return;
            const binding = svc.getPreflightBinding(preflight.preflightToken);
            expect(binding).toBeDefined();
            currentGame = buildAlternateFixtureGame();

            await expect(svc.rebindCheckpointRequest(projectRoot, {...request, preflightToken: preflight.preflightToken}, binding!)).resolves.toMatchObject({
                result: {status: "conflict"},
            });
        });

        it("reports unsupported for a game that never opted into exact enumeration", async () => {
            const result = await service(POKIE_VERSION, buildUnsupportedFixtureGame()).estimate(projectRoot, {});
            expect(result.status).toBe("unsupported");
        });

        it("reports load-error when the package fails to load", async () => {
            const failing = new StudioOutcomeLibraryGenerateService(
                POKIE_VERSION,
                () => Promise.reject(new Error("boom")),
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                {prepare: () => Promise.resolve(plannedOutcomeLibrary)},
            );
            const result = await failing.estimate(projectRoot, {});
            expect(result).toMatchObject({status: "load-error", error: "boom", plan: {status: "unavailable", source: {kind: "tsPackage"}}});
        });
    });

    describe("generate", () => {
        it("materializes the exact managed bundle selected by a reuse plan without regenerating it", async () => {
            const managed = await service().generate(projectRoot, {outDir: "managed-outcomes"});
            expect(managed.status).toBe("ok");

            const destination = path.join(projectRoot, "reused-outcomes");
            const reusePlan: ArtifactConversionPlan = {
                ...plannedOutcomeLibrary,
                target: {
                    ...plannedOutcomeLibrary.target,
                    canonicalLocation: destination,
                },
                steps: [
                    {
                        kind: "reuseManagedOutcomeLibrary",
                        choice: "reuse",
                        estimatedWork: "none",
                        input: plannedOutcomeLibrary.source,
                        output: {kind: "outcomeLibrary", canonicalLocation: path.join(projectRoot, "managed-outcomes"), capabilities: ["outcome-library-read"]},
                    },
                    {
                        kind: "publish",
                        choice: "publish",
                        estimatedWork: "publish",
                        input: {kind: "outcomeLibrary", canonicalLocation: path.join(projectRoot, "managed-outcomes"), capabilities: ["outcome-library-read"]},
                        output: {...plannedOutcomeLibrary.target, canonicalLocation: destination},
                    },
                ],
                managedOutcome: {disposition: "reused"},
            };
            const regenerate = () => Promise.reject(new Error("reuse must not regenerate"));
            const svc = new StudioOutcomeLibraryGenerateService(
                POKIE_VERSION,
                () => Promise.resolve(buildFixtureGame()),
                undefined,
                regenerate,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                {prepare: () => Promise.resolve(reusePlan)},
            );

            await expect(svc.generate(projectRoot, {outDir: "reused-outcomes"})).resolves.toMatchObject({
                status: "ok",
                bundleDir: "reused-outcomes",
                plan: reusePlan,
                generator: {strategy: "exact"},
            });
            await expect(new OutcomeLibraryBundleReader().readManifest(destination)).resolves.toMatchObject({modes: [{modeName: "base"}]});
        });

        it("writes the default bundle directory and reports path/files/provenance/hash/generator/count/weight/RTP/coverage", async () => {
            const result = await service().generate(projectRoot, {});
            if (result.status !== "ok") {
                throw new Error(`expected ok, got ${JSON.stringify(result)}`);
            }

            expect(result.bundleDir).toBe(StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR);
            expect(fs.existsSync(path.join(projectRoot, "outcomelibrary", "manifest.json"))).toBe(true);
            expect(result.files.length).toBeGreaterThan(0);
            expect(result.mode.modeName).toBe("base");
            expect(result.mode.libraryId).toBe("fixture-slot");
            expect(result.mode.outcomeCount).toBe(4);
            expect(result.mode.totalWeight).toBe(6);
            expect(result.mode.hash).toEqual(expect.any(String));
            expect(result.generator.strategy).toBe("exact");
            expect(result.generator.pokieVersion).toBe(POKIE_VERSION);
            expect(result.coverage).toBe(1);
            expect(result.selector).toEqual({kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"});

            const manifest = await new OutcomeLibraryBundleReader().readManifest(path.join(projectRoot, "outcomelibrary"));
            expect(manifest.modes).toHaveLength(1);
        });

        it("derives modeName/libraryId defaults from the game id and --mode, same as the CLI", async () => {
            const result = await service().generate(projectRoot, {mode: "bonus"});
            if (result.status !== "ok") {
                throw new Error(`expected ok, got ${JSON.stringify(result)}`);
            }
            expect(result.selector).toEqual({kind: "bundle", bundleDir: "outcomelibrary", modeName: "bonus"});
            expect(result.mode.libraryId).toBe("fixture-slot-bonus");
        });

        it("preserves every other mode already in the bundle when regenerating one mode", async () => {
            const svc = service();
            const first = await svc.generate(projectRoot, {mode: "base"});
            const second = await svc.generate(projectRoot, {mode: "bonus"});
            expect(first.status).toBe("ok");
            expect(second.status).toBe("ok");

            const manifest = await new OutcomeLibraryBundleReader().readManifest(path.join(projectRoot, "outcomelibrary"));
            expect(manifest.modes.map((entry) => entry.modeName).sort()).toEqual(["base", "bonus"]);

            // Regenerating "base" again must not drop "bonus".
            const third = await svc.generate(projectRoot, {mode: "base"});
            expect(third.status).toBe("ok");
            const manifestAfter = await new OutcomeLibraryBundleReader().readManifest(path.join(projectRoot, "outcomelibrary"));
            expect(manifestAfter.modes.map((entry) => entry.modeName).sort()).toEqual(["base", "bonus"]);
        });

        it("reports unsupported for a game that never opted into exact enumeration", async () => {
            const result = await service(POKIE_VERSION, buildUnsupportedFixtureGame()).generate(projectRoot, {});
            expect(result.status).toBe("unsupported");
        });

        it("reports generation-error when the space exceeds maxOutcomeSpaceSize without bounded options", async () => {
            const result = await service().generate(projectRoot, {maxOutcomeSpaceSize: BigInt(2)});
            expect(result).toMatchObject({status: "generation-error", code: "weighted-outcome-library-generation-space-exceeded"});
        });

        it("uses the prepared domain destination contract for both estimate and execution", async () => {
            await expect(service().estimate(projectRoot, {outDir: "../outside-project"})).resolves.toMatchObject({
                status: "conflict",
                error: expect.stringMatching(/outside its permitted publication root/i),
            });
            await expect(service().generate(projectRoot, {outDir: "../outside-project"})).resolves.toMatchObject({
                status: "conflict",
                error: expect.stringMatching(/outside its permitted publication root/i),
            });
        });

        it("returns a resumable cancellation result without publishing a partial bundle", async () => {
            const controller = new AbortController();
            controller.abort();

            const result = await service().generate(projectRoot, {signal: controller.signal});

            expect(result).toMatchObject({status: "cancelled", processedRawIndex: BigInt(0), progressTotal: BigInt(6)});
            expect(fs.existsSync(path.join(projectRoot, "outcomelibrary", "manifest.json"))).toBe(false);
            if (result.status === "cancelled") {
                const resumed = await service().generate(projectRoot, {resumeFrom: result.checkpoint});
                expect(resumed).toMatchObject({status: "ok", generator: {strategy: "exact"}});
            }
        });
    });

    describe("registry", () => {
        it("reports missing when no bundle exists yet", async () => {
            const result = await service().registry(projectRoot);
            expect(result).toEqual({status: "ok", bundleDir: "outcomelibrary", buildStatus: "missing"});
        });

        it("reports compatible right after a matching generate() run", async () => {
            const svc = service();
            await svc.generate(projectRoot, {});
            const result = await svc.registry(projectRoot);
            if (result.status !== "ok" || result.buildStatus === "missing") {
                throw new Error(`expected a compatible build, got ${JSON.stringify(result)}`);
            }
            expect(result.buildStatus).toBe("compatible");
            expect(result.modes).toHaveLength(1);
            expect(result.modes[0]).toMatchObject({modeName: "base", outcomeCount: 4, strategy: "exact"});
        });

        it("reports stale once the pokie release that computed the outcomes no longer matches", async () => {
            await service("1.0.0").generate(projectRoot, {});
            const result = await service("2.0.0").registry(projectRoot);
            if (result.status !== "ok" || result.buildStatus === "missing") {
                throw new Error(`expected a stale build, got ${JSON.stringify(result)}`);
            }
            expect(result.buildStatus).toBe("stale");
        });

        it("reports wrong once the bundle belongs to a different game entirely", async () => {
            await service(POKIE_VERSION, buildFixtureGame()).generate(projectRoot, {});
            const result = await service(POKIE_VERSION, buildAlternateFixtureGame()).registry(projectRoot);
            if (result.status !== "ok" || result.buildStatus === "missing") {
                throw new Error(`expected a wrong build, got ${JSON.stringify(result)}`);
            }
            expect(result.buildStatus).toBe("wrong");
        });

        it("reports load-error when the bundle directory exists but isn't a valid bundle", async () => {
            fs.mkdirSync(path.join(projectRoot, "outcomelibrary"), {recursive: true});
            fs.writeFileSync(path.join(projectRoot, "outcomelibrary", "not-a-manifest.txt"), "nope");
            const result = await service().registry(projectRoot);
            expect(result.status).toBe("load-error");
        });

        it("discovers a library generated to a non-default, user-selected output directory", async () => {
            const svc = service();
            const generated = await svc.generate(projectRoot, {outDir: "custom-outcomes"});
            expect(generated.status).toBe("ok");

            const result = await svc.registry(projectRoot);
            if (result.status !== "ok" || result.buildStatus === "missing") {
                throw new Error(`expected a compatible build, got ${JSON.stringify(result)}`);
            }
            expect(result.buildStatus).toBe("compatible");
            expect(result.bundleDir).toBe("custom-outcomes");
            expect(result.modes).toHaveLength(1);
            expect(result.modes[0]).toMatchObject({modeName: "base", bundleDir: "custom-outcomes", buildStatus: "compatible"});
        });

        it("keeps discovering a custom output directory's library after a fresh service instance is constructed", async () => {
            const first = service();
            const generated = await first.generate(projectRoot, {outDir: "custom-outcomes"});
            expect(generated.status).toBe("ok");

            // Simulates a Studio server restart: a brand-new service instance, carrying none of `first`'s
            // in-memory state, against the same project directory on disk.
            const restarted = service();
            const result = await restarted.registry(projectRoot);
            if (result.status !== "ok" || result.buildStatus === "missing") {
                throw new Error(`expected a compatible build, got ${JSON.stringify(result)}`);
            }
            expect(result.buildStatus).toBe("compatible");
            expect(result.bundleDir).toBe("custom-outcomes");
            expect(result.modes).toHaveLength(1);
            expect(result.modes[0]).toMatchObject({modeName: "base", bundleDir: "custom-outcomes", buildStatus: "compatible"});
        });

        it("merges modes discovered across the default directory and a custom output directory", async () => {
            const svc = service();
            await svc.generate(projectRoot, {mode: "base"});
            await svc.generate(projectRoot, {mode: "bonus", outDir: "custom-outcomes"});

            const result = await svc.registry(projectRoot);
            if (result.status !== "ok" || result.buildStatus === "missing") {
                throw new Error(`expected a compatible build, got ${JSON.stringify(result)}`);
            }
            const byMode = Object.fromEntries(result.modes.map((mode) => [mode.modeName, mode]));
            expect(byMode.base).toMatchObject({bundleDir: "outcomelibrary", buildStatus: "compatible"});
            expect(byMode.bonus).toMatchObject({bundleDir: "custom-outcomes", buildStatus: "compatible"});
        });

        it("ignores an unsafe or malformed persisted registry-index entry instead of failing the whole registry read", async () => {
            const first = service();
            const generated = await first.generate(projectRoot, {outDir: "custom-outcomes"});
            expect(generated.status).toBe("ok");

            // Tamper with the persisted, project-scoped registry index directly on disk -- as if it had
            // been hand-edited or corrupted -- mixing an absolute path, a "..".-style escape, and a
            // non-string entry alongside the one legitimate, already-discovered custom directory.
            const registryIndexPath = path.join(projectRoot, ".pokie", "outcome-library-registry.json");
            fs.writeFileSync(registryIndexPath, JSON.stringify(["custom-outcomes", "/etc/passwd", "../outside-project", 42]));

            // Simulates a Studio server restart against the tampered index.
            const restarted = service();
            const result = await restarted.registry(projectRoot);
            if (result.status !== "ok" || result.buildStatus === "missing") {
                throw new Error(`expected a compatible build, got ${JSON.stringify(result)}`);
            }
            expect(result.buildStatus).toBe("compatible");
            expect(result.bundleDir).toBe("custom-outcomes");
            expect(result.modes).toHaveLength(1);
            expect(result.modes[0]).toMatchObject({modeName: "base", bundleDir: "custom-outcomes", buildStatus: "compatible"});
        });

        it("ignores a blank or project-contained non-directory persisted registry-index entry instead of failing the whole registry read", async () => {
            const first = service();
            const generated = await first.generate(projectRoot, {outDir: "custom-outcomes"});
            expect(generated.status).toBe("ok");

            // Tamper with the persisted, project-scoped registry index directly on disk -- as if it had
            // been hand-edited or corrupted -- mixing a blank entry (which resolves to the project root
            // itself, an existing but non-bundle directory) and a project-contained plain file (which
            // existsSync would report as "existing" even though it is never a valid bundle directory)
            // alongside the one legitimate, already-discovered custom directory.
            fs.writeFileSync(path.join(projectRoot, "not-a-directory.txt"), "nope");
            const registryIndexPath = path.join(projectRoot, ".pokie", "outcome-library-registry.json");
            fs.writeFileSync(registryIndexPath, JSON.stringify(["custom-outcomes", "", "not-a-directory.txt"]));

            // Simulates a Studio server restart against the tampered index.
            const restarted = service();
            const result = await restarted.registry(projectRoot);
            if (result.status !== "ok" || result.buildStatus === "missing") {
                throw new Error(`expected a compatible build, got ${JSON.stringify(result)}`);
            }
            expect(result.buildStatus).toBe("compatible");
            expect(result.bundleDir).toBe("custom-outcomes");
            expect(result.modes).toHaveLength(1);
            expect(result.modes[0]).toMatchObject({modeName: "base", bundleDir: "custom-outcomes", buildStatus: "compatible"});
        });

        it("keeps only the most recently generated occurrence when the same mode is later regenerated into a different output directory", async () => {
            let clock = new Date("2026-01-01T00:00:00.000Z");
            const writer = new OutcomeLibraryBundleWriter<string>(POKIE_VERSION, undefined, () => clock);
            const svc = new StudioOutcomeLibraryGenerateService(
                POKIE_VERSION,
                () => Promise.resolve(buildFixtureGame()),
                undefined,
                undefined,
                writer,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                {prepare: () => Promise.resolve(plannedOutcomeLibrary)},
            );

            await svc.generate(projectRoot, {mode: "base", outDir: "first-out"});
            clock = new Date("2026-01-02T00:00:00.000Z");
            await svc.generate(projectRoot, {mode: "base", outDir: "second-out"});

            const result = await svc.registry(projectRoot);
            if (result.status !== "ok" || result.buildStatus === "missing") {
                throw new Error(`expected a compatible build, got ${JSON.stringify(result)}`);
            }
            expect(result.modes).toHaveLength(1);
            expect(result.modes[0]).toMatchObject({modeName: "base", bundleDir: "second-out"});
        });
    });
});
