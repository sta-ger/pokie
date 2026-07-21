import type {StakeEngineOutcomeSourceReadResult} from "./StakeEngineOutcomeSourceReadResult.js";

// Reads and normalizes an arbitrary Stake Engine outcome directory -- index.json, per-mode lookup CSV, per-mode
// zstd-compressed JSONL books -- into StakeEngineOutcomeRecord DTOs, with no pokie-manifest.json involved at any
// point. Unlike StakeEngineImporting (which only ever round-trips a directory "pokie stakeengine export" itself
// produced, and requires that run's own manifest to recover betMode/stake/provenance/libraryId), this reads
// whatever a real Stake Engine math-sdk run -- POKIE's own or a third party's -- actually writes: an existing
// directory with no POKIE manifest and no history of a POKIE export at all.
export interface StakeEngineOutcomeSourceReading {
    readFromDirectory(stakeDir: string): Promise<StakeEngineOutcomeSourceReadResult>;
}
