import {majorVersionOf} from "./internal/compareSemverLite.js";
import {POKIE_WASM_CONTRACT_VERSION, type PokieWasmComponentManifest} from "./PokieWasmComponentManifest.js";
import {PokieWasmComponentManifestValidator} from "./PokieWasmComponentManifestValidator.js";
import type {WasmComponentCompatibilityDiagnostic} from "./WasmComponentCompatibilityDiagnostic.js";

const manifestValidator = new PokieWasmComponentManifestValidator();

// Checks a WASM component's own manifest against POKIE's own WASM component contract -- always run before
// WasmProjectTargetAdapter resolves a ".wasm" target as a "wasm" ProjectType (see that adapter), the same
// "compatibility is checked before anything else trusts the target" discipline
// ExternalDeploymentCompatibilityValidator applies to ExternalDeploymentTarget. Runs shape validation
// (PokieWasmComponentManifestValidator) first -- a malformed manifest is reported as incompatible with that
// validator's own issues, never partially checked further. Only the major segment of "schemaVersion" is
// compared against POKIE_WASM_CONTRACT_VERSION's own major segment (an equal-or-lower minor/patch on the
// manifest's own side is accepted) -- POKIE reserves a major bump for an actually breaking change to the
// manifest shape, so a minor/patch-only difference is never treated as incompatible. Deliberately never
// checks "minPokieVersion" against a running POKIE release -- that field is declared metadata a future
// execution backend would enforce (see PokieWasmComponentManifest's own doc comment); resolving a "wasm"
// project read-only never needs to know which POKIE release is currently running. Never throws.
export function assessWasmComponentCompatibility(manifest: unknown): WasmComponentCompatibilityDiagnostic {
    const shapeIssues = manifestValidator.validate(manifest);
    if (shapeIssues.some((issue) => issue.severity === "error")) {
        return {compatible: false, issues: shapeIssues};
    }

    const typedManifest = manifest as PokieWasmComponentManifest;
    const manifestMajor = majorVersionOf(typedManifest.schemaVersion);
    const contractMajor = majorVersionOf(POKIE_WASM_CONTRACT_VERSION);
    if (manifestMajor === contractMajor) {
        return {compatible: true, issues: []};
    }

    return {
        compatible: false,
        issues: [
            {
                code: "wasm-component-schema-version-incompatible",
                severity: "error",
                message:
                    `component "${typedManifest.component.id}" declares schemaVersion "${typedManifest.schemaVersion}", which is not ` +
                    `compatible with POKIE's own WASM component contract version "${POKIE_WASM_CONTRACT_VERSION}" (major version must match).`,
                details: {declaredSchemaVersion: typedManifest.schemaVersion, contractVersion: POKIE_WASM_CONTRACT_VERSION},
                path: "schemaVersion",
            },
        ],
    };
}
