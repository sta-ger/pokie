import type {PokieProject, ReplayDescriptor} from "pokie";
import type {StudioReplayStatus} from "./StudioReplayStatus.js";

// The internal, mutable job record StudioReplayExecutionService/StudioReplayRepository hold —
// intentionally never returned directly from an API response (it carries an AbortController) — see
// toStudioReplayJobView for the one place this is turned into the safe, plain-data StudioReplayJobView
// the API actually sends. Mirrors StudioSimulationJobRecord's own shape/reasoning.
export type StudioReplayJobRecord = {
    id: string;
    projectRoot: string;
    status: StudioReplayStatus;
    round: number;
    seed?: string;
    // Only set when this job originated from the Replay tab's "Recent Simulation" source (see
    // ValidatedReplayRequest.simulationId) -- the id of the completed simulation report this round was
    // selected from. Drives StudioServer's own onCompleted recording of the reproduced round as a
    // genuine simulation sample (see StudioReplayExecutionService's constructor); absent for every
    // other source ("Recreate from seed", "Replay Artifact"), which never claim to be one.
    simulationId?: string;
    startedAt: number;
    // Set exactly once, the moment status first becomes terminal (completed/failed/cancelled) — see
    // StudioReplayExecutionService's fail()/cancelRecord()/completion path. Undefined while
    // queued/running.
    completedAt?: number;
    completedRounds: number;
    durationMs: number;
    // Known as soon as the game package has loaded (before the round-playing loop starts) — lets the
    // Replay list show which game a still-running job belongs to without waiting for it to finish.
    game?: {id: string; name: string; version: string};
    // Captured when this replay loads its game, never recomputed while the record is retained.
    // This is the replay's configuration provenance even after the Blueprint Project is later saved
    // with different content.
    configHash?: string;
    descriptor?: ReplayDescriptor;
    error?: string;
    abortController: AbortController;
    // The already-resolved "outcomeLibrary"/"stakeAdapter" project this job replays, when start() was
    // given one -- see StudioReplayExecutionService.start()'s own doc comment. Undefined for an ordinary
    // "tsPackage"/"blueprint" replay, which run() drives through loadGame/GameSessionHandling.play() instead.
    outcomeSourceProject?: PokieProject;
    // The real outcome-library mode this job replays/replayed -- undefined at start() time when the
    // caller didn't request one explicitly, then overwritten with the actual resolved value (via
    // resolveOutcomeLibraryModeName) once runOutcomeSourceReplay reads the manifest, mirroring
    // StudioSimulationJobRecord's own modeName field. Always undefined for an ordinary
    // "tsPackage"/"blueprint" replay.
    modeName?: string;
};
