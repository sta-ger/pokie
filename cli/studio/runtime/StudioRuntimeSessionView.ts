import type {PreGeneratedRoundReplayDescriptor, RoundArtifactJson} from "pokie";

// Studio's own session response DTO for a played/drawn round — built by StudioPlayService directly off
// a real, in-process PokieSessionState (see its own buildSessionView() doc comment): every public field
// the game's own serializer returned is spread through as-is (including any rich serializer-specific
// fields — paytable, reelsSymbols, etc. — hence the index signature), `sessionVersion` is hoisted to the
// top level unconditionally (whenever the configured repository is versioned), and `debug` is always
// attached. Never the raw PokieSessionState/repository/wallet objects themselves — only their own
// public+internal projection.
export type StudioRuntimeSessionView = {
    sessionId: string;
    game: {id: string; name: string; version: string};
    // Absent only for a stateless one-shot draw with no session/wallet of its own at all (the Outcome
    // Source Analysis tab's "Sample" route) -- every genuine session (the Play tab) always has a
    // real credits figure, so this is never fabricated as 0 to fill the shape out where there truly isn't
    // one.
    credits?: number;
    bet?: number;
    win?: number;
    screen?: unknown[][];
    // Every symbol id this session's own game reports via VideoSlotConfigDescribing.getAvailableSymbols()
    // -- present only where the underlying session actually is one (see StudioPlayService.buildSessionView()'s
    // own doc comment), and only ever the real, game-reported list, never inferred from a screen/round that
    // happens to have been seen so far. Play's own "Find symbol win" chooser is the one consumer today.
    availableSymbols?: string[];
    sessionVersion?: number;
    // Studio's own bookkeeping, not part of the game/public wire contract at all -- the client-supplied
    // requestId a spin was called with, recorded directly from that call's own parameter, so it's present
    // on every recorded recent spin. This is what lets the Session Spin find method locate one exact spin
    // among several recent ones -- unlike `debug.requestId` below (only ever present alongside the rest
    // of the debug bundle).
    studioRequestId?: string;
    // Studio's own bookkeeping too, attached only by StudioRoundRecorder.record() -- so these are present
    // on every entry the shared recorder's `list()` returns, but absent from a plain createSession()/
    // getSession() result (neither of which is ever recorded as a round). `studioRound` is this session's
    // own 1-based round index (stable across the recorder's own bound and across an idempotent retry of
    // the same requestId -- see StudioRoundRecorder.record()'s own doc comment), the one piece of
    // unambiguous identity that survives everything else about a round changing. `studioRecordedAt` is
    // when Studio recorded it (no producer returns a timestamp of its own). `studioSource` names which of
    // Studio's own tabs/routes actually produced this round (see StudioRoundSource); `studioOperation`
    // names the concrete action within that tab (see StudioRoundOperation) -- e.g. a Play tab round can be
    // an ordinary "spin" or one found by "find-any-win"/"find-symbol-win"/"find-free-games". `studioProjectRoot`/
    // `studioSeed` are attached only when the producer genuinely had them at record time (every producer
    // except a one-shot outcome-source sample without an explicit seed) -- never invented otherwise.
    // `studioModeName` is the real outcome-library mode this round was drawn against (see
    // StudioRoundProvenance's own doc comment) -- present only for an outcome-library-backed round, absent
    // for a "runtime"/"live"/"pre-generated" one, which has no such notion at all.
    studioRound?: number;
    studioRecordedAt?: string;
    studioSource?: "live" | "pre-generated" | "play" | "play-outcome-source" | "outcome-source-sample" | "simulation-sample";
    studioOperation?: "spin" | "find-any-win" | "find-symbol-win" | "find-free-games" | "outcome-source-sample" | "simulation-sample";
    studioProjectRoot?: string;
    studioSeed?: string | number;
    studioModeName?: string;
    // The portable, exact replay identity for a seeded native outcome-library draw.  This is carried
    // on the ordinary Play/Sample result as well as the recorded round so a user does not need to
    // reconstruct a private descriptor just to move the round to `pokie replay`.
    replay?: PreGeneratedRoundReplayDescriptor;
    debug?: {
        stateAfter?: unknown;
        stateBefore?: unknown;
        debugData?: Record<string, unknown>;
        requestId?: string;
        // The same complete, JSON-projected, hashed RoundArtifact StudioReplayExecutionService already
        // builds for a reproduced round -- present whenever this exact round's session supported building
        // one (see PokieSessionState.roundArtifact / PreGeneratedRoundInternalView.artifact), so a Session
        // Spin can be inspected through the identical RoundArtifactInspector component the Replay tab's
        // other sources already use, rather than a bespoke raw-JSON dump of this field's raw inputs.
        artifact?: RoundArtifactJson;
        // Present instead of `artifact` whenever "full" capture was requested but this exact session
        // couldn't produce one (e.g. a non-video-slot game), or the raw artifact failed to project -- an
        // honest diagnostic, never silently omitted in favor of a bare absence that could read as "nothing
        // was ever captured here".
        artifactUnavailableReason?: string;
    } & Record<string, unknown>;
} & Record<string, unknown>;
