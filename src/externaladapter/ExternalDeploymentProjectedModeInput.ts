import type {ExternalDeploymentProjectedOutcome} from "./ExternalDeploymentProjectedOutcome.js";

// One mode's worth of already-projected content — what ExternalDeploymentService actually calls
// ExternalArtifactGenerator.generate() with, built from an ExternalDeploymentModeInput<T>'s own
// WeightedOutcomeLibrary<T> by running every outcome's RoundArtifact<T> through the target's own
// ExternalRoundProjector<T> (see ExternalDeploymentService's own doc comment). A generator never receives the
// original WeightedOutcomeLibrary, a RoundArtifact, or the projector itself — only this, which is why generation
// is deliberately no longer generic over T (see ExternalArtifactGenerator): once projection has happened,
// nothing about T is observable anymore, only plain JSON.
//
// "libraryId"/"libraryHash" are carried over from the source library (computeWeightedOutcomeLibraryHash, run
// once by the service) so a generator that wants to embed library provenance in its own output (an index file,
// a manifest, ...) doesn't need the original library to do it — see LocalJsonExternalArtifactGenerator for a
// worked example.
export type ExternalDeploymentProjectedModeInput = {
    readonly modeName: string;
    readonly libraryId: string;
    readonly libraryHash: string;
    readonly outcomes: readonly ExternalDeploymentProjectedOutcome[];
};
