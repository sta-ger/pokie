import type {ReplayDescriptor} from "pokie";

// The typed, plain-data DTO POST /api/project/replays and GET /api/project/replays/:id return — never
// a stack trace, never a runtime session/game object (there simply isn't one to leak here: a replay
// is fully synchronous and never holds a live session past the request that produced it — see
// StudioReplayService.run()).
export type StudioReplayRecordView = {
    id: string;
    projectRoot: string;
    descriptor: ReplayDescriptor;
};
