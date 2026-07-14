import {deepFreeze} from "../internal/deepFreeze.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import {computeWeightedOutcomeLibraryHash} from "./computeWeightedOutcomeLibraryHash.js";
import type {WeightedOutcomeLibrary} from "./WeightedOutcomeLibrary.js";
import type {WeightedOutcomeLibraryJson} from "./WeightedOutcomeLibraryJson.js";
import type {WeightedOutcomeLibraryProjector} from "./WeightedOutcomeLibraryProjector.js";

// The standard POKIE projector: turns a WeightedOutcomeLibrary into a plain, JSON-safe object with a canonical
// field order (sorted keys, via the same toCanonicalJson this shares with computeWeightedOutcomeLibraryHash —
// so the two can never silently drift apart on what a library's JSON shape actually is) and stamps it with its
// own content hash. Fails fast (propagates InvalidJsonValueError) on anything that isn't valid canonical JSON.
export class PokieJsonWeightedOutcomeLibraryProjector<T extends string | number = string>
implements WeightedOutcomeLibraryProjector<T, WeightedOutcomeLibraryJson<T>> {
    public project(library: WeightedOutcomeLibrary<T>): WeightedOutcomeLibraryJson<T> {
        const canonical = toCanonicalJson(library) as unknown as WeightedOutcomeLibrary<T>;
        return deepFreeze({...canonical, hash: computeWeightedOutcomeLibraryHash(library)});
    }
}
