import {ArtifactConversionPlan, computeWeightedOutcomeLibraryHash, OutcomeLibraryBundleReader, OutcomeLibraryBundleWriter, OutcomeLibraryBundleWriting, generateWeightedOutcomeLibrary, loadPokieGame, releasePokieGame} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {BuildCommand} from "../../../cli/commands/BuildCommand.js";
import {OutcomeLibraryCommand} from "../../../cli/commands/OutcomeLibraryCommand.js";
import {StudioOutcomeLibraryGenerateService} from "../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.js";

const plan: ArtifactConversionPlan = {
    status: "planned",
    source: {kind: "tsPackage", capabilities: ["outcome-library-generate"]},
    target: {kind: "outcomeLibrary", capabilities: ["outcome-library-read"]},
    steps: [{kind: "generateOutcomeLibrary", choice: "materialize", estimatedWork: "generate", input: {kind: "tsPackage", capabilities: []}, output: {kind: "outcomeLibrary", capabilities: []}}],
    preflight: {destinationKind: "directory", estimatedWork: "generate", losses: [], oneWay: false},
};

function canonicalLibraryHash(library: Parameters<typeof computeWeightedOutcomeLibraryHash>[0]): string {
    return computeWeightedOutcomeLibraryHash(library);
}

function withoutGeneratedAt<T extends {readonly generatedAt?: string}>(provenance: T): Omit<T, "generatedAt"> {
    const {generatedAt: _generatedAt, ...normalized} = provenance;
    return normalized;
}

function latestCommandJson(): Record<string, unknown> {
    const message = (console.log as jest.Mock).mock.calls
        .map(([value]) => value)
        .filter((value): value is string => typeof value === "string")
        .reverse()
        .find((value) => value.startsWith("{"));
    if (message === undefined) throw new Error("Expected CLI JSON report.");
    return JSON.parse(message) as Record<string, unknown>;
}

function commandJsonReport(): Record<string, unknown> {
    const report = latestCommandJson();
    if (report.diagnostics === undefined) throw new Error("Expected CLI JSON generation report.");
    return report;
}

function expectEquivalentPreflight(
    cli: Record<string, unknown>,
    studio: {
        readonly game: unknown;
        readonly reelsNumber: number;
        readonly reelsSymbolsNumber: number;
        readonly reelSizes: readonly number[];
        readonly totalOutcomeSpaceSize: number | string;
        readonly maxOutcomeSpaceSize: number | string;
        readonly strategy: string;
        readonly expectedRawWork: number | string;
        readonly warnings: readonly string[];
        readonly requiresBounded: boolean;
        readonly sampleSize?: number | string;
        readonly seed?: string;
    },
): void {
    // This is the complete common preflight contract, rather than a display
    // subset. Both adapters preserve bigint safety with the same
    // number-or-decimal-string transport convention before publishing.
    expect({
        game: cli.game,
        reelsNumber: cli.reelsNumber,
        reelsSymbolsNumber: cli.reelsSymbolsNumber,
        reelSizes: cli.reelSizes,
        totalOutcomeSpaceSize: cli.totalOutcomeSpaceSize,
        maxOutcomeSpaceSize: cli.maxOutcomeSpaceSize,
        strategy: cli.strategy,
        expectedRawWork: cli.expectedRawWork,
        warnings: cli.warnings,
        requiresBounded: cli.requiresBounded,
        sampleSize: cli.sampleSize,
        seed: cli.seed,
    }).toEqual({
        game: studio.game,
        reelsNumber: studio.reelsNumber,
        reelsSymbolsNumber: studio.reelsSymbolsNumber,
        reelSizes: studio.reelSizes,
        totalOutcomeSpaceSize: studio.totalOutcomeSpaceSize,
        maxOutcomeSpaceSize: studio.maxOutcomeSpaceSize,
        strategy: studio.strategy,
        expectedRawWork: studio.expectedRawWork,
        warnings: studio.warnings,
        requiresBounded: studio.requiresBounded,
        sampleSize: studio.sampleSize,
        seed: studio.seed,
    });
}

describe("Outcome Library CLI and Studio generation (integration)", () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-outcome-parity-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(root, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("publishes the same deterministic sampled library and generator provenance as CLI", async () => {
        const blueprint = path.join(root, "slot.blueprint.json");
        const packageRoot = path.join(root, "package");
        fs.writeFileSync(blueprint, JSON.stringify({
            manifest: {id: "parity-slot", name: "Parity Slot", version: "1.0.0"}, reels: 2, rows: 1, symbols: ["A", "B"],
            paytable: {A: {2: 5}}, reelStrips: [["A", "A", "B"], ["A", "B"]], availableBets: [1],
        }));
        expect(await new BuildCommand("1.3.0").run([blueprint, "--target", "tsPackage", "--out", packageRoot])).toBe(0);

        const cliOutput = path.join(root, "cli.json");
        expect(await new OutcomeLibraryCommand("1.3.0").run([
            "generate", packageRoot, "--mode", "base", "--stake", "1", "--library-id", "parity-lib", "--sample", "19", "--seed", "parity-seed", "--out", cliOutput, "--estimate", "--format", "json",
        ])).toBe(0);
        const cliPreflight = latestCommandJson();
        expect(await new OutcomeLibraryCommand("1.3.0").run([
            "generate", packageRoot, "--mode", "base", "--stake", "1", "--library-id", "parity-lib", "--sample", "19", "--seed", "parity-seed", "--out", cliOutput, "--format", "json",
        ])).toBe(0);

        // Use the real Studio planner: a caller-selected project-relative
        // sidecar must receive the same acceptance at preflight and execution
        // as the default outcomelibrary directory.
        const studio = new StudioOutcomeLibraryGenerateService("1.3.0", loadPokieGame);
        const studioRequest = {libraryId: "parity-lib", mode: "base", stake: 1, generation: "sampled" as const, sample: {sampleSize: BigInt(19), seed: "parity-seed"}, outDir: "studio-library"};
        const preview = await studio.estimate(packageRoot, studioRequest);
        if (preview.status !== "ok") throw new Error("Expected sampled Studio preflight.");
        expectEquivalentPreflight(cliPreflight, preview);
        const generated = await studio.generate(packageRoot, {
            ...studioRequest, preflightToken: preview.preflightToken,
        });
        expect(preview).toMatchObject({status: "ok", strategy: "bounded-coverage", expectedRawWork: 19});
        expect(generated).toMatchObject({status: "ok", generator: {strategy: "bounded-coverage", seed: "parity-seed"}});

        const cli = JSON.parse(fs.readFileSync(cliOutput, "utf8"));
        const cliResult = commandJsonReport();
        const bundle = await new OutcomeLibraryBundleReader().readLibrary(path.join(packageRoot, "studio-library"), "base");
        expect(bundle.outcomes).toEqual(cli.outcomes);
        const generatedResult = generated as Extract<typeof generated, {status: "ok"}>;
        expect(bundle.libraryId).toBe(cli.libraryId);
        expect(generatedResult.mode.libraryId).toBe(cli.libraryId);
        expect(canonicalLibraryHash(bundle)).toBe(canonicalLibraryHash(cli));
        expect(generatedResult.mode.hash).toBe(canonicalLibraryHash(cli));
        expect(generatedResult.mode.hash).toBe((await new OutcomeLibraryBundleReader().readManifest(path.join(packageRoot, "studio-library"))).modes[0].libraryHash);
        expect(withoutGeneratedAt(generatedResult.generator)).toEqual(withoutGeneratedAt(cliResult.diagnostics as typeof generatedResult.generator));
        expect(preview).toMatchObject({
            totalOutcomeSpaceSize: 6,
            maxOutcomeSpaceSize: 20_000_000,
            sampleSize: 19,
            seed: "parity-seed",
            requiresBounded: false,
            game: {id: "parity-slot", version: "1.0.0"}, reelsNumber: 2, reelsSymbolsNumber: 1, reelSizes: [3, 2],
            warnings: ["Bounded coverage is deterministic but is not an exact enumeration."],
        });
        expect(await studio.registry(packageRoot)).toMatchObject({
            status: "ok", buildStatus: "compatible",
            modes: [expect.objectContaining({modeName: "base", buildStatus: "compatible", hash: generatedResult.mode.hash})],
        });

        // This crosses the real Studio planner (not an injected plan): a managed custom
        // directory may be updated only as a verified bundle, retaining its other modes.
        const antePreview = await studio.estimate(packageRoot, {...studioRequest, mode: "ante", libraryId: "parity-lib-ante"});
        if (antePreview.status !== "ok") throw new Error(`Expected update preflight, got ${JSON.stringify(antePreview)}`);
        await expect(studio.generate(packageRoot, {...studioRequest, mode: "ante", libraryId: "parity-lib-ante", preflightToken: antePreview.preflightToken})).resolves.toMatchObject({status: "ok"});
        const baseRegenerationPreview = await studio.estimate(packageRoot, studioRequest);
        if (baseRegenerationPreview.status !== "ok") throw new Error(`Expected regeneration preflight, got ${JSON.stringify(baseRegenerationPreview)}`);
        await expect(studio.generate(packageRoot, {...studioRequest, preflightToken: baseRegenerationPreview.preflightToken})).resolves.toMatchObject({status: "ok"});
        await expect(new OutcomeLibraryBundleReader().readManifest(path.join(packageRoot, "studio-library"))).resolves.toMatchObject({
            modes: expect.arrayContaining([expect.objectContaining({modeName: "base"}), expect.objectContaining({modeName: "ante"})]),
        });

        // The conventional default path is the same managed-bundle contract, not a separate
        // first-write-only shortcut.
        const defaultRequest = {...studioRequest, outDir: undefined};
        for (const request of [
            defaultRequest,
            {...defaultRequest, mode: "ante", libraryId: "parity-default-ante"},
            defaultRequest,
        ]) {
            const preview = await studio.estimate(packageRoot, request);
            if (preview.status !== "ok") throw new Error(`Expected default bundle update preflight, got ${JSON.stringify(preview)}`);
            await expect(studio.generate(packageRoot, {...request, preflightToken: preview.preflightToken})).resolves.toMatchObject({status: "ok"});
        }
        await expect(new OutcomeLibraryBundleReader().readManifest(path.join(packageRoot, "outcomelibrary"))).resolves.toMatchObject({
            modes: expect.arrayContaining([expect.objectContaining({modeName: "base"}), expect.objectContaining({modeName: "ante"})]),
        });

        // Exercise compatibility against actual rebuilt packages, never by
        // altering the generated bundle's declaration of its provenance.
        const staleBlueprint = path.join(root, "sampled-stale.blueprint.json");
        const stalePackage = path.join(root, "sampled-stale-package");
        fs.writeFileSync(staleBlueprint, JSON.stringify({
            manifest: {id: "parity-slot", name: "Parity Slot", version: "1.0.0"}, reels: 2, rows: 1, symbols: ["A", "B"],
            paytable: {A: {2: 5}}, reelStrips: [["A", "B", "B"], ["A", "B"]], availableBets: [1],
        }));
        expect(await new BuildCommand("1.3.0").run([staleBlueprint, "--target", "tsPackage", "--out", stalePackage])).toBe(0);
        fs.cpSync(path.join(packageRoot, "studio-library"), path.join(stalePackage, "studio-library"), {recursive: true});
        fs.cpSync(path.join(packageRoot, ".pokie"), path.join(stalePackage, ".pokie"), {recursive: true});
        expect(await studio.registry(stalePackage)).toMatchObject({status: "ok", buildStatus: "stale", modes: expect.arrayContaining([expect.objectContaining({buildStatus: "stale"})])});

        const wrongBlueprint = path.join(root, "sampled-wrong.blueprint.json");
        const wrongPackage = path.join(root, "sampled-wrong-package");
        fs.writeFileSync(wrongBlueprint, JSON.stringify({
            manifest: {id: "wrong-parity-slot", name: "Parity Slot", version: "1.0.0"}, reels: 2, rows: 1, symbols: ["A", "B"],
            paytable: {A: {2: 5}}, reelStrips: [["A", "A", "B"], ["A", "B"]], availableBets: [1],
        }));
        expect(await new BuildCommand("1.3.0").run([wrongBlueprint, "--target", "tsPackage", "--out", wrongPackage])).toBe(0);
        fs.cpSync(path.join(packageRoot, "studio-library"), path.join(wrongPackage, "studio-library"), {recursive: true});
        fs.cpSync(path.join(packageRoot, ".pokie"), path.join(wrongPackage, ".pokie"), {recursive: true});
        expect(await studio.registry(wrongPackage)).toMatchObject({status: "ok", buildStatus: "wrong", modes: expect.arrayContaining([expect.objectContaining({buildStatus: "wrong"})])});
    });

    it("binds an exact real-package preflight and publishes the same canonical library as CLI", async () => {
        const blueprint = path.join(root, "exact-slot.blueprint.json");
        const packageRoot = path.join(root, "exact-package");
        fs.writeFileSync(blueprint, JSON.stringify({
            manifest: {id: "exact-parity-slot", name: "Exact Parity Slot", version: "1.0.0"}, reels: 2, rows: 1, symbols: ["A", "B"],
            paytable: {A: {2: 5}}, reelStrips: [["A", "A", "B"], ["A", "B"]], availableBets: [1],
        }));
        expect(await new BuildCommand("1.3.0").run([blueprint, "--target", "tsPackage", "--out", packageRoot])).toBe(0);

        const cliOutput = path.join(root, "exact-cli.json");
        expect(await new OutcomeLibraryCommand("1.3.0").run([
            "generate", packageRoot, "--mode", "base", "--stake", "1", "--library-id", "exact-parity-lib", "--out", cliOutput, "--estimate", "--format", "json",
        ])).toBe(0);
        const cliPreflight = latestCommandJson();
        expect(await new OutcomeLibraryCommand("1.3.0").run([
            "generate", packageRoot, "--mode", "base", "--stake", "1", "--library-id", "exact-parity-lib", "--out", cliOutput, "--format", "json",
        ])).toBe(0);

        const studio = new StudioOutcomeLibraryGenerateService(
            "1.3.0", loadPokieGame, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
            {prepare: () => Promise.resolve(plan)},
        );
        const preflight = await studio.estimate(packageRoot, {libraryId: "exact-parity-lib", mode: "base", stake: 1, outDir: "studio-exact"});
        expect(preflight).toMatchObject({status: "ok", strategy: "exact", expectedRawWork: 6});
        if (preflight.status !== "ok") throw new Error("Expected exact Studio preflight.");
        expectEquivalentPreflight(cliPreflight, preflight);
        const generated = await studio.generate(packageRoot, {
            libraryId: "exact-parity-lib", mode: "base", stake: 1, outDir: "studio-exact", preflightToken: preflight.preflightToken,
        });
        expect(generated).toMatchObject({status: "ok", generator: {strategy: "exact"}});

        const cli = JSON.parse(fs.readFileSync(cliOutput, "utf8"));
        const cliResult = commandJsonReport();
        const bundle = await new OutcomeLibraryBundleReader().readLibrary(path.join(packageRoot, "studio-exact"), "base");
        expect(bundle.outcomes).toEqual(cli.outcomes);
        const generatedResult = generated as Extract<typeof generated, {status: "ok"}>;
        expect(bundle.libraryId).toBe(cli.libraryId);
        expect(generatedResult.mode.libraryId).toBe(cli.libraryId);
        expect(canonicalLibraryHash(bundle)).toBe(canonicalLibraryHash(cli));
        expect(generatedResult.mode.hash).toBe(canonicalLibraryHash(cli));
        expect(withoutGeneratedAt(generatedResult.generator)).toEqual(withoutGeneratedAt(cliResult.diagnostics as typeof generatedResult.generator));
        expect(preflight).toMatchObject({
            game: {id: "exact-parity-slot", version: "1.0.0"}, reelsNumber: 2, reelsSymbolsNumber: 1, reelSizes: [3, 2], warnings: [], totalOutcomeSpaceSize: 6,
            maxOutcomeSpaceSize: 20_000_000, strategy: "exact", requiresBounded: false,
        });
        expect(await studio.registry(packageRoot)).toMatchObject({
            status: "ok", buildStatus: "compatible",
            modes: [expect.objectContaining({modeName: "base", buildStatus: "compatible", hash: generatedResult.mode.hash})],
        });

        // A new Pokie runtime version is a real stale transition too: the
        // persisted bundle remains untouched while the new Studio service
        // checks its writer/runtime compatibility contract.
        const upgradedStudio = new StudioOutcomeLibraryGenerateService(
            "1.3.1", loadPokieGame, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
            {prepare: () => Promise.resolve(plan)},
        );
        expect(await upgradedStudio.registry(packageRoot)).toMatchObject({status: "ok", buildStatus: "stale", modes: [expect.objectContaining({buildStatus: "stale"})]});

        const wrongBlueprint = path.join(root, "exact-wrong.blueprint.json");
        const wrongPackage = path.join(root, "exact-wrong-package");
        fs.writeFileSync(wrongBlueprint, JSON.stringify({
            manifest: {id: "wrong-exact-parity-slot", name: "Exact Parity Slot", version: "1.0.0"}, reels: 2, rows: 1, symbols: ["A", "B"],
            paytable: {A: {2: 5}}, reelStrips: [["A", "A", "B"], ["A", "B"]], availableBets: [1],
        }));
        expect(await new BuildCommand("1.3.0").run([wrongBlueprint, "--target", "tsPackage", "--out", wrongPackage])).toBe(0);
        fs.cpSync(path.join(packageRoot, "studio-exact"), path.join(wrongPackage, "studio-exact"), {recursive: true});
        fs.cpSync(path.join(packageRoot, ".pokie"), path.join(wrongPackage, ".pokie"), {recursive: true});
        expect(await studio.registry(wrongPackage)).toMatchObject({status: "ok", buildStatus: "wrong", modes: [expect.objectContaining({buildStatus: "wrong"})]});
    });

    it("selects a declared executable ante mode consistently in domain generation, Studio exact/sampled bundles, and the CLI", async () => {
        const blueprint = path.join(root, "runtime-mode-slot.blueprint.json");
        const packageRoot = path.join(root, "runtime-mode-package");
        fs.writeFileSync(blueprint, JSON.stringify({
            manifest: {id: "runtime-mode-slot", name: "Runtime Mode Slot", version: "1.0.0"},
            reels: 2, rows: 1, symbols: ["A", "B"], paytable: {A: {2: 5}},
            reelStrips: [["A", "A", "B"], ["A", "B"]], availableBets: [1],
            betModes: [
                {id: "base", runtimeType: "base", isDefault: true},
                {id: "ante", runtimeType: "ante", costMultiplier: 2},
            ],
        }));
        expect(await new BuildCommand("1.3.0").run([blueprint, "--target", "tsPackage", "--out", packageRoot])).toBe(0);

        const game = await loadPokieGame(packageRoot);
        try {
            const control = await generateWeightedOutcomeLibrary({
                libraryId: "domain-ante", game, pokieVersion: "1.3.0", mode: "ante", selectBetMode: true, generation: "exact",
            });
            expect(control.library.outcomes).toEqual(expect.arrayContaining([
                expect.objectContaining({artifact: expect.objectContaining({betMode: "ante", stake: 2, payoutMultiplier: 2.5})}),
            ]));
            expect(control.library.outcomes.every((outcome) => outcome.artifact.betMode === "ante" && outcome.artifact.stake === 2)).toBe(true);
        } finally {
            await releasePokieGame(game);
        }

        const studio = new StudioOutcomeLibraryGenerateService("1.3.0", loadPokieGame);
        const exactRequest = {libraryId: "studio-ante-exact", mode: "ante", generation: "exact" as const, outDir: "ante-exact"};
        const exactPreview = await studio.estimate(packageRoot, exactRequest);
        if (exactPreview.status !== "ok") throw new Error(`Expected executable-mode exact preflight, got ${JSON.stringify(exactPreview)}`);
        await expect(studio.generate(packageRoot, {...exactRequest, preflightToken: exactPreview.preflightToken})).resolves.toMatchObject({status: "ok"});
        const exact = await new OutcomeLibraryBundleReader().readLibrary(path.join(packageRoot, "ante-exact"), "ante");
        expect(exact.outcomes).toEqual(expect.arrayContaining([
            expect.objectContaining({artifact: expect.objectContaining({betMode: "ante", stake: 2, payoutMultiplier: 2.5})}),
        ]));

        const sampledRequest = {libraryId: "studio-ante-sampled", mode: "ante", generation: "sampled" as const, sample: {sampleSize: BigInt(19), seed: "runtime-ante"}, outDir: "ante-sampled"};
        const sampledPreview = await studio.estimate(packageRoot, sampledRequest);
        if (sampledPreview.status !== "ok") throw new Error(`Expected executable-mode sampled preflight, got ${JSON.stringify(sampledPreview)}`);
        await expect(studio.generate(packageRoot, {...sampledRequest, preflightToken: sampledPreview.preflightToken})).resolves.toMatchObject({status: "ok"});
        const sampled = await new OutcomeLibraryBundleReader().readLibrary(path.join(packageRoot, "ante-sampled"), "ante");
        expect(sampled.outcomes.every((outcome) => outcome.artifact.betMode === "ante" && outcome.artifact.stake === 2)).toBe(true);

        const cliOutput = path.join(root, "cli-ante.json");
        expect(await new OutcomeLibraryCommand("1.3.0").run([
            "generate", packageRoot, "--mode", "ante", "--exact", "--out", cliOutput, "--format", "json",
        ])).toBe(0);
        const cli = JSON.parse(fs.readFileSync(cliOutput, "utf8")) as {outcomes: Array<{artifact: {betMode: string; stake: number; payoutMultiplier: number}}>};
        expect(cli.outcomes).toEqual(expect.arrayContaining([
            expect.objectContaining({artifact: expect.objectContaining({betMode: "ante", stake: 2, payoutMultiplier: 2.5})}),
        ]));

        await expect(studio.estimate(packageRoot, {...exactRequest, mode: "not-a-runtime-mode", outDir: "unsupported-mode"})).resolves.toMatchObject({
            status: "unsupported", error: expect.stringContaining("does not declare executable bet mode"),
        });
        expect(await new OutcomeLibraryCommand("1.3.0").run([
            "generate", packageRoot, "--mode", "not-a-runtime-mode", "--exact", "--out", path.join(root, "unsupported-mode.json"),
        ])).toBe(1);
    });

    it("rejects a corrupted retained mode instead of silently rebuilding it while adding another mode", async () => {
        const blueprint = path.join(root, "retained-integrity-slot.blueprint.json");
        const packageRoot = path.join(root, "retained-integrity-package");
        fs.writeFileSync(blueprint, JSON.stringify({
            manifest: {id: "retained-integrity-slot", name: "Retained Integrity Slot", version: "1.0.0"},
            reels: 2, rows: 1, symbols: ["A", "B"], paytable: {A: {2: 5}},
            reelStrips: [["A", "A", "B"], ["A", "B"]], availableBets: [1],
        }));
        expect(await new BuildCommand("1.3.0").run([blueprint, "--target", "tsPackage", "--out", packageRoot])).toBe(0);
        const studio = new StudioOutcomeLibraryGenerateService("1.3.0", loadPokieGame);
        const base = {libraryId: "retained-base", mode: "base", generation: "exact" as const, outDir: "retained-bundle"};
        const basePreview = await studio.estimate(packageRoot, base);
        if (basePreview.status !== "ok") throw new Error(`Expected base preflight, got ${JSON.stringify(basePreview)}`);
        await expect(studio.generate(packageRoot, {...base, preflightToken: basePreview.preflightToken})).resolves.toMatchObject({status: "ok"});

        const bundleDir = path.join(packageRoot, "retained-bundle");
        const outcomesPath = path.join(bundleDir, "outcomes_base.jsonl");
        const originalOutcomes = fs.readFileSync(outcomesPath, "utf8");
        const corruptedOutcomes = originalOutcomes.replace(/"weight":2(?=[}\n])/, '"weight":9');
        expect(corruptedOutcomes).not.toBe(originalOutcomes);
        fs.writeFileSync(outcomesPath, corruptedOutcomes);
        const destinationBeforeAnte = fs.readdirSync(bundleDir).sort().map((file) => [file, fs.readFileSync(path.join(bundleDir, file), "utf8")] as const);

        const ante = {libraryId: "retained-ante", mode: "ante", generation: "exact" as const, outDir: "retained-bundle"};
        const antePreview = await studio.estimate(packageRoot, ante);
        if (antePreview.status !== "ok") throw new Error(`Expected preflight to defer retained-stream validation, got ${JSON.stringify(antePreview)}`);
        const result = await studio.generate(packageRoot, {...ante, preflightToken: antePreview.preflightToken});
        expect(result).toMatchObject({status: "load-error", error: expect.stringContaining("original index entry")});
        expect(fs.readdirSync(bundleDir).sort().map((file) => [file, fs.readFileSync(path.join(bundleDir, file), "utf8")] as const)).toEqual(destinationBeforeAnte);
    });

    it("returns a Studio conflict boundary instead of dropping a sibling mode published after retained-mode read", async () => {
        const blueprint = path.join(root, "concurrent-retained-slot.blueprint.json");
        const packageRoot = path.join(root, "concurrent-retained-package");
        fs.writeFileSync(blueprint, JSON.stringify({
            manifest: {id: "concurrent-retained-slot", name: "Concurrent Retained Slot", version: "1.0.0"},
            reels: 2, rows: 1, symbols: ["A", "B"], paytable: {A: {2: 5}},
            reelStrips: [["A", "A", "B"], ["A", "B"]], availableBets: [1],
        }));
        expect(await new BuildCommand("1.3.0").run([blueprint, "--target", "tsPackage", "--out", packageRoot])).toBe(0);
        const normalStudio = new StudioOutcomeLibraryGenerateService("1.3.0", loadPokieGame);
        const base = {libraryId: "concurrent-base", mode: "base", generation: "exact" as const, outDir: "concurrent-bundle"};
        const initialPreview = await normalStudio.estimate(packageRoot, base);
        if (initialPreview.status !== "ok") throw new Error(`Expected initial base preflight, got ${JSON.stringify(initialPreview)}`);
        await expect(normalStudio.generate(packageRoot, {...base, preflightToken: initialPreview.preflightToken})).resolves.toMatchObject({status: "ok"});

        let releaseFirstWriter: (() => void) | undefined;
        const firstWriterReleased = new Promise<void>((resolve) => {
            releaseFirstWriter = resolve;
        });
        let firstWriterEntered: (() => void) | undefined;
        const firstWriterReady = new Promise<void>((resolve) => {
            firstWriterEntered = resolve;
        });
        let gateFirstWriter = true;
        const nativeWriter = new OutcomeLibraryBundleWriter<string>("1.3.0");
        const gatedWriter: OutcomeLibraryBundleWriting<string> = {
            writeToDirectory: async (modes, outDir, options) => {
                if (gateFirstWriter) {
                    gateFirstWriter = false;
                    firstWriterEntered?.();
                    await firstWriterReleased;
                }
                return nativeWriter.writeToDirectory(modes, outDir, options);
            },
        };
        const delayedStudio = new StudioOutcomeLibraryGenerateService("1.3.0", loadPokieGame, undefined, undefined, gatedWriter);
        const regenerationPreview = await delayedStudio.estimate(packageRoot, base);
        if (regenerationPreview.status !== "ok") throw new Error(`Expected base regeneration preflight, got ${JSON.stringify(regenerationPreview)}`);
        const staleRegeneration = delayedStudio.generate(packageRoot, {...base, preflightToken: regenerationPreview.preflightToken});
        await firstWriterReady;

        const ante = {libraryId: "concurrent-ante", mode: "ante", generation: "exact" as const, outDir: "concurrent-bundle"};
        const antePreview = await normalStudio.estimate(packageRoot, ante);
        if (antePreview.status !== "ok") throw new Error(`Expected ante preflight, got ${JSON.stringify(antePreview)}`);
        await expect(normalStudio.generate(packageRoot, {...ante, preflightToken: antePreview.preflightToken})).resolves.toMatchObject({status: "ok"});
        releaseFirstWriter?.();

        await expect(staleRegeneration).resolves.toMatchObject({status: "load-error", error: expect.stringContaining("claimed")});
        const manifest = await new OutcomeLibraryBundleReader().readManifest(path.join(packageRoot, "concurrent-bundle"));
        expect(manifest.modes.map((mode) => mode.modeName)).toEqual(["base", "ante"]);
    });
});
