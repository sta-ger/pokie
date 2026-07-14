import type {RoundArtifactWin} from "../artifact/RoundArtifactWin.js";

// The client-safe projection of a PreGeneratedRoundResult — exactly what a player-facing client needs
// to render a round, never the library/outcome/weight provenance that produced it (see
// PreGeneratedRoundInternalView for that). Mirrors PokieDevSessionResponse's own public/internal split
// (see PokieDevServer), field-for-field where the concepts overlap (`credits`, `win`, `screen`).
export type PreGeneratedRoundPublicView<T extends string | number = string> = {
    readonly roundId: string;
    readonly sessionId: string;
    readonly requestId?: string;
    readonly credits: number;
    readonly win: number;
    readonly payoutMultiplier: number;
    readonly screen: readonly (readonly T[])[];
    readonly wins: readonly RoundArtifactWin<T>[];
};
