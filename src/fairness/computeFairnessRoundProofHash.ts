import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {FairnessRoundProof} from "./FairnessRoundProof.js";
import {sha256OfBytes} from "./internal/sha256OfBytes.js";

// A sha256 hash of a FairnessRoundProof's own content, stable regardless of the source object's own key order —
// via toCanonicalJson, the one canonical serializer every hash in this codebase shares (see
// computeWeightedOutcomeLibraryHash). A general-purpose content identity for a proof (deduplication, storage
// keys, comparing two proofs for exact equality) — distinct from any single field on the proof itself, and never
// used internally to re-derive any of the fields it hashes over.
export function computeFairnessRoundProofHash(proof: FairnessRoundProof): string {
    return sha256OfBytes(JSON.stringify(toCanonicalJson(proof)));
}
