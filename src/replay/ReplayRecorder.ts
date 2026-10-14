import {FixedBetModeForNextSimulationRoundSetting} from "../simulation/FixedBetModeForNextSimulationRoundSetting.js";
import {AuditRoundReplay, buildAuditRoundRecording, captureAuditBoundary, captureAuditDelivery, validateAuditRoundRecording} from "./AuditRoundReplay.js";
import type {AuditDelivery, AuditDisposition, AuditRoundRecording} from "./AuditRoundRecording.js";
import {deepFreeze} from "../internal/deepFreeze.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import {resolveGameSessionIdentity} from "../runtime/GameSessionIdentity.js";
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
type AuditOperation = {
    inputs: string;
    commands: readonly SessionCommand[];
    disposition: AuditDisposition;
    context?: PokieGameContext;
    deliveries: AuditDelivery[];
    acceptedDeliveries: number;
    completedCommands: number;
    descriptor?: ReplayDescriptor;
    captureFailure?: AuditReplayError;
};
type AuditHistory = {operations: Map<string, AuditOperation>; deliveries: number; unavailable?: AuditOperation};

// There is no seek-to-round primitive in GameSessionHandling, so this replays a round best-effort by
// playing a fresh session forward from round 1 up to the requested round. Reproducibility for a given
// seed depends entirely on the game package actually threading context.seed into a deterministic setup.
export class ReplayRecorder implements ReplayRecording, PreGeneratedReplayRecording, AuditReplayRecording {
    private readonly auditHistory = new WeakMap<GameSessionHandling, AuditHistory>();

    constructor(private readonly auditRetentionLimit = 10000) {
        if (!Number.isSafeInteger(auditRetentionLimit) || auditRetentionLimit < 1 || auditRetentionLimit > 10000) throw new Error("Audit retention limit must be an integer in 1..10000.");
    }

    /** Capture the actual injected session without changing its funding, commands or RNG. */
    public recordAudit(game: PokieGame, session: GameSessionHandling, commands: readonly SessionCommand[], disposition: AuditDisposition, context?: PokieGameContext): ReplayDescriptor {
        if (!game.getConfigHash || !game.getSessionStateSchema || !game.getSessionCommandCapabilities) throw new AuditReplayError("audit-codec-unsupported", "game", "Exact audit requires model identity and authoritative executable codecs.");
        const history: AuditHistory = this.auditHistory.get(session) ?? {operations: new Map(), deliveries: 0};
        const commandRequest = (commands[0] as SessionCommand & {requestId?: string})?.requestId;
        const operationId = disposition.requestId ?? commandRequest;
        const logicalKeys = commands.map(command => {
            if (command.continuation) return [command.continuation.roundId, command.continuation.cursor];
            return command.roundId ? [command.roundId, "entry"] : null;
        });
        let requestKey: string | undefined;
        if (operationId) requestKey = JSON.stringify([disposition.sessionId, "request", operationId]);
        else if (logicalKeys.length && logicalKeys.every(key => key !== null)) requestKey = JSON.stringify([disposition.sessionId, "logical", logicalKeys]);
        const inputs = JSON.stringify(toCanonicalJson({commands, disposition, ...(context ? {context} : {}), identity: resolveGameSessionIdentity(game), game: JSON.parse(JSON.stringify(game.getManifest())), stateSchema: JSON.parse(JSON.stringify(game.getSessionStateSchema()))}));
        const historical = requestKey ? history.operations.get(requestKey) : undefined;
        if (historical) {
            if (historical.inputs !== inputs) throw new AuditReplayError("audit-identity", "operation", "Retry conflicts with the original commands, disposition, context or model.");
            if (historical.completedCommands === historical.commands.length && historical.descriptor) return historical.descriptor;
        }
        // An unkeyed failed capture must not turn a retry into a fresh operation either.
        if (history.unavailable) {
            if (!requestKey && history.unavailable.inputs !== inputs) throw new AuditReplayError("audit-identity", "operation", "Retry conflicts with the original unavailable operation.");
            throw history.unavailable.captureFailure!;
        }
        // Reserve the maximum accepted boundaries before executing; a capacity rejection draws nothing.
        const required = commands.reduce((count, command) => count + (command.delivery === "composite" ? command.maxSubrounds ?? 1000 : 1), 0);
        if (!required || history.deliveries + required - (historical?.acceptedDeliveries ?? 0) > this.auditRetentionLimit) throw new AuditReplayError("audit-order", "commands", "Audit retry retention limit reached; export evidence and release the session.");
        this.auditHistory.set(session, history);
        const startedAt = new Date().toISOString();
        const operation: AuditOperation = historical ?? {
            inputs, commands: deepFreeze(JSON.parse(JSON.stringify(commands))),
            disposition: deepFreeze(JSON.parse(JSON.stringify({...disposition, startedAt: disposition.startedAt ?? startedAt}))),
            ...(context ? {context: deepFreeze(JSON.parse(JSON.stringify(context)))} : {}),
            deliveries: [], acceptedDeliveries: 0, completedCommands: 0,
        };
        let before = operation.deliveries[operation.deliveries.length - 1]?.after ?? deepFreeze(JSON.parse(JSON.stringify(captureAuditBoundary(session))));
        const runtime = new SessionRuntime(session, undefined, (command, result) => {
            // Runtime already accepted this boundary. Bind and charge it before any fallible capture.
            if (requestKey) history.operations.set(requestKey, operation);
            operation.acceptedDeliveries++;
            history.deliveries++;
            const accepted = deepFreeze(JSON.parse(JSON.stringify({command, before, result,
                disposition: {...operation.disposition, recordedAt: operation.disposition.recordedAt ?? new Date().toISOString()}})));
            let delivery: AuditDelivery | undefined;
            // A transient codec/artifact failure can be recovered at this same live boundary.
            // Never resume calculation or recapture from a later session state to fill the gap.
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    delivery = deepFreeze(captureAuditDelivery(game, session, accepted.command, accepted.before, accepted.result, accepted.disposition, "accepted-boundary"));
                    break;
                } catch (error) {
                    if (attempt === 0) continue;
                    operation.captureFailure = Object.assign(new AuditReplayError("audit-capture-unavailable", `deliveries[${operation.deliveries.length}]`,
                        `Accepted delivery evidence is unavailable; release this session after exporting its prefix. ${error instanceof Error ? error.message : String(error)}`), {
                        acceptedDeliveries: operation.acceptedDeliveries, uncapturedDelivery: accepted,
                        operation: deepFreeze({commands: operation.commands, disposition: operation.disposition, context: operation.context}),
                    });
                    history.unavailable = operation;
                    throw operation.captureFailure;
                }
            }
            operation.deliveries.push(delivery!);
            before = delivery!.after;
        });
        try {
            while (operation.completedCommands < operation.commands.length) {
                const result = runtime.execute(operation.commands[operation.completedCommands]);
                if (result.status !== "played") throw new AuditReplayError("audit-command", "command", result.reason);
                operation.completedCommands++;
            }
        } catch (error) {
            // Keep the runtime's original exception/progress and expose immutable exportable evidence.
            const failure = error instanceof Error ? error : new Error(String(error));
            if (operation.deliveries.length) operation.descriptor = deepFreeze(this.describeAudit(buildAuditRoundRecording(game, operation.context, operation.deliveries,
                operation.captureFailure ? {acceptedDeliveries: operation.acceptedDeliveries} : undefined)));
            if (operation.descriptor) Object.assign(failure, {committedRecording: operation.descriptor});
            throw failure;
        }
        if (!operation.deliveries.length) throw new AuditReplayError("audit-order", "commands", "Historical delivery was not captured by this recorder; export its original retained evidence.");
        operation.descriptor = deepFreeze(this.describeAudit(buildAuditRoundRecording(game, operation.context, operation.deliveries)));
        return operation.descriptor;
    }

    /** Recorder history has the same owner lifetime as direct runtime retained deliveries. */
    public releaseAuditSession(session: GameSessionHandling): void {
        this.auditHistory.delete(session);
        new SessionRuntime(session).release();
    }

    public describeAudit(audit: AuditRoundRecording): ReplayDescriptor {
        validateAuditRoundRecording(audit);
        const last = audit.deliveries[audit.deliveries.length - 1];
        const artifact = [...audit.deliveries].reverse().find(delivery => delivery.artifact)?.artifact;
        const round = last.result.logicalRound;
        return {audit, auditStatus: "recorded", auditCompletion: audit.captureUnavailable ? "pending" : round?.status ?? "completed",
            ...(audit.captureUnavailable ? {auditUnavailableReason: "An accepted delivery could not be captured; only the preceding executable prefix is available."} : {}), sessionId: last.disposition.sessionId, game: audit.game,
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

        if (options.betModeId !== undefined && (options.entryCommands !== undefined || options.unit === "logical-round")) throw new Error("Simulation mode policy requires step replay without overriding entry commands.");
        const selector = options.betModeId === undefined ? undefined : new FixedBetModeForNextSimulationRoundSetting(options.betModeId);
        const executedCommands: SessionCommand[] = [];
        const startedAt = Date.now();
        let logicalRound: LogicalRound | undefined;
        let totalBet = 0;
        let totalWin = 0;
        for (let played = 0; played < round; played++) {
            if (options.unit !== "logical-round" && !session.canPlayNextGame()) {
                throw new Error(`Replay target round ${round} is unreachable: session stopped after ${played} round(s).`);
            }
            selector?.setBetModeForNextRound(session);
            // Record paid entries and zero-stake continuations separately. A consumed purchase is
            // not re-armed during its continuation; the shared simulation selector owns that policy.
            const selected = session as GameSessionHandling & {getStakeAmount?(): number; getBetModeId?(): string};
            const command = options.unit === "logical-round"
                ? {...options.entryCommands?.[played], kind: "spin" as const, delivery: "composite" as const, roundId: `replay:${played + 1}`}
                : options.entryCommands?.[played] ?? (selector ? {kind: "spin" as const, ...(selected.getStakeAmount?.() === 0 ? {} : {mode: selected.getBetModeId?.()})} : undefined);
            if (selector && command) executedCommands.push(command);
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
        let artifact = (slot.getSequenceSelections?.().length || logicalRound || (geometry && !new ScreenProjection(geometry).isIdentity())) && slot.getWinEvaluationResult
            ? new PokieJsonRoundArtifactProjector().project(buildRoundArtifactFromSession(slot as VideoSlotSessionHandling, {
                roundId: logicalRound?.id ?? `replay:${seed ?? "no-seed"}:${round}`, provenance: {game: manifest, pokieVersion: "1.3.0", ...(game.getConfigHash ? {configHash: game.getConfigHash()} : {})},
            })) : undefined;

        if (logicalRound && slot.getWinEvaluationResult) artifact = new PokieJsonRoundArtifactProjector().project(buildLogicalRoundArtifact(logicalRound,
            buildRoundArtifactFromSession(slot as VideoSlotSessionHandling, {roundId: logicalRound.id, stake: logicalRound.totalStake, provenance: {game: manifest, pokieVersion: "1.3.0", ...(game.getConfigHash ? {configHash: game.getConfigHash()} : {})}})));
        const unit = selector ? "step" : options.unit;
        const commands = selector ? executedCommands : options.entryCommands;
        return {
            auditStatus: "legacy-best-effort",
            ...(unit ? {unit} : {}), ...(commands ? {commands} : {}), ...(selector ? {modePolicy: {betModeId: options.betModeId!, selection: "repeat-when-available" as const}} : {}), ...(logicalRound ? {logicalRound} : {}),
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
