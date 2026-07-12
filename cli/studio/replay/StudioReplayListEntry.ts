import type {StudioReplayStatus} from "./StudioReplayStatus.js";

// One row of GET /api/project/replays — every job for one project regardless of status (unlike
// Simulation's Reports list, which only ever shows completed jobs; the Replay tab's "Recent Replays"
// list is meant to show a still-running replay too), most-recently-started first. `game`/`totalBet`/
// `totalWin`/`completedAt`/`error` are only present once known (see StudioReplayJobRecord) — never
// `screen`, which stays out of the list summary and is only reachable via the detail endpoint.
export type StudioReplayListEntry = {
    id: string;
    status: StudioReplayStatus;
    game?: {id: string; name: string; version: string};
    round: number;
    seed?: string;
    completedRounds: number;
    totalBet?: number;
    totalWin?: number;
    startedAt: string;
    completedAt?: string;
    durationMs: number;
    error?: string;
};
