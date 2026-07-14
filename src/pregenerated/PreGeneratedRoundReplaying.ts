import type {PreGeneratedRoundReplayDescriptor} from "./PreGeneratedRoundReplayDescriptor.js";
import type {PreGeneratedRoundReplayOptions} from "./PreGeneratedRoundReplayOptions.js";

export interface PreGeneratedRoundReplaying {
    replay<T extends string | number = string>(options: PreGeneratedRoundReplayOptions<T>): PreGeneratedRoundReplayDescriptor;
}
