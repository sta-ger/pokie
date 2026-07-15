// A capability id is a plain, open string rather than a closed union — mirrors RoundArtifact's own "betMode"
// convention (see RoundArtifact.ts): the three constants below are the vocabulary this SDK's own compatibility
// checks understand, but a third-party ExternalDeploymentTarget is free to declare its own additional capability
// ids (e.g. "myVendor.replayUrls") that ExternalDeploymentCompatibilityValidator simply never checks against —
// closing this to a union would make every new target's capability a breaking change to this package itself.
export type ExternalDeploymentCapability = string;

// A target declaring this supports RoundArtifact/RoundStepArtifact instances whose "featureEvents" is
// non-empty. Content that uses feature events against a target that doesn't declare this capability is rejected
// by ExternalDeploymentCompatibilityValidator before any file is generated, rather than silently dropping the
// events (or letting a generator choke on them) at generation time.
export const ROUND_ARTIFACT_FEATURE_EVENTS_CAPABILITY = "roundArtifact.featureEvents";

// A target declaring this supports RoundArtifact/RoundStepArtifact instances whose "debug" field is present.
export const ROUND_ARTIFACT_DEBUG_METADATA_CAPABILITY = "roundArtifact.debugMetadata";

// A target declaring this accepts more than one ExternalDeploymentModeInput in a single deployment. Targets
// that only ever model one bet mode (cost) at a time should omit it — ExternalDeploymentCompatibilityValidator
// then rejects a multi-mode deployment against them up front instead of the generator silently only handling
// the first mode.
export const MULTI_MODE_DEPLOYMENT_CAPABILITY = "multiMode";
