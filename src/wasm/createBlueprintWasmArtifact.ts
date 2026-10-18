import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {compileCanonicalWasmArtifact} from "./DeclarativeWasmModel.js";
import {resolveResolvedCanonicalWasmGameModel} from "./resolveResolvedCanonicalWasmGameModel.js";
import {sha256CanonicalWasmBytes, type CanonicalPokieWasmComponentDescriptor} from "./PokieWasmCanonicalModule.js";
import {stableSlotMathJson} from "./math/SharedSlotMath.js";
import {POKIE_WASM_RUNTIME_VERSION} from "./PokieWasmRuntimeApi.js";
import {POKIE_WASM_ABI_VERSION, POKIE_WASM_ADAPTER, POKIE_WASM_CONTRACT_VERSION, type PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";

/** Compile in memory; publication and authored-file authority stay with the caller. */
export async function createBlueprintWasmArtifact(blueprint: GameBlueprint): Promise<{bytes: Uint8Array<ArrayBuffer>; manifest: PokieWasmComponentManifest}> {
    const model = resolveResolvedCanonicalWasmGameModel(blueprint);
    const configurationHash = await sha256CanonicalWasmBytes(new TextEncoder().encode(stableSlotMathJson(model)));
    const descriptor: CanonicalPokieWasmComponentDescriptor = {
        schemaVersion: POKIE_WASM_CONTRACT_VERSION, component: {id: blueprint.manifest.id, version: blueprint.manifest.version},
        minPokieVersion: POKIE_WASM_RUNTIME_VERSION,
        serialization: {session: "pokie.session.v2", play: "pokie.play.v2", state: model.features ? "pokie.state.v4" : "pokie.state.v3"},
        host: {rng: "pokie.rng.v2", services: []}, capabilities: ["runtime.play", "runtime.serialize", "runtime.replay", "artifact.inspect"],
        artifact: {format: "pokie.wasm.v1", abiVersion: POKIE_WASM_ABI_VERSION, adapter: POKIE_WASM_ADAPTER, configurationHash},
    };
    const bytes = compileCanonicalWasmArtifact(model, descriptor);
    const manifest: PokieWasmComponentManifest = {...descriptor, artifact: {...descriptor.artifact, adapter: POKIE_WASM_ADAPTER, sha256: await sha256CanonicalWasmBytes(bytes), bytes: bytes.length}};
    return {bytes, manifest};
}
