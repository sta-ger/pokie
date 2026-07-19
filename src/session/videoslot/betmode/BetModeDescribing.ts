// Read-only runtime descriptor for a single bet mode -- distinct from gamepackage/BetMode.ts, which
// is pure serializable data shared with GameBlueprint/PAR sheet/Stake Engine. This is the first-class
// runtime hook that BetMode.ts's own doc comment says a real buy-the-feature/ante mechanic needs:
// stakeMultiplier and forcesFeatureEntry actually drive VideoSlotWithBetModesSession's execution path
// (see that class), not just labeling. metadata/targetRtp are carried through for a caller (or a
// future per-mode simulation/reporting layer) to read, without this package hard-coding what they mean.
export interface BetModeDescribing {
    getId(): string;

    // Relative to the base bet; 1 is a normal spin, >1 an ante/buy-feature cost actually charged by
    // VideoSlotWithBetModesSession.play() (on top of, not instead of, the normal bet debit).
    getStakeMultiplier(): number;

    // Whether selecting this mode forces feature entry (e.g. a bought bonus round) on the next play(),
    // via the injected ForcedFeatureEntryHandling -- see VideoSlotWithBetModesSession.
    forcesFeatureEntry(): boolean;

    getMetadata(): Record<string, unknown> | undefined;

    // An RTP target this mode is designed around (e.g. a buy-feature mode commonly targets a
    // different RTP than base). Purely descriptive here -- wiring it into simulation/reporting is a
    // later step (see GAP_AUDIT_v1.3.md), not this one.
    getTargetRtp(): number | undefined;
}
