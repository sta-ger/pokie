import type {ExternalArtifactGenerationContext} from "./ExternalArtifactGenerationContext.js";
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
// "context.roundProjector" is always the caller's one source of truth for which projector to use — a generator
// implementation must have no round projector of its own (no constructor-injected default, no fallback) to
// generate a round through, precisely so a target can never declare one projector as its own "roundProjector"
// while its generator secretly (or accidentally) uses a different one, or none at all. See
// ExternalRoundProjector's own doc comment for why generation must never gain a second, independent calculation
// path in the first place; this context is what makes that a structural guarantee rather than a convention a
// generator author has to remember to follow.
export interface ExternalArtifactGenerator<T extends string | number = string> {
    generate(modes: readonly ExternalDeploymentModeInput<T>[], context: ExternalArtifactGenerationContext<T>): ExternalArtifactGenerationResult;
}
