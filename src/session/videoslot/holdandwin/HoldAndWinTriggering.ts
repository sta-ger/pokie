import type {LockedHoldAndWinSymbol} from "./LockedHoldAndWinSymbol.js";

// Decides whether a base (non-feature) spin's own collectible candidates are enough to trigger a Hold &
// Win/Lock & Spin run. Only ever consulted by HoldAndWinRoundHandler on a spin where the feature isn't
// already active — once active, every subsequent respin locks whatever HoldAndWinCollecting finds with no
// further threshold at all (see HoldAndWinRoundHandler's own doc comment), so this interface has no say
// over respin-time collection, only over whether a feature run starts in the first place.
export interface HoldAndWinTriggering<T extends string | number | symbol = string> {
    isTriggered(candidates: readonly LockedHoldAndWinSymbol<T>[]): boolean;
}
