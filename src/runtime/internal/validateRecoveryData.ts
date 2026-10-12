import type {PokieGame} from "../../gamepackage/PokieGame.js";
import type {SpinOperationRecord} from "../../server/spin/SpinOperationRecord.js";
import {validatePersistedSession} from "../validatePersistedSession.js";

type Rejection = ReturnType<typeof validatePersistedSession>;
const corrupt = (reason: string): Rejection => ({status: "corrupt-state", reason});
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const amount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const revision = (value: unknown): boolean => value === undefined || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);

/** Validate the complete published envelope, not only its executable snapshot. */
export function validateRetryResult(value: unknown, game: PokieGame, sessionId: string, requestId: string): Rejection {
    if (!object(value) || value.sessionId !== sessionId || (value.requestId !== undefined && value.requestId !== requestId)) return corrupt("Invalid cached result identifiers.");
    if (value.status !== "played") {
        if (!["invalid-command", "incompatible-state", "corrupt-state", "restoration-unsupported", "storage-error", "settlement-error", "execution-error", "blocked", "not-found", "conflict", "recovery-required"].includes(String(value.status)) ||
            (value.status !== "not-found" && typeof value.reason !== "string")) return corrupt("Invalid cached result outcome.");
        return undefined;
    }
    if (value.requestId !== requestId || value.previousState === undefined) return corrupt("Incomplete cached result envelope.");
    return validateComputedResult(value, value.state, value.previousState, value.version, game);
}

function validateComputedResult(value: Record<string, unknown>, state: unknown, previous: unknown, version: unknown, game: PokieGame): Rejection {
    const rejected = validatePersistedSession(state, game) ?? (previous === undefined ? undefined : validatePersistedSession(previous, game));
    if (rejected !== undefined) return rejected;
    if (!amount(value.win) || !amount(value.credits) || (value.stake !== undefined && !amount(value.stake)) || !revision(version) ||
        (value.mode !== undefined && (typeof value.mode !== "string" || value.mode.length === 0)) ||
        !object(state) || state.win !== value.win || state.credits !== value.credits ||
        (value.mode !== undefined && (!object(state.commandCapabilities) || !Array.isArray(state.commandCapabilities.modes) || !state.commandCapabilities.modes.includes(value.mode)))) return corrupt("Invalid computed result accounting or selection.");
    return undefined;
}

export function validateOperationRecord(value: SpinOperationRecord, game: PokieGame, sessionId: string, requestId: string): Rejection {
    if (!object(value) || value.sessionId !== sessionId || value.requestId !== requestId ||
        ![value.attemptId, value.debitTransactionId, value.creditTransactionId].every(id => typeof id === "string" && id.length > 0) ||
        !amount(value.stakeAmount) || !revision(value.expectedVersion) ||
        !["started", "debited", "settled", "session-saved", "committed", "compensated"].includes(value.checkpoint) ||
        !Number.isFinite(Date.parse(value.startedAt)) || !Number.isFinite(Date.parse(value.updatedAt))) return corrupt("Invalid operation record envelope.");
    const captured = value.capturedResult;
    if (captured === undefined) return undefined;
    if (!object(captured) || captured.previousState === undefined || captured.newState === undefined) return corrupt("Invalid captured result envelope.");
    if (captured.stake !== undefined && captured.stake !== value.stakeAmount) return corrupt("Captured stake does not match the operation.");
    return validateComputedResult(captured, captured.newState, captured.previousState, captured.newVersion, game);
}
