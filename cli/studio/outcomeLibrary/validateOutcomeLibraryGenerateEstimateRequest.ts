import {
    type OutcomeLibraryGenerateTransportInput,
    type ValidatedOutcomeLibraryGenerateTransportRequest,
    validateOutcomeLibraryGenerateTransportRequest,
} from "./validateOutcomeLibraryGenerateRequest.js";

export type OutcomeLibraryGenerateEstimateRequestInput = OutcomeLibraryGenerateTransportInput;
export type ValidatedOutcomeLibraryGenerateEstimateRequest = ValidatedOutcomeLibraryGenerateTransportRequest;

// "mode" is never required -- an unset mode estimates the package's own default exact outcome space,
// the same as omitting "pokie outcomelibrary generate"'s own --mode (the estimate only reads reel-strip
// sizes, which don't vary by bet mode).
export function validateOutcomeLibraryGenerateEstimateRequest(input: OutcomeLibraryGenerateEstimateRequestInput): ValidatedOutcomeLibraryGenerateEstimateRequest {
    return validateOutcomeLibraryGenerateTransportRequest(input);
}
