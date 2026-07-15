import type {WeightedOutcomeRandomSource} from "../../pregenerated/WeightedOutcomeRandomSource.js";
import type {WeightedOutcome} from "../WeightedOutcome.js";

// The pre-generated runtime's own integration point into a canonical outcome-library bundle: a single mode's
// worth of weighted-draw capability, bound once to a (bundleDir, modeName) pair, without ever requiring a full
// WeightedOutcomeLibrary in memory. Deliberately its own interface rather than an implementation of
// WeightedOutcomeSelecting — that interface's own "select(library, randomSource)" signature requires every
// outcome's full RoundArtifact up front, which is exactly what a bundle-native, index-only draw exists to avoid
// loading (see OutcomeLibraryBundleOutcomeSource).
export interface OutcomeLibraryBundleOutcomeSourcing<T extends string | number = string> {
    // A single weighted draw: reads only this mode's own small index (never the outcomes file's full content)
    // to pick a winning id by exact integer cumulative weight, then reads exactly that one outcome by byte
    // range — never calling readLibrary(), never materializing any other outcome.
    drawOutcome(randomSource: WeightedOutcomeRandomSource): Promise<WeightedOutcome<T>>;

    // The mode's own recorded libraryHash, from its small index — the same identity check
    // PreGeneratedSpinCommandHandler/a session's own stored libraryHash would compare against, obtainable
    // without ever reading the (potentially huge) outcomes file.
    getLibraryHash(): Promise<string>;
}
