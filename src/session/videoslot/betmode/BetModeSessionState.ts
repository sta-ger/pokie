// `base` opaquely forwards whatever the wrapped session's own toSessionState() (e.g.
// VideoSlotWithFreeGamesSessionState) produces, if it implements ConvertableToSessionState at all --
// VideoSlotWithBetModesSession never needs to know its shape, only whether it's present. This is what
// lets deterministic replay carry both the selected mode and any nested free-games-in-progress state
// through the same single featureState blob PokieDevServer captures (see captureBaseSessionState).
export interface BetModeSessionState {
    betModeId: string;
    base?: unknown;
}
