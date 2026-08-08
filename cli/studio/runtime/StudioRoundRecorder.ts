import type {StudioRuntimeSessionView} from "./StudioRuntimeSessionView.js";

// Every distinct place Studio can produce a genuinely played/drawn round -- the Play tab (a real
// in-process game session, or a real draw against a resolved "outcomeLibrary" project's own bundle), the
// Outcome Source Analysis tab's one-shot "Sample" draw, and the Replay tab's "Recent Simulation" source
// (a real forward reproduction of a round selected from a completed simulation report -- see
// StudioReplayExecutionService's own onCompleted hook). Kept a closed union (rather than a free-form
// string) so a new producer is a compile-time-visible decision, never an implicit fourth thing that
// happens to also write into the shared history. "live"/"pre-generated" are vestigial -- the now-removed
// Runtime tab's own two sources -- kept only so any already-recorded round from before its removal still
// type-checks; nothing produces them anymore.
export type StudioRoundSource = "live" | "pre-generated" | "play" | "play-outcome-source" | "outcome-source-sample" | "simulation-sample";

// The concrete action that produced a round, independent of *where* it came from (StudioRoundSource) --
// "spin" is the Play tab's ordinary Spin/outcome-source draw; "find-any-win"/"find-symbol-win" are the
// Play tab's own scenario-search controls (StudioPlayService.findAnyWin()/findSymbolWin()), which repeat
// real spin() calls until one matches -- every spin along the way, not just the final matching one, is
// recorded under the operation that's actually driving it, never demoted to a bare "spin" once it's part
// of a search. "outcome-source-sample" is the Outcome Source Analysis tab's own stateless single-draw
// route; "simulation-sample" is the Replay tab's "Recent Simulation" reproduction -- one action, so
// (unlike "spin"/"find-any-win"/"find-symbol-win") it never needs a second, more specific operation name
// of its own.
export type StudioRoundOperation = "spin" | "find-any-win" | "find-symbol-win" | "outcome-source-sample" | "simulation-sample";

// What a producer actually knows about a round beyond the StudioRuntimeSessionView itself -- `projectRoot`/
// `seed` are only ever attached when the producer genuinely has them (a Play session's own creation
// parameters; there is no session, and therefore no seed, for a one-shot outcome-source sample unless the
// caller supplied one directly), never invented to fill the shape out.
export type StudioRoundProvenance = {
    readonly source: StudioRoundSource;
    readonly operation: StudioRoundOperation;
    readonly projectRoot?: string;
    readonly seed?: string | number;
};

// The single place every round-producing action in Studio -- Play tab spins/scenario
// searches/outcome-source draws, Outcome Source Analysis sample draws, and Replay's own "Recent
// Simulation" reproductions -- funnels through to become part of one shared, bounded, most-recent-first
// history, so "the last N rounds played in Studio, from any tab" is genuinely one list, not several
// independently-bounded ones a caller would have to merge itself.
export class StudioRoundRecorder {
    private static readonly MAX_RECORDS = 20;

    private records: StudioRuntimeSessionView[] = [];
    // Session-local round counters, keyed by sessionId -- strictly increasing regardless of MAX_RECORDS'
    // own eviction. Safe to share across every producer's sessionIds: each producer mints its own
    // sessionId from a separate, effectively-collision-free space (crypto.randomUUID()), so two
    // different producers' sessions can never collide on the same key here.
    private roundCounters = new Map<string, number>();

    // Retrying the *same* (sessionId, studioRequestId) pair replays the same underlying round rather
    // than filing a new one -- the retry's own view is stamped with the original entry's identity fields
    // and the call returns without touching the list. A round made without a requestId (every Play tab
    // round, every outcome-source-sample draw, every simulation-sample reproduction) can't be identified
    // as a retry of anything, so it's always recorded as its own new entry.
    public record(session: StudioRuntimeSessionView, provenance: StudioRoundProvenance): void {
        const requestId = session.studioRequestId;
        if (requestId !== undefined) {
            const duplicate = this.records.find((entry) => entry.sessionId === session.sessionId && entry.studioRequestId === requestId);
            if (duplicate !== undefined) {
                session.studioRound = duplicate.studioRound;
                session.studioRecordedAt = duplicate.studioRecordedAt;
                session.studioSource = duplicate.studioSource;
                session.studioOperation = duplicate.studioOperation;
                session.studioProjectRoot = duplicate.studioProjectRoot;
                session.studioSeed = duplicate.studioSeed;
                return;
            }
        }

        session.studioRound = this.nextRound(session.sessionId);
        session.studioRecordedAt = new Date().toISOString();
        session.studioSource = provenance.source;
        session.studioOperation = provenance.operation;
        if (provenance.projectRoot !== undefined) {
            session.studioProjectRoot = provenance.projectRoot;
        }
        if (provenance.seed !== undefined) {
            session.studioSeed = provenance.seed;
        }

        this.records.unshift(session);
        if (this.records.length > StudioRoundRecorder.MAX_RECORDS) {
            this.records.length = StudioRoundRecorder.MAX_RECORDS;
        }
    }

    // Read-only snapshot, most-recent-first, across every source -- the Replay & Debug tab's "Session
    // Spin" find method lists and looks up by requestId against this directly.
    public list(): StudioRuntimeSessionView[] {
        return [...this.records];
    }

    // Discards every recorded round regardless of source -- used when the whole project is going away (a
    // project switch, or Studio shutdown): every producer's history refers to sessions/games that no
    // longer exist, so nothing here should survive into the next project.
    public clearAll(): void {
        this.records = [];
        this.roundCounters = new Map();
    }

    private nextRound(sessionId: string): number {
        const next = (this.roundCounters.get(sessionId) ?? 0) + 1;
        this.roundCounters.set(sessionId, next);
        return next;
    }
}
