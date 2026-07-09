export type PokieDevSessionResponse = {
    sessionId: string;
    game: {
        id: string;
        name: string;
        version: string;
    };
    bet: number;
    win?: number;
    credits: number;
    screen?: unknown[][];
};
