import fs from "fs";
import path from "path";
import crypto from "crypto";
import {assessWasmComponentCompatibility} from "./wasm/assessWasmComponentCompatibility.js";
import {satisfiesMinimumSemverLite} from "./wasm/internal/compareSemverLite.js";
import type {PokieWasmComponentManifest} from "./wasm/PokieWasmComponentManifest.js";
import {ProjectTargetMalformedError} from "./ProjectTargetMalformedError.js";
import type {ProjectTargetTypeAdapter} from "./ProjectTargetTypeAdapter.js";
import {ProjectTargetUnsupportedError} from "./ProjectTargetUnsupportedError.js";
import {describeWasmSidecarFailure} from "./WasmProductContract.js";
import {readCanonicalPokieWasmModule, type CanonicalPokieWasmComponentDescriptor} from "../wasm/PokieWasmCanonicalModule.js";

// The sidecar file a ".wasm" file must be paired with for this adapter to ever recognize it -- e.g.
// "game.wasm" needs a "game.wasm.pokie-wasm.json" next to it declaring a PokieWasmComponentManifest. Exported
// so readWasmComponentManifest can re-read the exact same file a resolved "wasm" project was recognized from,
// without duplicating this naming rule a second time.
export function wasmComponentManifestSidecarPath(wasmFilePath: string): string {
    return `${wasmFilePath}.pokie-wasm.json`;
}

function hasBoundWasmConfiguration(bytes: Buffer, configurationHash: string): boolean {
    try {
        return `sha256:${crypto.createHash("sha256").update(readCanonicalPokieWasmModule(new Uint8Array(bytes)).modelBytes).digest("hex")}` === configurationHash;
    } catch {
        return false;
    }
}

export function assertCanonicalWasmDescriptorMatchesManifest(descriptor: CanonicalPokieWasmComponentDescriptor, manifest: PokieWasmComponentManifest): void {
    const artifact = manifest.artifact;
    if (artifact === undefined || descriptor.schemaVersion !== manifest.schemaVersion || descriptor.component.id !== manifest.component.id ||
        descriptor.component.version !== manifest.component.version || descriptor.minPokieVersion !== manifest.minPokieVersion ||
        descriptor.serialization.session !== manifest.serialization.session || descriptor.serialization.play !== manifest.serialization.play ||
        descriptor.serialization.state !== manifest.serialization.state || descriptor.host.rng !== manifest.host.rng ||
        JSON.stringify(descriptor.host.services) !== JSON.stringify(manifest.host.services) || JSON.stringify(descriptor.capabilities) !== JSON.stringify(manifest.capabilities) ||
        descriptor.artifact.format !== artifact.format || descriptor.artifact.abiVersion !== artifact.abiVersion ||
        descriptor.artifact.adapter !== artifact.adapter || descriptor.artifact.configurationHash !== artifact.configurationHash) {
        throw new Error("the canonical component descriptor embedded in the WASM module does not agree with its manifest");
    }
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
    private readonly pokieVersion: string;

    public constructor(pokieVersion = "1.3.0") {
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
            let canonical;
            try {
                canonical = readCanonicalPokieWasmModule(new Uint8Array(bytes));
            } catch {
                canonical = undefined;
            }
            if (!WebAssembly.validate(new Uint8Array(bytes)) || canonical === undefined || bytes.byteLength !== typedManifest.artifact.bytes ||
                `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}` !== typedManifest.artifact.sha256 ||
                !hasBoundWasmConfiguration(bytes, typedManifest.artifact.configurationHash)) {
                throw new ProjectTargetMalformedError(`POKIE rejected "${resolvedPath}": its integrity-bound WASM module or game configuration does not match its manifest. Rebuild the artifact; do not copy a sidecar or glue file between modules.`, {targetType: "wasm", stage: "WASM artifact integrity"});
            }
            try {
                assertCanonicalWasmDescriptorMatchesManifest(canonical.descriptor, typedManifest);
            } catch (error) {
                throw new ProjectTargetMalformedError(`POKIE rejected "${resolvedPath}": ${error instanceof Error ? error.message : String(error)}. Rebuild the artifact; do not edit a runnable component sidecar.`, {targetType: "wasm", stage: "WASM artifact descriptor"});
            }
        }

        const {component} = typedManifest;
        return `compatible PokieWasmComponentManifest ("${path.basename(sidecarPath)}", component "${component.id}" v${component.version})`;
    }
}
