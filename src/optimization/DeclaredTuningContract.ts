import fs from "fs";
import {computeGameBlueprintHash} from "../generated/computeGameBlueprintHash.js";
import {resolveCanonicalWasmGameModel} from "../project/WasmArtifactBuilder.js";
import {compileCanonicalWasmArtifact} from "../wasm/DeclarativeWasmModel.js";
import {readWasmComponentManifest} from "../project/readWasmComponentManifest.js";
import {ProjectTargetResolver} from "../project/ProjectTargetResolver.js";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import type {PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";
import {digest, inventory, paytablePaths, readJson} from "./internal/optimizationData.js";

/** Package authors explicitly opt in; a descriptor or executable capability alone is insufficient. */
export type DeclaredPackageTuningContract = {
    version: "pokie.tuning.v1";
    parameterFile: string;
    paths: string[];
    /** Exact hashes of all package files except this contract and the parameter file. */
    sourceHashes: Record<string, string>;
    modelHash: string;
    runtimeBinding: "getConfigHash:blueprint-v1";
};
export type CanonicalWasmTuningContract = {
    version: "pokie.wasm-tuning.v1";
    builder: "canonical-pokie-v1";
    blueprint: GameBlueprint;
    paths: string[];
    modelHash: string;
    moduleHash: string;
};
export function compileBoundTuningWasm(blueprint: GameBlueprint, manifest: PokieWasmComponentManifest): Uint8Array {
    if (!manifest.artifact) throw new Error("Missing canonical WASM provenance.");
    const {sha256: _hash, bytes: _bytes, ...artifact} = manifest.artifact;
    return compileCanonicalWasmArtifact(resolveCanonicalWasmGameModel(blueprint), {
        schemaVersion: manifest.schemaVersion,
        component: manifest.component,
        ...(manifest.minPokieVersion === undefined ? {} : {minPokieVersion: manifest.minPokieVersion}),
        serialization: manifest.serialization,
        host: manifest.host,
        capabilities: manifest.capabilities,
        artifact,
    });
}
/** Explicit authoring action; never invoked implicitly by optimization support discovery. */
export function declarePackageTuning(packageRoot: string, parameterFile: string, paths: string[]): void {
    if (
        !parameterFile ||
        parameterFile.startsWith("/") ||
        parameterFile.split("/").some((part) => ["..", ".", ""].includes(part)) ||
        parameterFile.includes("\\")
    ) throw new Error("Unsafe parameterFile.");
    const files = inventory(packageRoot);
    const blueprint = readJson(`${packageRoot}/${parameterFile}`) as GameBlueprint;
    if (paths.some((field) => !paytablePaths(blueprint).includes(field))) throw new Error("Only existing paytable leaves are supported.");
    Reflect.deleteProperty(files, parameterFile);
    Reflect.deleteProperty(files, "pokie-tuning.json");
    const contract: DeclaredPackageTuningContract = {
        version: "pokie.tuning.v1",
        parameterFile,
        paths,
        sourceHashes: files,
        modelHash: computeGameBlueprintHash(blueprint),
        runtimeBinding: "getConfigHash:blueprint-v1",
    };
    fs.writeFileSync(`${packageRoot}/pokie-tuning.json`, `${JSON.stringify(contract, null, 2)}\n`, {flag: "wx"});
}
/** Opts a reproducible canonical component into detached source rebuilding. */
export async function bindCanonicalWasmTuningSource(
    file: string,
    blueprint: GameBlueprint,
    paths: string[],
): Promise<void> {
    const project = await new ProjectTargetResolver().resolve(file);
    if (!project || project.type !== "wasm") throw new Error("Expected a canonical WASM project.");
    const read = await readWasmComponentManifest(project);
    if (!read.supported || !read.canonical || paths.some((field) => !paytablePaths(blueprint).includes(field))) throw new Error("Unsupported source/tuning contract.");
    if (digest(compileBoundTuningWasm(blueprint, read.manifest)) !== digest(fs.readFileSync(file))) throw new Error("Source does not reproduce canonical component bytes.");
    const contract: CanonicalWasmTuningContract = {
        version: "pokie.wasm-tuning.v1",
        builder: "canonical-pokie-v1",
        blueprint,
        paths,
        modelHash: computeGameBlueprintHash(blueprint),
        moduleHash: read.manifest.artifact!.sha256,
    };
    fs.writeFileSync(`${file}.tuning.json`, `${JSON.stringify(contract, null, 2)}\n`, {flag: "wx"});
}
