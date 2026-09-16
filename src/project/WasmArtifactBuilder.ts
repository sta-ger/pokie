import crypto from "crypto";
import fs from "fs";
import path from "path";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import {loadGameBlueprint} from "../generated/loadGameBlueprint.js";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {materializeReelStrips} from "../generated/materializeReelStrips.js";
import {resolveReelStripGeneration} from "../generated/resolveReelStripGeneration.js";
import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import {assertArtifactBuildNotCancelled, captureArtifactDestinationState, cleanupIncompleteArtifactOutput, ensureArtifactDestinationParent, reportArtifactBuildProgress, type ArtifactBuildOptions} from "./ArtifactBuildOptions.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "./internal/assertArtifactDestinationIsSafe.js";
import type {PokieProject} from "./PokieProject.js";
import {POKIE_WASM_ABI_VERSION, POKIE_WASM_ADAPTER, POKIE_WASM_CONTRACT_VERSION, type PokieWasmComponentManifest} from "./wasm/PokieWasmComponentManifest.js";
import {wasmComponentManifestSidecarPath} from "./WasmProjectTargetAdapter.js";
import {POKIE_WASM_COMPONENT_DESCRIPTOR_SECTION, POKIE_WASM_GAME_MODEL_SECTION, POKIE_WASM_IMPORT_MODULE, POKIE_WASM_PLAY_EXPORT, POKIE_WASM_RANDOM_IMPORT, type CanonicalPokieWasmComponentDescriptor, type PokieWasmGameModel} from "../wasm/PokieWasmCanonicalModule.js";

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
    let remaining = value | 0;
    let more: boolean;
    do {
        let byte = remaining & 0x7f;
        remaining >>= 7;
        more = !((remaining === 0 && (byte & 0x40) === 0) || (remaining === -1 && (byte & 0x40) !== 0));
        if (more) byte |= 0x80;
        encoded.push(byte);
    } while (more);
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
 * function turns host-issued random words into packed reel stops. The
 * portable host evaluates those stops against this selected game's strips,
 * paylines, and paytable without smuggling a Node game loader into the
 * artifact.
 */
function buildPortableWasmModule(model: string, descriptor: CanonicalPokieWasmComponentDescriptor, stopWidths: readonly number[], stripLengths: readonly number[]): Buffer {
    const type = section(1, [0x01, 0x60, 0x00, 0x01, 0x7f]);
    const imports = section(2, [0x01, ...stringBytes(POKIE_WASM_IMPORT_MODULE), ...stringBytes(POKIE_WASM_RANDOM_IMPORT), 0x00, 0x00]);
    const functions = section(3, [0x01, 0x00]);
    const exports = section(7, [0x01, ...stringBytes(POKIE_WASM_PLAY_EXPORT), 0x00, 0x01]);
    let shift = 0;
    const body = [0x01, 0x02, 0x7f]; // i32 accumulator plus one host-issued random word.
    for (let reel = 0; reel < stopWidths.length; reel++) {
        // Rejection sampling maps a uniformly host-issued 31-bit word to an
        // arbitrary strip length without the modulo bias that a packed bit
        // slice would introduce for a three-, five-, or seven-stop reel.
        const limit = Math.floor(0x80000000 / stripLengths[reel]) * stripLengths[reel];
        body.push(0x03, 0x40, 0x10, 0x00, 0x22, 0x01, 0x41, ...signedLeb(limit), 0x4f, 0x0d, 0x00, 0x0b);
        body.push(0x20, 0x00, 0x20, 0x01);
        body.push(0x41, ...unsignedLeb(stripLengths[reel]), 0x70);
        if (shift > 0) body.push(0x41, ...unsignedLeb(shift), 0x74);
        body.push(0x72, 0x21, 0x00);
        shift += stopWidths[reel];
    }
    body.push(0x20, 0x00, 0x0b);
    const code = section(10, [0x01, ...unsignedLeb(body.length), ...body]);
    const gameModel = section(0, [...stringBytes(POKIE_WASM_GAME_MODEL_SECTION), ...UTF8.encode(model)]);
    const componentDescriptor = section(0, [...stringBytes(POKIE_WASM_COMPONENT_DESCRIPTOR_SECTION), ...UTF8.encode(stableJson(descriptor))]);
    return Buffer.from([...WASM_HEADER, ...type, ...imports, ...functions, ...exports, ...code, ...gameModel, ...componentDescriptor]);
}

/** The one Blueprint-to-portable-model boundary used by preview, validation, and publication. */
export function resolveCanonicalWasmGameModel(blueprint: GameBlueprint): PokieWasmGameModel {
    assertSupportedCanonicalWasmSemantics(blueprint);
    const resolution = resolveReelStripGeneration(blueprint);
    if (!resolution.success) {
        const failedReels = resolution.reels.filter((reel) => !reel.success).map((reel) => `reel ${reel.reelIndex}: ${reel.diagnostics.flatMap((diagnostic) => diagnostic.violations.map((violation) => violation.message)).join("; ")}`).join(" | ");
        throw new Error(`Blueprint "${blueprint.manifest.id}" cannot materialize its generated reel strips for the canonical WASM model. ${failedReels || "Fix reelStripGeneration and rebuild."}`);
    }
    let materialized: GameBlueprint;
    try {
        materialized = materializeReelStrips(blueprint, resolution.reelStripGeneration);
    } catch (error) {
        throw new Error(`Blueprint "${blueprint.manifest.id}" cannot materialize its reel strips for the canonical WASM model. ${error instanceof Error ? error.message : String(error)} Next: use valid literal/generated strips or repair the authored symbol weights.`);
    }
    const strips = materialized.reelStrips ?? [];
    if (strips.length !== blueprint.reels || strips.some((strip) => strip === undefined || strip.length === 0)) throw new Error(`Blueprint "${blueprint.manifest.id}" cannot materialize one executable strip per reel for the canonical WASM model.`);
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
        ...(blueprint.wilds === undefined ? {} : {wilds: blueprint.wilds}),
        ...(blueprint.scatters === undefined ? {} : {scatters: blueprint.scatters}),
        ...(blueprint.availableBets === undefined ? {} : {availableBets: blueprint.availableBets}),
    };
}

function assertSupportedCanonicalWasmSemantics(blueprint: GameBlueprint): void {
    if (blueprint.winModel !== undefined && blueprint.winModel.type !== "lines") {
        throw new Error(`Blueprint "${blueprint.manifest.id}" uses winModel.type "${blueprint.winModel.type}", which canonical POKIE WASM does not implement. Next: use line wins (omit winModel or set {type: "lines"}) before building.`);
    }
    if (blueprint.mechanics?.freeGames !== undefined) {
        throw new Error(`Blueprint "${blueprint.manifest.id}" uses mechanics.freeGames, which canonical POKIE WASM does not implement. Next: remove mechanics.freeGames before building this portable artifact.`);
    }
    if (blueprint.betModes !== undefined && blueprint.betModes.length > 0) {
        throw new Error(`Blueprint "${blueprint.manifest.id}" declares betModes, which canonical POKIE WASM does not implement. Next: remove betModes and use availableBets for supported stake selection.`);
    }
}

export type WasmArtifactPublication = {
    writeFile(filePath: string, contents: string | Uint8Array): Promise<void>;
    rename(fromPath: string, toPath: string): Promise<void>;
};

const filesystemWasmArtifactPublication: WasmArtifactPublication = {
    writeFile: (filePath, contents) => fs.promises.writeFile(filePath, contents),
    rename: (fromPath, toPath) => fs.promises.rename(fromPath, toPath),
};

function canonicalDescriptor(manifest: Omit<PokieWasmComponentManifest, "artifact"> & {readonly artifact: Omit<NonNullable<PokieWasmComponentManifest["artifact"]>, "sha256" | "bytes">}): CanonicalPokieWasmComponentDescriptor {
    return {
        schemaVersion: manifest.schemaVersion,
        component: manifest.component,
        ...(manifest.minPokieVersion === undefined ? {} : {minPokieVersion: manifest.minPokieVersion}),
        serialization: manifest.serialization,
        host: manifest.host,
        capabilities: manifest.capabilities,
        artifact: manifest.artifact,
    };
}

/** Publishes an atomic, integrity-bound portable POKIE WASM component. */
export class WasmArtifactBuilder implements ArtifactBuilder {
    public readonly target = "wasm" as const;
    public readonly destinationKind = "file" as const;
    private readonly pokieVersion: string;
    private readonly publication: WasmArtifactPublication;

    public constructor(pokieVersion: string, publication: WasmArtifactPublication = filesystemWasmArtifactPublication) {
        this.pokieVersion = pokieVersion;
        this.publication = publication;
    }

    public validate(source: PokieProject): Promise<void> {
        return Promise.resolve().then(() => {
            if (source.type !== "blueprint") throw new Error("A canonical WASM artifact requires a Game Blueprint source.");
            const blueprint = loadGameBlueprint(source.rootPath) as GameBlueprint;
            const errors = new GameBlueprintValidator().validate(blueprint).filter((issue) => issue.severity === "error");
            if (errors.length > 0) throw new Error(`Blueprint "${source.rootPath}" has ${errors.length} error(s): ${errors.map((issue) => issue.code).join(", ")}`);
            resolveCanonicalWasmGameModel(blueprint);
        });
    }

    public async build(source: PokieProject, destinationPath: string, options?: ArtifactBuildOptions): Promise<ArtifactBuildResult> {
        if (source.type !== "blueprint") throw new Error("A canonical WASM artifact requires a Game Blueprint source.");
        assertArtifactBuildNotCancelled(options);
        assertArtifactDestinationIsSafe(source.rootPath, destinationPath);
        assertArtifactDestinationAvailable(destinationPath, this.destinationKind);
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
            const model = stableJson(resolveCanonicalWasmGameModel(blueprint));
            const parsedModel = JSON.parse(model) as PokieWasmGameModel;
            const configurationHash = `sha256:${crypto.createHash("sha256").update(model).digest("hex")}`;
            const descriptor = canonicalDescriptor({
                schemaVersion: POKIE_WASM_CONTRACT_VERSION,
                component: {id: blueprint.manifest.id, version: blueprint.manifest.version},
                minPokieVersion: this.pokieVersion,
                serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
                host: {rng: "pokie.rng.v1", services: []},
                capabilities: ["runtime.play", "runtime.serialize", "runtime.replay", "artifact.inspect"],
                artifact: {format: "pokie.wasm.v1", abiVersion: POKIE_WASM_ABI_VERSION, adapter: POKIE_WASM_ADAPTER, configurationHash},
            });
            const moduleBytes = buildPortableWasmModule(model, descriptor, parsedModel.stopWidths, parsedModel.reelStrips.map((strip) => strip.length));
            const hash = `sha256:${crypto.createHash("sha256").update(moduleBytes).digest("hex")}`;
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
            await this.publication.writeFile(wasmStage, moduleBytes);
            await this.publication.writeFile(manifestStage, `${JSON.stringify(manifest, null, 2)}\n`);
            assertArtifactBuildNotCancelled(options);
            // The module is published last only after its bound sidecar is
            // complete; a reader never accepts an orphan module as canonical.
            await this.publication.rename(manifestStage, sidecarPath);
            assertArtifactBuildNotCancelled(options);
            await this.publication.rename(wasmStage, destinationPath);
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
