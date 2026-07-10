// Optional, feature-detected capability: a GameSessionHandling implementation MAY implement this
// to expose its internal state (e.g. an in-progress free-games round) beyond bet/credits/win, so a
// consumer like PokieDevServer can capture it for persistence. Games that don't implement it simply
// aren't asked for more than the base GameSessionHandling already exposes (a snapshot-only fallback).
export interface ConvertableToSessionState<T = unknown> {
    toSessionState(): T;
}
