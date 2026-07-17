import type {RoundArtifactJson} from "../artifact/RoundArtifactJson.js";

export type ReplayDescriptor = {
    game: {id: string; name: string; version: string};
    seed: string | null;
    round: number;
    totalBet: number;
    totalWin: number;
    screen: unknown[][] | null;
    timestamp: number;
    durationMs: number;
    // The full per-round record (steps, wins with payout/multiplier breakdown, feature events,
    // provenance, content hash) for the target round -- optional so every existing caller/producer of a
    // ReplayDescriptor that predates this field (e.g. ReplayRecorder/`pokie replay`, which never builds
    // one) stays valid. Only Studio's own StudioReplayExecutionService populates it.
    artifact?: RoundArtifactJson;
};
