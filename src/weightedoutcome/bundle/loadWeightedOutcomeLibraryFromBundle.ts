import type {WeightedOutcomeLibrary} from "../WeightedOutcomeLibrary.js";
import {OutcomeLibraryBundleReader} from "./OutcomeLibraryBundleReader.js";
import type {OutcomeLibraryBundleReading} from "./OutcomeLibraryBundleReading.js";

// The one shared "load a full WeightedOutcomeLibrary from a canonical bundle" path — both the Stake Engine
// exporter's CLI (StakeEngineCommand, via a mode's "bundleDir"/"bundleModeName" instead of "libraryPath") and
// the pre-generated runtime's wiring (constructing PreGeneratedSpinCommandHandler/PokieDevServer's
// preGeneratedOutcomeLibrary option) call exactly this function, so the two can never end up reading different
// bytes or disagreeing about what a bundle contains.
export function loadWeightedOutcomeLibraryFromBundle<T extends string | number = string>(
    bundleDir: string,
    modeName: string,
    reader: OutcomeLibraryBundleReading<T> = new OutcomeLibraryBundleReader<T>(),
): Promise<WeightedOutcomeLibrary<T>> {
    return reader.readLibrary(bundleDir, modeName);
}
