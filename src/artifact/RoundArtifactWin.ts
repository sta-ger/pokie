import type {JsonObject} from "../json/JsonValue.js";

// A deeply-readonly, JSON-safe mirror of one WinMultiplierBreakdown (see WinComponent.getMultiplierBreakdown())
// — positions/values are deep-copied at build time (see buildRoundStepArtifact), never shared with the
// win evaluation pipeline's own mutable state.
export type RoundArtifactMultiplierBreakdown = {
    readonly source: string;
    readonly positions: readonly (readonly number[])[];
    readonly values: readonly number[];
    readonly combinedMultiplier: number;
};

// A lossless, deeply-readonly, JSON-safe mirror of one WinComponent<T> (see WinComponent's own getType/getId/
// getSymbolId/getWinAmount/getWinningPositions/getMultiplierBreakdown/getMetadata) — a plain-data projection,
// not a recomputation, so a RoundArtifact's wins are always exactly what the win evaluation pipeline already
// produced. "metadata" is canonicalized via canonicalizeJsonField at build time: both deeply copied (isolated
// from the win evaluation pipeline's own state) and validated as JSON-safe.
export type RoundArtifactWin<T extends string | number | symbol = string> = {
    readonly type: string;
    readonly id: string;
    readonly symbolId: T;
    readonly winAmount: number;
    readonly winningPositions: readonly (readonly number[])[];
    readonly multiplierBreakdown: readonly RoundArtifactMultiplierBreakdown[];
    readonly metadata: JsonObject;
};
