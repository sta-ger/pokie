import type {GameBlueprint} from "./GameBlueprint.js";
import {BetModeRuntimeSemanticsInvalidError} from "./BetModeRuntimeSemanticsInvalidError.js";

export type BetModeCodegenWiring = {
    defaultModeId: string;
    buyFeatureModes: {id: string; forcedFreeGames: number}[];
};

// Decides whether renderGeneratedGameModule.ts may safely wire a blueprint's betModes into a real,
// bet-mode-aware generated session (VideoSlotWithBetModesSession) -- returns undefined only for the
// legacy case where NO bet mode sets "runtimeType" at all (metadata-only, today's behavior, exactly as
// if the explicit runtime-semantics contract had never been introduced). Any number of "buyFeature"
// modes are supported, each carrying its own costMultiplier/forcedFreeGames -- see
// gamepackage/BetMode.ts's own doc comment and PerModeForcedFeatureEntryHandler, which is what lets
// renderGeneratedGameModule.ts route forced entry per mode id without hard-coding any of them.
//
// Deliberately independent of GameBlueprintValidator: GamePackageGenerator.generate() (and this
// function's own callers) don't require validation to have run first, so this re-checks every
// semantic rule itself rather than trusting a validator pass that may not have happened. It does NOT
// re-validate purely structural things GameBlueprintValidator alone is responsible for (id
// non-emptiness/uniqueness) -- those are prerequisites for the blueprint being valid at all, not
// specific to "should the bet-mode runtime be wired".
//
// Once ANY mode sets "runtimeType", the whole array has committed to the explicit contract -- an
// incomplete or invalid attempt from that point on throws BetModeRuntimeSemanticsInvalidError rather
// than silently degrading to metadata-only, so a direct GamePackageGenerator.generate() call (which
// skips GameBlueprintValidator) can never produce a generated package that quietly drops semantics
// its blueprint clearly intended to have. Only the case where NO mode sets "runtimeType" at all keeps
// returning undefined -- that is genuinely the old, pre-runtimeType schema, not a broken opt-in.
export function resolveBetModeCodegenWiring(blueprint: GameBlueprint): BetModeCodegenWiring | undefined {
    const betModes = blueprint.betModes;
    if (!betModes || betModes.length === 0) {
        return undefined;
    }
    if (!betModes.some((mode) => mode.runtimeType !== undefined)) {
        return undefined;
    }
    if (!betModes.every((mode) => mode.runtimeType !== undefined)) {
        throw new BetModeRuntimeSemanticsInvalidError(
            '"runtimeType" is set on some bet modes but not all -- every bet mode must set an explicit ' +
                '"runtimeType" once any one of them does.',
        );
    }
    if (!betModes.every((mode) => mode.runtimeType === "base" || mode.runtimeType === "ante" || mode.runtimeType === "buyFeature")) {
        throw new BetModeRuntimeSemanticsInvalidError('Every bet mode\'s "runtimeType" must be one of: base, ante, buyFeature.');
    }

    for (const mode of betModes) {
        if (mode.runtimeType === "buyFeature") {
            if (!(typeof mode.costMultiplier === "number" && Number.isFinite(mode.costMultiplier) && mode.costMultiplier > 0)) {
                throw new BetModeRuntimeSemanticsInvalidError(
                    `Bet mode "${mode.id}" has runtimeType "buyFeature", so "costMultiplier" must be a positive, finite number.`,
                );
            }
            if (!(typeof mode.forcedFreeGames === "number" && Number.isInteger(mode.forcedFreeGames) && mode.forcedFreeGames > 0)) {
                throw new BetModeRuntimeSemanticsInvalidError(
                    `Bet mode "${mode.id}" has runtimeType "buyFeature", so "forcedFreeGames" must be a positive integer.`,
                );
            }
        } else if (mode.runtimeType === "ante") {
            if (!(typeof mode.costMultiplier === "number" && Number.isFinite(mode.costMultiplier) && mode.costMultiplier > 0)) {
                throw new BetModeRuntimeSemanticsInvalidError(
                    `Bet mode "${mode.id}" has runtimeType "ante", so "costMultiplier" must be a positive, finite number.`,
                );
            }
            if (mode.forcedFreeGames !== undefined) {
                throw new BetModeRuntimeSemanticsInvalidError(
                    `Bet mode "${mode.id}" has runtimeType "ante", so "forcedFreeGames" must not be set.`,
                );
            }
        } else {
            // "base"
            if (mode.costMultiplier !== undefined && mode.costMultiplier !== 1) {
                throw new BetModeRuntimeSemanticsInvalidError(
                    `Bet mode "${mode.id}" has runtimeType "base", so "costMultiplier" must be 1 if present.`,
                );
            }
            if (mode.forcedFreeGames !== undefined) {
                throw new BetModeRuntimeSemanticsInvalidError(
                    `Bet mode "${mode.id}" has runtimeType "base", so "forcedFreeGames" must not be set.`,
                );
            }
        }
    }

    const defaults = betModes.filter((mode) => mode.isDefault === true);
    if (defaults.length !== 1) {
        throw new BetModeRuntimeSemanticsInvalidError(
            `Exactly one bet mode must set "isDefault": true, but ${defaults.length} do.`,
        );
    }
    const defaultMode = defaults[0];
    if (defaultMode.runtimeType === "buyFeature") {
        throw new BetModeRuntimeSemanticsInvalidError(
            `Bet mode "${defaultMode.id}" is both the default mode and runtimeType "buyFeature" -- a one-shot purchase can never be a safe default.`,
        );
    }

    const buyFeatureModes = betModes.filter((mode) => mode.runtimeType === "buyFeature");
    if (buyFeatureModes.length > 0 && blueprint.mechanics?.freeGames === undefined) {
        throw new BetModeRuntimeSemanticsInvalidError(
            'A "buyFeature" bet mode forces entry into "mechanics.freeGames", but "mechanics.freeGames" is not configured on this blueprint.',
        );
    }

    return {
        defaultModeId: defaultMode.id,
        buyFeatureModes: buyFeatureModes.map((mode) => ({id: mode.id, forcedFreeGames: mode.forcedFreeGames as number})),
    };
}
