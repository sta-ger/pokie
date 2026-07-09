export type SimulationReport = {
    game: {id: string; name: string; version: string};
    requestedRounds: number;
    rounds: number;
    seed: string | null;
    totalBet: number;
    totalWin: number;
    rtp: number;
    hitFrequency: number;
    maxWin: number;
    durationMs: number;
    spinsPerSecond: number;
};
