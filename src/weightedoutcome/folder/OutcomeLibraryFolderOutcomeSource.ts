import fs from "fs";
import path from "path";
import {PreGeneratedOutcomeSourceConflictError} from "../../pregenerated/PreGeneratedOutcomeSourceConflictError.js";
import type {PreGeneratedOutcomeSelection} from "../../pregenerated/PreGeneratedOutcomeSelection.js";
import type {PreGeneratedOutcomeSourcing} from "../../pregenerated/PreGeneratedOutcomeSourcing.js";
import type {WeightedOutcomeRandomSource} from "../../pregenerated/WeightedOutcomeRandomSource.js";
import {readAndVerifyOutcomeAtByteRange} from "./internal/readOutcomeAtByteRange.js";
import {selectIndexEntryByCumulativeWeight} from "./internal/selectIndexEntryByCumulativeWeight.js";
import {OutcomeLibraryFolderInvariantError} from "./OutcomeLibraryFolderInvariantError.js";
import {OutcomeLibraryFolderReader} from "./OutcomeLibraryFolderReader.js";
import type {OutcomeLibraryFolderReading} from "./OutcomeLibraryFolderReading.js";

// The pre-generated runtime's own integration point into a canonical outcome-library bundle: a single mode's
// worth of weighted-draw capability, bound once to a (libraryDir, modeName) pair, without ever requiring a full
// WeightedOutcomeLibrary in memory or calling readLibrary(). Implements PreGeneratedOutcomeSourcing directly
// (rather than OutcomeLibraryFolderReading's own drawOutcome(), which only returns the bare outcome) so every
// draw reads this mode's own small index_<modeName>.json exactly once — never a separate read for identity and
// another for selection — and returns libraryId/libraryHash/totalWeight/outcome together, all from that same
// single read. This is what lets PreGeneratedSpinCommandHandler's own session-identity check relate to the exact
// index version a draw was made against: if the bundle is rebuilt between one draw and the next, the *next*
// draw's own atomic result reflects that immediately, rather than a stale identity fetched independently.
type CachedModeIndex = {
    readonly device: bigint;
    readonly inode: bigint;
    readonly size: bigint;
    readonly mtimeNs: bigint;
    readonly index: import("./OutcomeLibraryFolderModeIndex.js").OutcomeLibraryFolderModeIndex;
};

export class OutcomeLibraryFolderOutcomeSource<T extends string | number = string> implements PreGeneratedOutcomeSourcing<T> {
    private readonly libraryDir: string;
    private readonly modeName: string;
    private readonly reader: OutcomeLibraryFolderReading<T>;
    private cachedIndex?: CachedModeIndex;

    constructor(libraryDir: string, modeName: string, reader: OutcomeLibraryFolderReading<T> = new OutcomeLibraryFolderReader<T>()) {
        this.libraryDir = libraryDir;
        this.modeName = modeName;
        this.reader = reader;
    }

    public async drawOutcome(randomSource: WeightedOutcomeRandomSource): Promise<PreGeneratedOutcomeSelection<T>> {
        const index = await this.readModeIndexCached();
        const winningEntry = selectIndexEntryByCumulativeWeight(this.modeName, index.entries, randomSource);
        const outcomesPath = path.join(this.libraryDir, index.outcomesFile);

        let outcome;
        try {
            outcome = readAndVerifyOutcomeAtByteRange<T>(this.modeName, outcomesPath, winningEntry);
        } catch (error) {
            // A drifted id/weight/recordHash at this exact byte range means the outcomes file changed since
            // this call's own index read — e.g. the bundle was rebuilt mid-draw, or a hand-tampered record —
            // never a bug in this class itself. Translated into the general PreGeneratedOutcomeSourcing
            // contract's own conflict type, so PreGeneratedSpinCommandHandler can react to it uniformly
            // regardless of which kind of source produced it.
            if (error instanceof OutcomeLibraryFolderInvariantError) {
                throw new PreGeneratedOutcomeSourceConflictError(error.message);
            }
            throw error;
        }

        return {libraryId: index.libraryId, libraryHash: index.libraryHash, totalWeight: index.totalWeight, outcome};
    }

    // A batch simulation draws thousands of outcomes from the same immutable bundle. Re-reading and
    // parsing a multi-megabyte mode index on every draw made simulation cost scale with library size
    // (tens of seconds for a 16k-outcome library) instead of with the number of draws. The index is
    // still checked against its file identity on every call, so an atomic rebuild is observed on the
    // next draw; only an in-place rewrite that preserves device/inode/size/mtimeNs could evade this
    // cheap check, and the per-outcome recordHash verification above still catches a changed record.
    private async readModeIndexCached(): Promise<import("./OutcomeLibraryFolderModeIndex.js").OutcomeLibraryFolderModeIndex> {
        const indexPath = path.join(this.libraryDir, `index_${this.modeName}.json`);
        const stat = await fs.promises.stat(indexPath, {bigint: true});
        const cached = this.cachedIndex;
        if (cached !== undefined && cached.device === stat.dev && cached.inode === stat.ino &&
            cached.size === stat.size && cached.mtimeNs === stat.mtimeNs) {
            return cached.index;
        }
        const index = await this.reader.readModeIndex(this.libraryDir, this.modeName);
        this.cachedIndex = {device: stat.dev, inode: stat.ino, size: stat.size, mtimeNs: stat.mtimeNs, index};
        return index;
    }
}
