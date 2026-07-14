import type {RoundArtifactStepSource} from "./RoundArtifactStepSource.js";
import type {RoundArtifactWin} from "./RoundArtifactWin.js";
import type {RoundStepArtifact} from "./RoundStepArtifact.js";

// Pure mapping from an already-computed WinEvaluationResult to one RoundStepArtifact — totalWin/wins are read
// straight off the win evaluation pipeline's own output, never recalculated.
export function buildRoundStepArtifact<T extends string | number | symbol = string>(
    index: number,
    source: RoundArtifactStepSource<T>,
): RoundStepArtifact<T> {
    const wins: RoundArtifactWin<T>[] = source.winEvaluationResult.getWinComponents().map((component) => ({
        type: component.getType(),
        id: component.getId(),
        symbolId: component.getSymbolId(),
        winAmount: component.getWinAmount(),
        winningPositions: component.getWinningPositions(),
        multiplierBreakdown: component.getMultiplierBreakdown(),
        metadata: component.getMetadata(),
    }));

    return {
        index,
        screen: source.screen.map((reel) => [...reel]),
        totalWin: source.winEvaluationResult.getTotalWin(),
        wins,
        ...(source.featureEvents !== undefined ? {featureEvents: [...source.featureEvents]} : {}),
        ...(source.debug !== undefined ? {debug: {...source.debug}} : {}),
    };
}
