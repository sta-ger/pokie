import type {ExternalExportProjectedOutcome} from "./ExternalExportProjectedOutcome.js";

// One mode's worth of already-projected content — what ExternalExportService actually calls
// ExternalFileGenerator.generate() with, built from an ExternalExportModeInput<T>'s own
// WeightedOutcomeLibrary<T> by running every outcome's RoundRecord<T> through the target's own
// ExternalRoundProjector<T> (see ExternalExportService's own doc comment). A generator never receives the
// original WeightedOutcomeLibrary, a RoundRecord, or the projector itself — only this, which is why generation
// is deliberately no longer generic over T (see ExternalFileGenerator): once projection has happened,
// nothing about T is observable anymore, only plain JSON.
//
// "libraryId"/"libraryHash" are carried over from the source library (computeWeightedOutcomeLibraryHash, run
// once by the service) so a generator that wants to embed library provenance in its own output (an index file,
// a manifest, ...) doesn't need the original library to do it — see LocalJsonExternalFileGenerator for a
// worked example.
export type ExternalExportProjectedModeInput = {
    readonly modeName: string;
    readonly libraryId: string;
    readonly libraryHash: string;
    readonly outcomes: readonly ExternalExportProjectedOutcome[];
};
