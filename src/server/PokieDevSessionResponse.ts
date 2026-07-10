// `sessionId`/`game`/`credits` are always present, server-computed fields (credits always the
// authoritative wallet balance, never a game's own possibly-stale getCreditsAmount()). Everything
// else depends on whether the loaded game provided a serializer (see PokieGame.getSessionSerializer):
// without one, the response is the original narrow shape (`bet`/`win?`/`screen?`, still declared
// here for documentation/DX); with one, it's `{...serializer.getInitialData()/.getRoundData()
// output}` instead — an open-ended, game-specific shape the `& Record<string, unknown>` allows for.
export type PokieDevSessionResponse = {
    sessionId: string;
    game: {
        id: string;
        name: string;
        version: string;
    };
    credits: number;
    bet?: number;
    win?: number;
    screen?: unknown[][];
} & Record<string, unknown>;
