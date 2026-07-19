// Thrown by VideoSlotWithBetModesSession.setBetMode() when selecting a forcing mode
// (forcesFeatureEntry() true) while the wrapped session is already inside an active zero-stake
// feature round -- an unfinished free-games round, whether naturally triggered or granted by an
// earlier purchase. Rejecting the selection outright (rather than silently accepting it) is what
// prevents a latent/deferred buy: if the selection were accepted here and simply left un-armed until
// the round finishes, the very next ordinary spin would find forcesFeatureEntry() still true on the
// still-selected mode and force (and charge for) a brand new bonus entry the player never took any
// fresh action to request at that later point. Selecting a non-forcing mode (base/ante) is never
// affected -- only forcing modes are gated, and only while a zero-stake round is genuinely active.
export class ForcingBetModeSelectionRejectedError extends Error {
    private readonly modeId: string;

    constructor(modeId: string) {
        super(
            `Bet mode "${modeId}" forces feature entry and cannot be selected while a zero-stake feature ` +
                "round is already active -- select it again once that round finishes to make a fresh purchase.",
        );
        this.name = "ForcingBetModeSelectionRejectedError";
        this.modeId = modeId;
    }

    public getModeId(): string {
        return this.modeId;
    }
}
