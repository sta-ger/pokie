import {AuditRoundReplay, buildAuditRoundRecording, captureAuditBoundary, captureAuditDelivery, validateAuditRoundRecording} from "./AuditRoundReplay.js";
import type {AuditDelivery, AuditDisposition, AuditRoundRecording} from "./AuditRoundRecording.js";
import {AuditReplayError} from "./AuditReplayError.js";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import type {PokieGameContext} from "../gamepackage/PokieGameContext.js";
import type {SessionCommand} from "../runtime/SessionCommand.js";
import {SessionRuntime, executeSessionCommand} from "../runtime/SessionRuntime.js";
import {executeLogicalReplayCommand} from "./internal/executeLogicalReplayCommand.js";
import type {CascadeResultProviding} from "../session/videoslot/cascade/CascadeResultProviding.js";
import {buildLogicalRoundArtifact} from "../artifact/buildLogicalRoundArtifact.js";
import type {LogicalRound} from "../runtime/LogicalRound.js";
import {ScreenProjection} from "../session/videoslot/coordinates/ScreenProjection.js";
import {buildRoundArtifactFromSession} from "../artifact/buildRoundArtifactFromSession.js";
import {PokieJsonRoundArtifactProjector} from "../artifact/PokieJsonRoundArtifactProjector.js";
import type {VideoSlotSessionHandling} from "../session/videoslot/VideoSlotSessionHandling.js";
import {captureScreen} from "../server/session/captureScreen.js";

import crypto from "crypto";
import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {ReplayDescriptor} from "./ReplayDescriptor.js";
import type {AuditReplayRecording, PreGeneratedReplayRecording, ReplayRecording} from "./ReplayRecording.js";
import type {PreGeneratedReplayRecordingOptions, ReplayRecordingOptions} from "./ReplayRecordingOptions.js";

type SessionWithSymbolsCombination = GameSessionHandling & {
    getSymbolsCombination(): {toMatrix(transposed?: boolean): unknown[][]};
};

// There is no seek-to-round primitive in GameSessionHandling, so this replays a round best-effort by
// playing a fresh session forward from round 1 up to the requested round. Reproducibility for a given
// seed depends entirely on the game package actually threading context.seed into a deterministic setup.
export class ReplayRecorder implements ReplayRecording, PreGeneratedReplayRecording, AuditReplayRecording {
    private readonly auditHistory = new WeakMap<GameSessionHandling, Map<string, {recording: AuditRoundRecording; length: number}>>();

    /** Capture the actual injected session without changing its funding, commands or RNG. */
    public recordAudit(game: PokieGame, session: GameSessionHandling, commands: readonly SessionCommand[], disposition: AuditDisposition, context?: PokieGameContext): ReplayDescriptor {
        if (!game.getConfigHash || !game.getSessionStateSchema || !game.getSessionCommandCapabilities) throw new AuditReplayError("audit-codec-unsupported", "game", "Exact audit requires model identity and authoritative executable codecs.");
        const history = this.auditHistory.get(session) ?? new Map();
        const requestKey = JSON.stringify(commands);
        const historical = history.get(requestKey);
        if (historical) return this.describeAudit(buildAuditRoundRecording(game, context, historical.recording.deliveries.slice(0, historical.length)));
        const startedAt = new Date().toISOString();
        const deliveries: AuditDelivery[] = [];
        let before = captureAuditBoundary(session);
        const runtime = new SessionRuntime(session, undefined, (command, result) => {
            const delivery = captureAuditDelivery(game, session, command, before, result,
                {...disposition, startedAt: disposition.startedAt ?? startedAt, recordedAt: disposition.recordedAt ?? new Date().toISOString()}, "accepted-boundary");
            deliveries.push(delivery);
            before = delivery.after;
        });
        for (const command of commands) {
            const result = runtime.execute(command);
            if (result.status !== "played") throw new AuditReplayError("audit-command", "command", result.reason);
        }
        if (!deliveries.length) throw new AuditReplayError("audit-order", "commands", "Historical delivery was not captured by this recorder; export its original retained evidence.");
        const recording = buildAuditRoundRecording(game, context, deliveries);
        for (const [index, delivery] of deliveries.entries()) history.set(JSON.stringify([delivery.command]), {recording, length: index + 1});
        history.set(requestKey, {recording, length: deliveries.length});
        this.auditHistory.set(session, history);
        return this.describeAudit(recording);
    }

    /** Recorder history has the same owner lifetime as direct runtime retained deliveries. */
    public releaseAuditSession(session: GameSessionHandling): void {
        this.auditHistory.delete(session);
    }

    public describeAudit(audit: AuditRoundRecording): ReplayDescriptor {
        validateAuditRoundRecording(audit);
        const last = audit.deliveries[audit.deliveries.length - 1];
        const artifact = [...audit.deliveries].reverse().find(delivery => delivery.artifact)?.artifact;
        const round = last.result.logicalRound;
        return {audit, auditStatus: "recorded", auditCompletion: round?.status ?? "completed", sessionId: last.disposition.sessionId, game: audit.game,
            seed: audit.context?.seed === undefined ? null : String(audit.context.seed), round: 1,
            commands: audit.deliveries.map(delivery => delivery.command), ...(round ? {logicalRound: round, unit: "logical-round"} : {}),
            totalBet: round?.totalStake ?? audit.deliveries.reduce((sum, delivery) => sum + delivery.result.stake, 0),
            totalWin: round?.totalWin ?? audit.deliveries.reduce((sum, delivery) => sum + delivery.result.win, 0), credits: last.result.credits,
            screen: (artifact?.screen ?? round?.subrounds[round.cursor - 1].screen)?.map(reel => [...reel]) ?? null,
            ...(artifact ? {artifact} : {}), timestamp: last.disposition.recordedAt ? Date.parse(last.disposition.recordedAt) : Date.now(), durationMs: 0};
    }

    public replay(game: PokieGame, recording: AuditRoundRecording, signal?: AbortSignal): ReplayDescriptor {
        const execution = this.replaySteps(game, recording, signal);
        let next = execution.next();
        while (!next.done) next = execution.next();
        return next.value;
    }

    public *replaySteps(game: PokieGame, recording: AuditRoundRecording, signal?: AbortSignal): Generator<{completedDeliveries: number; delivery: AuditDelivery}, ReplayDescriptor> {
        const started = Date.now();
        const execution = new AuditRoundReplay().execute(game, recording, signal);
        let next = execution.next();
        while (!next.done) {
            yield next.value;
            next = execution.next();
        }
        const verified = next.value;
        return {...this.describeAudit(recording), originalSessionId: recording.deliveries[0].disposition.sessionId,
            sessionId: crypto.randomUUID(), auditStatus: verified.verification, auditCompletion: verified.completion, timestamp: started, durationMs: Date.now() - started};
    }

    public record(options: ReplayRecordingOptions): ReplayDescriptor {
        const execution = this.execute(options);
        let next = execution.next();
        while (!next.done) next = execution.next();
        return next.value;
    }

    /** One package calculation loop shared by CLI and Studio; caller owns scheduling and leases. */
    public *execute(options: ReplayRecordingOptions, signal?: AbortSignal, existingSession?: GameSessionHandling): Generator<{completedRounds: number; session: GameSessionHandling; result: import("../runtime/SessionRuntimeHandling.js").SessionCommandResult}, ReplayDescriptor> {
        const {game, seed, round} = options;
        if (!Number.isInteger(round) || round < 1) {
            throw new Error(`round must be a positive integer, got ${round}.`);
        }

        const manifest = game.getManifest();
        const session = existingSession ?? game.createSession(seed === undefined ? undefined : {seed});
        // A replay reconstructs a specific round, not risk of ruin — give the session a bankroll large
        // enough that reaching `round` is never cut short by running out of credits mid-replay.
        if (!existingSession) session.setCreditsAmount(options.unit === "logical-round" ? session.getBet() : Number.MAX_SAFE_INTEGER);

        const startedAt = Date.now();
        let logicalRound: LogicalRound | undefined;
        let totalBet = 0;
        let totalWin = 0;
        for (let played = 0; played < round; played++) {
            if (options.unit !== "logical-round" && !session.canPlayNextGame()) {
                throw new Error(`Replay target round ${round} is unreachable: session stopped after ${played} round(s).`);
            }
            const command = options.unit === "logical-round"
                ? {...options.entryCommands?.[played], kind: "spin" as const, delivery: "composite" as const, roundId: `replay:${played + 1}`}
                : options.entryCommands?.[played];
            const result = options.unit === "logical-round" ? executeLogicalReplayCommand(session, command!, signal) : executeSessionCommand(session, command, signal);
            logicalRound = result.logicalRound;
            if ((logicalRound && logicalRound.status !== "completed") || (session as Partial<CascadeResultProviding>).getCascadeResult?.().getMetadata().maxCascadeStepsExceeded === true) throw new Error("Replay logical round exceeded the delivery bound; result is incomplete or exhausted.");
            totalBet += logicalRound?.totalStake ?? result.stake;
            totalWin += logicalRound?.totalWin ?? result.win;
            yield {completedRounds: played + 1, session, result};
        }
        const durationMs = Date.now() - startedAt;
        const slot = session as Partial<VideoSlotSessionHandling>;
        const geometry = slot.getScreenGeometry?.();
        let artifact = (logicalRound || (geometry && !new ScreenProjection(geometry).isIdentity())) && slot.getWinEvaluationResult
            ? new PokieJsonRoundArtifactProjector().project(buildRoundArtifactFromSession(slot as VideoSlotSessionHandling, {
                roundId: `replay:${seed ?? "no-seed"}:${round}`, provenance: {game: manifest, pokieVersion: "1.3.0", ...(game.getConfigHash ? {configHash: game.getConfigHash()} : {})},
            })) : undefined;

        if (logicalRound && slot.getWinEvaluationResult) artifact = new PokieJsonRoundArtifactProjector().project(buildLogicalRoundArtifact(logicalRound,
            buildRoundArtifactFromSession(slot as VideoSlotSessionHandling, {roundId: logicalRound.id, stake: logicalRound.totalStake, provenance: {game: manifest, pokieVersion: "1.3.0", ...(game.getConfigHash ? {configHash: game.getConfigHash()} : {})}})));
        return {
            auditStatus: "legacy-best-effort",
            ...(options.unit ? {unit: options.unit} : {}), ...(options.entryCommands ? {commands: options.entryCommands} : {}), ...(logicalRound ? {logicalRound} : {}),
            sessionId: crypto.randomUUID(),
            game: {id: manifest.id, name: manifest.name, version: manifest.version},
            seed: seed ?? null,
            round,
            totalBet,
            totalWin,
            screen: this.captureScreen(session),
            ...(artifact ? {artifact} : {}),
            timestamp: startedAt,
            durationMs,
        };
    }

    // Records an already-settled native Outcome Library round in the standard ReplayDescriptor shape.
    // Unlike record(), this never creates a game session or calls play(): the supplied artifact/provenance
    // is the authoritative math result and the outcomeSource field preserves how it was selected.
    public recordPreGenerated(options: PreGeneratedReplayRecordingOptions): ReplayDescriptor {
        const {sessionId, game, replay, totalBet, credits, screen} = options;
        return {
            sessionId,
            game,
            seed: replay.seed,
            round: replay.round,
            totalBet,
            totalWin: replay.totalWin,
            ...(credits === undefined ? {} : {credits}),
            screen,
            timestamp: replay.timestamp,
            durationMs: replay.durationMs,
            outcomeSource: replay,
        };
    }

    private captureScreen(session: GameSessionHandling): unknown[][] | null {
        if (!this.hasSymbolsCombination(session)) {
            return null;
        }
        return captureScreen(session);
    }

    private hasSymbolsCombination(session: GameSessionHandling): session is SessionWithSymbolsCombination {
        return typeof (session as Partial<SessionWithSymbolsCombination>).getSymbolsCombination === "function";
    }
}
