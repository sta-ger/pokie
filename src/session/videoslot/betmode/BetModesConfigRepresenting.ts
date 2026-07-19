import type {BetModeDescribing} from "./BetModeDescribing.js";

// The set of bet modes a VideoSlotWithBetModesSession can be switched between, plus which one is
// active by default -- OCP seam for callers to supply their own modes/policy without touching the
// decorator itself. See BetModesConfig for the default (single "base" mode) implementation.
export interface BetModesConfigRepresenting {
    getDefaultBetModeId(): string;

    getBetMode(modeId: string): BetModeDescribing | undefined;

    getBetModeIds(): string[];
}
