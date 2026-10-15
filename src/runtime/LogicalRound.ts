import {RoundArtifactValidator} from "../artifact/RoundArtifactValidator.js";
import {validateRepositoryCommand} from "./RepositoryCommand.js";
import {validateSessionCommand, type SessionCommand} from "./SessionCommand.js";
import type {RoundStepArtifact} from "../artifact/RoundStepArtifact.js";

export type RoundDeliveryPolicy = "stepwise" | "composite";
export type RoundContinuation = {readonly roundId: string; readonly cursor: number};

/** A subround is one accepted domain play. A cascade subround can contain several mathematical steps. */
export type LogicalSubround = {
    readonly id: string;
    readonly index: number;
    readonly command: SessionCommand;
    readonly stake: number;
    readonly win: number;
    /** Actual wallet award, including a released free-game bank; never added to win. */
    readonly payout: number;
    readonly credits: number;
    readonly screen?: unknown[][];
    /** Final unevaluated refill when a cascade stopped at its bound. */
    readonly finalScreen?: unknown[][];
    readonly artifacts?: readonly RoundStepArtifact[];
};

/** Required continuation data, independent of optional debug capture and transport projection. */
export type LogicalRound = {
    readonly id: string;
    readonly entry: SessionCommand;
    readonly bet: number;
    readonly mode?: string;
    readonly cursor: number;
    /** Deliveries may advance over saved cascade steps without changing the mathematical cursor. */
    readonly mathematicalStatus: "pending" | "completed" | "exhausted";
    readonly deliveryCursor: number;
    readonly stageCursor: number;
    readonly status: "pending" | "completed" | "exhausted";
    readonly totalStake: number;
    readonly totalWin: number;
    readonly totalPayout: number;
    readonly subrounds: readonly LogicalSubround[];
};

export interface LogicalRoundProgressProviding {
    hasPendingLogicalRound(): boolean;
}

export function validateLogicalRound(value: unknown): string | undefined {
    try {
        return validateLogicalRoundStructure(value);
    } catch {
        return "Malformed retained logical round.";
    }
}

function validateLogicalRoundStructure(value: unknown): string | undefined {
    const round = value as LogicalRound | undefined;
    if (!round || typeof round !== "object" || typeof round.id !== "string" || !round.id ||
        !Number.isSafeInteger(round.deliveryCursor) || round.deliveryCursor < 1 || !Number.isSafeInteger(round.stageCursor) || round.stageCursor < 0 || !Number.isSafeInteger(round.cursor) || round.cursor < 1 || !Array.isArray(round.subrounds) || round.subrounds.length !== round.cursor ||
        !["pending", "completed", "exhausted"].includes(round.mathematicalStatus) || !["pending", "completed", "exhausted"].includes(round.status) || !Number.isFinite(round.bet) || round.bet <= 0 ||
        ![round.totalStake, round.totalWin, round.totalPayout].every(n => Number.isFinite(n) && n >= 0)) return "Invalid logical-round cursor/accounting.";
    if (validateSessionCommand(round.entry) || round.entry.roundId !== round.id || round.entry.continuation || round.entry.delivery === undefined) return "Invalid retained entry command.";
    if ((round.entry.bet !== undefined && round.entry.bet !== round.bet) || (round.entry.mode !== undefined && round.entry.mode !== round.mode) ||
        (round.mode !== undefined && (typeof round.mode !== "string" || !round.mode))) return "Retained entry selection differs from logical selection.";
    const entrySession = (round.entry as SessionCommand & {sessionId?: string}).sessionId;
    let priorCursor = 0;
    for (const [index, step] of round.subrounds.entries()) {
        const command = step.command as SessionCommand & {sessionId?: string};
        if ((entrySession !== undefined && (validateRepositoryCommand(command) || typeof (command as {requestId?: string}).requestId !== "string" || command.sessionId !== entrySession)) ||
            (index === 0 ? JSON.stringify(step.command) !== JSON.stringify(round.entry) :
                command.continuation?.roundId !== round.id || command.continuation.cursor !== priorCursor)) return "Foreign or inconsistent retained subround command.";
        if (validateSessionCommand(step.command) || step.index !== index || step.id !== `${round.id}:${index}` ||
            ![step.stake, step.win, step.payout, step.credits].every(n => Number.isFinite(n) && n >= 0) ||
            (index > 0 && step.stake !== 0)) return "Invalid logical subround.";
        if (step.finalScreen !== undefined && (!validScreen(step.finalScreen) || index !== round.cursor - 1 || round.mathematicalStatus !== "exhausted")) return "Invalid exhausted final screen.";
        if (step.screen !== undefined && !validScreen(step.screen)) return "Invalid retained subround screen.";
        if (step.artifacts !== undefined) {
            if (!Array.isArray(step.artifacts) || step.artifacts.length === 0 || !step.artifacts.every((artifact: RoundStepArtifact) => artifact && validScreen(artifact.screen) && Array.isArray(artifact.wins) && artifact.wins.every(validWin))) return "Invalid retained mathematical steps.";
            const last = step.artifacts[step.artifacts.length - 1];
            const totalWin = step.artifacts.reduce((sum: number, artifact: RoundStepArtifact) => sum + artifact.totalWin, 0);
            const artifact = {schemaVersion: 1, roundId: round.id, provenance: {game: {id: "retained", name: "Retained", version: "1"}, pokieVersion: "unknown"}, betMode: round.mode ?? "base", stake: step.stake,
                totalWin, payoutMultiplier: step.stake > 0 ? totalWin / step.stake : 0, screen: last.screen, ...(last.sequenceSelections ? {sequenceSelections: last.sequenceSelections} : {}),
                ...(last.geometry ? {geometry: last.geometry, generatedScreen: last.generatedScreen} : {}), steps: step.artifacts, wins: step.artifacts.flatMap((item: RoundStepArtifact) => item.wins)};
            if (new RoundArtifactValidator().validate(artifact).length || Math.abs(totalWin - step.win) > 1e-9 || JSON.stringify(last.screen) !== JSON.stringify(step.screen)) return "Invalid retained mathematical artifact/accounting.";
        }
        priorCursor += Math.max(1, step.artifacts?.length ?? 0);
    }
    const stages = round.subrounds[round.cursor - 1].artifacts?.length ?? 0;
    const priorDeliveries = round.subrounds.slice(0, -1).reduce((sum, subround) => sum + Math.max(1, subround.artifacts?.length ?? 0), 0);
    let expectedStatus: LogicalRound["status"] = "completed";
    if (round.mathematicalStatus === "exhausted") expectedStatus = "exhausted";
    else if (round.mathematicalStatus === "pending" || round.stageCursor < stages) expectedStatus = "pending";
    if (round.status !== expectedStatus || (stages === 0 ? round.stageCursor !== 0 : round.stageCursor < 1) || round.stageCursor > stages || round.deliveryCursor !== priorDeliveries + Math.max(1, round.stageCursor) ||
        (round.status === "completed" && (round.mathematicalStatus !== "completed" || round.stageCursor < stages))) return "Delivery cursor differs from retained mathematical steps.";
    if (round.totalStake !== round.subrounds.reduce((sum, s) => sum + s.stake, 0) ||
        round.totalWin !== round.subrounds.reduce((sum, s) => sum + s.win, 0) ||
        round.totalPayout !== round.subrounds.reduce((sum, s) => sum + s.payout, 0)) return "Logical-round totals differ from retained subrounds.";
    return undefined;
}

function validScreen(value: unknown): boolean {
    return Array.isArray(value) && value.length > 0 && value.every(reel => Array.isArray(reel) && reel.length > 0 && reel.every(symbol => typeof symbol === "string" || (typeof symbol === "number" && Number.isFinite(symbol))));
}

function validPositions(value: unknown): boolean {
    return Array.isArray(value) && value.every(position => Array.isArray(position) && position.length === 2 && position.every(coordinate => Number.isSafeInteger(coordinate) && coordinate >= 0));
}

function validWin(value: unknown): boolean {
    const win = value as import("../artifact/RoundArtifactWin.js").RoundArtifactWin | undefined;
    return !!win && typeof win.type === "string" && !!win.type && typeof win.id === "string" && !!win.id &&
        ((win.type === "jackpot" && win.symbolId === null) || typeof win.symbolId === "string" || (typeof win.symbolId === "number" && Number.isFinite(win.symbolId))) &&
        validPositions(win.winningPositions) && Array.isArray(win.multiplierBreakdown) && win.multiplierBreakdown.every(item =>
        item && typeof item.source === "string" && !!item.source && validPositions(item.positions) && Array.isArray(item.values) &&
        item.values.every(Number.isFinite) && Number.isFinite(item.combinedMultiplier)) &&
        typeof win.metadata === "object" && win.metadata !== null && !Array.isArray(win.metadata);
}
