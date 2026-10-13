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
    if (validateSessionCommand(round.entry) || round.entry.roundId !== round.id || round.entry.continuation) return "Invalid retained entry command.";
    for (const [index, step] of round.subrounds.entries()) {
        if (validateSessionCommand(step.command) || step.index !== index || step.id !== `${round.id}:${index}` ||
            ![step.stake, step.win, step.payout, step.credits].every(n => Number.isFinite(n) && n >= 0) ||
            (index > 0 && step.stake !== 0)) return "Invalid logical subround.";
    }
    const stages = round.subrounds[round.cursor - 1].artifacts?.length ?? 0;
    const priorDeliveries = round.subrounds.slice(0, -1).reduce((sum, subround) => sum + Math.max(1, subround.artifacts?.length ?? 0), 0);
    if (round.stageCursor > stages || round.deliveryCursor !== priorDeliveries + Math.max(1, round.stageCursor) ||
        (round.status === "completed" && (round.mathematicalStatus !== "completed" || round.stageCursor < stages))) return "Delivery cursor differs from retained mathematical steps.";
    if (round.totalStake !== round.subrounds.reduce((sum, s) => sum + s.stake, 0) ||
        round.totalWin !== round.subrounds.reduce((sum, s) => sum + s.win, 0) ||
        round.totalPayout !== round.subrounds.reduce((sum, s) => sum + s.payout, 0)) return "Logical-round totals differ from retained subrounds.";
    return undefined;
}
