import type {ReplayDescriptor} from "./ReplayDescriptor.js";
import type {ReplayRecordingOptions} from "./ReplayRecordingOptions.js";

export interface ReplayRecording {
    record(options: ReplayRecordingOptions): ReplayDescriptor;
}
