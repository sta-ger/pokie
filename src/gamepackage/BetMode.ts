// A single selectable bet mode (e.g. base game, ante bet, buy-the-feature). id/label/costMultiplier
// are pure declarative pricing/labeling data, same as always -- a caller (or, historically, nothing
// at all) was free to interpret costMultiplier however it liked. runtimeType/isDefault/forcedFreeGames
// are a SEPARATE, opt-in, explicit runtime-semantics contract: see the doc comment on runtimeType
// below for exactly what it does and doesn't unlock, and GameBlueprintValidator for the validation
// that makes "opt in" mean "opt in completely" (no half-specified semantics) rather than a new set of
// silent guesses to replace the old ones.
export type BetModeRuntimeType = "base" | "ante" | "buyFeature";

export type BetMode = {
    id: string;
    label?: string;
    // Relative to the base bet; 1 (or omitted) is a normal spin, >1 a buy-feature cost -- purely
    // informational metadata unless runtimeType is also set (see below), for a caller to apply itself
    // (e.g. multiply the base bet before session.setBet()).
    costMultiplier?: number;
    // Opt-in explicit runtime semantics -- absent (on every mode in the array) means this betModes
    // array is exactly the old pure-metadata shape (a caller/UI concern only, same as before this
    // field existed). Present on ANY mode requires it to be present, valid, and consistent on EVERY
    // mode in the array (see GameBlueprintValidator.validateBetModes) -- there is no partial opt-in,
    // and renderGeneratedGameModule.ts only ever wires VideoSlotWithBetModesSession into a generated
    // session when the whole array validates cleanly under this contract:
    //   - "base": a persistent, normal-cost mode. costMultiplier, if present, must be exactly 1.
    //   - "ante": a persistent extra-bet mode -- costMultiplier is REQUIRED (the always-applied stake
    //     multiplier; see VideoSlotWithBetModesSession/BetModeDefinition's stakeMultiplier).
    //   - "buyFeature": a one-shot, forced-feature-entry mode -- costMultiplier is REQUIRED (the buy
    //     price) and forcedFreeGames is REQUIRED (how many free games it forces entry into via
    //     mechanics.freeGames; see FreeGamesForcedFeatureEntryHandler). At most one "buyFeature" mode
    //     is supported by the generated-session wiring (see resolveBetModeCodegenWiring.ts) -- there's
    //     no per-mode-id dispatch in the runtime's ForcedFeatureEntryHandling contract to route
    //     multiple different buy-cost/grant pairs to the right purchase.
    runtimeType?: BetModeRuntimeType;
    // Exactly one mode in the array must set this true when runtimeType is used at all -- the mode
    // VideoSlotWithBetModesSession starts (and reverts to after a one-shot purchase) with. Must not be
    // the mode whose runtimeType is "buyFeature" (a one-shot purchase can never be a safe landing
    // mode -- see BetModesConfig's own same constraint on its runtime default).
    isDefault?: boolean;
    // Only meaningful (and required) on a "buyFeature"-runtimeType mode: how many free games buying
    // this mode forces entry into. Requires mechanics.freeGames to be configured on the same blueprint
    // -- there's no other feature this package's blueprint schema can force entry into yet.
    forcedFreeGames?: number;
};
