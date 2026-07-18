// A single selectable bet mode (e.g. base game, buy-the-feature). Pure data — no built-in game
// logic ever selects one automatically; a caller (server layer, simulation harness, UI) always
// supplies the active mode explicitly, same rule "betMode" follows on RoundArtifact. Declared here
// (rather than under generated/) so both GameBlueprint and PokieGame can reference the same shape.
export type BetMode = {
    id: string;
    label?: string;
    // Relative to the base bet; 1 (or omitted) is a normal spin, >1 a buy-feature cost.
    costMultiplier?: number;
    // True only for a mode that always forces free games entry (a "buy the feature" mode) --
    // meaningful only alongside a configured mechanics.freeGames.
    forcesFreeGames?: boolean;
};
