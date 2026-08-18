import type {ReplayDescriptor} from "./ReplayDescriptor.js";
import type {PreGeneratedReplayRecordingOptions, ReplayRecordingOptions} from "./ReplayRecordingOptions.js";

export interface ReplayRecording {
    record(options: ReplayRecordingOptions): ReplayDescriptor;
}

// A capability of the canonical replay recorder, separate from ReplayRecording so existing game-only
// adapters keep their narrow contract.  OutcomeSourceDevServer requires this capability to persist a
// settled native round in the same descriptor workflow as every other replayable product round.
export interface PreGeneratedReplayRecording {
    recordPreGenerated(options: PreGeneratedReplayRecordingOptions): ReplayDescriptor;
}
