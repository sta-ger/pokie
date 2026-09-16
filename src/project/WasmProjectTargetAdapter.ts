import fs from "fs";
import path from "path";
import {assessWasmComponentCompatibility} from "./wasm/assessWasmComponentCompatibility.js";
import {satisfiesMinimumSemverLite} from "./wasm/internal/compareSemverLite.js";
import type {PokieWasmComponentManifest} from "./wasm/PokieWasmComponentManifest.js";
import {ProjectTargetMalformedError} from "./ProjectTargetMalformedError.js";
import type {ProjectTargetTypeAdapter} from "./ProjectTargetTypeAdapter.js";
import {ProjectTargetUnsupportedError} from "./ProjectTargetUnsupportedError.js";
import {describeWasmSidecarFailure} from "./WasmProductContract.js";
import {describeUnsupportedCanonicalWasmRuntimeContract, readIntegrityBoundCanonicalPokieWasmArtifact} from "../wasm/PokieWasmCanonicalModule.js";
import {POKIE_WASM_RUNTIME_VERSION} from "../wasm/PokieWasmRuntimeApi.js";

// The sidecar file a ".wasm" file must be paired with for this adapter to ever recognize it -- e.g.
// "game.wasm" needs a "game.wasm.pokie-wasm.json" next to it declaring a PokieWasmComponentManifest. Exported
// so readWasmComponentManifest can re-read the exact same file a resolved "wasm" project was recognized from,
// without duplicating this naming rule a second time.
export function wasmComponentManifestSidecarPath(wasmFilePath: string): string {
    return `${wasmFilePath}.pokie-wasm.json`;
}

// Recognizes a ".wasm" file carrying a sidecar PokieWasmComponentManifest -- the read-only half of the WASM
// compatibility boundary this module defines (see docs/wasm-compatibility-boundary.md). Canonical components
// are integrity-checked against their module bytes; legacy sidecar-only components remain metadata-only.
// Three distinct outcomes:
//   - no sidecar file at all -> undefined (not recognized; ProjectTargetResolver's own WASM_FILE_EXTENSION
//     fallback reports the missing POKIE component contract diagnostic, so an ordinary ".wasm" file is
//     never treated as a runnable POKIE artifact).
//   - sidecar present but its JSON is unreadable, or PokieWasmComponentManifestValidator rejects its shape ->
//     throws ProjectTargetMalformedError (the manifest signaled intent to be this type and failed a deeper
//     read, the same convention TsPackageProjectTargetAdapter/OutcomeLibraryProjectTargetAdapter use).
//   - sidecar present, well-shaped, but assessWasmComponentCompatibility rejects its schemaVersion -> throws
//     ProjectTargetUnsupportedError naming exactly what's incompatible -- a clear incompatibility diagnostic,
//     not a generic "unrecognized" report.
//   - sidecar present, well-shaped, and compatible -> recognized. ProjectTargetResolver then stamps only
//     shared WASM capability model onto the resolved project: canonical artifacts are portable-runtime
//     executable while legacy sidecar-only artifacts stay inspection-only.
export class WasmProjectTargetAdapter implements ProjectTargetTypeAdapter {
    public readonly type = "wasm";
    public readonly targetKind = "file";
    private readonly pokieVersion: string;

    public constructor(pokieVersion = POKIE_WASM_RUNTIME_VERSION) {
        this.pokieVersion = pokieVersion;
    }

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
                describeWasmSidecarFailure(resolvedPath, sidecarPath, "malformed", "it is not valid JSON"),
                {targetType: "wasm", stage: "WASM component sidecar", recovery: "Repair the compatible POKIE WASM component sidecar, then inspect it again."},
            );
        }

        const diagnostic = assessWasmComponentCompatibility(manifest);
        if (!diagnostic.compatible) {
            const summary = diagnostic.issues.map((issue) => issue.message).join(" ");
            const isShapeIssue = diagnostic.issues.some((issue) => issue.code.startsWith("wasm-component-manifest-"));
            if (isShapeIssue) {
                throw new ProjectTargetMalformedError(
                    describeWasmSidecarFailure(resolvedPath, sidecarPath, "malformed", `it does not satisfy PokieWasmComponentManifest's own shape: ${summary}`),
                    {targetType: "wasm", stage: "WASM component sidecar", recovery: "Repair the compatible POKIE WASM component sidecar, then inspect it again."},
                );
            }
            throw new ProjectTargetUnsupportedError(
                describeWasmSidecarFailure(resolvedPath, sidecarPath, "incompatible", summary),
                {targetType: "wasm"},
            );
        }

        const typedManifest = manifest as PokieWasmComponentManifest;
        if (typedManifest.minPokieVersion !== undefined && !satisfiesMinimumSemverLite(this.pokieVersion, typedManifest.minPokieVersion)) {
            throw new ProjectTargetUnsupportedError(
                `POKIE ${this.pokieVersion} cannot run "${resolvedPath}": it requires POKIE ${typedManifest.minPokieVersion} or newer. Update POKIE or rebuild the artifact for this runtime.`,
                {targetType: "wasm"},
            );
        }
        // Canonical artifacts bind their sidecar to the exact bytes that will
        // be instantiated.  Legacy sidecar-only artifacts remain recognized
        // for inspection, but never gain runnable capabilities accidentally.
        if (typedManifest.artifact !== undefined) {
            let bytes: Buffer;
            try {
                bytes = await fs.promises.readFile(resolvedPath);
            } catch (error) {
                throw new ProjectTargetMalformedError(`POKIE could not read WASM module "${resolvedPath}": ${error instanceof Error ? error.message : String(error)}`, {targetType: "wasm", stage: "WASM module"});
            }
            try {
                await readIntegrityBoundCanonicalPokieWasmArtifact(new Uint8Array(bytes), typedManifest);
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                const runtimeContractReason = describeUnsupportedCanonicalWasmRuntimeContract(typedManifest);
                if (runtimeContractReason !== undefined && reason === `POKIE WASM artifact cannot execute: ${runtimeContractReason}.`) {
                    throw new ProjectTargetUnsupportedError(
                        `POKIE cannot run "${resolvedPath}": ${runtimeContractReason}. Rebuild the artifact for the supported portable runtime contract.`,
                        {targetType: "wasm"},
                    );
                }
                const stage = reason.includes("descriptor") ? "WASM artifact descriptor" : "WASM artifact integrity";
                throw new ProjectTargetMalformedError(`POKIE rejected "${resolvedPath}": its canonical WASM module or game configuration does not match its manifest: ${reason}. Rebuild the artifact; do not copy a sidecar or glue file between modules.`, {targetType: "wasm", stage});
            }
        }

        const {component} = typedManifest;
        return `compatible PokieWasmComponentManifest ("${path.basename(sidecarPath)}", component "${component.id}" v${component.version})`;
    }
}
