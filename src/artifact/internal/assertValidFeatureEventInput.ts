import {RoundArtifactBuildError} from "../RoundArtifactBuildError.js";
import type {RoundArtifactFeatureEventInput} from "../RoundArtifactFeatureEvent.js";

// Shared between buildRoundStepArtifact (step-level events) and buildRoundArtifact (round-level events): a
// feature event with a missing/empty "type" is meaningless (there'd be nothing to distinguish it from any
// other event by), so it's rejected at build time rather than only by RoundArtifactValidator after the fact.
export function assertValidFeatureEventInput(event: RoundArtifactFeatureEventInput, context: string): void {
    if (typeof event.type !== "string" || event.type.trim().length === 0) {
        throw new RoundArtifactBuildError(
            "round-artifact-feature-event-type-invalid",
            `${context} featureEvents must have a non-empty "type", got ${JSON.stringify(event.type)}.`,
        );
    }
}
