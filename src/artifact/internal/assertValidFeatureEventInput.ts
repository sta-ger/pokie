import {RoundRecordBuildError} from "../RoundRecordBuildError.js";
import type {RoundRecordFeatureEventInput} from "../RoundRecordFeatureEvent.js";

// Shared between buildRoundStepRecord (step-level events) and buildRoundRecord (round-level events): a
// feature event with a missing/empty "type" is meaningless (there'd be nothing to distinguish it from any
// other event by), so it's rejected at build time rather than only by RoundRecordValidator after the fact.
export function assertValidFeatureEventInput(event: RoundRecordFeatureEventInput, context: string): void {
    if (typeof event.type !== "string" || event.type.trim().length === 0) {
        throw new RoundRecordBuildError(
            "round-record-feature-event-type-invalid",
            `${context} featureEvents must have a non-empty "type", got ${JSON.stringify(event.type)}.`,
        );
    }
}
