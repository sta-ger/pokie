import {
    buildRoundArtifactFromSession,
    captureInitialPokieSessionState,
    captureRoundPokieSessionState,
    captureScreen,
    describeUnsupportedProjectOperation,
    GameSessionHandling,
    loadPokieGame,
    OUTCOME_SOURCE_REPLAY_OPERATION,
    OutcomeLibraryBundleOutcomeSource,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    PokieGame,
    PokieGameContext,
    PokieGameManifest,
    PokieJsonRoundArtifactProjector,
    PokieProject,
    PokieSessionState,
    ReplayDescriptor,
    resolveGameSessionSerializer,
    resolveOutcomeLibraryModeName,
    RoundArtifact,
    SeededWeightedOutcomeRandomSource,
    VideoSlotSessionHandling,
    WeightedOutcomeRandomSource,
} from "pokie";
import {deriveDeterministicSeed} from "../../../src/pregenerated/internal/deriveDeterministicSeed.js";
import crypto from "crypto";
import {InMemoryStudioReplayRepository} from "./InMemoryStudioReplayRepository.js";
import type {StudioReplayJobRecord} from "./StudioReplayJobRecord.js";
import type {StudioReplayJobView} from "./StudioReplayJobView.js";
import type {StudioReplayListEntry} from "./StudioReplayListEntry.js";
import type {StudioReplayRepository} from "./StudioReplayRepository.js";
import type {StudioReplayStatus} from "./StudioReplayStatus.js";
import {toStudioReplayJobView} from "./toStudioReplayJobView.js";
import type {ValidatedReplayRequest} from "./validateReplayRequest.js";

const DEFAULT_CHUNK_SIZE = 500;

export type StudioGameLoading = (projectRoot: string, options?: {readonly signal?: AbortSignal}) => ReturnType<typeof loadPokieGame>;

export type StudioReplayStartResult =
    | {status: "created"; job: StudioReplayJobView}
    | {status: "conflict"; activeJobId: string};

export type GetReplayDownloadResult =
    | {status: "ok"; descriptor: ReplayDescriptor}
    | {status: "not-found"}
    // Either not terminal yet (queued/running) or terminal without a descriptor (failed/cancelled) —
    // `jobStatus` tells the caller which, so it can phrase a precise message either way. Mirrors
    // StudioSimulationService's GetSimulationReportResult.
    | {status: "not-ready"; jobStatus: StudioReplayStatus};

// Drives loadPokieGame/GameSessionHandling.play() — the exact same primitives ReplayRecorder itself
// uses — directly, in chunks, so a replay of a large `round` never blocks the HTTP server's event loop
// (see run()'s own doc comment for why chunking is unavoidable here: ReplayRecorder.record() is a
// tight synchronous loop with no yield points, abort hook, or seek-to-round primitive of its own). No
// CLI command is ever spawned as a subprocess, and none of ReplayRecorder's replay logic is
// reimplemented — only the chunk-scheduling glue is new, mirroring StudioSimulationService's own
// chunked-runner approach for the exact same reason.
export class StudioReplayExecutionService {
    private readonly repository: StudioReplayRepository;
    private readonly loadGame: typeof loadPokieGame;
    private readonly loadRuntimeGame: StudioGameLoading;
    private readonly chunkSize: number;
    private readonly now: () => number;
    private readonly yieldToEventLoop: () => Promise<void>;
    private readonly createId: () => string;
    private readonly pokieVersion: string;
    // Fired exactly once per job, right after a reproduction genuinely completes (never for a
    // failed/cancelled one) -- StudioServer's only hook for recording a "Recent Simulation" selection
    // (see StudioReplayJobRecord.simulationId) into the shared StudioRoundRecorder the moment it's real,
    // rather than reactively (e.g. from a status poll), so GET /api/project/rounds reflects it as
    // soon as the job that produced it is done. A no-op default keeps every other caller (every test
    // that constructs this service directly) unaffected.
    private readonly onCompleted: (record: StudioReplayJobRecord) => void;
    // Reads a resolved "outcomeLibrary"/"stakeAdapter" project's own bundle manifest -- see start()'s
    // own `outcomeSourceProject` parameter for why this service never resolves a project's type itself.
    private readonly outcomeLibraryReader: OutcomeLibraryBundleReading;

    constructor(
        repository: StudioReplayRepository = new InMemoryStudioReplayRepository(),
        loadGame: typeof loadPokieGame = loadPokieGame,
        chunkSize: number = DEFAULT_CHUNK_SIZE,
        now: () => number = Date.now,
        yieldToEventLoop: () => Promise<void> = () =>
            new Promise((resolve) => {
                setImmediate(resolve);
            }),
        createId: () => string = () => crypto.randomUUID(),
        pokieVersion = "unknown",
        onCompleted: (record: StudioReplayJobRecord) => void = () => undefined,
        outcomeLibraryReader: OutcomeLibraryBundleReading = new OutcomeLibraryBundleReader(),
        loadRuntimeGame: StudioGameLoading = (projectRoot) => loadGame(projectRoot),
    ) {
        this.repository = repository;
        this.loadGame = loadGame;
        this.loadRuntimeGame = loadRuntimeGame;
        this.chunkSize = chunkSize;
        this.now = now;
        this.yieldToEventLoop = yieldToEventLoop;
        this.createId = createId;
        this.pokieVersion = pokieVersion;
        this.onCompleted = onCompleted;
        this.outcomeLibraryReader = outcomeLibraryReader;
    }

    // Returns immediately with a "queued" job — the actual replay runs in the background (see run()),
    // never blocking the caller (StudioServer's POST handler). Rejects with a conflict instead of
    // creating a second job when one is already queued/running for this projectRoot, same reasoning as
    // StudioSimulationService.start().
    //
    // `outcomeSourceProject`, when given, is the already-resolved "outcomeLibrary"/"stakeAdapter"
    // PokieProject StudioServer's own ProjectDashboardContext resolved when it opened `projectRoot` --
    // same "caller already knows, pass it through" convention as StudioSimulationService.start()'s own
    // parameter of the same name (see that doc comment for why this service never re-resolves
    // `projectRoot`'s own type itself).
    public start(projectRoot: string, request: ValidatedReplayRequest, outcomeSourceProject?: PokieProject): StudioReplayStartResult {
        const active = this.repository.findActiveByProjectRoot(projectRoot);
        if (active) {
            return {status: "conflict", activeJobId: active.id};
        }

        const record: StudioReplayJobRecord = {
            id: this.createId(),
            projectRoot,
            status: "queued",
            round: request.round,
            seed: request.seed,
            simulationId: request.simulationId,
            startedAt: this.now(),
            completedRounds: 0,
            durationMs: 0,
            abortController: new AbortController(),
            outcomeSourceProject,
            modeName: request.modeName,
        };
        this.repository.save(record);

        this.run(record).catch(() => {
            // run() already catches every failure into the record's own "failed" status (see below)
            // — this is an extra safety net only, so a bug there can never surface as an unhandled
            // promise rejection and crash the process.
        });

        return {status: "created", job: toStudioReplayJobView(record)};
    }

    // undefined covers both a genuinely unknown id AND an id that belongs to a different project —
    // deliberately indistinguishable from the caller's perspective, same reasoning as
    // StudioSimulationService.getReport(): this can never be used to probe whether some other project
    // has a replay with a given id.
    public getStatus(projectRoot: string, id: string): StudioReplayJobView | undefined {
        const record = this.repository.get(id);
        if (!record || record.projectRoot !== projectRoot) {
            return undefined;
        }
        return toStudioReplayJobView(record);
    }

    // Idempotent: cancelling an already-terminal job is a no-op that still returns its (unchanged)
    // current view rather than an error — same "repeated request can't corrupt state" guarantee as
    // start(). Returns undefined for an unknown id or one belonging to a different project (same
    // isolation reasoning as getStatus()).
    public cancel(projectRoot: string, id: string): StudioReplayJobView | undefined {
        const record = this.repository.get(id);
        if (!record || record.projectRoot !== projectRoot) {
            return undefined;
        }
        if (record.status === "queued" || record.status === "running") {
            record.abortController.abort();
        }
        return toStudioReplayJobView(record);
    }

    // Best-effort: aborts every currently active replay — called from StudioServer.stop() so a
    // stopped Studio process never leaves a replay's chunk loop scheduled against an event loop nobody
    // is serving HTTP requests on anymore.
    public cancelAll(): void {
        for (const record of this.repository.listActive()) {
            record.abortController.abort();
        }
    }

    // Same reasoning as cancelAll(), scoped to one project — called from StudioServer whenever Studio
    // switches away from `projectRoot` (a different project opened, or back to Home), so a replay for
    // the project just left doesn't keep running its chunk loop unseen and unreachable. A no-op when
    // nothing is active for that project.
    public cancelActiveForProject(projectRoot: string): void {
        const record = this.repository.findActiveByProjectRoot(projectRoot);
        record?.abortController.abort();
    }

    // Process-wide (not scoped to one project) — feeds GET /api/studio/diagnostics, a plain count safe
    // to expose regardless of which project (if any) is currently active.
    public getActiveCount(): number {
        return this.repository.listActive().length;
    }

    public listJobs(projectRoot: string): StudioReplayListEntry[] {
        return this.repository.listByProjectRoot(projectRoot).map((record) => this.toListEntry(record));
    }

    // "not-found" covers both a genuinely unknown id AND an id belonging to a different project (same
    // isolation reasoning as getStatus()); "not-ready" covers every status other than "completed" — a
    // failed/cancelled replay has no descriptor to download, same as a failed/cancelled simulation
    // having no report (see StudioSimulationService.getReport()).
    public getDownload(projectRoot: string, id: string): GetReplayDownloadResult {
        const record = this.repository.get(id);
        if (!record || record.projectRoot !== projectRoot) {
            return {status: "not-found"};
        }
        if (!record.descriptor) {
            return {status: "not-ready", jobStatus: record.status};
        }
        return {status: "ok", descriptor: record.descriptor};
    }

    private toListEntry(record: StudioReplayJobRecord): StudioReplayListEntry {
        return {
            id: record.id,
            status: record.status,
            game: record.game,
            configHash: record.configHash,
            round: record.round,
            seed: record.seed,
            completedRounds: record.completedRounds,
            totalBet: record.descriptor?.totalBet,
            totalWin: record.descriptor?.totalWin,
            startedAt: new Date(record.startedAt).toISOString(),
            completedAt: record.completedAt !== undefined ? new Date(record.completedAt).toISOString() : undefined,
            durationMs: record.durationMs,
            error: record.error,
            modeName: record.modeName,
        };
    }

    // Chunked rather than one uninterrupted play() loop up to `round` (what ReplayRecorder itself
    // does): that loop has no yield points and no abort hook, so replaying a large `round` in a single
    // call would block this process's entire event loop for as long as it took — no status poll,
    // cancel request, or unrelated Inspect/Validate call could be served in the meantime. The session
    // is created exactly once, before the loop, and reused across every chunk — never recreated, and
    // its RNG/game state is never reset — so the sequence of rounds actually played, and therefore the
    // resulting descriptor, is identical to what ReplayRecorder's own uninterrupted loop would produce
    // for the same seed/round; only the *scheduling* differs.
    private async run(record: StudioReplayJobRecord): Promise<void> {
        if (record.outcomeSourceProject !== undefined) {
            await this.runOutcomeSourceReplay(record, record.outcomeSourceProject);
            return;
        }

        let game: PokieGame;
        try {
            game = await this.loadRuntimeGame(record.projectRoot, {signal: record.abortController.signal});
        } catch (error) {
            if (record.abortController.signal.aborted) this.cancelRecord(record);
            else this.fail(record, error);
            return;
        }

        if (record.abortController.signal.aborted) {
            this.cancelRecord(record);
            return;
        }

        record.status = "running";
        const manifest = game.getManifest();
        record.game = {id: manifest.id, name: manifest.name, version: manifest.version};
        record.configHash = game.getConfigHash?.();

        const context: PokieGameContext | undefined = record.seed === undefined ? undefined : {seed: record.seed};
        // Minted here, at the exact moment the brand-new session is created -- never reused from
        // `record.id` (the job id, minted in start() before this session exists at all). Two runs of
        // the same seed/round each get their own sessionId, since each is a genuinely new session, not a
        // lookup of a prior one -- this is what lets the UI show the real session identity instead of
        // mislabeling the job id as one.
        const sessionId = this.createId();
        let session: GameSessionHandling;
        let playerCredits: number;
        try {
            session = game.createSession(context);
            playerCredits = session.getCreditsAmount();
            // A replay reconstructs a specific round, not risk of ruin — same reasoning as
            // ReplayRecorder itself: a bankroll large enough that reaching `round` is never cut short
            // by running out of credits mid-replay.
            session.setCreditsAmount(Number.MAX_SAFE_INTEGER);
        } catch (error) {
            this.fail(record, error);
            return;
        }

        const serializer = resolveGameSessionSerializer(game);
        // Best-effort: a throwing custom game/serializer must never fail the whole replay over a state
        // snapshot — see captureStateSafely()'s own doc comment. Captured once, right after the session
        // exists and before any round is played, so it's both this replay's "state before round 1" and
        // the previousState every later captureRoundPokieSessionState call carries initialPayload/
        // initialDebugPayload forward from (see that function's own doc comment for why).
        const initialState = this.captureStateSafely(() => captureInitialPokieSessionState(context, session, serializer));

        let totalBet = 0;
        let totalWin = 0;
        let roundsRemaining = record.round;
        let stateBeforeFinal: PokieSessionState | undefined;
        let stateAfterFinal: PokieSessionState | undefined;

        try {
            while (roundsRemaining > 0) {
                if (record.abortController.signal.aborted) {
                    this.cancelRecord(record);
                    return;
                }

                const chunkRounds = Math.min(this.chunkSize, roundsRemaining);
                for (let played = 0; played < chunkRounds; played++) {
                    // True exactly once across the whole replay, on the very last play() call overall,
                    // regardless of chunking -- snapshotting every round would be wasted work for a
                    // `round` that can be up to 100000 (see validateReplayRequest), when only the target
                    // round's own before/after state is ever shown.
                    const isFinalPlay = roundsRemaining - played === 1;
                    if (isFinalPlay) {
                        stateBeforeFinal = this.captureBoundaryState(record.round === 1, context, session, initialState, serializer);
                    }

                    totalBet += session.getBet();
                    session.play();
                    totalWin += session.getWinAmount();
                    playerCredits = playerCredits - session.getBet() + session.getWinAmount();

                    if (isFinalPlay) {
                        stateAfterFinal = this.captureBoundaryState(false, context, session, initialState, serializer);
                    }
                }

                record.completedRounds += chunkRounds;
                record.durationMs = this.now() - record.startedAt;
                roundsRemaining -= chunkRounds;
                if (roundsRemaining > 0) {
                    await this.yieldToEventLoop();
                }
            }
        } catch (error) {
            this.fail(record, error);
            return;
        }

        const descriptor: ReplayDescriptor = {
            sessionId,
            game: record.game,
            seed: record.seed ?? null,
            round: record.round,
            totalBet,
            totalWin,
            credits: playerCredits,
            screen: captureScreen(session),
            timestamp: record.startedAt,
            durationMs: record.durationMs,
            artifact: this.buildArtifact(session, manifest, record, this.mergeDebugPayloads(stateAfterFinal)),
            ...(stateBeforeFinal !== undefined ? {stateBefore: this.toPublicSessionState(stateBeforeFinal)} : {}),
            ...(stateAfterFinal !== undefined ? {stateAfter: this.toPublicSessionState(stateAfterFinal)} : {}),
        };

        record.status = "completed";
        record.descriptor = descriptor;
        this.markTerminal(record);
        this.onCompleted(record);
    }

    // The "outcomeLibrary"/"stakeAdapter" counterpart to run() above -- reached only when start() was
    // given an already-resolved `outcomeSourceProject` (see that parameter's own doc comment). A "stakeAdapter" export has no
    // draw contract of its own (see OUTCOME_SOURCE_SAMPLE_CAPABILITY's own doc comment) and fails here
    // with the same structured capability diagnostic every other POKIE surface gives it, before ever
    // reading a bundle file. A resolved "outcomeLibrary" project reproduces round `record.round` of a
    // seeded draw stream against `record.modeName` -- a real mode from the manifest's own list, resolved
    // via resolveOutcomeLibraryModeName (defaulting to the manifest's own first mode when start() wasn't
    // given one explicitly, same as before Replay had a mode picker at all) -- the exact same
    // OutcomeLibraryBundleOutcomeSource selector Play/Simulation already draw through, drawn forward
    // `record.round` times and keeping only the last draw, mirroring exactly what a fresh Play session
    // seeded the same way, against the same mode, would show at that Nth draw. Unlike the "runtime"
    // branch above, there is no live GameSessionHandling/PokieSessionState to snapshot before/after -- a
    // drawn WeightedOutcome carries no session state of its own (see StudioPlayService's own
    // buildOutcomeSourceSessionView doc comment) -- so the resulting ReplayDescriptor never sets
    // stateBefore/stateAfter, only its own real artifact. `record.modeName` is overwritten here with the
    // actually-resolved value, mirroring StudioSimulationService.runOutcomeSourceSampling's own reasoning
    // -- every terminal job/list entry carries the real mode this run replayed against.
    private async runOutcomeSourceReplay(record: StudioReplayJobRecord, project: PokieProject): Promise<void> {
        const diagnostic = describeUnsupportedProjectOperation(project, OUTCOME_SOURCE_REPLAY_OPERATION);
        if (diagnostic !== undefined) {
            this.fail(record, new Error(diagnostic.message));
            return;
        }
        if (record.seed === undefined) {
            this.fail(record, new Error("Cannot exactly replay an outcome-library round without a seed. Restore the original session seed and retry."));
            return;
        }
        if (record.modeName === undefined) {
            this.fail(record, new Error("Cannot exactly replay an outcome-library round without its recorded mode. Restore the original mode and retry."));
            return;
        }

        let modeName: string;
        let manifestGame: PokieGameManifest;
        try {
            const manifest = await this.outcomeLibraryReader.readManifest(project.rootPath);
            if (manifest.modes.length === 0) {
                this.fail(record, new Error(`"${project.rootPath}" has no outcome-library modes to replay.`));
                return;
            }
            modeName = resolveOutcomeLibraryModeName(manifest.modes, record.modeName);
            manifestGame = manifest.game;
        } catch (error) {
            this.fail(record, error);
            return;
        }
        record.modeName = modeName;

        if (record.abortController.signal.aborted) {
            this.cancelRecord(record);
            return;
        }
        record.status = "running";
        const gameIdentity = {id: manifestGame.id, name: manifestGame.name, version: manifestGame.version};
        record.game = gameIdentity;

        const sessionId = this.createId();
        const outcomeSource = new OutcomeLibraryBundleOutcomeSource(project.rootPath, modeName);
        let roundsRemaining = record.round;
        let lastArtifact: RoundArtifact | undefined;
        let lastSelection: {libraryId: string; libraryHash: string; outcomeId: string; weight: number} | undefined;
        try {
            while (roundsRemaining > 0) {
                if (record.abortController.signal.aborted) {
                    this.cancelRecord(record);
                    return;
                }

                const chunkRounds = Math.min(this.chunkSize, roundsRemaining);
                for (let played = 0; played < chunkRounds; played++) {
                    const replayRound = record.completedRounds + played + 1;
                    const randomSource: WeightedOutcomeRandomSource = new SeededWeightedOutcomeRandomSource(
                        deriveDeterministicSeed(record.seed, replayRound),
                    );
                    const selection = await outcomeSource.drawOutcome(randomSource);
                    lastArtifact = selection.outcome.artifact;
                    lastSelection = {
                        libraryId: selection.libraryId,
                        libraryHash: selection.libraryHash,
                        outcomeId: selection.outcome.id,
                        weight: selection.outcome.weight,
                    };
                }

                record.completedRounds += chunkRounds;
                record.durationMs = this.now() - record.startedAt;
                roundsRemaining -= chunkRounds;
                if (roundsRemaining > 0) {
                    await this.yieldToEventLoop();
                }
            }
        } catch (error) {
            this.fail(record, error);
            return;
        }

        if (lastArtifact === undefined || lastSelection === undefined) {
            this.fail(record, new Error("Replay produced no outcome."));
            return;
        }

        const descriptor: ReplayDescriptor = {
            sessionId,
            game: gameIdentity,
            seed: record.seed ?? null,
            round: record.round,
            totalBet: lastArtifact.stake,
            totalWin: lastArtifact.totalWin,
            screen: lastArtifact.screen.map((row) => [...row]),
            timestamp: record.startedAt,
            durationMs: record.durationMs,
            artifact: new PokieJsonRoundArtifactProjector().project(lastArtifact),
            ...(record.seed === undefined
                ? {}
                : {
                    outcomeSource: {
                        game: gameIdentity,
                        ...lastSelection,
                        modeName,
                        selectionAlgorithm: "derived-round-seed-v1" as const,
                        seed: record.seed,
                        round: record.round,
                        totalWin: lastArtifact.totalWin,
                        payoutMultiplier: lastArtifact.payoutMultiplier,
                        stake: lastArtifact.stake,
                        screen: lastArtifact.screen.map((row) => [...row]),
                        artifact: lastArtifact,
                        timestamp: record.startedAt,
                        durationMs: record.durationMs,
                    },
                }),
        };

        record.status = "completed";
        record.descriptor = descriptor;
        this.markTerminal(record);
        this.onCompleted(record);
    }

    // "useInitialStateDirectly" covers round 1's own "before" snapshot: at that point no play() has
    // happened yet, so the state before round 1 *is* the initial state -- calling
    // captureRoundPokieSessionState on a session that hasn't played anything would ask a serializer for
    // round data about a round that doesn't exist yet. Every other call (round >1's "before", and every
    // "after") reads the session's current live state via captureRoundPokieSessionState. Returns
    // undefined whenever `initialState` itself is undefined (the one capture failure this replay
    // tolerates) so "before"/"after" are always both-present or both-absent, never inconsistent.
    private captureBoundaryState(
        useInitialStateDirectly: boolean,
        context: PokieGameContext | undefined,
        session: GameSessionHandling,
        initialState: PokieSessionState | undefined,
        serializer: ReturnType<typeof resolveGameSessionSerializer>,
    ): PokieSessionState | undefined {
        if (useInitialStateDirectly) {
            return initialState;
        }
        if (initialState === undefined) {
            return undefined;
        }
        return this.captureStateSafely(() => captureRoundPokieSessionState(context, session, initialState, serializer));
    }

    // Requirement: a game/session type that doesn't support state serialization (or whose serializer
    // throws) must never fail the replay itself -- the caller sees `undefined` and renders an explicit
    // "state snapshot unavailable", not a crash and not a false deterministic mismatch.
    private captureStateSafely(capture: () => PokieSessionState): PokieSessionState | undefined {
        try {
            return capture();
        } catch {
            return undefined;
        }
    }

    // The public/internal split PokieDevServer's own internal session response already applies (see its
    // buildInternalSessionData) -- initialDebugPayload/roundDebugPayload never belong in the "state"
    // section shown alongside the round; they're merged into the artifact's own `debug` bag instead (see
    // mergeDebugPayloads below).
    private toPublicSessionState(state: PokieSessionState): Record<string, unknown> {
        const {initialDebugPayload: _initialDebugPayload, roundDebugPayload: _roundDebugPayload, ...publicState} = state;
        return publicState;
    }

    // Same merge PokieDevServer's own private mergeSerializedDebugPayloads() performs (that method isn't
    // exported, so this is a local mirror, not a second calculation path -- both are a two-key spread
    // over the exact same PokieSessionState fields). `stateAfterFinal` already carries
    // initialDebugPayload forward from the session-creation capture (see captureRoundPokieSessionState's
    // own doc comment), so this alone is the round's complete debug bag.
    private mergeDebugPayloads(state: PokieSessionState | undefined): Record<string, unknown> | undefined {
        if (state === undefined || (state.initialDebugPayload === undefined && state.roundDebugPayload === undefined)) {
            return undefined;
        }
        return {...state.initialDebugPayload, ...state.roundDebugPayload};
    }

    // Feature-detected exactly like captureScreen() above: only a video-slot session (getSymbolsCombination
    // + getWinEvaluationResult) has anything buildRoundArtifactFromSession can read, so any other game
    // simply gets no artifact (undefined), same "no screen to capture" fallback captureScreen already
    // uses. `roundId` is deterministic (seed+round, not a random id) so two replays of the exact same
    // seed+round produce the exact same artifact hash when the outcome genuinely reproduces — that
    // determinism is what makes the Studio UI's match/mismatch comparison meaningful.
    private buildArtifact(
        session: ReturnType<PokieGame["createSession"]>,
        manifest: ReturnType<PokieGame["getManifest"]>,
        record: StudioReplayJobRecord,
        debug: Record<string, unknown> | undefined,
    ): ReplayDescriptor["artifact"] {
        if (!this.hasVideoSlotShape(session)) {
            return undefined;
        }
        const artifact = buildRoundArtifactFromSession(session, {
            roundId: `replay:${record.seed ?? "no-seed"}:${record.round}`,
            provenance: {game: manifest, pokieVersion: this.pokieVersion, ...(record.configHash !== undefined ? {configHash: record.configHash} : {})},
            ...(debug !== undefined ? {debug} : {}),
        });
        return new PokieJsonRoundArtifactProjector().project(artifact);
    }

    private hasVideoSlotShape(session: unknown): session is VideoSlotSessionHandling {
        const candidate = session as {getSymbolsCombination?: unknown; getWinEvaluationResult?: unknown};
        return typeof candidate.getSymbolsCombination === "function" && typeof candidate.getWinEvaluationResult === "function";
    }

    private fail(record: StudioReplayJobRecord, error: unknown): void {
        record.status = "failed";
        record.error = error instanceof Error ? error.message : String(error);
        this.markTerminal(record);
    }

    private cancelRecord(record: StudioReplayJobRecord): void {
        record.status = "cancelled";
        this.markTerminal(record);
    }

    // Common tail for every path that lands a record in a terminal status: stamps durationMs/
    // completedAt, then re-saves through the repository specifically so it gets a chance to enforce
    // retention (see StudioReplayRepository.save()'s own doc comment) — every other mutation in this
    // class updates `record` in place without a second save() call, since the repository stores it by
    // reference; this one call is the deliberate exception.
    private markTerminal(record: StudioReplayJobRecord): void {
        record.durationMs = this.now() - record.startedAt;
        record.completedAt = record.startedAt + record.durationMs;
        this.repository.save(record);
    }
}
