import type {ExternalArtifactGenerationResult} from "./ExternalArtifactGenerationResult.js";
import type {ExternalDeploymentModeInput} from "./ExternalDeploymentModeInput.js";

// One target's own content -> files/payloads generation step. Always in-memory and synchronous — no disk or
// network I/O happens inside generate() itself (mirrors StakeEngineExporter's own "build everything in memory
// first" phase, minus the disk-writing half of it): a target that needs to publish generated artifacts
// somewhere does so afterward, either by hand or through its own ExternalDeploymentRuntimeAdapter (see
// writeExternalDeploymentArtifactsToDirectory for the local-filesystem case). Keeping generation itself
// transport-agnostic is what lets ExternalArtifactValidator run against a generator's output before anything is
// actually published, and lets the same generator be reused unmodified by a target that later swaps its
// transport (local disk today, an HTTP push tomorrow).
//
// Implementations must run every content through their target's own ExternalRoundProjector — see that
// interface's own doc comment for why generation must never gain a second, independent calculation path.
export interface ExternalArtifactGenerator<T extends string | number = string> {
    generate(modes: readonly ExternalDeploymentModeInput<T>[]): ExternalArtifactGenerationResult;
}
