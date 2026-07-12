// An explicit, safe ceiling on the `round` a single Studio-launched replay may request. `pokie
// replay` itself has no such limit, but ReplayRecorder.record() has no seek-to-round primitive (see
// its own doc comment) — replaying round N means playing a fresh session forward N times. Studio runs
// this in chunks against one long-lived session (see StudioReplayExecutionService), so this mostly
// bounds how long a single replay job can occupy its project's one-active-replay-at-a-time slot.
export const MAX_STUDIO_REPLAY_ROUND = 100_000;
