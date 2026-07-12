// One row of GET /api/project/replays — a flattened summary (no `screen`, which can be a sizeable
// matrix and isn't needed until a specific replay is actually opened via GET
// /api/project/replays/:id) of one project's stored replays, most-recently-recorded first.
export type StudioReplayListEntry = {
    id: string;
    game: {id: string; name: string; version: string};
    round: number;
    seed: string | null;
    totalBet: number;
    totalWin: number;
    timestamp: number;
    durationMs: number;
};
