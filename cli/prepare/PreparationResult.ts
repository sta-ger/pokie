import type {PokieGameManifest} from "pokie";
import type {GamePackagePreparationPhase} from "./GamePackagePreparationError.js";

export type PreparationResult = {
    projectRoot: string;
    manifest: PokieGameManifest;
    createdFiles: string[];
    // Every phase that ran to completion, in order -- always ["create", "dependencies", "build",
    // "verify"] on success, since GamePackagePreparer.prepare() throws GamePackagePreparationError
    // (rather than returning) the moment any phase fails.
    phasesCompleted: GamePackagePreparationPhase[];
};
