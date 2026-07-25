// What produced a randomly generated GameBlueprint, and with which algorithm -- distinct from the
// blueprint's own manifest.version, which describes the *game*, not the generator that made it.
// "generatorVersion" exists so a future change to RandomGameBlueprintStrategy's own logic can be
// distinguished from a replay of the exact same seed against the exact same algorithm: same seed +
// same generatorVersion always reproduces the same blueprint, but a seed alone does not once
// generatorVersion has moved on.
export type RandomGameBlueprintProvenance = {
    readonly generatorVersion: string;
    // RandomGameBlueprintStrategy.name of whichever strategy actually produced this blueprint.
    readonly strategy: string;
    readonly seed: number;
};
