// Everything a JackpotTriggering/JackpotAwarding implementation needs to make its own decision for the round
// that just played — "bet" is the session's own nominal getBet(), "stake" is what this specific round
// actually charged (0 for a zero-stake round, e.g. a respin of some other feature this session is stacked
// under — see JackpotRoundHandler, which only ever builds this context for a round it's already decided to
// evaluate contribution/trigger for), and "symbols" is the freshly played grid, reel-major
// ([reelId][rowId]), matching every other grid-consuming primitive in this package (e.g.
// SymbolsCombinationsAnalyzer, HoldAndWinCollecting).
export type JackpotTriggerContext<T extends string | number | symbol = string> = {
    readonly bet: number;
    readonly stake: number;
    readonly symbols: readonly (readonly T[])[];
};
