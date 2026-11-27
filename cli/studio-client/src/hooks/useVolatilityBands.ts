import {useCallback, useEffect, useSyncExternalStore} from "react";
import {clearStudioVolatilityBands, saveStudioVolatilityBands} from "../api/apiClient";
import {useStudioApi} from "../context/StudioApiProvider";
import type {VolatilityBands} from "../domain/volatilityBands";
import {
    clearStoredVolatilityBands,
    loadVolatilityBands,
    saveVolatilityBands,
    subscribeVolatilityBands,
} from "../domain/volatilityBandsStorage";
import {syncVolatilityBandsFromServer} from "../domain/volatilityBandsSync";

/**
 * Portfolio volatility bands are a Studio-local authoring preference, not project math. The browser
 * cache makes them immediate; Studio's preferences file makes them survive a browser or machine change.
 */
type VolatilityBandsState = {
    bands: VolatilityBands | undefined;
    save: (bands: VolatilityBands) => Promise<void>;
    clear: () => Promise<void>;
};

export function useVolatilityBands(): VolatilityBandsState {
    const fetchImpl = useStudioApi();
    useEffect(() => {
        syncVolatilityBandsFromServer(fetchImpl).catch(() => undefined);
    }, [fetchImpl]);
    const bands = useSyncExternalStore(subscribeVolatilityBands, loadVolatilityBands, () => undefined);
    const save = useCallback(async (next: VolatilityBands): Promise<void> => {
        await saveStudioVolatilityBands(fetchImpl, next);
        saveVolatilityBands(next);
    }, [fetchImpl]);
    const clear = useCallback(async (): Promise<void> => {
        await clearStudioVolatilityBands(fetchImpl);
        clearStoredVolatilityBands();
    }, [fetchImpl]);
    return {bands, save, clear};
}
