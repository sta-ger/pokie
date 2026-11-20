import {resolveCanonicalWasmGameModel} from "../wasm/resolveCanonicalWasmGameModel.js";
import {compileCanonicalWasmBuild} from "../wasm/DeclarativeWasmModel.js";
import {stableSlotMathJson} from "../wasm/math/SharedSlotMath.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import {loadGameBlueprint} from "../generated/loadGameBlueprint.js";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import type {BuildOutputBuilder} from "./BuildOutputBuilder.js";
import type {BuildOutputResult} from "./BuildOutputResult.js";
import {assertBuildNotCancelled, captureOutputDestinationState, cleanupIncompleteArtifactOutput, ensureArtifactDestinationParent, reportBuildProgress, type BuildOutputOptions} from "./BuildOutputOptions.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "./internal/assertArtifactDestinationIsSafe.js";
import type {PokieProject} from "./PokieProject.js";
import {POKIE_WASM_ABI_VERSION, POKIE_WASM_ADAPTER, POKIE_WASM_CONTRACT_VERSION, type PokieWasmComponentInfo} from "./wasm/PokieWasmComponentInfo.js";
import {wasmComponentInfoCompanionPath} from "./WasmProjectTargetAdapter.js";
import {type CanonicalPokieWasmComponentDescriptor, type PokieWasmGameModel} from "../wasm/PokieWasmCanonicalModule.js";

export {resolveCanonicalWasmGameModel} from "../wasm/resolveCanonicalWasmGameModel.js";

export type WasmOutputPublication = {
    writeFile(filePath: string, contents: string | Uint8Array): Promise<void>;
    rename(fromPath: string, toPath: string): Promise<void>;
};

const filesystemWasmArtifactPublication: WasmOutputPublication = {
    writeFile: (filePath, contents) => fs.promises.writeFile(filePath, contents),
    rename: (fromPath, toPath) => fs.promises.rename(fromPath, toPath),
};

function canonicalDescriptor(manifest: Omit<PokieWasmComponentInfo, "artifact"> & {readonly artifact: Omit<NonNullable<PokieWasmComponentInfo["artifact"]>, "sha256" | "bytes">}): CanonicalPokieWasmComponentDescriptor {
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
export class WasmOutputBuilder implements BuildOutputBuilder {
    public readonly target = "wasm" as const;
    public readonly destinationKind = "file" as const;
    private readonly pokieVersion: string;
    private readonly publication: WasmOutputPublication;

    public constructor(pokieVersion: string, publication: WasmOutputPublication = filesystemWasmArtifactPublication) {
        this.pokieVersion = pokieVersion;
        this.publication = publication;
    }

    public validate(source: PokieProject): Promise<void> {
        return Promise.resolve().then(() => {
            if (source.type !== "blueprint") throw new Error("A canonical WASM artifact requires a Game Blueprint source.");
            const blueprint = loadGameBlueprint(source.rootPath) as GameBlueprint;
            const errors = new GameBlueprintValidator().validate(blueprint).filter((issue) => issue.severity === "error");
            if (errors.length > 0) throw new Error(`Blueprint "${source.rootPath}" has ${errors.length} error(s): ${errors.map((issue) => `${issue.code} at ${issue.path ?? "$"}: ${issue.message}`).join("; ")}`);
            resolveCanonicalWasmGameModel(blueprint);
        });
    }

    public async build(source: PokieProject, destinationPath: string, options?: BuildOutputOptions): Promise<BuildOutputResult> {
        if (source.type !== "blueprint") throw new Error("A canonical WASM artifact requires a Game Blueprint source.");
        assertBuildNotCancelled(options);
        assertArtifactDestinationIsSafe(source.rootPath, destinationPath);
        assertArtifactDestinationAvailable(destinationPath, this.destinationKind);
        const sidecarPath = wasmComponentInfoCompanionPath(destinationPath);
        assertArtifactDestinationAvailable(sidecarPath, this.destinationKind);
        const destinationState = captureOutputDestinationState(destinationPath, this.destinationKind);
        const sidecarState = captureOutputDestinationState(sidecarPath, this.destinationKind);
        let wasmStage: string | undefined;
        let manifestStage: string | undefined;
        try {
            await this.validate(source);
            await ensureArtifactDestinationParent(destinationPath);
            const blueprint = loadGameBlueprint(source.rootPath) as GameBlueprint;
            const model = stableSlotMathJson(resolveCanonicalWasmGameModel(blueprint));
            const parsedModel = JSON.parse(model) as PokieWasmGameModel;
            const configurationHash = `sha256:${crypto.createHash("sha256").update(model).digest("hex")}`;
            const descriptor = canonicalDescriptor({
                schemaVersion: POKIE_WASM_CONTRACT_VERSION,
                component: {id: blueprint.manifest.id, version: blueprint.manifest.version},
                minPokieVersion: this.pokieVersion,
                serialization: {session: "pokie.session.v2", play: "pokie.play.v2", state: parsedModel.features !== undefined ? "pokie.state.v4" : "pokie.state.v3"},
                host: {rng: "pokie.rng.v2", services: []},
                capabilities: ["runtime.play", "runtime.serialize", "runtime.replay", "artifact.inspect"],
                artifact: {format: "pokie.wasm.v1", abiVersion: POKIE_WASM_ABI_VERSION, adapter: POKIE_WASM_ADAPTER, configurationHash},
            });
            const moduleBytes = compileCanonicalWasmBuild(parsedModel, descriptor);
            const hash = `sha256:${crypto.createHash("sha256").update(moduleBytes).digest("hex")}`;
            const manifest: PokieWasmComponentInfo = {
                schemaVersion: POKIE_WASM_CONTRACT_VERSION,
                component: {id: blueprint.manifest.id, version: blueprint.manifest.version},
                minPokieVersion: this.pokieVersion,
                serialization: {session: "pokie.session.v2", play: "pokie.play.v2", state: parsedModel.features !== undefined ? "pokie.state.v4" : "pokie.state.v3"},
                host: {rng: "pokie.rng.v2", services: []},
                capabilities: ["runtime.play", "runtime.serialize", "runtime.replay", "artifact.inspect"],
                artifact: {format: "pokie.wasm.v1", sha256: hash, bytes: moduleBytes.byteLength, abiVersion: POKIE_WASM_ABI_VERSION, adapter: POKIE_WASM_ADAPTER, configurationHash},
            };
            const nonce = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
            wasmStage = path.join(path.dirname(destinationPath), `.${path.basename(destinationPath)}.${nonce}.tmp`);
            manifestStage = path.join(path.dirname(sidecarPath), `.${path.basename(sidecarPath)}.${nonce}.tmp`);
            reportBuildProgress(options, {status: "running", message: "Staging portable WASM component"});
            await this.publication.writeFile(wasmStage, moduleBytes);
            await this.publication.writeFile(manifestStage, `${JSON.stringify(manifest, null, 2)}\n`);
            assertBuildNotCancelled(options);
            // The module is published last only after its bound sidecar is
            // complete; a reader never accepts an orphan module as canonical.
            await this.publication.rename(manifestStage, sidecarPath);
            assertBuildNotCancelled(options);
            await this.publication.rename(wasmStage, destinationPath);
            reportBuildProgress(options, {status: "completed"});
            return {outputPath: destinationPath};
        } catch (error) {
            await Promise.all([wasmStage && fs.promises.rm(wasmStage, {force: true}), manifestStage && fs.promises.rm(manifestStage, {force: true})].filter(Boolean));
            await cleanupIncompleteArtifactOutput(destinationPath, destinationState);
            await cleanupIncompleteArtifactOutput(sidecarPath, sidecarState);
            reportBuildProgress(options, {status: options?.signal?.aborted ? "cancelled" : "failed", message: "WASM publication failed"});
            throw error;
        }
    }
}
