import fs from "fs";
import {WASM_INSPECT_OPERATION} from "./PokieOperation.js";
import type {PokieProject} from "./PokieProject.js";
import type {UnsupportedProjectOperationDiagnostic} from "./UnsupportedProjectOperationDiagnostic.js";
import {describeUnsupportedProjectOperation} from "./describeUnsupportedProjectOperation.js";
import {assessWasmComponentCompatibility} from "./wasm/assessWasmComponentCompatibility.js";
import type {PokieWasmComponentManifest} from "./wasm/PokieWasmComponentManifest.js";
import {wasmComponentManifestSidecarPath} from "./WasmProjectTargetAdapter.js";
import {WASM_PRODUCT_CONTRACT} from "./WasmProductContract.js";

export type WasmComponentManifestReadResult =
    | {readonly supported: true; readonly manifest: PokieWasmComponentManifest}
    | {readonly supported: false; readonly diagnostic: UnsupportedProjectOperationDiagnostic};

// Reads back a resolved "wasm" project's own PokieWasmComponentManifest -- the read-only access
// WASM_MANIFEST_READ_CAPABILITY actually grants (see ProjectCapabilities.ts): metadata only, never the
// ".wasm" bytes themselves, and never anything resembling loading/instantiating/executing the component --
// POKIE has no WASM execution backend (see docs/wasm-compatibility-boundary.md). Re-reads and re-validates
// the sidecar from disk rather than trusting `project.provenance` (a human-readable string, not structured
// data) -- PokieProject itself never carries type-specific structured data beyond
// type/rootPath/capabilities/provenance, the same discipline sampleOutcomeSourceProject/
// simulateOutcomeSourceProject follow for "outcomeLibrary"/"stakeAdapter" projects. Throws only if the sidecar
// has genuinely changed on disk (moved/deleted/edited) since `project` was resolved -- an already-resolved
// "wasm" project is a promise the manifest was compatible at resolution time, not a guarantee it still is at
// read time.
export async function readWasmComponentManifest(project: PokieProject): Promise<WasmComponentManifestReadResult> {
    const diagnostic = describeUnsupportedProjectOperation(project, WASM_INSPECT_OPERATION);
    if (diagnostic !== undefined) {
        return {supported: false, diagnostic};
    }

    const sidecarPath = wasmComponentManifestSidecarPath(project.rootPath);
    const raw = await fs.promises.readFile(sidecarPath, "utf-8");
    const manifest: unknown = JSON.parse(raw);

    const compatibility = assessWasmComponentCompatibility(manifest);
    if (!compatibility.compatible) {
        throw new Error(
            `"${sidecarPath}" no longer satisfies POKIE's WASM inspection contract (it may have changed on disk ` +
                `since this project was resolved): ${compatibility.issues.map((issue) => issue.message).join(" ")} ` +
                `Repair the sidecar, then inspect it again. ${WASM_PRODUCT_CONTRACT.inspectionBoundary}`,
        );
    }

    return {supported: true, manifest: manifest as PokieWasmComponentManifest};
}
