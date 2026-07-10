// The restoring half of ConvertableToSessionState: rebuilds a session's internal state (e.g. an
// in-progress free-games round) from a value earlier produced by toSessionState(). Optional and
// feature-detected for the same reason — a game that doesn't implement it is simply never asked to
// restore anything beyond what the base GameSessionHandling already exposes.
export interface BuildableFromSessionState<T = unknown> {
    fromSessionState(value: T): this;
}
