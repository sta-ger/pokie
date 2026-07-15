import {
    MULTI_MODE_DEPLOYMENT_CAPABILITY,
    ROUND_ARTIFACT_DEBUG_METADATA_CAPABILITY,
    ROUND_ARTIFACT_FEATURE_EVENTS_CAPABILITY,
} from "../ExternalDeploymentCapability.js";
import type {ExternalDeploymentTarget} from "../ExternalDeploymentTarget.js";
import {LocalExternalDeploymentDiagnostic} from "./LocalExternalDeploymentDiagnostic.js";
import {LocalFileExternalDeploymentRuntimeAdapter} from "./LocalFileExternalDeploymentRuntimeAdapter.js";
import {LocalJsonExternalArtifactGenerator} from "./LocalJsonExternalArtifactGenerator.js";
import {LocalJsonExternalRoundProjector} from "./LocalJsonExternalRoundProjector.js";

export type LocalJsonExternalDeploymentTargetOptions = {
    readonly id?: string;
    readonly version?: string;
    readonly outDir: string;
};

// The SDK's one simple, ready-to-run example target — writes one pretty-printed JSON file per outcome plus an
// index.json to a local directory (see LocalJsonExternalArtifactGenerator/LocalFileExternalDeploymentRuntimeAdapter).
// It exists to exercise every piece of this SDK end to end (registration, compatibility validation, generation,
// artifact validation, diagnostics, delivery) against a real, runnable target — not as a template for a
// specific external RGS/aggregator format, and not a private integration for any of them (see
// ExternalDeploymentRuntimeAdapter's own doc comment on that being out of scope for this package).
//
// Declares every optional capability this SDK currently knows about (feature events, debug metadata, multi-mode)
// since its own JSON projection has no reason to reject any of them — a real target should only declare the
// capabilities its own format genuinely supports.
//
// Has no "artifactValidator" of its own — StandardExternalArtifactValidator's generic checks are already
// everything this target's output needs, and ExternalDeploymentService always runs that validator regardless
// (see that class's own doc comment), so declaring it again here would just duplicate every issue it reports.
export function createLocalJsonExternalDeploymentTarget<T extends string | number = string>(
    options: LocalJsonExternalDeploymentTargetOptions,
): ExternalDeploymentTarget<T> {
    const roundProjector = new LocalJsonExternalRoundProjector<T>();

    return {
        id: options.id ?? "local-json-example",
        version: options.version ?? "1.0.0",
        requirements: {requiresHomogeneousProvenance: true},
        capabilities: [ROUND_ARTIFACT_FEATURE_EVENTS_CAPABILITY, ROUND_ARTIFACT_DEBUG_METADATA_CAPABILITY, MULTI_MODE_DEPLOYMENT_CAPABILITY],
        roundProjector,
        artifactGenerator: new LocalJsonExternalArtifactGenerator<T>(),
        runtimeAdapter: new LocalFileExternalDeploymentRuntimeAdapter(options.outDir),
        diagnostic: new LocalExternalDeploymentDiagnostic(options.outDir),
    };
}
