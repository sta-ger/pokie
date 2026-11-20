import {toCanonicalJson} from "../json/toCanonicalJson.js";
import {sha256OfBytes} from "./internal/sha256OfBytes.js";

// Recomputes exactly the hash an Outcome Library Bundle's own OutcomeLibraryFolderIndexEntry.recordHash is —
// sha256 of the exact canonical-JSON bytes {id, weight, artifact} would be written as inside
// outcomes_<modeName>.jsonl (see streamModeOutcomesToTempFile, the one place that hash is originally computed;
// this mirrors it exactly, never a second, differently-derived digest). A CertificationPackSampleRecord's
// own {outcomeId, weight, artifact} is exactly that same triple under different field names, so this recomputes
// what "the recordHash of this exact sample" should be, whether or not a live bundle is available:
// CertificationPackValidator uses it as a self-consistency check (does the record's own recordHash
// still match its own {outcomeId, weight, artifact}), and CertificationPackVerifier additionally
// compares the result — or the record's own recordHash directly — against a live OutcomeLibraryFolderIndexEntry
// for the same id.
export function computeCertificationSampleRecordHash(record: {id: string; weight: number; artifact: unknown}): string {
    return sha256OfBytes(JSON.stringify(toCanonicalJson({id: record.id, weight: record.weight, artifact: record.artifact})));
}
