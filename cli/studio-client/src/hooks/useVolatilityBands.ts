import {useSyncExternalStore} from "react";
import {
    clearStoredVolatilityBands,
    loadVolatilityBands,
    saveVolatilityBands,
    subscribeVolatilityBands,
} from "../domain/volatilityBandsStorage";
import type {VolatilityBands} from "../domain/volatilityBands";

/**
 * Portfolio volatility bands are a Studio-local authoring preference, not project math. They live in
 * browser storage so every producer card on this machine can label the same standard deviation with
 * the same convention without mutating a game design or an outcome table.
 */
type VolatilityBandsState = {
    bands: VolatilityBands | undefined;
    save: (bands: VolatilityBands) => void;
    clear: () => void;
};

export function useVolatilityBands(): VolatilityBandsState {
    const bands = useSyncExternalStore(subscribeVolatilityBands, loadVolatilityBands, () => undefined);
    return {bands, save: saveVolatilityBands, clear: clearStoredVolatilityBands};
}
