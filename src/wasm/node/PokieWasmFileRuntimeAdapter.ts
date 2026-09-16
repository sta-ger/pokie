import fs from "fs";
import {ProjectTargetResolver} from "../../project/ProjectTargetResolver.js";
import {readWasmComponentManifest} from "../../project/readWasmComponentManifest.js";
import {instantiatePokieWasm} from "../PokieWasmRuntime.js";
import type {PokieWasmHost, PokieWasmRuntime} from "../PokieWasmRuntimeApi.js";

/** Node-only file adapter; portable WASM runtime modules never import this. */
export async function loadPokieWasmFileRuntime(filePath: string, host: PokieWasmHost): Promise<PokieWasmRuntime> {
    const project = await new ProjectTargetResolver().resolve(filePath);
    if (project?.type !== "wasm") throw new Error(`"${filePath}" is not a recognized POKIE WASM artifact.`);
    const manifestRead = await readWasmComponentManifest(project);
    if (!manifestRead.supported || manifestRead.manifest.artifact === undefined) {
        throw new Error("This WASM component is inspection-only and cannot be loaded as a canonical POKIE runtime.");
    }
    return instantiatePokieWasm(new Uint8Array(await fs.promises.readFile(project.rootPath)), manifestRead.manifest, host);
}
