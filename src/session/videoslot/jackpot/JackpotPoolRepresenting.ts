// One jackpot pool/tier's own value bookkeeping — deliberately the only contract JackpotRoundHandler,
// JackpotTriggering, and JackpotAwarding depend on, so "fixed", "local", and "progressive"-style jackpots
// (see FixedJackpotPool/AccumulatingJackpotPool's own doc comments) are all just different implementations
// of this one interface, not different code paths anywhere else in this package. A pool that also wants its
// own value to survive a session restore additionally implements ConvertableToSessionState<X>/
// BuildableFromSessionState<X> (feature-detected by VideoSlotWithJackpotSession's own toSessionState()/
// fromSessionState(), the same optional-capability idiom used everywhere else in this codebase) — see
// AccumulatingJackpotPool for the concrete example.
export interface JackpotPoolRepresenting {
    getId(): string;

    // The pool's own current awardable value — informational (e.g. for display), never mutated by reading
    // it.
    getValue(): number;

    // Grows the pool by "amount" (called once per round this pool is contributed to — see
    // JackpotContributing). A pool that never grows (e.g. FixedJackpotPool) is free to make this a no-op.
    contribute(amount: number): void;

    // Called exactly once, only when JackpotAwarding resolves this pool as the winner for the round that
    // just triggered — returns the amount to actually pay out, and leaves the pool in whatever state it
    // should be in for what comes next (a fixed pool: unchanged; a growing pool: reset back to its own seed
    // value, see AccumulatingJackpotPool). Never called speculatively or more than once per award.
    award(): number;
}
