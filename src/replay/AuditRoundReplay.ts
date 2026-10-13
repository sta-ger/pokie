import {validateRepositoryCommand} from "../runtime/RepositoryCommand.js";
import crypto from "crypto";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import {deepFreeze} from "../internal/deepFreeze.js";
import {resolveGameSessionIdentity} from "../runtime/GameSessionIdentity.js";
import {SessionRuntime} from "../runtime/SessionRuntime.js";
import {validateSessionCommand, type SessionCommand} from "../runtime/SessionCommand.js";
import {validateLogicalRound} from "../runtime/LogicalRound.js";
import {validateExecutableState} from "../runtime/validateExecutableState.js";
import {isSessionStateRestorable, resolveSessionStateSchema, sessionStateSchemasMatch} from "../session/SessionStateRestoring.js";
import {restoreFeatureState} from "../server/session/restoreFeatureState.js";
import {buildRoundArtifactFromSession} from "../artifact/buildRoundArtifactFromSession.js";
import {buildLogicalRoundArtifact} from "../artifact/buildLogicalRoundArtifact.js";
import {PokieJsonRoundArtifactProjector} from "../artifact/PokieJsonRoundArtifactProjector.js";
import {RoundArtifactValidator} from "../artifact/RoundArtifactValidator.js";
import {computeRoundArtifactHash} from "../artifact/computeRoundArtifactHash.js";
import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {VideoSlotSessionHandling} from "../session/videoslot/VideoSlotSessionHandling.js";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import type {PokieGameContext} from "../gamepackage/PokieGameContext.js";
import type {PokieSessionState} from "../server/session/PokieSessionState.js";
import type {SessionCommandResult} from "../runtime/SessionRuntimeHandling.js";
import type {AuditBoundary, AuditDelivery, AuditDisposition, AuditRoundRecording} from "./AuditRoundRecording.js";
import {AuditReplayError} from "./AuditReplayError.js";

type Played = Extract<SessionCommandResult, {status: "played"}>;

/** Optional fields emitted by existing runtime DTOs are omitted, never invalid required state data. */
function dto<T>(value: T): T {
    if (Array.isArray(value)) return value.map(item => dto(item)) as T;
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, dto(item)])) as T;
    return value;
}
function canonical(value: unknown): string {
    return JSON.stringify(toCanonicalJson(value));
}
export function computeAuditRoundHash(recording: Omit<AuditRoundRecording, "hash">): string {
    return `sha256:${crypto.createHash("sha256").update(canonical(recording)).digest("hex")}`;
}
function equal(actual: unknown, expected: unknown, path: string, code: ConstructorParameters<typeof AuditReplayError>[0]): void {
    if (canonical(actual) === canonical(expected)) return;
    if (actual && expected && typeof actual === "object" && typeof expected === "object") {
        const first = actual as Record<string, unknown>,
            second = expected as Record<string, unknown>;
        for (const key of new Set([...Object.keys(first), ...Object.keys(second)])) {
            if (!(key in first) || !(key in second)) throw new AuditReplayError(code, `${path}.${key}`, "Missing or unexpected field.");
            equal(first[key], second[key], `${path}.${key}`, code);
        }
    }
    throw new AuditReplayError(code, path, "Recorded value differs from selected authority or reproduced execution.");
}
export function auditBoundaryFromState(state: PokieSessionState, credits = state.credits): AuditBoundary {
    if (credits === undefined || state.featureState === undefined) throw new AuditReplayError("audit-codec-unsupported", "state", "Complete executable state and credits are required.");
    return dto({state: toCanonicalJson(state.featureState), bet: state.bet, credits, ...(state.logicalRound ? {logicalRound: state.logicalRound} : {})});
}
export function captureAuditBoundary(session: GameSessionHandling): AuditBoundary {
    if (!isSessionStateRestorable(session)) throw new AuditReplayError("audit-codec-unsupported", "state", "Session must implement complete capture, restore and validation.");
    let state: unknown;
    try {
        state = (session as GameSessionHandling & {toSessionState(): unknown}).toSessionState();
        // Validate raw codec output before normalization; undefined/nonfinite/custom objects are errors.
        toCanonicalJson(state);
    } catch (error) {
        throw new AuditReplayError("audit-state", "state", error instanceof Error ? error.message : String(error));
    }
    return dto({state, bet: session.getBet(), credits: session.getCreditsAmount(), logicalRound: new SessionRuntime(session).getLogicalRound()});
}
export function captureAuditDelivery(game: PokieGame, session: GameSessionHandling, command: SessionCommand, before: AuditBoundary, result: Played, disposition: AuditDisposition, execution: AuditDelivery["execution"] = "command"): AuditDelivery {
    const slot = session as Partial<VideoSlotSessionHandling>;
    let artifact: AuditDelivery["artifact"];
    if (!result.deliveryOnly && typeof slot.getWinEvaluationResult === "function" && typeof slot.getSymbolsCombination === "function") {
        const built = buildRoundArtifactFromSession(slot as VideoSlotSessionHandling, {roundId: result.logicalRound?.id ?? command.roundId ?? disposition.requestId ?? disposition.sessionId,
            stake: result.stake, betMode: result.mode, provenance: {game: game.getManifest(), pokieVersion: "1.3.0", ...(game.getConfigHash ? {configHash: game.getConfigHash()} : {})}});
        artifact = new PokieJsonRoundArtifactProjector().project(result.logicalRound ? buildLogicalRoundArtifact(result.logicalRound, built) : built);
    }
    return dto({execution, command, before, after: captureAuditBoundary(session), result, ...(artifact ? {artifact} : {}), disposition});
}
function rngProfile(schema: AuditRoundRecording["stateSchema"]): AuditRoundRecording["rngProfile"] {
    let leaf = schema;
    while ("base" in leaf) leaf = leaf.base;
    if (leaf.kind === "seeded-video-slot") return "seeded-mulberry32-v1";
    if (leaf.kind === "base") return "none";
    return "custom-codec-v1";
}
export function buildAuditRoundRecording(game: PokieGame, context: PokieGameContext | undefined, deliveries: readonly AuditDelivery[], captureUnavailable?: AuditRoundRecording["captureUnavailable"]): AuditRoundRecording {
    const identity = resolveGameSessionIdentity(game);
    if (!identity.modelHash || !game.getSessionStateSchema || !game.getSessionCommandCapabilities) throw new AuditReplayError("audit-codec-unsupported", "identity", "Exact audit requires selected model hash, authoritative codec and command capabilities.");
    const stateSchema = game.getSessionStateSchema();
    const body: Omit<AuditRoundRecording, "hash"> = dto({schemaVersion: "pokie.audit-round.v1", runtimeVersion: "pokie.session-runtime.v1", identity,
        game: game.getManifest(), stateSchema, rngProfile: rngProfile(stateSchema),
        ...(context ? {context} : {}), deliveries, ...(captureUnavailable ? {captureUnavailable} : {})});
    const recording = {...body, hash: computeAuditRoundHash(body)};
    validateAuditRoundRecording(recording, game);
    return deepFreeze(recording);
}

/** Validate before reconstruction. Selected package is authority; recorded claims cannot select a weaker codec. */
export function validateAuditRoundRecording(value: unknown, game?: PokieGame): asserts value is AuditRoundRecording {
    try {
        validateAuditStructure(value, game);
    } catch (error) {
        if (error instanceof AuditReplayError) throw error;
        throw new AuditReplayError("audit-structure", "$", error instanceof Error ? error.message : String(error));
    }
}

function validateAuditStructure(value: unknown, game?: PokieGame): void {
    try {
        toCanonicalJson(value);
    } catch (error) {
        throw new AuditReplayError("audit-structure", "$", String(error));
    }
    const r = value as AuditRoundRecording;
    if (!r || typeof r !== "object" || !Array.isArray(r.deliveries) || !r.deliveries.length || r.deliveries.length > 10000) throw new AuditReplayError("audit-structure", "deliveries", "Expected 1..10000 recorded deliveries.");
    if (r.schemaVersion !== "pokie.audit-round.v1" || r.runtimeVersion !== "pokie.session-runtime.v1") throw new AuditReplayError("audit-version", "schemaVersion/runtimeVersion", "Unsupported audit/runtime version.");
    const {hash, ...body} = r;
    if (typeof hash !== "string" || !(/^sha256:[a-f0-9]{64}$/).test(hash) || computeAuditRoundHash(body) !== hash) throw new AuditReplayError("audit-hash", "hash", "Missing, malformed or mismatched canonical digest.");
    if (r.captureUnavailable !== undefined && (!r.captureUnavailable || typeof r.captureUnavailable !== "object" ||
        Object.keys(r.captureUnavailable).length !== 1 || !Number.isSafeInteger(r.captureUnavailable.acceptedDeliveries) ||
        r.captureUnavailable.acceptedDeliveries <= r.deliveries.length || r.captureUnavailable.acceptedDeliveries > 10000)) throw new AuditReplayError("audit-structure", "captureUnavailable", "Expected a bounded accepted delivery count greater than the available prefix.");
    if (!r.identity || [r.identity.modelHash, r.identity.gameId, r.identity.compatibilityVersion, r.identity.stateSchemaVersion, r.game?.id, r.game?.name, r.game?.version].some(item => typeof item !== "string" || !item.trim()) || r.identity.gameId !== r.game?.id || !r.stateSchema) throw new AuditReplayError("audit-identity", "identity", "Missing or contradictory model/game/codec identity.");
    if (r.context !== undefined && (typeof r.context !== "object" || r.context === null || Array.isArray(r.context) ||
        (r.context.seed !== undefined && typeof r.context.seed !== "string" && (typeof r.context.seed !== "number" || !Number.isFinite(r.context.seed))) ||
        (r.context.options !== undefined && (typeof r.context.options !== "object" || r.context.options === null || Array.isArray(r.context.options))))) throw new AuditReplayError("audit-structure", "context", "Invalid recorded construction context.");
    if (game) {
        if (!game.getConfigHash || !game.getSessionStateSchema || !game.getSessionCommandCapabilities) throw new AuditReplayError("audit-codec-unsupported", "game", "Selected package does not declare exact audit authority.");
        equal(r.identity, resolveGameSessionIdentity(game), "identity", "audit-identity");
        equal(r.game, dto(game.getManifest()), "game", "audit-identity");
        equal(r.stateSchema, dto(game.getSessionStateSchema()), "stateSchema", "audit-version");
    }
    let leaf = r.stateSchema;
    while ("base" in leaf) leaf = leaf.base;
    equal(r.rngProfile, rngProfile(r.stateSchema), "rngProfile", "audit-version");
    const identities = new Set<string>();
    for (const [index, delivery] of r.deliveries.entries()) {
        const path = `deliveries[${index}]`;
        if (!["command", "accepted-boundary"].includes(delivery?.execution)) throw new AuditReplayError("audit-structure", `${path}.execution`, "Unknown execution boundary.");
        const invalid = validateSessionCommand(delivery?.command);
        if (invalid) throw new AuditReplayError("audit-command", `${path}.command`, invalid);
        if (!delivery.disposition || !["calculated", "committed", "compensated", "rejected", "pending", "recovery-required"].includes(delivery.disposition.status) ||
            !["detached", "process-only", "atomic-local", "external-provider", "independent-ports"].includes(delivery.disposition.durability) || !delivery.disposition.sessionId || delivery.result?.status !== "played") throw new AuditReplayError("audit-structure", `${path}.disposition/result`, "Missing result or transactional disposition.");
        for (const key of Object.keys(delivery.command)) {
            if (!["kind", "bet", "mode", "delivery", "roundId", "continuation", "maxSubrounds", "sessionId", "requestId", "expectedVersion"].includes(key)) throw new AuditReplayError("audit-command", `${path}.command.${key}`, "Unknown command field.");
        }
        const command = delivery.command as SessionCommand & {sessionId?: string; requestId?: string; expectedVersion?: number};
        if (command.sessionId !== undefined && validateRepositoryCommand(command)) throw new AuditReplayError("audit-command", `${path}.command`, validateRepositoryCommand(command)!);
        const disposition = delivery.disposition;
        for (const key of ["sessionId", "requestId", "attemptId", "debitTransactionId", "creditTransactionId"] as const) {
            if (disposition[key] !== undefined && (typeof disposition[key] !== "string" || !disposition[key]!.trim() || disposition[key]!.includes("\0"))) throw new AuditReplayError("audit-identity", `${path}.disposition.${key}`, "Invalid operation identifier.");
        }
        for (const key of ["startedAt", "recordedAt"] as const) {
            if (disposition[key] !== undefined && (typeof disposition[key] !== "string" || !Number.isFinite(Date.parse(disposition[key]!)))) throw new AuditReplayError("audit-structure", `${path}.disposition.${key}`, "Invalid original operation time.");
        }
        for (const key of ["walletPayout", "walletCredits"] as const) {
            if (disposition[key] !== undefined && (!Number.isFinite(disposition[key]) || (key === "walletCredits" && disposition[key]! < 0))) throw new AuditReplayError("audit-state", `${path}.disposition.${key}`, "Invalid settlement amount.");
        }
        if ((disposition.expectedVersion === undefined) !== (disposition.version === undefined) || (disposition.expectedVersion !== undefined &&
            (!Number.isSafeInteger(disposition.expectedVersion) || disposition.expectedVersion < 1 || disposition.version !== disposition.expectedVersion + 1))) throw new AuditReplayError("audit-identity", `${path}.disposition.version`, "Invalid accepted revision transition.");
        const previousDisposition = r.deliveries[index - 1]?.disposition;
        const sameCompositeOperation = disposition.requestId !== undefined && previousDisposition?.requestId === disposition.requestId &&
            previousDisposition.attemptId === disposition.attemptId && previousDisposition.expectedVersion === disposition.expectedVersion && previousDisposition.version === disposition.version;
        if (index && disposition.expectedVersion !== undefined && !sameCompositeOperation && previousDisposition?.version !== disposition.expectedVersion) throw new AuditReplayError("audit-order", `${path}.disposition.expectedVersion`, "Revision sequence does not follow prior delivery.");
        if ((command.sessionId !== undefined && command.sessionId !== delivery.disposition.sessionId) || (command.requestId !== undefined && command.requestId !== delivery.disposition.requestId) ||
            (command.expectedVersion !== undefined && command.expectedVersion !== delivery.disposition.expectedVersion)) throw new AuditReplayError("audit-identity", `${path}.command`, "Command and settlement identities/revisions differ.");
        if (index && delivery.disposition.sessionId !== r.deliveries[0].disposition.sessionId) throw new AuditReplayError("audit-identity", `${path}.disposition.sessionId`, "Foreign session.");
        // One composite request owns several distinct accepted delivery boundaries.
        let deliveryKey: (string | number)[] | undefined;
        if (command.continuation) deliveryKey = [command.continuation.roundId, command.continuation.cursor];
        else if (command.roundId) deliveryKey = [command.roundId, "entry"];
        let key: string | undefined;
        if (disposition.requestId) key = JSON.stringify([disposition.requestId, deliveryKey ?? null]);
        else if (deliveryKey) key = JSON.stringify(deliveryKey);
        if (key && identities.has(key)) throw new AuditReplayError("audit-order", path, "Duplicate delivery; retries reference historical evidence instead of appending calculation.");
        if (key) identities.add(key);
        for (const boundary of ["before", "after"] as const) {
            const state = delivery[boundary];
            if (!state || !Number.isFinite(state.bet) || state.bet <= 0 || !Number.isFinite(state.credits) || state.credits < 0) throw new AuditReplayError("audit-state", `${path}.${boundary}`, "Invalid executable boundary accounting.");
            if (state.logicalRound && validateLogicalRound(state.logicalRound)) throw new AuditReplayError("audit-order", `${path}.${boundary}.logicalRound`, validateLogicalRound(state.logicalRound)!);
            try {
                validateExecutableState(state.state, r.stateSchema, game?.validateSessionState ? s => game.validateSessionState!(s, r.context) : undefined);
            } catch (error) {
                if (game || leaf.kind !== "custom") throw new AuditReplayError("audit-state", `${path}.${boundary}.state`, String(error));
            }
            const capabilities = game?.getSessionCommandCapabilities?.(r.context);
            if (capabilities && (!capabilities.bets.includes(state.bet) || (command.bet !== undefined && !capabilities.bets.includes(command.bet)) || (command.mode !== undefined && !capabilities.modes?.includes(command.mode)))) throw new AuditReplayError("audit-command", `${path}.command`, "Selection is outside selected model capabilities.");
        }
        if (index) equal(delivery.before, r.deliveries[index - 1].after, `${path}.before`, "audit-order");
        if (command.continuation && (delivery.before.logicalRound?.id !== command.continuation.roundId || delivery.before.logicalRound.deliveryCursor !== command.continuation.cursor)) throw new AuditReplayError("audit-order", `${path}.command.continuation`, "Continuation does not name recorded progress.");
        if (delivery.artifact) {
            const {hash: artifactHash, ...artifact} = delivery.artifact;
            if (artifactHash !== computeRoundArtifactHash(artifact)) throw new AuditReplayError("audit-artifact", `${path}.artifact.hash`, "Invalid artifact digest.");
            const issue = new RoundArtifactValidator().validate(artifact)[0];
            if (issue) throw new AuditReplayError("audit-artifact", `${path}.artifact${issue.path ? `.${issue.path}` : ""}`, issue.message);
            if (artifact.provenance.game.id !== r.game.id || artifact.provenance.configHash !== r.identity.modelHash) throw new AuditReplayError("audit-identity", `${path}.artifact.provenance`, "Artifact model differs from audit model.");
        }
        if (delivery.result.credits !== delivery.after.credits || (delivery.result.logicalRound && canonical(delivery.result.logicalRound) !== canonical(delivery.after.logicalRound))) throw new AuditReplayError("audit-state", `${path}.result`, "Result and executable boundary disagree.");
        if (delivery.disposition.walletPayout !== undefined && delivery.disposition.walletPayout !== delivery.after.credits - delivery.before.credits + delivery.result.stake) throw new AuditReplayError("audit-state", `${path}.disposition.walletPayout`, "Wallet payout differs from actual balance delta and stake.");
        if (delivery.disposition.walletCredits !== undefined && delivery.disposition.walletCredits !== delivery.result.credits) throw new AuditReplayError("audit-state", `${path}.disposition.walletCredits`, "Settlement and result disagree.");
    }
}

export interface AuditRoundReplaying {
    replay(game: PokieGame, recording: AuditRoundRecording, signal?: AbortSignal): AuditReplayResult;
}
export type AuditReplayResult = {readonly verification: "verified"; readonly completion: "completed" | "pending" | "exhausted"; readonly recording: AuditRoundRecording; readonly deliveries: readonly AuditDelivery[]};

/** Offline: no repository, wallet, provider or reconciliation dependencies. Each delivery restores a detached session. */
export class AuditRoundReplay implements AuditRoundReplaying {
    public replay(game: PokieGame, recording: AuditRoundRecording, signal?: AbortSignal): AuditReplayResult {
        const execution = this.execute(game, recording, signal);
        let next = execution.next();
        while (!next.done) next = execution.next();
        return next.value;
    }

    public *execute(game: PokieGame, recording: AuditRoundRecording, signal?: AbortSignal): Generator<{completedDeliveries: number; delivery: AuditDelivery}, AuditReplayResult> {
        validateAuditRoundRecording(recording, game);
        const deliveries: AuditDelivery[] = [];
        for (const [index, delivery] of recording.deliveries.entries()) {
            if (signal?.aborted) throw new AuditReplayError("audit-cancelled", `deliveries[${index}]`, "Cancelled before execution.");
            let actual: AuditDelivery;
            try {
                const session = game.createSession(recording.context);
                if (!isSessionStateRestorable(session)) throw new AuditReplayError("audit-codec-unsupported", `deliveries[${index}].session`, "Selected session has no complete executable codec.");
                if (!sessionStateSchemasMatch(resolveSessionStateSchema(session), recording.stateSchema)) throw new AuditReplayError("audit-version", `deliveries[${index}].session.stateSchema`, "Selected session codec differs from package declaration.");
                restoreFeatureState(session, toCanonicalJson(delivery.before.state));
                session.setBet(delivery.before.bet);
                session.setCreditsAmount(delivery.before.credits);
                const runtime = new SessionRuntime(session, delivery.before.logicalRound);
                let result: SessionCommandResult;
                if (delivery.execution === "accepted-boundary") {
                    const prepared = runtime.prepare(delivery.command, delivery.before.credits);
                    result = prepared.status === "ready" ? prepared.execute() : {status: "blocked", reason: prepared.reason};
                } else result = runtime.execute(delivery.command, signal);
                if (result.status !== "played") throw new AuditReplayError("audit-execution-mismatch", `deliveries[${index}].command`, result.reason);
                actual = captureAuditDelivery(game, session, delivery.command, delivery.before, result, delivery.disposition, delivery.execution);
                equal(actual, delivery, `deliveries[${index}]`, "audit-execution-mismatch");
            } catch (error) {
                if (error instanceof AuditReplayError && error.path.startsWith(`deliveries[${index}]`)) throw error;
                throw new AuditReplayError("audit-execution-mismatch", `deliveries[${index}]`, error instanceof Error ? error.message : String(error));
            }
            deliveries.push(actual);
            yield {completedDeliveries: index + 1, delivery: actual};
        }
        return {verification: "verified", completion: recording.captureUnavailable ? "pending" : deliveries[deliveries.length - 1].result.logicalRound?.status ?? "completed", recording, deliveries};
    }
}
