import type {RandomGameBlueprint} from "./RandomGameBlueprint.js";

// Pins the manifest's name (and, optionally, id) instead of accepting the randomly generated one --
// e.g. "pokie create <name> --random" already has a name from the command line and shouldn't get a
// second, unrelated one made up for it.
export type RandomGameBlueprintOverrides = {
    id?: string;
    name?: string;
};

export interface RandomGameBlueprintGenerating {
    // "seed", when given, always produces the same blueprint; omit it for a fresh one every call
    // (the seed actually used comes back either way -- see RandomGameBlueprint).
    generate(seed?: number, overrides?: RandomGameBlueprintOverrides): RandomGameBlueprint;
}
