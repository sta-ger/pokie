import {ArtifactConversionPlan, OutcomeLibraryBundleReader, loadPokieGame} from "pokie";
import crypto from "crypto";
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

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonicalize(child)]));
    }
    return value;
}

function canonicalLibraryHash(library: {readonly outcomes: unknown}): string {
    return `sha256:${crypto.createHash("sha256").update(JSON.stringify(canonicalize(library.outcomes))).digest("hex")}`;
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

        const studio = new StudioOutcomeLibraryGenerateService(
            "1.3.0", loadPokieGame, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
            {prepare: () => Promise.resolve(plan)},
        );
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
        expect(canonicalLibraryHash(bundle)).toBe(canonicalLibraryHash(cli));
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
        expect(await studio.registry(stalePackage)).toMatchObject({status: "ok", buildStatus: "stale", modes: [expect.objectContaining({buildStatus: "stale"})]});

        const wrongBlueprint = path.join(root, "sampled-wrong.blueprint.json");
        const wrongPackage = path.join(root, "sampled-wrong-package");
        fs.writeFileSync(wrongBlueprint, JSON.stringify({
            manifest: {id: "wrong-parity-slot", name: "Parity Slot", version: "1.0.0"}, reels: 2, rows: 1, symbols: ["A", "B"],
            paytable: {A: {2: 5}}, reelStrips: [["A", "A", "B"], ["A", "B"]], availableBets: [1],
        }));
        expect(await new BuildCommand("1.3.0").run([wrongBlueprint, "--target", "tsPackage", "--out", wrongPackage])).toBe(0);
        fs.cpSync(path.join(packageRoot, "studio-library"), path.join(wrongPackage, "studio-library"), {recursive: true});
        fs.cpSync(path.join(packageRoot, ".pokie"), path.join(wrongPackage, ".pokie"), {recursive: true});
        expect(await studio.registry(wrongPackage)).toMatchObject({status: "ok", buildStatus: "wrong", modes: [expect.objectContaining({buildStatus: "wrong"})]});
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
        expect(canonicalLibraryHash(bundle)).toBe(canonicalLibraryHash(cli));
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
});
