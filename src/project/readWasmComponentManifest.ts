import fs from "fs";
import crypto from "crypto";
import {WASM_INSPECT_OPERATION} from "./PokieOperation.js";
import type {PokieProject} from "./PokieProject.js";
import type {UnsupportedProjectOperationDiagnostic} from "./UnsupportedProjectOperationDiagnostic.js";
import {describeUnsupportedProjectOperation} from "./describeUnsupportedProjectOperation.js";
import {assessWasmComponentCompatibility} from "./wasm/assessWasmComponentCompatibility.js";
import type {PokieWasmComponentManifest} from "./wasm/PokieWasmComponentManifest.js";
import {assertCanonicalWasmDescriptorMatchesManifest, wasmComponentManifestSidecarPath} from "./WasmProjectTargetAdapter.js";
import {describeWasmSidecarFailure} from "./WasmProductContract.js";
import {readCanonicalPokieWasmModule} from "../wasm/PokieWasmCanonicalModule.js";

export type WasmComponentManifestReadResult =
    | {readonly supported: true; readonly manifest: PokieWasmComponentManifest}
    | {readonly supported: false; readonly diagnostic: UnsupportedProjectOperationDiagnostic};

function hasBoundWasmConfiguration(bytes: Buffer, configurationHash: string): boolean {
    try {
        return `sha256:${crypto.createHash("sha256").update(readCanonicalPokieWasmModule(new Uint8Array(bytes)).modelBytes).digest("hex")}` === configurationHash;
    } catch {
        return false;
    }
}

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
    let raw: string;
    try {
        raw = await fs.promises.readFile(sidecarPath, "utf-8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            throw new Error(describeWasmSidecarFailure(project.rootPath, sidecarPath, "missing"));
        }
        throw error;
    }
    let manifest: unknown;
    try {
        manifest = JSON.parse(raw);
    } catch {
        throw new Error(describeWasmSidecarFailure(project.rootPath, sidecarPath, "malformed", "it is not valid JSON"));
    }

    const compatibility = assessWasmComponentCompatibility(manifest);
    if (!compatibility.compatible) {
        const isShapeIssue = compatibility.issues.some((issue) => issue.code.startsWith("wasm-component-manifest-"));
        throw new Error(describeWasmSidecarFailure(
            project.rootPath,
            sidecarPath,
            isShapeIssue ? "malformed" : "incompatible",
            compatibility.issues.map((issue) => issue.message).join(" "),
        ));
    }

    const typedManifest = manifest as PokieWasmComponentManifest;
    if (typedManifest.artifact !== undefined) {
        const bytes = await fs.promises.readFile(project.rootPath);
        let canonical;
        try {
            canonical = readCanonicalPokieWasmModule(new Uint8Array(bytes));
        } catch {
            canonical = undefined;
        }
        if (!WebAssembly.validate(new Uint8Array(bytes)) || canonical === undefined || bytes.byteLength !== typedManifest.artifact.bytes ||
            `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}` !== typedManifest.artifact.sha256 ||
            !hasBoundWasmConfiguration(bytes, typedManifest.artifact.configurationHash)) {
            throw new Error(`POKIE rejected "${project.rootPath}": the canonical WASM module or game configuration no longer matches its integrity-bound manifest.`);
        }
        assertCanonicalWasmDescriptorMatchesManifest(canonical.descriptor, typedManifest);
    }

    return {supported: true, manifest: typedManifest};
}
