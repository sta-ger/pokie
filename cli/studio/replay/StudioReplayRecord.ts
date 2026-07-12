import type {ReplayDescriptor} from "pokie";

// The internal record StudioReplayRepository stores. Deliberately minimal: `descriptor` (produced by
// ReplayRecorder.record(), reused as-is) already carries game id/name/version, round, seed, cumulative
// totalBet/totalWin, screen, timestamp, and durationMs — every field a replay record needs to
// contain — so nothing here duplicates it. `projectRoot` is the one thing ReplayDescriptor doesn't
// carry, and is what makes project isolation possible (see StudioReplayService.getReplay()).
export type StudioReplayRecord = {
    id: string;
    projectRoot: string;
    descriptor: ReplayDescriptor;
};
