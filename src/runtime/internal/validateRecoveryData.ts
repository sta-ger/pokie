import {toCanonicalJson} from "../../json/toCanonicalJson.js";
import {validateAuditRoundRecording} from "../../replay/AuditRoundReplay.js";
import {commandEnvelope} from "../commandEnvelope.js";
import type {PokieSessionState} from "../../server/session/PokieSessionState.js";
import {validateSavedStageDelivery} from "./validateSavedStageDelivery.js";
import {validateRepositoryCommand, type RepositoryCommand} from "../RepositoryCommand.js";
import {validateSessionCommand} from "../SessionCommand.js";
import type {LiveSessionAuthority} from "./LiveSessionAuthority.js";
import type {PokieGame} from "../../gamepackage/PokieGame.js";
import type {SpinOperationRecord} from "../../server/spin/SpinOperationRecord.js";
import {validatePersistedSession} from "../validatePersistedSession.js";

type Rejection = ReturnType<typeof validatePersistedSession>;
const corrupt = (reason: string): Rejection => ({status: "corrupt-state", reason});
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const amount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const revision = (value: unknown): boolean => value === undefined || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);

/** Validate the complete published envelope, not only its executable snapshot. */
export function validateRetryResult(value: unknown, game: PokieGame, sessionId: string, requestId: string, live?: LiveSessionAuthority): Rejection {
    if (!object(value) || value.sessionId !== sessionId || (value.requestId !== undefined && value.requestId !== requestId)) return corrupt("Invalid cached result identifiers.");
    if (value.status !== "played") {
        if (!["invalid-command", "incompatible-state", "corrupt-state", "restoration-unsupported", "storage-error", "settlement-error", "execution-error", "blocked", "not-found", "conflict", "recovery-required"].includes(String(value.status)) ||
            (value.status !== "not-found" && typeof value.reason !== "string")) return corrupt("Invalid cached result outcome.");
        return undefined;
    }
    if (value.requestId !== requestId || value.previousState === undefined) return corrupt("Incomplete cached result envelope.");
    const rejected = validateComputedResult(value, value.state, value.previousState, value.version, game, live, sessionId);
    if (rejected) return rejected;
    if (value.audit !== undefined) {
        try {
            validateAuditRoundRecording(value.audit, game);
            const last = value.audit.deliveries[value.audit.deliveries.length - 1];
            if (last.disposition.sessionId !== sessionId || last.disposition.requestId !== requestId || last.result.win !== value.win || last.result.credits !== value.credits ||
                (value.stake !== undefined && last.result.stake !== value.stake) || (value.mode !== undefined && last.result.mode !== value.mode) ||
                last.after.bet !== (value.state as PokieSessionState).bet ||
                JSON.stringify(toCanonicalJson(last.before.state)) !== JSON.stringify(toCanonicalJson((value.previousState as PokieSessionState).featureState)) ||
                JSON.stringify(toCanonicalJson(last.after.logicalRound ?? null)) !== JSON.stringify(toCanonicalJson((value.state as PokieSessionState).logicalRound ?? null)) || JSON.stringify(toCanonicalJson(last.after.state)) !== JSON.stringify(toCanonicalJson((value.state as PokieSessionState).featureState))) return corrupt("Audit and retained result disagree.");
        } catch (error) {
            return corrupt(error instanceof Error ? error.message : String(error));
        }
    }
    const state = value.state as PokieSessionState;
    const previous = value.previousState as PokieSessionState;
    const command = value.deliveryCommand as RepositoryCommand | undefined;
    if (command !== undefined && (validateRepositoryCommand(command) || validateSessionCommand(command) || command.sessionId !== sessionId || command.requestId !== requestId)) return corrupt("Invalid retained delivery command.");
    if (value.deliveryOnly === true) {
        if (!command || !validateSavedStageDelivery(previous, state, command)) return corrupt("Invalid retained saved-stage delivery.");
    } else if (state.logicalRound) {
        const original = state.logicalRound.subrounds[state.logicalRound.cursor - 1].command as RepositoryCommand;
        if (original.requestId !== requestId || (command && commandEnvelope(command) !== commandEnvelope(original))) return corrupt("Retained logical result differs from its accepted command.");
    }
    return undefined;
}

function validateComputedResult(value: Record<string, unknown>, state: unknown, previous: unknown, version: unknown, game: PokieGame, live?: LiveSessionAuthority, sessionId?: string): Rejection {
    const rejected = validatePersistedSession(state, game, live, sessionId) ?? (previous === undefined ? undefined : validatePersistedSession(previous, game, live, sessionId));
    if (rejected !== undefined) return rejected;
    if (!amount(value.win) || !amount(value.credits) || (value.stake !== undefined && !amount(value.stake)) || !revision(version) ||
        (value.mode !== undefined && (typeof value.mode !== "string" || value.mode.length === 0)) ||
        !object(state) || state.win !== value.win || state.credits !== value.credits ||
        (value.mode !== undefined && (!object(state.commandCapabilities) || !Array.isArray(state.commandCapabilities.modes) || !state.commandCapabilities.modes.includes(value.mode)))) return corrupt("Invalid computed result accounting or selection.");
    return undefined;
}

export function validateOperationRecord(value: SpinOperationRecord, game: PokieGame, sessionId: string, requestId: string, live?: LiveSessionAuthority): Rejection {
    if (!object(value) || value.sessionId !== sessionId || value.requestId !== requestId ||
        ![value.attemptId, value.debitTransactionId, value.creditTransactionId].every(id => typeof id === "string" && id.length > 0) ||
        !amount(value.stakeAmount) || !revision(value.expectedVersion) ||
        !["started", "debited", "settled", "session-saved", "committed", "compensated"].includes(value.checkpoint) ||
        !Number.isFinite(Date.parse(value.startedAt)) || !Number.isFinite(Date.parse(value.updatedAt))) return corrupt("Invalid operation record envelope.");
    if (value.command !== undefined && (validateRepositoryCommand(value.command) || validateSessionCommand(value.command) || value.command.sessionId !== sessionId || value.command.requestId !== requestId)) return corrupt("Invalid retained logical command envelope.");
    const captured = value.capturedResult;
    if (captured === undefined) return undefined;
    if (!object(captured) || captured.previousState === undefined || captured.newState === undefined) return corrupt("Invalid captured result envelope.");
    if (captured.stake !== undefined && captured.stake !== value.stakeAmount) return corrupt("Captured stake does not match the operation.");
    const rejected = validateComputedResult(captured, captured.newState, captured.previousState, captured.newVersion, game, live, sessionId);
    if (rejected) return rejected;
    if (captured.audit !== undefined) {
        // Validate the ORIGINAL digest/envelope before any reconciliation stamps a new disposition.
        const invalidAudit = validateRetryResult({status: "played", sessionId, requestId, state: captured.newState,
            previousState: captured.previousState, version: captured.newVersion, win: captured.win, credits: captured.credits,
            stake: captured.stake, mode: captured.mode, audit: captured.audit,
            ...(value.command ? {deliveryCommand: value.command} : {}), ...(captured.deliveryOnly ? {deliveryOnly: true} : {})}, game, sessionId, requestId, live);
        if (invalidAudit) return invalidAudit;
        const last = captured.audit.deliveries[captured.audit.deliveries.length - 1];
        const disposition = last.disposition;
        if (disposition.attemptId !== value.attemptId || (captured.deliveryOnly !== true && disposition.debitTransactionId !== value.debitTransactionId) ||
            (captured.deliveryOnly !== true && disposition.creditTransactionId !== value.creditTransactionId) || disposition.expectedVersion !== value.expectedVersion ||
            disposition.startedAt !== value.startedAt || last.result.stake !== value.stakeAmount ||
            (value.command && commandEnvelope(last.command as RepositoryCommand) !== commandEnvelope(value.command)) ||
            (value.checkpoint === "committed" && disposition.status !== "committed") ||
            (value.checkpoint === "compensated" && disposition.status !== "compensated")) return corrupt("Captured audit identity or disposition differs from its operation.");
    }
    if (captured.deliveryOnly === true && (!value.command || value.stakeAmount !== 0 || !validateSavedStageDelivery(captured.previousState as PokieSessionState, captured.newState as PokieSessionState, value.command))) return corrupt("Invalid captured saved-stage transition.");
    if (captured.deliveryOnly !== true && captured.newState.logicalRound) {
        const original = captured.newState.logicalRound.subrounds[captured.newState.logicalRound.cursor - 1].command as RepositoryCommand;
        if (original.requestId !== requestId || (value.command && commandEnvelope(value.command) !== commandEnvelope(original))) return corrupt("Captured logical result differs from its accepted command.");
    }
    return undefined;
}
