export type ReplayDescriptor = {
    game: {id: string; name: string; version: string};
    seed: string | null;
    round: number;
    totalBet: number;
    totalWin: number;
    screen: unknown[][] | null;
    timestamp: number;
    durationMs: number;
};
