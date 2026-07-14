// A pre-generated session's own persisted state — deliberately tiny compared to PokieSessionState:
// there's no live GameSessionHandling object or feature state to reconstruct, since a pre-generated
// round never runs a game's own calculation path. `roundsPlayed` plus `seed` is everything
// PreGeneratedSpinCommandHandler needs to derive the next round's deterministic draw (see
// deriveDeterministicSeed) and everything PreGeneratedRoundReplayer needs to reproduce any past one.
//
// `libraryId`/`libraryHash` are stamped at session creation and checked again on every spin
// (PreGeneratedSpinCommandHandler): a session created against one library must never be spun against a
// different library, or a same-id library that was since regenerated with different weights/outcomes
// (same libraryId, different hash) — either would silently reinterpret this session's `seed`/round
// index against content it was never drawn from. A mismatch surfaces as an explicit "conflict" result,
// never as a round played against the wrong library.
export type PreGeneratedSessionState = {
    readonly libraryId: string;
    readonly libraryHash: string;
    readonly seed: string;
    readonly roundsPlayed: number;
};
