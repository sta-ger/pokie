import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {OutcomeLibraryBundleModeIndex} from "../weightedoutcome/bundle/OutcomeLibraryBundleModeIndex.js";
import {sha256OfBytes} from "./internal/sha256OfBytes.js";

// A sha256 hash of a mode's entire OutcomeLibraryBundleModeIndex — every id/weight/byteOffset/byteLength/
// recordHash of every entry, in the index's own canonical (sorted-by-id) order. Pinned onto a FairnessRoundProof
// at build time (see FairnessRoundProofBuilder) so FairnessRoundProofVerifier can detect "bundle drift" at
// whole-index granularity — an entry added, removed, reweighted, or byte-shifted — even for outcomes the proof's
// own single recordHash cross-check never individually touches, the same way libraryHash already pins the whole
// library's own content. Stable regardless of key order via toCanonicalJson, the one canonical serializer every
// hash in this codebase shares (see computeWeightedOutcomeLibraryHash).
export function computeFairnessIndexHash(index: OutcomeLibraryBundleModeIndex): string {
    return sha256OfBytes(JSON.stringify(toCanonicalJson(index)));
}
