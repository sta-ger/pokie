import type {GameBlueprint} from "./GameBlueprint.js";

export type BetModeCodegenWiring = {
    defaultModeId: string;
    buyFeatureMode?: {id: string; forcedFreeGames: number};
};

// Decides whether renderGeneratedGameModule.ts may safely wire a blueprint's betModes into a real,
// bet-mode-aware generated session (VideoSlotWithBetModesSession) -- returns undefined (metadata-only,
// today's behavior) unless the WHOLE array validates cleanly under the explicit runtime-semantics
// contract (see gamepackage/BetMode.ts's own doc comment): every mode's runtimeType set and valid,
// exactly one non-buyFeature default, ante/buyFeature each carrying their own required fields, at most
// one buyFeature mode, and mechanics.freeGames configured whenever a buyFeature mode exists.
//
// Deliberately independent of GameBlueprintValidator: GamePackageGenerator.generate() (and this
// function's own callers) don't require validation to have run first, so this re-checks every
// semantic rule itself rather than trusting a validator pass that may not have happened. It does NOT
// re-validate purely structural things GameBlueprintValidator alone is responsible for (id
// non-emptiness/uniqueness) -- those are prerequisites for the blueprint being valid at all, not
// specific to "should the bet-mode runtime be wired".
//
// Returns undefined (never guesses/wires a best-effort subset) for anything short of a fully
// consistent contract -- an incomplete or invalid attempt at explicit semantics falls back to the
// same plain, metadata-only getBetModes() this package already had, exactly as if runtimeType had
// never been set at all.
export function resolveBetModeCodegenWiring(blueprint: GameBlueprint): BetModeCodegenWiring | undefined {
    const betModes = blueprint.betModes;
    if (!betModes || betModes.length === 0) {
        return undefined;
    }
    if (!betModes.every((mode) => mode.runtimeType !== undefined)) {
        return undefined;
    }
    if (!betModes.every((mode) => mode.runtimeType === "base" || mode.runtimeType === "ante" || mode.runtimeType === "buyFeature")) {
        return undefined;
    }

    for (const mode of betModes) {
        if (mode.runtimeType === "buyFeature") {
            if (!(typeof mode.costMultiplier === "number" && Number.isFinite(mode.costMultiplier) && mode.costMultiplier > 0)) {
                return undefined;
            }
            if (!(typeof mode.forcedFreeGames === "number" && Number.isInteger(mode.forcedFreeGames) && mode.forcedFreeGames > 0)) {
                return undefined;
            }
        } else if (mode.runtimeType === "ante") {
            if (!(typeof mode.costMultiplier === "number" && Number.isFinite(mode.costMultiplier) && mode.costMultiplier > 0)) {
                return undefined;
            }
            if (mode.forcedFreeGames !== undefined) {
                return undefined;
            }
        } else {
            // "base"
            if (mode.costMultiplier !== undefined && mode.costMultiplier !== 1) {
                return undefined;
            }
            if (mode.forcedFreeGames !== undefined) {
                return undefined;
            }
        }
    }

    const defaults = betModes.filter((mode) => mode.isDefault === true);
    if (defaults.length !== 1) {
        return undefined;
    }
    const defaultMode = defaults[0];
    if (defaultMode.runtimeType === "buyFeature") {
        return undefined;
    }

    const buyFeatureModes = betModes.filter((mode) => mode.runtimeType === "buyFeature");
    if (buyFeatureModes.length > 1) {
        return undefined;
    }
    if (buyFeatureModes.length === 1 && blueprint.mechanics?.freeGames === undefined) {
        return undefined;
    }

    return {
        defaultModeId: defaultMode.id,
        buyFeatureMode:
            buyFeatureModes.length === 1
                ? {id: buyFeatureModes[0].id, forcedFreeGames: buyFeatureModes[0].forcedFreeGames as number}
                : undefined,
    };
}
