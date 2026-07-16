import type {ExternalArtifactGenerationResult} from "./ExternalArtifactGenerationResult.js";
import type {ExternalDeploymentProjectedModeInput} from "./ExternalDeploymentProjectedModeInput.js";

// One target's own content -> files/payloads generation step. Always in-memory and synchronous — no disk or
// network I/O happens inside generate() itself (mirrors StakeEngineExporter's own "build everything in memory
// first" phase, minus the disk-writing half of it): a target that needs to publish generated artifacts
// somewhere does so afterward, either by hand or through its own ExternalDeploymentRuntimeAdapter (see
// writeExternalDeploymentArtifactsToDirectory for the local-filesystem case). Keeping generation itself
// transport-agnostic is what lets ExternalArtifactValidator run against a generator's output before anything is
// actually published, and lets the same generator be reused unmodified by a target that later swaps its
// transport (local disk today, an HTTP push tomorrow).
//
// Deliberately not generic over T, and takes ExternalDeploymentProjectedModeInput[] — already-projected plain
// JSON — rather than the original ExternalDeploymentModeInput<T>[]/WeightedOutcomeLibrary<T>/RoundArtifact<T>.
// ExternalDeploymentService is the only thing that ever calls target.roundProjector — a generator implementation
// has no RoundArtifact, no ExternalRoundProjector reference, and nothing generic-over-T to project through, so
// it has no way to select, ignore, or diverge from the target's own declared projector: by the time generate()
// runs, projection has already happened, once, upstream. See ExternalRoundProjector's own doc comment for why
// generation must never gain a second, independent calculation path in the first place; this signature is what
// makes that a structural guarantee rather than a convention a generator author has to remember to follow.
export interface ExternalArtifactGenerator {
    generate(modes: readonly ExternalDeploymentProjectedModeInput[]): ExternalArtifactGenerationResult;
}
