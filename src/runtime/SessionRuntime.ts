import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import {supportsBetModeSelecting} from "../session/videoslot/betmode/supportsBetModeSelecting.js";
import type {StakeAmountDetermining} from "../session/StakeAmountDetermining.js";
import {validateSessionCommand, type SessionCommand} from "./SessionCommand.js";
import type {SessionCommandResult, SessionRuntimeHandling} from "./SessionRuntimeHandling.js";

export type PreparedSessionCommand =
    | {readonly status: "ready"; readonly rollback: () => boolean; readonly execute: () => Extract<SessionCommandResult, {status: "played"}>}
    | {readonly status: "blocked"; readonly reason: string; readonly restored: boolean};

/** Portable command boundary. The injected session remains the sole owner of domain math. */
export class SessionRuntime implements SessionRuntimeHandling {
    private readonly session: GameSessionHandling;

    constructor(session: GameSessionHandling) {
        this.session = session;
    }

    public execute(command: SessionCommand): SessionCommandResult {
        const invalid = this.validateSelection(command);
        if (invalid !== undefined) return {status: "invalid-command", reason: invalid};
        const prepared = this.prepare(command, this.session.getCreditsAmount());
        if (prepared.status === "blocked") return {status: "blocked", reason: prepared.reason};
        return prepared.execute();
    }

    public validateSelection(command: SessionCommand): string | undefined {
        const invalid = validateSessionCommand(command);
        if (invalid !== undefined) return invalid;
        const session = this.session;
        if (command.bet !== undefined && !session.getAvailableBets().includes(command.bet)) {
            return `Session does not support bet ${command.bet} (available bets: ${session.getAvailableBets().join(", ")}).`;
        }
        if (command.mode !== undefined) {
            if (!supportsBetModeSelecting(session)) return "Session does not support bet mode selection.";
            if (!session.getAvailableBetModeIds().includes(command.mode)) return `Session does not support bet mode "${command.mode}" (available modes: ${session.getAvailableBetModeIds().join(", ")}).`;
        }
        return undefined;
    }

    public prepare(command: SessionCommand, balance: number): PreparedSessionCommand {
        const invalid = this.validateSelection(command);
        if (invalid !== undefined) return {status: "blocked", reason: invalid, restored: true};
        const session = this.session;
        const {bet, mode} = command;
        // Command setters are applied to the same object that will play, then rolled back as one
        // unit on a rejected guard or setter failure.  A scratch session cannot prove affordability
        // for a finite/live-only feature or preserve its RNG; this reversible projection can.
        const previousCredits = session.getCreditsAmount();
        const previousBet = session.getBet();
        const previousMode = supportsBetModeSelecting(session) ? session.getBetModeId() : undefined;
        let executed = false;
        let invalidated = false;
        const rollback = (): boolean => {
            if (executed) return false;
            invalidated = true;
            try {
                if (previousMode !== undefined && supportsBetModeSelecting(session)) session.setBetMode(previousMode);
                session.setBet(previousBet);
                session.setCreditsAmount(previousCredits);
                return true;
            } catch {
                return false;
            }
        };
        try {
            // Setters are allowed to mutate and then throw.  Always restore the snapshot on failure so a
            // partial setCreditsAmount() cannot bypass restoration merely because it never returned.
            session.setCreditsAmount(balance);
            if (bet !== undefined) session.setBet(bet);
            if (mode !== undefined && supportsBetModeSelecting(session)) session.setBetMode(mode);
            if (session.canPlayNextGame()) return {status: "ready", rollback, execute: () => {
                if (executed || invalidated) throw new Error("Prepared command is no longer executable.");
                executed = true;
                return this.executePrepared();
            }};
            const restored = rollback();
            return {status: "blocked", reason: restored
                ? "Session cannot play the next round (canPlayNextGame() returned false)."
                : "Session rejected the command and does not support reversible command-state restoration.", restored};
        } catch (error) {
            // We intentionally attempt the snapshot restore even if the first setter threw: it may have
            // applied part of its mutation before reporting failure.  If restoration itself fails, the
            // caller evicts this object rather than leaving it executable in the live cache.
            const restored = rollback();
            if (!restored) {
                return {status: "blocked", reason: "Session rejected the command and does not support reversible command-state restoration.", restored: false};
            }
            return {status: "blocked", reason: error instanceof Error ? error.message : String(error), restored: true};
        }
    }
    /** Settlement adapters prepare once, debit the wallet, then execute the same session. */
    private executePrepared(): Extract<SessionCommandResult, {status: "played"}> {
        const session = this.session;
        if (!session.canPlayNextGame()) throw new Error("Prepared session cannot play the next round.");
        const stake = typeof (session as Partial<StakeAmountDetermining>).getStakeAmount === "function"
            ? (session as GameSessionHandling & StakeAmountDetermining).getStakeAmount() : session.getBet();
        const mode = supportsBetModeSelecting(session) ? session.getBetModeId() : undefined;
        session.play();
        return {status: "played", win: session.getWinAmount(), credits: session.getCreditsAmount(), stake, mode};
    }
}

/** Synchronous convenience for tools; rejects a blocked round instead of publishing a report. */
export function executeSessionCommand(session: GameSessionHandling, command: SessionCommand = {kind: "spin"}): Extract<SessionCommandResult, {status: "played"}> {
    const result = new SessionRuntime(session).execute(command);
    if (result.status !== "played") throw new Error(`${result.status}: ${result.reason}`);
    return result;
}
