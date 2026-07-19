// Thrown by VideoSlotWithBetModesSession.play() when the active mode's forcesFeatureEntry() is true
// but the configured ForcedFeatureEntryHandling.canForceFeatureEntry() reports it can't actually
// perform entry against the wrapped session (e.g. the default NoOpForcedFeatureEntryHandler was left
// in place, or a real handler like FreeGamesForcedFeatureEntryHandler was wired to a session that
// doesn't implement the free-games contract it needs). Raised *before* anything is charged or
// mutated, so a misconfigured buy/ante mode fails explicitly instead of silently charging its cost
// for an entry that never happens.
export class ForcedFeatureEntryUnsupportedError extends Error {
    private readonly modeId: string;

    constructor(modeId: string) {
        super(
            `Bet mode "${modeId}" has forcesFeatureEntry() true, but the configured ForcedFeatureEntryHandling ` +
                "cannot perform entry against this session.",
        );
        this.name = "ForcedFeatureEntryUnsupportedError";
        this.modeId = modeId;
    }

    public getModeId(): string {
        return this.modeId;
    }
}
