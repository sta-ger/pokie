type RandomPreset = "default" | "variant";

const RANDOM_PRESETS: readonly RandomPreset[] = ["default", "variant"];

export type BlueprintRandomRequestInput = {seed?: unknown; preset?: unknown; name?: unknown};

export type ValidatedBlueprintRandomRequest = {seed?: number; preset: RandomPreset; name?: string};

// The one place a POST /api/home/blueprints/random body is turned into a trusted request — throws a
// plain, client-safe Error (StudioServer catches this and maps it to 400) for anything malformed.
// Mirrors CreateCommand's own "--random --seed --preset" parsing: "seed", when given, must be an
// integer (any other seed would silently fail to reproduce via RandomGameBlueprintGenerator's own
// "same seed always reproduces the same blueprint" contract); "preset" defaults to "default" exactly
// like "pokie create --random" does; "name", when given, becomes the generated manifest's own name
// override (see RandomGameBlueprintOverrides).
export function validateBlueprintRandomRequest(input: BlueprintRandomRequestInput): ValidatedBlueprintRandomRequest {
    const {seed, preset, name} = input;

    let resolvedSeed: number | undefined;
    if (seed !== undefined) {
        if (typeof seed !== "number" || !Number.isInteger(seed)) {
            throw new Error('"seed" must be an integer when given.');
        }
        resolvedSeed = seed;
    }

    let resolvedPreset: RandomPreset = "default";
    if (preset !== undefined) {
        if (typeof preset !== "string" || !RANDOM_PRESETS.includes(preset as RandomPreset)) {
            throw new Error(`"preset" must be one of: ${RANDOM_PRESETS.join(", ")}.`);
        }
        resolvedPreset = preset as RandomPreset;
    }

    let resolvedName: string | undefined;
    if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length === 0) {
            throw new Error('"name" must be a non-empty string when given.');
        }
        resolvedName = name;
    }

    return {seed: resolvedSeed, preset: resolvedPreset, name: resolvedName};
}
