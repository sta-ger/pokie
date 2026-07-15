import type {FairnessCommitment} from "./FairnessCommitment.js";
import type {FairnessRoundProof} from "./FairnessRoundProof.js";

// Builds the "reveal" half of a commit-reveal round — always against a live source Outcome Library Bundle
// (never a second, differently-derived selection path): draws the one outcome this commitment's own
// clientSeed/nonce/serverSeed deterministically select (see HmacFairnessRandomSource), via the exact same
// OutcomeLibraryBundleReading.drawOutcome every other bundle-backed draw in this codebase uses, and pins the
// mode index's own content hash alongside it.
export interface FairnessRoundProofBuilding {
    build(commitment: FairnessCommitment, serverSeed: string, sourceBundleDir: string): Promise<FairnessRoundProof>;
}
