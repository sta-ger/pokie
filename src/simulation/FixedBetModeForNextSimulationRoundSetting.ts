import type {BetModeForNextSimulationRoundSetting} from "./BetModeForNextSimulationRoundSetting.js";
import type {BetModeSelecting} from "../session/videoslot/betmode/BetModeSelecting.js";
import {ForcingBetModeSelectionRejectedError} from "../session/videoslot/betmode/ForcingBetModeSelectionRejectedError.js";
import type {GameSessionHandling} from "../session/GameSessionHandling.js";

// Locks a simulation run to one bet mode: (re-)selects it before every round, which is what actually
// drives the runtime (VideoSlotWithBetModesSession) rather than any bet-mode math being recomputed
// here. Re-selecting every round (rather than once, up front) is what correctly simulates "the player
// always buys/antes every time it's available" for a forcing mode: VideoSlotWithBetModesSession
// itself rejects re-selecting a forcing mode while its own bonus round is still active (see
// ForcingBetModeSelectionRejectedError) -- that specific, expected rejection is swallowed here (this
// round simply continues the round the mode already bought), while any other error (e.g.
// UnknownBetModeError for a typo'd mode id) still propagates, surfacing as a clear simulation failure.
// A session that doesn't support BetModeSelecting at all is left untouched -- backward compatible for
// games without configured bet modes.
export class FixedBetModeForNextSimulationRoundSetting implements BetModeForNextSimulationRoundSetting {
    private readonly modeId: string;

    constructor(modeId: string) {
        this.modeId = modeId;
    }

    public setBetModeForNextRound(session: GameSessionHandling): void {
        if (!this.supportsBetModeSelecting(session)) {
            return;
        }
        try {
            session.setBetMode(this.modeId);
        } catch (error) {
            if (!(error instanceof ForcingBetModeSelectionRejectedError)) {
                throw error;
            }
        }
    }

    private supportsBetModeSelecting(session: GameSessionHandling): session is GameSessionHandling & BetModeSelecting {
        return typeof (session as Partial<BetModeSelecting>).setBetMode === "function";
    }
}
