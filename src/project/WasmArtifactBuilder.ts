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

function signedLeb(value: number): number[] {
    const encoded: number[] = [];
    let more = true;
    while (more) {
        let byte = value & 0x7f;
        value >>= 7;
        more = !((value === 0 && (byte & 0x40) === 0) || (value === -1 && (byte & 0x40) !== 0));
        if (more) byte |= 0x80;
        encoded.push(byte);
    }
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
 * function mixes every host-issued random word with a model-derived salt.
 * That gives every Blueprint distinct executable bytes without smuggling any
 * Node or JavaScript game loader into the artifact.
 */
function buildPortableWasmModule(model: string): Buffer {
    const modelHash = crypto.createHash("sha256").update(model).digest();
    const gameSalt = modelHash.readInt32LE(0);
    const type = section(1, [0x01, 0x60, 0x00, 0x01, 0x7f]);
    const imports = section(2, [0x01, ...stringBytes("pokie"), ...stringBytes("next_random"), 0x00, 0x00]);
    const functions = section(3, [0x01, 0x00]);
    const exports = section(7, [0x01, ...stringBytes("play"), 0x00, 0x01]);
    const body = [0x00, 0x10, 0x00, 0x41, ...signedLeb(gameSalt), 0x73, 0x0b];
    const code = section(10, [0x01, ...unsignedLeb(body.length), ...body]);
    const gameModel = section(0, [...stringBytes("pokie.game.v1"), ...UTF8.encode(model)]);
    return Buffer.from([...WASM_HEADER, ...type, ...imports, ...functions, ...exports, ...code, ...gameModel]);
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
            const model = stableJson(blueprint);
            const moduleBytes = buildPortableWasmModule(model);
            const hash = `sha256:${crypto.createHash("sha256").update(moduleBytes).digest("hex")}`;
            const configurationHash = `sha256:${crypto.createHash("sha256").update(model).digest("hex")}`;
            const manifest: PokieWasmComponentManifest = {
                schemaVersion: POKIE_WASM_CONTRACT_VERSION,
                component: {id: blueprint.manifest.id, version: blueprint.manifest.version},
                minPokieVersion: this.pokieVersion,
                serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
                host: {rng: "pokie.rng.v1", services: []},
                capabilities: ["runtime.play", "runtime.serialize", "runtime.replay", "runtime.simulate", "artifact.inspect"],
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
