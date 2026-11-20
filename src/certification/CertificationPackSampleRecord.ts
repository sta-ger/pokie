import type {RoundRecord} from "../roundrecord/RoundRecord.js";

// One deterministically-sampled round, drawn from a source Outcome Library Bundle's mode via
// OutcomeLibraryFolderReading.drawOutcome (the same weighted-draw algorithm the pre-generated runtime uses,
// seeded with SeededWeightedOutcomeRandomSource) — never a second selection algorithm. Embeds the outcome's
// full RoundRecord verbatim (not recomputed) so this evidence bundle stays self-contained and independently
// auditable without needing the — potentially much larger — source bundle at hand.
export type CertificationPackSampleRecord<T extends string | number = string> = {
    readonly modeName: string;
    // This sample's position in the deterministic draw sequence for "seed" — 0-based, so the exact same seed
    // against the exact same (unchanged) bundle always reproduces the exact same sequence of outcomeIds.
    readonly sampleIndex: number;
    readonly seed: string;
    readonly outcomeId: string;
    readonly weight: number;
    // The source bundle's own OutcomeLibraryFolderIndexEntry.recordHash for this exact outcome, reused as-is —
    // never a second, differently-derived record hash.
    readonly recordHash: string;
    // computeRoundRecordHash(artifact), reused as-is — the same content hash every other RoundRecord
    // consumer in this codebase computes and compares.
    readonly artifactHash: string;
    readonly artifact: RoundRecord<T>;
};
