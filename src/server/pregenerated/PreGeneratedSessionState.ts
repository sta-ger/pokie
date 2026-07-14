// A pre-generated session's own persisted state — deliberately tiny compared to PokieSessionState:
// there's no live GameSessionHandling object or feature state to reconstruct, since a pre-generated
// round never runs a game's own calculation path. `roundsPlayed` plus `seed` is everything
// PreGeneratedSpinCommandHandler needs to derive the next round's deterministic draw (see
// deriveDeterministicSeed) and everything PreGeneratedRoundReplayer needs to reproduce any past one.
export type PreGeneratedSessionState = {
    readonly libraryId: string;
    readonly seed: string;
    readonly roundsPlayed: number;
};
