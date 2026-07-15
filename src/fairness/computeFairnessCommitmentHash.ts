import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {FairnessCommitment} from "./FairnessCommitment.js";
import {sha256OfBytes} from "./internal/sha256OfBytes.js";

// A sha256 hash of a FairnessCommitment's own content, stable regardless of the source object's own key order —
// via toCanonicalJson, the one canonical serializer every hash in this codebase shares (see
// computeWeightedOutcomeLibraryHash). This is the exact hash FairnessRoundProofBuilder embeds as a
// FairnessRoundProof's own commitmentHash, and the one FairnessRoundProofVerifying recomputes from a
// caller-given commitment to confirm a proof is genuinely bound to that exact commitment, not merely one whose
// individual fields happen to look similar.
export function computeFairnessCommitmentHash(commitment: FairnessCommitment): string {
    return sha256OfBytes(JSON.stringify(toCanonicalJson(commitment)));
}
