// A pokie serve session response — always has sessionId/game/credits (see
// PokieDevSessionResponse), plus whatever else the loaded game's session shape decided to include
// (the narrow legacy bet/win/screen fields, or a much richer game-specific payload). This client
// never assumes anything beyond the guaranteed core fields — see interpretResponse.ts.
export type SessionResponse = {
    sessionId: string;
    game: {id: string; name: string; version: string};
    credits: number;
} & Record<string, unknown>;
