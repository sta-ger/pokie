// A single selectable bet mode (e.g. base game, buy-the-feature). Pure declarative pricing/labeling
// data for a caller to act on -- no built-in game logic ever selects one automatically, or forces
// any engine behavior from it (same rule "betMode" follows on RoundArtifact). Declared here (rather
// than under generated/) so both GameBlueprint and PokieGame can reference the same shape.
//
// Deliberately does NOT include a "forces free games entry" flag or similar: nothing in the runtime
// session-construction path (see renderGeneratedGameModule.ts) reads a bet mode at all, so a field
// promising that kind of engine behavior would be a public API this package couldn't actually honor
// -- a real "buy the feature" mechanic (forcing free-games entry on demand, or any other per-spin
// bet-mode-driven behavior) needs its own first-class runtime hook before it belongs here.
export type BetMode = {
    id: string;
    label?: string;
    // Relative to the base bet; 1 (or omitted) is a normal spin, >1 a buy-feature cost -- purely
    // informational, for a caller to apply itself (e.g. multiply the base bet before session.setBet()).
    costMultiplier?: number;
};
