import type {CertificationPackBuildResult} from "./CertificationPackBuildResult.js";
import type {CertificationPackBuildOptions} from "./CertificationPackBuildOptions.js";
import type {CertificationPackModeSampleInput} from "./CertificationPackModeSampleInput.js";

// Not generic over T, same reasoning as OutcomeLibraryFolderValidating: nothing in this method's own signature
// is typed by a particular T (it reads an on-disk bundle directory and writes another one, never accepts or
// returns a typed in-memory value) — CertificationPackBuilder itself still uses T internally to type
// each sampled RoundRecord<T>, but that's an implementation detail, not part of this contract.
export interface CertificationPackBuilding {
    buildFromBundle(
        libraryDir: string,
        modes: readonly CertificationPackModeSampleInput[],
        outDir: string,
        options?: CertificationPackBuildOptions,
    ): Promise<CertificationPackBuildResult>;
}
