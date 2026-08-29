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

function commandJsonReport(): Record<string, unknown> {
    const message = (console.log as jest.Mock).mock.calls
        .map(([value]) => value)
        .filter((value): value is string => typeof value === "string")
        .reverse()
        .find((value) => value.startsWith("{") && value.includes('"diagnostics"'));
    if (message === undefined) throw new Error("Expected CLI JSON generation report.");
    return JSON.parse(message) as Record<string, unknown>;
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
            paytable: {A: {2: 5}}, reelStrips: [["A", "A", "B"], ["A", "B"]],
        }));
        expect(await new BuildCommand("1.3.0").run([blueprint, "--target", "tsPackage", "--out", packageRoot])).toBe(0);

        const cliOutput = path.join(root, "cli.json");
        expect(await new OutcomeLibraryCommand("1.3.0").run([
            "generate", packageRoot, "--library-id", "parity-lib", "--sample", "19", "--seed", "parity-seed", "--out", cliOutput, "--format", "json",
        ])).toBe(0);

        const studio = new StudioOutcomeLibraryGenerateService(
            "1.3.0", loadPokieGame, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
            {prepare: () => Promise.resolve(plan)},
        );
        const studioRequest = {libraryId: "parity-lib", generation: "sampled" as const, sample: {sampleSize: BigInt(19), seed: "parity-seed"}, outDir: "studio-library"};
        const preview = await studio.estimate(packageRoot, studioRequest);
        if (preview.status !== "ok") throw new Error("Expected sampled Studio preflight.");
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
            game: {id: "parity-slot", version: "1.0.0"},
        });
        expect(await studio.registry(packageRoot)).toMatchObject({
            status: "ok", buildStatus: "compatible",
            modes: [expect.objectContaining({modeName: "base", buildStatus: "compatible", hash: generatedResult.mode.hash})],
        });
    });

    it("binds an exact real-package preflight and publishes the same canonical library as CLI", async () => {
        const blueprint = path.join(root, "exact-slot.blueprint.json");
        const packageRoot = path.join(root, "exact-package");
        fs.writeFileSync(blueprint, JSON.stringify({
            manifest: {id: "exact-parity-slot", name: "Exact Parity Slot", version: "1.0.0"}, reels: 2, rows: 1, symbols: ["A", "B"],
            paytable: {A: {2: 5}}, reelStrips: [["A", "A", "B"], ["A", "B"]],
        }));
        expect(await new BuildCommand("1.3.0").run([blueprint, "--target", "tsPackage", "--out", packageRoot])).toBe(0);

        const cliOutput = path.join(root, "exact-cli.json");
        expect(await new OutcomeLibraryCommand("1.3.0").run([
            "generate", packageRoot, "--library-id", "exact-parity-lib", "--out", cliOutput, "--format", "json",
        ])).toBe(0);

        const studio = new StudioOutcomeLibraryGenerateService(
            "1.3.0", loadPokieGame, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
            {prepare: () => Promise.resolve(plan)},
        );
        const preflight = await studio.estimate(packageRoot, {libraryId: "exact-parity-lib", outDir: "studio-exact"});
        expect(preflight).toMatchObject({status: "ok", strategy: "exact", expectedRawWork: 6});
        if (preflight.status !== "ok") throw new Error("Expected exact Studio preflight.");
        const generated = await studio.generate(packageRoot, {
            libraryId: "exact-parity-lib", outDir: "studio-exact", preflightToken: preflight.preflightToken,
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
            game: {id: "exact-parity-slot", version: "1.0.0"}, totalOutcomeSpaceSize: 6,
            maxOutcomeSpaceSize: 20_000_000, strategy: "exact", requiresBounded: false,
        });
        expect(await studio.registry(packageRoot)).toMatchObject({
            status: "ok", buildStatus: "compatible",
            modes: [expect.objectContaining({modeName: "base", buildStatus: "compatible", hash: generatedResult.mode.hash})],
        });

        // Registry classification is server-owned and must react immediately to
        // provenance drift, rather than being reconstructed by a CLI/UI caller.
        const manifestPath = path.join(packageRoot, "studio-exact", "manifest.json");
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {configHash?: string; game: {id: string}};
        fs.writeFileSync(manifestPath, JSON.stringify({...manifest, configHash: "stale-config"}));
        expect(await studio.registry(packageRoot)).toMatchObject({status: "ok", buildStatus: "stale", modes: [expect.objectContaining({buildStatus: "stale"})]});
        fs.writeFileSync(manifestPath, JSON.stringify({...manifest, game: {...manifest.game, id: "wrong-game"}}));
        expect(await studio.registry(packageRoot)).toMatchObject({status: "ok", buildStatus: "wrong", modes: [expect.objectContaining({buildStatus: "wrong"})]});
    });
});
