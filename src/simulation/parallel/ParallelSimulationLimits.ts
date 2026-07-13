// An explicit, safe ceiling on how many worker threads a single simulation may request — protects a
// host machine from a typo'd `--workers 100000` (or an equally-oversized Studio request) spawning
// far more OS threads than any real machine benefits from. Not tied to os.cpus().length: that reflects
// what's *optimal*, not what's *safe to accept*, and this repo has no runtime dependency on the `os`
// module for simulation today — see docs/simulation.md for sizing guidance.
export const MAX_SIMULATION_WORKERS = 32;
