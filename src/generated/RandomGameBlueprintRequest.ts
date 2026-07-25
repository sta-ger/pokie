// Pins the manifest's name (and, optionally, id) instead of accepting the randomly generated one --
// e.g. "pokie create <name> --random" already has a name from the command line and shouldn't get a
// second, unrelated one made up for it.
export type RandomGameBlueprintOverrides = {
    id?: string;
    name?: string;
};

// Every field is optional -- omit them all for a fully random game; supply "seed" alone to reproduce
// a previous call exactly (see RandomGameBlueprintResult.provenance for what came back that time),
// or add "overrides" to pin the manifest name/id without losing determinism for whatever's left to
// chance.
export type RandomGameBlueprintRequest = {
    seed?: number;
    overrides?: RandomGameBlueprintOverrides;
};
