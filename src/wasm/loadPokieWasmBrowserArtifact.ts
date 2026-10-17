import {readIntegrityBoundCanonicalPokieWasmArtifact} from "./PokieWasmCanonicalModule.js";
import type {PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";

export type PokieWasmBrowserArtifact = {
    readonly projectRoot: string;
    readonly generation: string;
    readonly bytes: readonly number[];
    readonly manifest: PokieWasmComponentManifest;
};
/** A Project-scoped response contains the matching bytes and sidecar. Verify again in the browser
 * before constructing a Worker; the Worker independently checks the same binding on initialize.
 */
export async function validatePokieWasmBrowserArtifact(value: PokieWasmBrowserArtifact, expectedProject: string, expectedIdentity?: string): Promise<PokieWasmBrowserArtifact> {
    if (!value || value.projectRoot !== expectedProject || typeof value.generation !== "string" || !value.generation ||
        !Array.isArray(value.bytes) || value.bytes.length > 32 * 1024 * 1024 || !value.bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) throw new Error("Malformed or replaced WASM Project artifact response. Reopen the Project and rebuild the artifact with its sidecar.");
    await readIntegrityBoundCanonicalPokieWasmArtifact(new Uint8Array(value.bytes), value.manifest);
    if (expectedIdentity !== undefined && value.manifest.artifact?.sha256 !== expectedIdentity) throw new Error("The WASM artifact changed. Reopen the Project before executing it.");
    return value;
}
