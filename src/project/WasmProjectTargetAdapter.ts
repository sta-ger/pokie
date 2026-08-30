import fs from "fs";
import path from "path";
import {assessWasmComponentCompatibility} from "./wasm/assessWasmComponentCompatibility.js";
import type {PokieWasmComponentManifest} from "./wasm/PokieWasmComponentManifest.js";
import {ProjectTargetMalformedError} from "./ProjectTargetMalformedError.js";
import type {ProjectTargetTypeAdapter} from "./ProjectTargetTypeAdapter.js";
import {ProjectTargetUnsupportedError} from "./ProjectTargetUnsupportedError.js";
import {WASM_PRODUCT_CONTRACT} from "./WasmProductContract.js";

// The sidecar file a ".wasm" file must be paired with for this adapter to ever recognize it -- e.g.
// "game.wasm" needs a "game.wasm.pokie-wasm.json" next to it declaring a PokieWasmComponentManifest. Exported
// so readWasmComponentManifest can re-read the exact same file a resolved "wasm" project was recognized from,
// without duplicating this naming rule a second time.
export function wasmComponentManifestSidecarPath(wasmFilePath: string): string {
    return `${wasmFilePath}.pokie-wasm.json`;
}

// Recognizes a ".wasm" file carrying a sidecar PokieWasmComponentManifest -- the read-only half of the WASM
// compatibility boundary this module defines (see docs/wasm-compatibility-boundary.md). POKIE has no WASM
// execution backend, so this adapter never reads or interprets the ".wasm" bytes themselves, only the sidecar
// manifest describing them. Three distinct outcomes:
//   - no sidecar file at all -> undefined (not recognized; ProjectTargetResolver's own WASM_FILE_EXTENSION
//     fallback still reports its generic "no versioned WASM export contract" diagnostic, exactly as before
//     this adapter existed -- an ordinary ".wasm" file is unaffected by this adapter's addition).
//   - sidecar present but its JSON is unreadable, or PokieWasmComponentManifestValidator rejects its shape ->
//     throws ProjectTargetMalformedError (the manifest signaled intent to be this type and failed a deeper
//     read, the same convention TsPackageProjectTargetAdapter/OutcomeLibraryProjectTargetAdapter use).
//   - sidecar present, well-shaped, but assessWasmComponentCompatibility rejects its schemaVersion -> throws
//     ProjectTargetUnsupportedError naming exactly what's incompatible -- a clear incompatibility diagnostic,
//     not a generic "unrecognized" report.
//   - sidecar present, well-shaped, and compatible -> recognized. ProjectTargetResolver then stamps only
//     PROJECT_TYPE_CAPABILITIES.wasm (WASM_MANIFEST_READ_CAPABILITY alone -- never runtime.execute) onto the
//     resolved project: "resolve read-only."
export class WasmProjectTargetAdapter implements ProjectTargetTypeAdapter {
    public readonly type = "wasm";
    public readonly targetKind = "file";

    public async recognize(resolvedPath: string): Promise<string | undefined> {
        if (path.extname(resolvedPath).toLowerCase() !== ".wasm") {
            return undefined;
        }

        const sidecarPath = wasmComponentManifestSidecarPath(resolvedPath);
        let raw: string;
        try {
            raw = await fs.promises.readFile(sidecarPath, "utf-8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
                return undefined;
            }
            throw error;
        }

        let manifest: unknown;
        try {
            manifest = JSON.parse(raw);
        } catch {
            throw new ProjectTargetMalformedError(
                `"${sidecarPath}" is not valid JSON, but "${resolvedPath}" requires it as its PokieWasmComponentManifest sidecar.`,
            );
        }

        const diagnostic = assessWasmComponentCompatibility(manifest);
        if (!diagnostic.compatible) {
            const summary = diagnostic.issues.map((issue) => issue.message).join(" ");
            const isShapeIssue = diagnostic.issues.some((issue) => issue.code.startsWith("wasm-component-manifest-"));
            if (isShapeIssue) {
                throw new ProjectTargetMalformedError(`"${sidecarPath}" does not satisfy PokieWasmComponentManifest's own shape: ${summary}`);
            }
            throw new ProjectTargetUnsupportedError(
                `"${resolvedPath}" declares a PokieWasmComponentManifest that is not compatible with this POKIE build: ${summary} ` +
                    `Repair the sidecar to inspect its declared metadata. ${WASM_PRODUCT_CONTRACT.inspectionBoundary}`,
            );
        }

        const {component} = manifest as PokieWasmComponentManifest;
        return `compatible PokieWasmComponentManifest ("${path.basename(sidecarPath)}", component "${component.id}" v${component.version})`;
    }
}
