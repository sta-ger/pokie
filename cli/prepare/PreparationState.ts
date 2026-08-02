import type {PokieGameManifest} from "pokie";
import type {GamePackagePreparationPhase} from "./GamePackagePreparationError.js";

// Persisted at `<projectRoot>/.pokie-prepare-state.json` by GamePackagePreparer after every phase it
// completes, and deleted once "verify" succeeds. Its presence is what tells a later prepare() call
// against the same projectRoot that the directory is a resumable in-progress preparation of *this
// tool's own making* -- safe to pick up from the last completed phase -- rather than an unrelated,
// pre-existing directory that must never be silently written into.
export type PreparationState = {
    manifest: PokieGameManifest;
    createdFiles: string[];
    phasesCompleted: GamePackagePreparationPhase[];
};
