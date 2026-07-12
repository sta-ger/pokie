// An explicit, safe ceiling on the `round` a single Studio-launched replay may request. `pokie
// replay` itself has no such limit, but ReplayRecorder.record() has no seek-to-round primitive (see
// its own doc comment) — replaying round N means playing a fresh session forward N times in a tight
// synchronous loop. Studio runs this directly inside an HTTP request (see StudioReplayService), so
// this bounds how long a single request can block the event loop.
export const MAX_STUDIO_REPLAY_ROUND = 100_000;
