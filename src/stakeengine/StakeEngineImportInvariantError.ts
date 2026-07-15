// Thrown only by StakeEngineImporter's own defensive self-checks — e.g. re-converting a reconstructed artifact's
// payoutMultiplier and requiring it to land back on the exact value a book line already reported, after
// StakeEngineImportValidator/StakeEngineRoundEventsImporter have already confirmed everything needed for that to
// hold. Should be unreachable in practice: a genuine mismatch would mean the importer's own reconstruction
// diverged from itself, not a caller input problem (those are always reported as ValidationIssue[] instead, see
// StakeEngineImportValidator/StakeEngineImportEventsError). Naming mirrors StakeEngineExportInvariantError.
export class StakeEngineImportInvariantError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "StakeEngineImportInvariantError";
    }
}
