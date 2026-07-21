import {WinEvaluationResult} from "../winevaluation/WinEvaluationResult.js";
import type {HoldAndWinCollecting} from "./HoldAndWinCollecting.js";
import type {HoldAndWinPayoutAggregating} from "./HoldAndWinPayoutAggregating.js";
import type {HoldAndWinRoundHandling} from "./HoldAndWinRoundHandling.js";
import type {HoldAndWinTriggering} from "./HoldAndWinTriggering.js";
import type {LockedHoldAndWinSymbol} from "./LockedHoldAndWinSymbol.js";
import type {VideoSlotWithHoldAndWinSessionHandling} from "./VideoSlotWithHoldAndWinSessionHandling.js";

// The actual Hold & Win/Lock & Spin state machine — see HoldAndWinRoundHandling's own doc comment for why
// this lives in a separate, replaceable collaborator rather than in VideoSlotWithHoldAndWinSession itself.
//
// - **Trigger**: only checked while the feature isn't already active. The just-played spin's own grid is
//   run through "collector" (against an empty locked set — every collectible position on this spin counts
//   as a candidate); "trigger" decides whether that candidate set is enough to start the feature. Nothing
//   is locked, and no respins are granted, for a base spin that doesn't trigger.
// - **Locked symbols/positions**: once active, every respin's grid is run through the same "collector",
//   this time against the feature's own current locked set — collector implementations must never return a
//   position already present in it (see HoldAndWinCollecting's own doc comment), so every element it
//   returns is unconditionally newly locked and simply appended.
// - **Respin reset on new collect**: any respin that newly locks at least one symbol resets
//   respinsRemaining back to "initialRespins" (a reset, not a "+1" grant — the same number configured for
//   the initial trigger is reused as the reset value, which is what "configurable initial respins" means
//   for both cases at once). A respin that locks nothing decrements respinsRemaining by exactly 1.
// - **Feature completion**: whichever happens first — the grid fills completely (locked.length reaches
//   reelsNumber * reelsSymbolsNumber, checked even right after the triggering spin itself, in the rare case
//   a trigger alone fills the board) or respinsRemaining reaches 0 with nothing newly locked that respin.
//   On completion, "payoutAggregator" folds the final locked set (at the bet the feature was triggered at)
//   into a single payout, credited once, and the feature deactivates.
// - **Outcome reporting**: every single call to afterRoundPlayed() ends by writing exactly one
//   HoldAndWinRoundOutcome — "ordinary" for a spin the feature had no say in (including the triggering spin
//   itself, whenever it doesn't *also* immediately complete the feature), "suppressed" for a respin whose
//   own wrapped-paytable win was collected then discarded without completing anything, or "completed" for
//   the one round — a respin, or, rarely, the triggering spin alone filling the whole board — that ends the
//   feature. See HoldAndWinRoundOutcome's own doc comment for why this must be explicit state, not derived
//   from isHoldAndWinActive() after the fact.
// - Every zero-stake respin restores credits to creditsBeforePlay first (mirrors FreeGamesRoundHandler's
//   own handling of its own zero-stake rounds) — whatever the wrapped session's own ordinary paytable
//   evaluation produced for that respin's reel strip is deliberately never paid out directly; only this
//   handler's own payoutAggregator result is, and only once, at completion.
export class HoldAndWinRoundHandler<T extends string | number | symbol = string> implements HoldAndWinRoundHandling<T> {
    private readonly initialRespins: number;
    private readonly collector: HoldAndWinCollecting<T>;
    private readonly trigger: HoldAndWinTriggering<T>;
    private readonly payoutAggregator: HoldAndWinPayoutAggregating<T>;

    constructor(initialRespins: number, collector: HoldAndWinCollecting<T>, trigger: HoldAndWinTriggering<T>, payoutAggregator: HoldAndWinPayoutAggregating<T>) {
        if (!Number.isSafeInteger(initialRespins) || initialRespins <= 0) {
            throw new Error(`HoldAndWinRoundHandler requires initialRespins to be a positive safe integer, got ${String(initialRespins)}.`);
        }
        this.initialRespins = initialRespins;
        this.collector = collector;
        this.trigger = trigger;
        this.payoutAggregator = payoutAggregator;
    }

    // A completed feature leaves its own payout/locked set visible for the round that just finished it to
    // report — clear both before a fresh, unrelated round starts, mirroring FreeGamesRoundHandler's own
    // "clear stale state before a new round" reset. A no-op on every round except the one right after a
    // completion (including the very first round ever played, where payout is already 0). Deliberately
    // never touches getHoldAndWinLastRoundOutcome() — afterRoundPlayed() always overwrites it unconditionally
    // on every path, so there is nothing stale to clear there.
    public beforeRoundPlayed(session: VideoSlotWithHoldAndWinSessionHandling<T>): void {
        if (!session.isHoldAndWinActive() && (session.getHoldAndWinPayout() !== 0 || session.getLockedHoldAndWinSymbols().length > 0)) {
            session.setHoldAndWinPayout(0);
            session.setLockedHoldAndWinSymbols([]);
        }
    }

    public afterRoundPlayed(session: VideoSlotWithHoldAndWinSessionHandling<T>, creditsBeforePlay: number, baseWinEvaluationResult: WinEvaluationResult<T>): void {
        const grid = session.getSymbolsCombination().toMatrix();

        if (!session.isHoldAndWinActive()) {
            const candidates = this.collector.collect(grid, []);
            if (!this.trigger.isTriggered(candidates)) {
                session.setHoldAndWinLastRoundOutcome({kind: "ordinary"});
                return;
            }
            session.setHoldAndWinActive(true);
            session.setLockedHoldAndWinSymbols(candidates);
            session.setHoldAndWinRespinsRemaining(this.initialRespins);
            if (this.isBoardFull(session, candidates)) {
                // The triggering spin alone filled the board — its own win was never touched (a normal
                // paid spin, not a respin), so it genuinely contributes alongside the feature payout.
                this.complete(session, baseWinEvaluationResult);
            } else {
                session.setHoldAndWinLastRoundOutcome({kind: "ordinary"});
            }
            return;
        }

        // A live respin never charges (see VideoSlotWithHoldAndWinSession.getStakeAmount()) — restore
        // whatever the wrapped session's own paytable evaluation of this respin's reel strip added before
        // this handler's own collect/lock/respin logic runs. That discarded win never contributes to this
        // round's own outcome either way, completion or not — hence the empty WinEvaluationResult passed to
        // complete() below, ignoring "baseWinEvaluationResult" entirely for this branch.
        session.setCreditsAmount(creditsBeforePlay);

        const alreadyLocked = session.getLockedHoldAndWinSymbols();
        const newlyCollected = this.collector.collect(grid, alreadyLocked);
        const locked = newlyCollected.length > 0 ? [...alreadyLocked, ...newlyCollected] : alreadyLocked;
        session.setLockedHoldAndWinSymbols(locked);

        if (newlyCollected.length > 0) {
            session.setHoldAndWinRespinsRemaining(this.initialRespins);
        } else {
            session.setHoldAndWinRespinsRemaining(session.getHoldAndWinRespinsRemaining() - 1);
        }

        if (this.isBoardFull(session, locked) || session.getHoldAndWinRespinsRemaining() <= 0) {
            this.complete(session, new WinEvaluationResult<T>());
        } else {
            session.setHoldAndWinLastRoundOutcome({kind: "suppressed"});
        }
    }

    private complete(session: VideoSlotWithHoldAndWinSessionHandling<T>, baseWinEvaluationResult: WinEvaluationResult<T>): void {
        const lockedSymbols = session.getLockedHoldAndWinSymbols();
        const payout = this.payoutAggregator.aggregate(lockedSymbols, session.getBet());
        session.setHoldAndWinPayout(payout);
        session.setCreditsAmount(session.getCreditsAmount() + payout);
        session.setHoldAndWinActive(false);
        session.setHoldAndWinRespinsRemaining(0);
        session.setHoldAndWinLastRoundOutcome({
            kind: "completed",
            baseWinAmount: baseWinEvaluationResult.getTotalWin(),
            payout,
            lockedSymbols,
            baseWinEvaluationResult,
        });
    }

    private isBoardFull(session: VideoSlotWithHoldAndWinSessionHandling<T>, locked: readonly LockedHoldAndWinSymbol<T>[]): boolean {
        return locked.length >= session.getReelsNumber() * session.getReelsSymbolsNumber();
    }
}
