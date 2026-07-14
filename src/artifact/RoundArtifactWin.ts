import type {WinMultiplierBreakdown} from "../session/videoslot/winevaluation/WinMultiplierBreakdown.js";

// A lossless, JSON-safe mirror of one WinComponent<T> (see WinComponent's own getType/getId/getSymbolId/
// getWinAmount/getWinningPositions/getMultiplierBreakdown/getMetadata) — a plain-data projection, not a
// recomputation, so a RoundArtifact's wins are always exactly what the win evaluation pipeline already produced.
export type RoundArtifactWin<T extends string | number | symbol = string> = {
    type: string;
    id: string;
    symbolId: T;
    winAmount: number;
    winningPositions: number[][];
    multiplierBreakdown: WinMultiplierBreakdown[];
    metadata: Record<string, unknown>;
};
