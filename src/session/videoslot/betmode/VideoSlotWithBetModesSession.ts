import type {BuildableFromSessionState} from "../../BuildableFromSessionState.js";
import type {ConvertableToSessionState} from "../../ConvertableToSessionState.js";
import type {StakeAmountDetermining} from "../../StakeAmountDetermining.js";
import {AbstractVideoSlotSessionDecorator} from "../AbstractVideoSlotSessionDecorator.js";
import type {VideoSlotSessionHandling} from "../VideoSlotSessionHandling.js";
import type {BetModeDescribing} from "./BetModeDescribing.js";
import type {BetModeSelecting} from "./BetModeSelecting.js";
import type {BetModeSessionState} from "./BetModeSessionState.js";
import {BetModesConfig} from "./BetModesConfig.js";
import type {BetModesConfigRepresenting} from "./BetModesConfigRepresenting.js";
import type {ForcedFeatureEntryHandling} from "./ForcedFeatureEntryHandling.js";
import {ForcedFeatureEntryUnsupportedError} from "./ForcedFeatureEntryUnsupportedError.js";
import {ForcingBetModeSelectionRejectedError} from "./ForcingBetModeSelectionRejectedError.js";
import {NoOpForcedFeatureEntryHandler} from "./NoOpForcedFeatureEntryHandler.js";
import {UnknownBetModeError} from "./UnknownBetModeError.js";

// Wraps any VideoSlotSessionHandling (a plain VideoSlotSession, or one already decorated with e.g.
// VideoSlotWithFreeGamesSession) to make the selected bet mode actually drive execution, rather than
// being metadata a caller has to interpret and apply itself (see gamepackage/BetMode.ts's own doc
// comment on why it deliberately stops short of that). Nothing about buy-bonus or ante-bet is
// hard-coded here: BetModesConfigRepresenting supplies the available modes and their
// stakeMultiplier/forcesFeatureEntry, and ForcedFeatureEntryHandling supplies what "forced entry"
// actually does to the wrapped session -- a new mode or a new kind of forced entry is new data/a new
// strategy implementation, never a change to this class.
//
// With both constructor arguments left at their defaults (a single "base" mode, stakeMultiplier 1, no
// forced entry, a no-op forced-entry handler), this behaves exactly like the wrapped session on its
// own -- the backward-compatible path for a game that never configures bet modes at all.
//
// Persistent modes (base/ante) and one-shot forcing purchases (buy-bonus) have deliberately different
// lifetimes. A persistent mode's stakeMultiplier applies to every spin indefinitely, until a caller
// explicitly changes it. A forcing mode is a single purchase: play() only forces entry while
// getStakeAmount() is still positive (see play()'s own comment) -- so it neither re-grants on every
// subsequent free spin of the round it just started, nor grants extra free spins to a "buy" attempted
// mid an already-active zero-stake round -- and the instant that purchase actually succeeds, the mode
// reverts to the default one, so it never lingers to auto-repurchase itself once the round it bought
// finishes. It never charges silently for an entry that didn't happen either: a forcing mode whose
// ForcedFeatureEntryHandling reports it can't actually perform entry (canForceFeatureEntry()) makes
// play() throw ForcedFeatureEntryUnsupportedError before anything is charged or mutated -- and, since
// nothing was purchased, the mode selection is left exactly as it was, for the caller to retry.
//
// setBetMode() itself refuses to *select* a forcing mode while a zero-stake feature round is already
// active (ForcingBetModeSelectionRejectedError) -- without that, the selection would otherwise sit
// latent until the round finishes, and the very next ordinary spin would then force (and charge for) a
// brand new bonus entry the player never took any fresh action to request at that point. A caller who
// wants to buy again must call setBetMode() a second time once the round is over -- a deliberate,
// explicit purchase, never a deferred one. Non-forcing modes (base/ante) are never restricted by this,
// and never auto-revert either -- persistent means persistent.
export class VideoSlotWithBetModesSession<T extends string | number | symbol = string>
    extends AbstractVideoSlotSessionDecorator<T>
    implements
        BetModeSelecting,
        StakeAmountDetermining,
        ConvertableToSessionState<BetModeSessionState>,
        BuildableFromSessionState<BetModeSessionState> {
    private readonly betModesConfig: BetModesConfigRepresenting;
    private readonly forcedFeatureEntryHandler: ForcedFeatureEntryHandling<T>;
    private currentBetModeId: string;

    constructor(
        baseSession: VideoSlotSessionHandling<T>,
        betModesConfig: BetModesConfigRepresenting = new BetModesConfig(),
        forcedFeatureEntryHandler: ForcedFeatureEntryHandling<T> = new NoOpForcedFeatureEntryHandler<T>(),
    ) {
        super(baseSession);
        this.betModesConfig = betModesConfig;
        this.forcedFeatureEntryHandler = forcedFeatureEntryHandler;
        this.currentBetModeId = betModesConfig.getDefaultBetModeId();
    }

    public getBetModeId(): string {
        return this.currentBetModeId;
    }

    public setBetMode(modeId: string): void {
        const mode = this.betModesConfig.getBetMode(modeId);
        if (mode === undefined) {
            throw new UnknownBetModeError(modeId, this.betModesConfig.getBetModeIds());
        }
        // Reject rather than silently latch a forcing mode while a zero-stake round is already
        // active -- see the class doc comment on why an accepted-but-not-yet-armed selection here
        // would resurface as an unrequested, auto-charged purchase the instant that round finishes.
        if (mode.forcesFeatureEntry() && this.isInsideActiveZeroStakeFeature()) {
            throw new ForcingBetModeSelectionRejectedError(modeId);
        }
        this.currentBetModeId = modeId;
    }

    // The amount the *next* play() will actually charge, including any ante/buy-feature multiplier --
    // consulted by SpinCommandHandler via determineStakeAmount() for real wallet debits, so a bet mode
    // affects money at the server boundary too, not only this session's own internal credits.
    public getStakeAmount(): number {
        return this.computeBaseStakeAmount() * this.resolveActiveBetMode().getStakeMultiplier();
    }

    public override canPlayNextGame(): boolean {
        if (!this.baseSession.canPlayNextGame()) {
            return false;
        }
        const totalCost = this.computeBaseStakeAmount() * this.resolveActiveBetMode().getStakeMultiplier();
        return this.baseSession.getCreditsAmount() >= totalCost;
    }

    public override play(): void {
        if (!this.canPlayNextGame()) {
            return;
        }
        const mode = this.resolveActiveBetMode();
        // getStakeAmount() itself, computed before any forced entry mutates the wrapped session's
        // state -- this is the one true "what does this spin cost" figure, identical to what a caller
        // (or SpinCommandHandler, via determineStakeAmount()) already read before calling play(). A
        // positive value here means this is a genuinely new, chargeable spin; 0 means we're already
        // mid a zero-stake feature round (e.g. an unfinished free-games round granted by an earlier
        // forced entry, or a naturally triggered one) -- forcing entry only ever happens on the
        // former, which is what makes it one-shot per purchase rather than repeated on every
        // subsequent free spin, and what stops a "buy" attempted mid an already-active round from
        // granting extra free spins on top.
        const totalIntendedCharge = this.getStakeAmount();

        if (mode.forcesFeatureEntry() && totalIntendedCharge > 0) {
            if (!this.forcedFeatureEntryHandler.canForceFeatureEntry(this.baseSession, mode)) {
                throw new ForcedFeatureEntryUnsupportedError(mode.getId());
            }
            this.forcedFeatureEntryHandler.forceFeatureEntry(this.baseSession, mode);
            // A forcing mode is a one-shot purchase intent, not a persistent one like ante: revert to
            // the default mode the instant the purchase actually succeeds, before the bonus round's
            // own first spin even plays out. Without this, the mode (and its stakeMultiplier) would
            // stay selected past the round it just bought, so the very next ordinary spin once that
            // round finishes -- with no fresh setBetMode() call from the player -- would still read
            // forcesFeatureEntry() true and a positive stake, silently forcing (and charging for) an
            // unrequested second purchase. Reverting here, not merely refusing to re-fire, is also what
            // keeps a state snapshot taken any time after this point (including mid the bought round)
            // from ever carrying a "consumed" forcing selection to restore in the first place.
            this.currentBetModeId = this.betModesConfig.getDefaultBetModeId();
        }

        // Whatever the wrapped session's own play() is now about to net-charge for this spin (0, for
        // instance, if forceFeatureEntry() just put it mid a free round it banks/reverts instead of
        // charging for) is topped up to exactly totalIntendedCharge -- never assumed to already equal
        // the base bet, which is what let a buy-bonus's first (forced, free) spin silently go
        // undercharged by a full base bet before this fix.
        const extraCost = totalIntendedCharge - this.computeBaseStakeAmount();
        if (extraCost !== 0) {
            this.baseSession.setCreditsAmount(this.baseSession.getCreditsAmount() - extraCost);
        }
        this.baseSession.play();
    }

    public toSessionState(): BetModeSessionState {
        const state: BetModeSessionState = {betModeId: this.currentBetModeId};
        if (this.supportsSessionStateCapture(this.baseSession)) {
            state.base = this.baseSession.toSessionState();
        }
        return state;
    }

    public fromSessionState(value: BetModeSessionState): this {
        this.currentBetModeId = value.betModeId;
        if (value.base !== undefined && this.supportsSessionStateRestore(this.baseSession)) {
            this.baseSession.fromSessionState(value.base);
        }
        return this;
    }

    private resolveActiveBetMode(): BetModeDescribing {
        const mode = this.betModesConfig.getBetMode(this.currentBetModeId);
        if (mode === undefined) {
            throw new UnknownBetModeError(this.currentBetModeId, this.betModesConfig.getBetModeIds());
        }
        return mode;
    }

    private computeBaseStakeAmount(): number {
        return this.supportsStakeAmount(this.baseSession) ? this.baseSession.getStakeAmount() : this.baseSession.getBet();
    }

    // True only when the wrapped session both supports StakeAmountDetermining and currently reports a
    // 0 stake -- i.e. a zero-stake feature round (free games or otherwise) is genuinely in progress
    // right now, whether it got there via an earlier forced entry or a natural trigger. Deliberately
    // not the same computeBaseStakeAmount() fallback used for charging (which returns getBet() when
    // unsupported): a session with no such contract at all is never "mid a zero-stake feature" by
    // definition, only one that actively reports 0 is.
    private isInsideActiveZeroStakeFeature(): boolean {
        return this.supportsStakeAmount(this.baseSession) && this.baseSession.getStakeAmount() === 0;
    }

    private supportsStakeAmount(
        session: VideoSlotSessionHandling<T>,
    ): session is VideoSlotSessionHandling<T> & StakeAmountDetermining {
        return typeof (session as Partial<StakeAmountDetermining>).getStakeAmount === "function";
    }

    private supportsSessionStateCapture(
        session: VideoSlotSessionHandling<T>,
    ): session is VideoSlotSessionHandling<T> & ConvertableToSessionState {
        return typeof (session as Partial<ConvertableToSessionState>).toSessionState === "function";
    }

    private supportsSessionStateRestore(
        session: VideoSlotSessionHandling<T>,
    ): session is VideoSlotSessionHandling<T> & BuildableFromSessionState {
        return typeof (session as Partial<BuildableFromSessionState>).fromSessionState === "function";
    }
}
