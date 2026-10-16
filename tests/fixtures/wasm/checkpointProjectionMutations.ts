/** Exact reviewer reproducers plus sibling public projection/analytics fields. */
export const checkpointProjectionMutations: readonly (readonly [string, unknown?])[] = [
    ["lastRound.network.totalWin", -123],
    ["lastRound.network.totalWin", "invalid"],
    ["lastRound.network.bet", 999],
    ["lastRound.network.credits", -123],
    ["lastRound.network.availableBets", [999]],
    ["lastRound.network.winEvaluationResult.totalWin", -123],
    ["lastRound.network.winEvaluationResult.winningPositions", [[-999, 999]]],
    ["lastRound.network.winningPositions", [[-999, 999]]],
    ["lastRound.network.boundedMechanics.weightedBonus.payout", -123],
    ["lastRound.network.boundedMechanics"],
    ["lastRound.network.winningLines", {"0": {definition: [-1], winAmount: -123}}],
    ["lastRound.network.winningScatters", {C: {symbolsPositions: [[-999, 999]], winAmount: -123}}],
    ["lastRound.network.winningClusters", {"0": {symbolsPositions: [[-999, 999]], winAmount: -123}}],
    ["lastRound.network.winningWays", {C: {symbolsPositions: [[-999, 999]], waysCount: -1, winAmount: -123}}],
    ["lastRound.network.winningValues", {C: {symbolsPositions: [[-999, 999]], winAmount: -123}}],
    ["lastRound.network.winEvaluationResult.metadata", {totalWin: -123}],
    ["lastRound.network.winEvaluationResult.valueWins", [{symbolId: "bonus", symbolsPositions: [], winAmount: -123}]],
    ["lastRound.network.betModeId", "foreign"],
    ["lastRound.network.chargedBetModeId", "foreign"],
    ["lastRound.network.freeGamesBank", -123],
    ["lastRound.network.modifiers", {rules: []}],
    ["lastRound.network.jackpot", {pools: []}],
    ["lastRound.network.holdAndWin", {locks: [[-999, 999]]}],
    ["lastRound.network.visibleRowCoverage", [-1]],
    ["lastRound.network.unexpected", {credits: -123}],
    ["analytics"],
    ["analytics.position", -1],
    ["analytics.source", "foreign"],
    ["analytics.active", {}],
    ["analytics.logicalKnown", false],
    ["analytics.active", {weightedBonus: {duration: 0, win: 0.25, known: true, entryPosition: 1, extra: []}}],
    ["analytics.active", {weightedBonus: {duration: 999, win: 0.25, known: true, entryPosition: 1}}],
    ["lastRound.analytics"],
    ["lastRound.analytics.position", -1],
    ["lastRound.analytics.source", "foreign"],
    ["lastRound.analytics.logicalCompletion", true],
    ["lastRound.analytics.components", []],
    ["lastRound.analytics.features", []],
    ["lastRound.analytics.envelope.modelId", "foreign"],
    ["analyticsCheckpoint"],
];

export function mutateCheckpointProjection<T>(saved: T, [path, value]: readonly [string, unknown?]): T {
    const corrupt = JSON.parse(JSON.stringify(saved));
    const parts = ["feature", ...path.split(".")];
    const key = parts.pop()!;
    let parent = corrupt;
    for (const part of parts) parent = parent[part];
    if (value === undefined) Reflect.deleteProperty(parent, key);
    else parent[key] = value;
    return corrupt as T;
}
