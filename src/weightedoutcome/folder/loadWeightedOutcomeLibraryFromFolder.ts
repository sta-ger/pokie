import type {WeightedOutcomeLibrary} from "../WeightedOutcomeLibrary.js";
import {OutcomeLibraryFolderReader} from "./OutcomeLibraryFolderReader.js";
import type {OutcomeLibraryFolderReading} from "./OutcomeLibraryFolderReading.js";

// The one shared "load a full WeightedOutcomeLibrary from a canonical bundle" path — both the Stake Engine
// exporter's CLI (StakeEngineCommand, via a mode's "libraryDir"/"libraryModeName" instead of "libraryPath") and
// the pre-generated runtime's wiring (constructing PreGeneratedSpinCommandHandler/PokieDevServer's
// preGeneratedOutcomeLibrary option) call exactly this function, so the two can never end up reading different
// bytes or disagreeing about what a bundle contains.
export function loadWeightedOutcomeLibraryFromFolder<T extends string | number = string>(
    libraryDir: string,
    modeName: string,
    reader: OutcomeLibraryFolderReading<T> = new OutcomeLibraryFolderReader<T>(),
): Promise<WeightedOutcomeLibrary<T>> {
    return reader.readLibrary(libraryDir, modeName);
}
