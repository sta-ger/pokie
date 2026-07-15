import type {CertificationEvidenceBundleBuildResult} from "./CertificationEvidenceBundleBuildResult.js";
import type {CertificationEvidenceBundleModeSampleInput} from "./CertificationEvidenceBundleModeSampleInput.js";

// Not generic over T, same reasoning as OutcomeLibraryBundleValidating: nothing in this method's own signature
// is typed by a particular T (it reads an on-disk bundle directory and writes another one, never accepts or
// returns a typed in-memory value) — CertificationEvidenceBundleBuilder itself still uses T internally to type
// each sampled RoundArtifact<T>, but that's an implementation detail, not part of this contract.
export interface CertificationEvidenceBundleBuilding {
    buildFromBundle(
        bundleDir: string,
        modes: readonly CertificationEvidenceBundleModeSampleInput[],
        outDir: string,
    ): Promise<CertificationEvidenceBundleBuildResult>;
}
