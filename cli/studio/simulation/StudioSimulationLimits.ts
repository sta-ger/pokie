// An explicit, safe ceiling on how many rounds a single Studio-launched simulation may request.
// `pokie sim` itself has no such limit (a human picks --rounds and waits as long as they like), but
// Studio is an interactive tool — this bounds how long a single browser session can tie up a
// simulation slot for one project (see StudioSimulationService's per-projectRoot concurrency limit).
// 10M covers overnight-scale math review while still leaving cancellation, durable progress and the
// per-project concurrency guard in control; an unseeded 10M run is no longer an accidental click.
export const MAX_STUDIO_SIMULATION_ROUNDS = 10_000_000;
