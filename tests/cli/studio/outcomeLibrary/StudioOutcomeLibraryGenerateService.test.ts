import {OutcomeLibraryBundleReader, PokieGame} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {StudioOutcomeLibraryGenerateService} from "../../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.js";
import {buildAlternateFixtureGame, buildFixtureGame, buildUnsupportedFixtureGame} from "../../../weightedoutcome/generate/GenerateTestFixtures.js";

const POKIE_VERSION = "9.9.9";

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
        return new StudioOutcomeLibraryGenerateService(pokieVersion, () => Promise.resolve(game));
    }

    describe("estimate", () => {
        it("reports the exact strategy for a small fixture game", async () => {
            const result = await service().estimate(projectRoot, {});
            expect(result).toMatchObject({status: "ok", strategy: "exact", requiresBounded: false, totalOutcomeSpaceSize: 6});
        });

        it("reports bounded-coverage as required once maxOutcomeSpaceSize is set below the space size", async () => {
            const result = await service().estimate(projectRoot, {maxOutcomeSpaceSize: BigInt(2)});
            expect(result).toMatchObject({status: "ok", strategy: "bounded-coverage", requiresBounded: true});
        });

        it("reports unsupported for a game that never opted into exact enumeration", async () => {
            const result = await service(POKIE_VERSION, buildUnsupportedFixtureGame()).estimate(projectRoot, {});
            expect(result.status).toBe("unsupported");
        });

        it("reports load-error when the package fails to load", async () => {
            const failing = new StudioOutcomeLibraryGenerateService(POKIE_VERSION, () => Promise.reject(new Error("boom")));
            const result = await failing.estimate(projectRoot, {});
            expect(result).toEqual({status: "load-error", error: "boom"});
        });
    });

    describe("generate", () => {
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
    });
});
