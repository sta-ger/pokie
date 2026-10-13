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


/** Actual execution capture and recorded-evidence verification; legacy recording stays independently usable. */
export interface AuditReplayRecording {
    /** Calculation failures expose error.committedRecording and resume on an identical retry.
     * Capture retries happen at acceptance without calculation. Persistent capture failure throws
     * audit-capture-unavailable, retains the prefix and accepted inputs, and retires further recording
     * until releaseAuditSession; its exported prefix remains explicitly pending in detached replay. */
    recordAudit(game: import("../gamepackage/PokieGame.js").PokieGame, session: import("../session/GameSessionHandling.js").GameSessionHandling,
        commands: readonly import("../runtime/SessionCommand.js").SessionCommand[], disposition: import("./AuditRoundRecording.js").AuditDisposition,
        context?: import("../gamepackage/PokieGameContext.js").PokieGameContext): ReplayDescriptor;
    describeAudit(recording: import("./AuditRoundRecording.js").AuditRoundRecording): ReplayDescriptor;
    replay(game: import("../gamepackage/PokieGame.js").PokieGame, recording: import("./AuditRoundRecording.js").AuditRoundRecording, signal?: AbortSignal): ReplayDescriptor;
}
