import crypto from "crypto";
import fs from "fs";
import path from "path";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import {loadGameBlueprint} from "../generated/loadGameBlueprint.js";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {resolveReelStripGeneration} from "../generated/resolveReelStripGeneration.js";
import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import {assertArtifactBuildNotCancelled, captureArtifactDestinationState, cleanupIncompleteArtifactOutput, ensureArtifactDestinationParent, reportArtifactBuildProgress, type ArtifactBuildOptions} from "./ArtifactBuildOptions.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "./internal/assertArtifactDestinationIsSafe.js";
import type {PokieProject} from "./PokieProject.js";
import {POKIE_WASM_ABI_VERSION, POKIE_WASM_ADAPTER, POKIE_WASM_CONTRACT_VERSION, type PokieWasmComponentManifest} from "./wasm/PokieWasmComponentManifest.js";
import {wasmComponentManifestSidecarPath} from "./WasmProjectTargetAdapter.js";
import {POKIE_WASM_GAME_MODEL_SECTION, POKIE_WASM_IMPORT_MODULE, POKIE_WASM_PLAY_EXPORT, POKIE_WASM_RANDOM_IMPORT, type PokieWasmGameModel} from "../wasm/PokieWasmCanonicalModule.js";

const WASM_HEADER = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const UTF8 = new TextEncoder();

function unsignedLeb(value: number): number[] {
    const encoded: number[] = [];
    do {
        let byte = value & 0x7f;
        value >>>= 7;
        if (value !== 0) byte |= 0x80;
        encoded.push(byte);
    } while (value !== 0);
    return encoded;
}

function stringBytes(value: string): number[] {
    const bytes = [...UTF8.encode(value)];
    return [...unsignedLeb(bytes.length), ...bytes];
}

function section(id: number, contents: readonly number[]): number[] {
    return [id, ...unsignedLeb(contents.length), ...contents];
}

function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

/**
 * Emits the tiny portable ABI that POKIE's runtime executes.  Its custom
 * section carries the canonical Blueprint model and its exported play
 * function turns one host-issued random word into packed reel stops. The
 * portable host evaluates those stops against this selected game's strips,
 * paylines, and paytable without smuggling a Node game loader into the
 * artifact.
 */
function buildPortableWasmModule(model: string, stopWidths: readonly number[], stripLengths: readonly number[]): Buffer {
    const type = section(1, [0x01, 0x60, 0x00, 0x01, 0x7f]);
    const imports = section(2, [0x01, ...stringBytes(POKIE_WASM_IMPORT_MODULE), ...stringBytes(POKIE_WASM_RANDOM_IMPORT), 0x00, 0x00]);
    const functions = section(3, [0x01, 0x00]);
    const exports = section(7, [0x01, ...stringBytes(POKIE_WASM_PLAY_EXPORT), 0x00, 0x01]);
    let shift = 0;
    const body = [0x01, 0x02, 0x7f, 0x10, 0x00, 0x21, 0x01]; // i32 accumulator plus one host-issued random word.
    for (let reel = 0; reel < stopWidths.length; reel++) {
        body.push(0x20, 0x00, 0x20, 0x01);
        if (shift > 0) body.push(0x41, ...unsignedLeb(shift), 0x76);
        body.push(0x41, ...unsignedLeb(stripLengths[reel]), 0x70);
        if (shift > 0) body.push(0x41, ...unsignedLeb(shift), 0x74);
        body.push(0x72, 0x21, 0x00);
        shift += stopWidths[reel];
    }
    body.push(0x20, 0x00, 0x0b);
    const code = section(10, [0x01, ...unsignedLeb(body.length), ...body]);
    const gameModel = section(0, [...stringBytes(POKIE_WASM_GAME_MODEL_SECTION), ...UTF8.encode(model)]);
    return Buffer.from([...WASM_HEADER, ...type, ...imports, ...functions, ...exports, ...code, ...gameModel]);
}

function resolveCanonicalModel(blueprint: GameBlueprint): PokieWasmGameModel {
    const resolution = resolveReelStripGeneration(blueprint);
    if (!resolution.success) throw new Error(`Blueprint "${blueprint.manifest.id}" could not generate its reel strips.`);
    const generated = new Map((resolution.reelStripGeneration?.reels ?? []).filter((reel) => reel.success && reel.strip !== undefined).map((reel) => [reel.reelIndex, reel.strip!]));
    const strips = blueprint.reelStrips ?? blueprint.reelStripGeneration?.map((spec, index) => spec.type === "literal" ? spec.strip : generated.get(index)!) ?? [];
    if (strips.length !== blueprint.reels || strips.some((strip) => strip.length === 0)) throw new Error(`Blueprint "${blueprint.manifest.id}" has no executable reel strips.`);
    const stopWidths = strips.map((strip) => Math.max(1, Math.ceil(Math.log2(strip.length))));
    if (stopWidths.reduce((total, width) => total + width, 0) > 30) throw new Error(`Blueprint "${blueprint.manifest.id}" requires more than 30 stop bits and cannot use POKIE WASM ABI 1.0.0.`);
    return {
        schemaVersion: "pokie.game.v1",
        reels: blueprint.reels,
        rows: blueprint.rows,
        reelStrips: strips,
        paylines: blueprint.paylines ?? Array.from({length: blueprint.rows}, (_, row) => Array.from({length: blueprint.reels}, () => row)),
        paytable: blueprint.paytable,
        stopWidths,
    };
}

/** Publishes an atomic, integrity-bound portable POKIE WASM component. */
export class WasmArtifactBuilder implements ArtifactBuilder {
    public readonly target = "wasm" as const;
    public readonly destinationKind = "file" as const;
    private readonly pokieVersion: string;

    public constructor(pokieVersion: string) {
        this.pokieVersion = pokieVersion;
    }

    public validate(source: PokieProject): Promise<void> {
        return Promise.resolve().then(() => {
            if (source.type !== "blueprint") throw new Error("A canonical WASM artifact requires a Game Blueprint source.");
            const blueprint = loadGameBlueprint(source.rootPath) as GameBlueprint;
            const errors = new GameBlueprintValidator().validate(blueprint).filter((issue) => issue.severity === "error");
            if (errors.length > 0) throw new Error(`Blueprint "${source.rootPath}" has ${errors.length} error(s): ${errors.map((issue) => issue.code).join(", ")}`);
            if (!resolveReelStripGeneration(blueprint).success) throw new Error(`Blueprint "${source.rootPath}" could not generate its reel strips.`);
        });
    }

    public async build(source: PokieProject, destinationPath: string, options?: ArtifactBuildOptions): Promise<ArtifactBuildResult> {
        if (source.type !== "blueprint") throw new Error("A canonical WASM artifact requires a Game Blueprint source.");
        assertArtifactBuildNotCancelled(options);
        assertArtifactDestinationAvailable(destinationPath, this.destinationKind);
        assertArtifactDestinationIsSafe(source.rootPath, destinationPath);
        const sidecarPath = wasmComponentManifestSidecarPath(destinationPath);
        assertArtifactDestinationAvailable(sidecarPath, this.destinationKind);
        const destinationState = captureArtifactDestinationState(destinationPath, this.destinationKind);
        const sidecarState = captureArtifactDestinationState(sidecarPath, this.destinationKind);
        let wasmStage: string | undefined;
        let manifestStage: string | undefined;
        try {
            await this.validate(source);
            await ensureArtifactDestinationParent(destinationPath);
            const blueprint = loadGameBlueprint(source.rootPath) as GameBlueprint;
            const model = stableJson(resolveCanonicalModel(blueprint));
            const parsedModel = JSON.parse(model) as PokieWasmGameModel;
            const moduleBytes = buildPortableWasmModule(model, parsedModel.stopWidths, parsedModel.reelStrips.map((strip) => strip.length));
            const hash = `sha256:${crypto.createHash("sha256").update(moduleBytes).digest("hex")}`;
            const configurationHash = `sha256:${crypto.createHash("sha256").update(model).digest("hex")}`;
            const manifest: PokieWasmComponentManifest = {
                schemaVersion: POKIE_WASM_CONTRACT_VERSION,
                component: {id: blueprint.manifest.id, version: blueprint.manifest.version},
                minPokieVersion: this.pokieVersion,
                serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
                host: {rng: "pokie.rng.v1", services: []},
                capabilities: ["runtime.play", "runtime.serialize", "runtime.replay", "artifact.inspect"],
                artifact: {format: "pokie.wasm.v1", sha256: hash, bytes: moduleBytes.byteLength, abiVersion: POKIE_WASM_ABI_VERSION, adapter: POKIE_WASM_ADAPTER, configurationHash},
            };
            const nonce = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
            wasmStage = path.join(path.dirname(destinationPath), `.${path.basename(destinationPath)}.${nonce}.tmp`);
            manifestStage = path.join(path.dirname(sidecarPath), `.${path.basename(sidecarPath)}.${nonce}.tmp`);
            reportArtifactBuildProgress(options, {status: "running", message: "Staging portable WASM component"});
            await fs.promises.writeFile(wasmStage, moduleBytes);
            await fs.promises.writeFile(manifestStage, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
            assertArtifactBuildNotCancelled(options);
            // The module is published last only after its bound sidecar is
            // complete; a reader never accepts an orphan module as canonical.
            await fs.promises.rename(manifestStage, sidecarPath);
            await fs.promises.rename(wasmStage, destinationPath);
            reportArtifactBuildProgress(options, {status: "completed"});
            return {outputPath: destinationPath};
        } catch (error) {
            await Promise.all([wasmStage && fs.promises.rm(wasmStage, {force: true}), manifestStage && fs.promises.rm(manifestStage, {force: true})].filter(Boolean));
            await cleanupIncompleteArtifactOutput(destinationPath, destinationState);
            await cleanupIncompleteArtifactOutput(sidecarPath, sidecarState);
            reportArtifactBuildProgress(options, {status: options?.signal?.aborted ? "cancelled" : "failed", message: "WASM publication failed"});
            throw error;
        }
    }
}
