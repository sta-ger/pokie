import path from "path";
import {PreGeneratedOutcomeSourceConflictError} from "../../pregenerated/PreGeneratedOutcomeSourceConflictError.js";
import type {PreGeneratedOutcomeSelection} from "../../pregenerated/PreGeneratedOutcomeSelection.js";
import type {PreGeneratedOutcomeSourcing} from "../../pregenerated/PreGeneratedOutcomeSourcing.js";
import type {WeightedOutcomeRandomSource} from "../../pregenerated/WeightedOutcomeRandomSource.js";
import {readAndVerifyOutcomeAtByteRange} from "./internal/readOutcomeAtByteRange.js";
import {selectIndexEntryByCumulativeWeight} from "./internal/selectIndexEntryByCumulativeWeight.js";
import {OutcomeLibraryBundleInvariantError} from "./OutcomeLibraryBundleInvariantError.js";
import {OutcomeLibraryBundleReader} from "./OutcomeLibraryBundleReader.js";
import type {OutcomeLibraryBundleReading} from "./OutcomeLibraryBundleReading.js";

// The pre-generated runtime's own integration point into a canonical outcome-library bundle: a single mode's
// worth of weighted-draw capability, bound once to a (bundleDir, modeName) pair, without ever requiring a full
// WeightedOutcomeLibrary in memory or calling readLibrary(). Implements PreGeneratedOutcomeSourcing directly
// (rather than OutcomeLibraryBundleReading's own drawOutcome(), which only returns the bare outcome) so every
// draw reads this mode's own small index_<modeName>.json exactly once — never a separate read for identity and
// another for selection — and returns libraryId/libraryHash/totalWeight/outcome together, all from that same
// single read. This is what lets PreGeneratedSpinCommandHandler's own session-identity check relate to the exact
// index version a draw was made against: if the bundle is rebuilt between one draw and the next, the *next*
// draw's own atomic result reflects that immediately, rather than a stale identity fetched independently.
export class OutcomeLibraryBundleOutcomeSource<T extends string | number = string> implements PreGeneratedOutcomeSourcing<T> {
    private readonly bundleDir: string;
    private readonly modeName: string;
    private readonly reader: OutcomeLibraryBundleReading<T>;

    constructor(bundleDir: string, modeName: string, reader: OutcomeLibraryBundleReading<T> = new OutcomeLibraryBundleReader<T>()) {
        this.bundleDir = bundleDir;
        this.modeName = modeName;
        this.reader = reader;
    }

    public async drawOutcome(randomSource: WeightedOutcomeRandomSource): Promise<PreGeneratedOutcomeSelection<T>> {
        const index = await this.reader.readModeIndex(this.bundleDir, this.modeName);
        const winningEntry = selectIndexEntryByCumulativeWeight(this.modeName, index.entries, randomSource);
        const outcomesPath = path.join(this.bundleDir, index.outcomesFile);

        let outcome;
        try {
            outcome = readAndVerifyOutcomeAtByteRange<T>(this.modeName, outcomesPath, winningEntry);
        } catch (error) {
            // A drifted id/weight/recordHash at this exact byte range means the outcomes file changed since
            // this call's own index read — e.g. the bundle was rebuilt mid-draw, or a hand-tampered record —
            // never a bug in this class itself. Translated into the general PreGeneratedOutcomeSourcing
            // contract's own conflict type, so PreGeneratedSpinCommandHandler can react to it uniformly
            // regardless of which kind of source produced it.
            if (error instanceof OutcomeLibraryBundleInvariantError) {
                throw new PreGeneratedOutcomeSourceConflictError(error.message);
            }
            throw error;
        }

        return {libraryId: index.libraryId, libraryHash: index.libraryHash, totalWeight: index.totalWeight, outcome};
    }
}
