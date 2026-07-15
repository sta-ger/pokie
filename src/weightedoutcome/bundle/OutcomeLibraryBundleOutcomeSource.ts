import type {WeightedOutcomeRandomSource} from "../../pregenerated/WeightedOutcomeRandomSource.js";
import type {WeightedOutcome} from "../WeightedOutcome.js";
import {OutcomeLibraryBundleReader} from "./OutcomeLibraryBundleReader.js";
import type {OutcomeLibraryBundleOutcomeSourcing} from "./OutcomeLibraryBundleOutcomeSourcing.js";
import type {OutcomeLibraryBundleReading} from "./OutcomeLibraryBundleReading.js";

// A thin, purpose-built wrapper binding one (bundleDir, modeName) pair to OutcomeLibraryBundleReading's own
// index-only weighted-draw path (drawOutcome) — the bundle-native counterpart to WeightedOutcomeSelector for a
// caller that wants to serve draws directly from a bundle on disk without ever holding a full
// WeightedOutcomeLibrary in memory (or even calling readLibrary() once). Every method here reads only this
// mode's own small index_<modeName>.json, plus — for drawOutcome — exactly the one winning outcome's own byte
// range in outcomes_<modeName>.jsonl; the rest of that file is never opened.
export class OutcomeLibraryBundleOutcomeSource<T extends string | number = string> implements OutcomeLibraryBundleOutcomeSourcing<T> {
    private readonly bundleDir: string;
    private readonly modeName: string;
    private readonly reader: OutcomeLibraryBundleReading<T>;

    constructor(bundleDir: string, modeName: string, reader: OutcomeLibraryBundleReading<T> = new OutcomeLibraryBundleReader<T>()) {
        this.bundleDir = bundleDir;
        this.modeName = modeName;
        this.reader = reader;
    }

    public drawOutcome(randomSource: WeightedOutcomeRandomSource): Promise<WeightedOutcome<T>> {
        return this.reader.drawOutcome(this.bundleDir, this.modeName, randomSource);
    }

    public async getLibraryHash(): Promise<string> {
        const index = await this.reader.readModeIndex(this.bundleDir, this.modeName);
        return index.libraryHash;
    }
}
