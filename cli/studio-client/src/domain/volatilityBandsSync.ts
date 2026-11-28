import {getStudioPreferences, saveStudioVolatilityBands, type FetchLike} from "../api/apiClient";
import {hydrateVolatilityBands, loadVolatilityBands} from "./volatilityBandsStorage";

let syncedFetch: FetchLike | undefined;
let syncPromise: Promise<void> | undefined;

/**
 * Hydrate the browser cache from Studio's machine-local preferences once per API client. On the first
 * run after an upgrade, a browser-only value is promoted to the server instead of being discarded.
 */
export function syncVolatilityBandsFromServer(fetchImpl: FetchLike): Promise<void> {
    if (syncedFetch === fetchImpl && syncPromise !== undefined) return syncPromise;
    syncedFetch = fetchImpl;
    syncPromise = getStudioPreferences(fetchImpl)
        .then(async (view) => {
            if (view.volatilityBands !== undefined) {
                hydrateVolatilityBands(view.volatilityBands);
                return;
            }
            const browserValue = loadVolatilityBands();
            if (browserValue !== undefined) await saveStudioVolatilityBands(fetchImpl, browserValue);
        })
        .catch(() => {
            // A transient Studio restart must not pin the app to an empty cache for the whole session.
            syncedFetch = undefined;
            syncPromise = undefined;
        });
    return syncPromise;
}
