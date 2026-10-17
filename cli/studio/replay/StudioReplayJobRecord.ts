import type {SessionCommand, PokieProject, ReplayDescriptor} from "@fromstan/pokie";
import type {StudioReplayStatus} from "./StudioReplayStatus.js";

// The internal, mutable job record StudioReplayExecutionService/StudioReplayRepository hold —
// intentionally never returned directly from an API response (it carries an AbortController) — see
// toStudioReplayJobView for the one place this is turned into the safe, plain-data StudioReplayJobView
// the API actually sends. Mirrors StudioSimulationJobRecord's own shape/reasoning.
export type StudioReplayJobRecord = {
    auditPrefix?: NonNullable<ReplayDescriptor["audit"]>;
    recording?: ReplayDescriptor & {audit: NonNullable<ReplayDescriptor["audit"]>};
    id: string;
    projectRoot: string;
    status: StudioReplayStatus;
    round: number;
    unit?: "step" | "logical-round";
    entryCommands?: readonly SessionCommand[];
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
    expectedConfigHash?: string;
    initialCredits?: number;
    descriptor?: ReplayDescriptor;
    error?: string;
    abortController: AbortController;
    // The already-resolved "outcomeLibrary"/"stakeAdapter" project this job replays, when start() was
    // given one -- see StudioReplayExecutionService.start()'s own doc comment. Undefined for an ordinary
    // "tsPackage"/"blueprint" replay, which run() drives through loadGame/GameSessionHandling.play() instead.
    outcomeSourceProject?: PokieProject;
    // Package repeat-mode policy, or the concrete native outcome-library mode.
    modeName?: string;
    // This is a retained settled draw, rather than a newly executed reproduction.
    source?: "outcome-source-sample";
};
