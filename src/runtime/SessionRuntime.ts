import {isSessionStateRestorable, resolveSessionStateSchema} from "../session/SessionStateRestoring.js";
import {sequenceSelectionsEqual} from "../artifact/validateSequenceSelections.js";
import type {CascadeResultProviding} from "../session/videoslot/cascade/CascadeResultProviding.js";
import {cloneSessionData} from "./internal/cloneSessionData.js";
import {deepFreeze} from "../internal/deepFreeze.js";
import {buildRoundArtifactFromSession} from "../artifact/buildRoundArtifactFromSession.js";
import type {VideoSlotSessionHandling} from "../session/videoslot/VideoSlotSessionHandling.js";
import {validateLogicalRound, type LogicalRound, type LogicalSubround, type LogicalRoundProgressProviding} from "./LogicalRound.js";

const releasedSessions = new WeakSet<GameSessionHandling>();
const logicalRounds = new WeakMap<GameSessionHandling, LogicalRound>();
type Played = Extract<SessionCommandResult, {status: "played"}>;
type SubroundNode = {subround: LogicalSubround; previous?: SubroundNode};
type SavedDelivery = {command: string; result: Omit<Played, "logicalRound">; round?: Omit<LogicalRound, "subrounds">; tail?: SubroundNode;
    composite?: {advanced: number; returned: boolean}};
const deliveries = new WeakMap<GameSessionHandling, Map<string, SavedDelivery>>();
const retainedTails = new WeakMap<GameSessionHandling, {roundId: string; tail: SubroundNode}>();
import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import {supportsBetModeSelecting} from "../session/videoslot/betmode/supportsBetModeSelecting.js";
import type {StakeAmountDetermining} from "../session/StakeAmountDetermining.js";
import {validateSessionCommand, type SessionCommand} from "./SessionCommand.js";
import type {SessionCommandProgress, SessionCommandResult, SessionRuntimeHandling} from "./SessionRuntimeHandling.js";

export type PreparedSessionCommand =
    | {readonly status: "ready"; readonly deliveryOnly?: boolean; readonly rollback: () => boolean; readonly execute: () => Extract<SessionCommandResult, {status: "played"}>}
    | {readonly status: "blocked"; readonly reason: string; readonly restored: boolean};

/** Portable command boundary. The injected session remains the sole owner of domain math. */
export class SessionRuntime implements SessionRuntimeHandling {
    private readonly session: GameSessionHandling;
    private readonly onAccepted?: (command: SessionCommand, result: Played) => void;

    constructor(session: GameSessionHandling, round?: LogicalRound, onAccepted?: (command: SessionCommand, result: Played) => void) {
        this.session = session;
        this.onAccepted = onAccepted;
        if (round !== undefined) {
            const invalid = validateLogicalRound(round);
            if (invalid) throw new Error(invalid);
            SessionRuntime.validateLogicalRoundProgress(session, round);
            logicalRounds.set(session, deepFreeze(cloneSessionData(round)));
        }
    }

    public static supportsLogicalRoundDelivery(session: GameSessionHandling): boolean {
        return resolveSessionStateSchema(session).kind === "base" || typeof (session as Partial<LogicalRoundProgressProviding>).hasPendingLogicalRound === "function";
    }

    /** The executable progress authority is shared by restore, retry and settlement recovery. */
    public static validateLogicalRoundProgress(session: GameSessionHandling, round: LogicalRound): void {
        const selections = (session as Partial<VideoSlotSessionHandling>).getSequenceSelections?.();
        const artifacts = round.subrounds[round.cursor - 1]?.artifacts;
        const retained = artifacts?.[artifacts.length - 1]?.sequenceSelections;
        // Canonical JSON restoration sorts object keys. Compare identity fields, rather than the
        // incidental insertion order of captured versus restored selection objects.
        if (selections?.length && !sequenceSelectionsEqual(selections, retained)) throw new Error("Retained weighted selections differ from the logical round.");
        const pending = (session as Partial<LogicalRoundProgressProviding>).hasPendingLogicalRound?.() ?? false;
        // Exhaustion is an unfinished stop, not a claim that every feature counter completed.
        if (round.mathematicalStatus !== "exhausted" && (round.mathematicalStatus === "pending") !== pending) throw new Error("Retained logical progress differs from executable progress.");
    }

    public getLogicalRound(): LogicalRound | undefined {
        return cloneSessionData(logicalRounds.get(this.session));
    }

    public hasPendingLogicalRound(): boolean {
        return logicalRounds.get(this.session)?.status === "pending";
    }

    /** Caller owns the session lifetime and retained retry results. Release retires execution too. */
    public release(): void {
        logicalRounds.delete(this.session);
        deliveries.delete(this.session);
        retainedTails.delete(this.session);
        releasedSessions.add(this.session);
    }

    public getRetainedDeliveryCount(): number {
        return deliveries.get(this.session)?.size ?? 0;
    }

    public execute(command: SessionCommand, signal?: AbortSignal): SessionCommandResult {
        if (releasedSessions.has(this.session)) return {status: "blocked", reason: "Session was released; create a new session."};
        let key: string | undefined;
        if (command?.continuation) key = `${command.continuation.roundId}:${command.continuation.cursor}`;
        else if (command?.roundId) key = `${command.roundId}:entry`;
        const saved = key ? deliveries.get(this.session)?.get(key) : undefined;
        if (saved) {
            if (saved.command !== JSON.stringify(command)) return {status: "invalid-command", reason: "Logical delivery identity conflicts with its original command."};
            const prefix = this.restoreDelivery(saved);
            return command.delivery === "composite" && !saved.composite?.returned ? this.completeComposite(command, prefix, key!, signal) : prefix;
        }
        if (signal?.aborted) return {status: "blocked", reason: "Cancelled before acceptance."};
        const invalid = this.validateSelection(command);
        if (invalid !== undefined) return {status: "invalid-command", reason: invalid};
        if ((deliveries.get(this.session)?.size ?? 0) >= 10000) return {status: "blocked", reason: "Direct session retry retention limit reached; export evidence and release the session."};
        const session = this.session;
        const previousRound = logicalRounds.get(session);
        const before = (command.delivery !== undefined || command.continuation !== undefined) && isSessionStateRestorable(session)
            ? {state: cloneSessionData((session as GameSessionHandling & {toSessionState(): unknown}).toSessionState()), credits: session.getCreditsAmount(), bet: session.getBet()}
            : undefined;
        const prepared = this.prepare(command, session.getCreditsAmount());
        if (prepared.status === "blocked") return {status: "blocked", reason: prepared.reason};
        let result: Extract<SessionCommandResult, {status: "played"}>;
        try {
            result = prepared.execute();
        } catch (error) {
            if (before) {
                (session as GameSessionHandling & {fromSessionState(state: unknown): unknown}).fromSessionState(before.state);
                session.setBet(before.bet);
                session.setCreditsAmount(before.credits);
                if (previousRound) logicalRounds.set(session, previousRound);
                else logicalRounds.delete(session);
            }
            throw error;
        }
        // Preserve the accepted prefix even if a later composite successor fails.
        if (key) {
            const ledger = deliveries.get(session) ?? new Map();
            ledger.set(key, this.saveDelivery(command, result));
            deliveries.set(session, ledger);
        }
        this.onAccepted?.(command, cloneSessionData(result));
        if (command.delivery === "composite") return this.completeComposite(command, result, key!, signal);
        if (key) {
            const ledger = deliveries.get(this.session) ?? new Map();
            ledger.set(key, this.saveDelivery(command, result));
            deliveries.set(this.session, ledger);
        }
        return result;
    }

    public validateSelection(command: SessionCommand): string | undefined {
        const invalid = validateSessionCommand(command);
        if (invalid !== undefined) return invalid;
        const round = logicalRounds.get(this.session);
        if (command.continuation && round && round.deliveryCursor >= 10000) return "Logical round delivery bound reached; retain its incomplete evidence.";
        if (command.continuation) {
            if (!round || round.id !== command.continuation.roundId || round.status !== "pending" || round.deliveryCursor !== command.continuation.cursor) return "Continuation does not name the next pending subround.";
            if (this.session.getBet() !== round.bet) return "Continuation cannot change the entry bet.";
            const stages = round.subrounds[round.cursor - 1].artifacts?.length ?? 0;
            const stake = (this.session as Partial<StakeAmountDetermining>).getStakeAmount?.() ?? this.session.getBet();
            if (round.stageCursor >= stages && stake !== 0) return "Logical continuation requires a zero-stake domain subround.";
        } else if (command.roundId && (round?.id === command.roundId || deliveries.get(this.session)?.has(`${command.roundId}:entry`))) return "Logical entry identity was already accepted; retry its saved delivery.";
        else if (round?.status === "pending" || round?.status === "exhausted") return "Logical round is pending; supply its continuation.";
        if ((command.delivery !== undefined || command.continuation !== undefined) && !command.continuation && !command.roundId) return "Explicit logical entry requires roundId.";
        if ((command.delivery !== undefined || command.continuation !== undefined) && !SessionRuntime.supportsLogicalRoundDelivery(this.session)) return "Custom session must declare logical-round progress before selecting a delivery policy.";
        if (command.delivery !== undefined && !command.continuation && this.isDomainPending()) return "Cannot enter a new logical round during an active feature.";
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
        if (releasedSessions.has(this.session)) return {status: "blocked", reason: "Session was released; create a new session.", restored: true};
        const invalid = this.validateSelection(command);
        if (invalid !== undefined) return {status: "blocked", reason: invalid, restored: true};
        const session = this.session;
        const round = logicalRounds.get(session);
        if (command.continuation && round && round.stageCursor < (round.subrounds[round.cursor - 1].artifacts?.length ?? 0)) {
            let used = false;
            return {status: "ready", deliveryOnly: true, rollback: () => {
                if (used) return false;
                used = true;
                return true;
            }, execute: () => {
                if (used) throw new Error("Prepared delivery is no longer executable.");
                used = true;
                const stageCursor = round.stageCursor + 1;
                const next: LogicalRound = deepFreeze({...round, deliveryCursor: round.deliveryCursor + 1, stageCursor,
                    status: stageCursor < (round.subrounds[round.cursor - 1].artifacts?.length ?? 0) || this.isDomainPending() ? "pending" : "completed"});
                logicalRounds.set(session, next);
                const last = round.subrounds[round.cursor - 1];
                return {status: "played", deliveryOnly: true, win: last.win, credits: last.credits, stake: 0, payout: 0, logicalRound: cloneSessionData(next)};
            }};
        }
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
            if (executed || invalidated) return false;
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
            (session as {validateScreenCoordinates?: () => void}).validateScreenCoordinates?.();
            session.setCreditsAmount(balance);
            if (bet !== undefined) session.setBet(bet);
            if (mode !== undefined && supportsBetModeSelecting(session)) session.setBetMode(mode);
            if (session.canPlayNextGame()) {
                (session as {validateEntryAction?: () => void}).validateEntryAction?.();
                return {status: "ready", rollback, execute: () => {
                    if (executed || invalidated) throw new Error("Prepared command is no longer executable.");
                    executed = true;
                    return this.executePrepared(command);
                }};
            }
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
    private completeComposite(command: SessionCommand, prefix: Played, key: string, signal?: AbortSignal): SessionCommandResult {
        let result = prefix;
        const ledger = deliveries.get(this.session)!;
        let advanced = ledger.get(key)!.composite?.advanced ?? 1;
        const limit = command.maxSubrounds ?? 1000;
        while (result.logicalRound?.status === "pending" && advanced < limit && !signal?.aborted) {
            const continuation = {roundId: result.logicalRound.id, cursor: result.logicalRound.deliveryCursor};
            const committedProgress: SessionCommandProgress = {committedResult: cloneSessionData(result), continuation};
            let next: SessionCommandResult;
            try {
                next = this.execute({kind: "spin", delivery: "stepwise", continuation}, signal);
            } catch (error) {
                // Preserve the original exception and add portable recovery information.
                const failure = error instanceof Error ? error : new Error(String(error));
                Object.assign(failure, {committedProgress});
                throw failure;
            }
            if (next.status !== "played") return {...next, committedProgress};
            result = next;
            // The successor may be a historical retry after another round has started. Share
            // its accepted delivery node rather than reading the session's newer live round.
            const accepted = ledger.get(`${continuation.roundId}:${continuation.cursor}`)!;
            advanced++;
            ledger.set(key, {...accepted, command: JSON.stringify(command), composite: {advanced, returned: false}});
        }
        // A completed or bounded batch is an immutable delivery. Cancellation leaves an
        // interrupted prefix resumable, with only the original batch's remaining budget.
        const returned = !signal?.aborted || advanced >= limit || result.logicalRound?.status !== "pending";
        ledger.set(key, {...ledger.get(key)!, composite: {advanced, returned}});
        return result;
    }

    /** Settlement adapters prepare once, debit the wallet, then execute the same session. */
    private executePrepared(command: SessionCommand): Extract<SessionCommandResult, {status: "played"}> {
        const session = this.session;
        if (!session.canPlayNextGame()) throw new Error("Prepared session cannot play the next round.");
        const stake = typeof (session as Partial<StakeAmountDetermining>).getStakeAmount === "function"
            ? (session as GameSessionHandling & StakeAmountDetermining).getStakeAmount() : session.getBet();
        const mode = supportsBetModeSelecting(session) ? session.getBetModeId() : undefined;
        const creditsBefore = session.getCreditsAmount();
        const bet = session.getBet();
        const context = command.continuation?.roundId ?? command.roundId;
        if (context) (session as Partial<VideoSlotSessionHandling>).setSelectionContext?.(`logical:${context}`);
        session.play();
        const win = session.getWinAmount(),
            credits = session.getCreditsAmount();
        const payout = Math.max(0, credits - creditsBefore + stake);
        if (command.delivery === undefined && command.continuation === undefined) return {status: "played", win, credits, stake, mode};
        const previous = command.continuation ? logicalRounds.get(session)! : undefined;
        if (previous && stake !== 0) throw new Error("Logical continuation attempted another entry stake.");
        const id = previous?.id ?? command.roundId!;
        const index = previous?.cursor ?? 0;
        const slot = session as Partial<VideoSlotSessionHandling>;
        const artifacts = typeof slot.getWinEvaluationResult === "function" && typeof slot.getSymbolsCombination === "function"
            ? buildRoundArtifactFromSession(slot as VideoSlotSessionHandling, {roundId: id, stake, betMode: mode, provenance: {game: {id: "runtime", name: "Runtime", version: "1"}, pokieVersion: "unknown"}}).steps : undefined;
        const screen = artifacts?.[artifacts.length - 1]?.screen;
        const stageCursor = artifacts?.length ? 1 : 0;
        const exhausted = (session as Partial<CascadeResultProviding>).getCascadeResult?.().getMetadata().maxCascadeStepsExceeded === true;
        const finalScreen = exhausted ? (session as Partial<CascadeResultProviding>).getCascadeResult?.().getFinalScreen() : undefined;
        // Optional command selections may arrive as explicit undefined values from adapters.
        // Retain their JSON representation, matching audit capture and retry envelope binding.
        const retainedCommand = cloneSessionData(Object.fromEntries(Object.entries(command).filter(([, value]) => value !== undefined))) as SessionCommand;
        const subround = {id: `${id}:${index}`, index, command: retainedCommand, stake, win, payout, credits,
            ...(screen ? {screen: screen.map(reel => [...reel])} : {}), ...(finalScreen ? {finalScreen} : {}), ...(artifacts ? {artifacts} : {})};
        let mathematicalStatus: LogicalRound["status"] = "completed";
        if (this.isDomainPending()) mathematicalStatus = "pending";
        if (exhausted) mathematicalStatus = "exhausted";
        let status = mathematicalStatus;
        if (!exhausted && stageCursor < (artifacts?.length ?? 0)) status = "pending";
        const round: LogicalRound = deepFreeze({id, entry: previous?.entry ?? retainedCommand, bet: previous?.bet ?? bet,
            ...(previous?.mode ?? mode ? {mode: previous?.mode ?? mode} : {}), cursor: index + 1, deliveryCursor: (previous?.deliveryCursor ?? 0) + 1, stageCursor,
            mathematicalStatus,
            status, totalStake: (previous?.totalStake ?? 0) + stake,
            totalWin: (previous?.totalWin ?? 0) + win, totalPayout: (previous?.totalPayout ?? 0) + payout,
            subrounds: [...(previous?.subrounds ?? []), deepFreeze(cloneSessionData(subround))]});
        logicalRounds.set(session, round);
        return {status: "played", win, credits, stake, mode, payout, logicalRound: cloneSessionData(round)};
    }
    // Each mathematical subround is retained once. Delivery snapshots keep only scalar progress
    // and a shared immutable tail; historical arrays are materialized only for the caller.
    private saveDelivery(command: SessionCommand, result: Played): SavedDelivery {
        const {logicalRound, ...output} = result;
        if (!logicalRound) return {command: JSON.stringify(command), result: output};
        const retained = logicalRounds.get(this.session)!;
        let tail = retainedTails.get(this.session)?.roundId === retained.id ? retainedTails.get(this.session)!.tail : undefined;
        for (let index = tail ? tail.subround.index + 1 : 0; index < retained.cursor; index++) tail = {subround: retained.subrounds[index], previous: tail};
        retainedTails.set(this.session, {roundId: retained.id, tail: tail!});
        const {subrounds: _subrounds, ...round} = retained;
        return {command: JSON.stringify(command), result: output, round, tail};
    }

    private restoreDelivery(saved: SavedDelivery): Played {
        if (!saved.round) return cloneSessionData(saved.result);
        const subrounds: LogicalSubround[] = [];
        for (let node = saved.tail; node; node = node.previous) subrounds.push(node.subround);
        subrounds.reverse();
        return cloneSessionData({...saved.result, logicalRound: {...saved.round, subrounds}});
    }

    private isDomainPending(): boolean {
        const session = this.session as GameSessionHandling & Partial<LogicalRoundProgressProviding>;
        return session.hasPendingLogicalRound?.() ?? false;
    }
}

/** Synchronous convenience for tools; rejects a blocked round instead of publishing a report. */
export function executeSessionCommand(session: GameSessionHandling, command: SessionCommand = {kind: "spin"}, signal: AbortSignal | undefined = undefined): Extract<SessionCommandResult, {status: "played"}> {
    const result = new SessionRuntime(session).execute(command, signal);
    if (result.status !== "played") throw new Error(`${result.status}: ${result.reason}`);
    return result;
}
