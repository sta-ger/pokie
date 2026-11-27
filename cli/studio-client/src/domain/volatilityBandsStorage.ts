import {parseVolatilityBands, VOLATILITY_BANDS_STORAGE_KEY, type VolatilityBands} from "./volatilityBands";

let cached: VolatilityBands | null | undefined;
const listeners = new Set<() => void>();
let storageListenerAttached = false;

function readStorage(): VolatilityBands | undefined {
    if (typeof window === "undefined") return undefined;
    try {
        const raw = window.localStorage.getItem(VOLATILITY_BANDS_STORAGE_KEY);
        if (raw === null) return undefined;
        return parseVolatilityBands(JSON.parse(raw));
    } catch {
        return undefined;
    }
}

function notify(): void {
    for (const listener of listeners) listener();
}

function attachStorageListener(): void {
    if (storageListenerAttached || typeof window === "undefined") return;
    storageListenerAttached = true;
    window.addEventListener("storage", (event) => {
        if (event.key !== VOLATILITY_BANDS_STORAGE_KEY) return;
        cached = undefined;
        notify();
    });
}

export function subscribeVolatilityBands(listener: () => void): () => void {
    attachStorageListener();
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function loadVolatilityBands(): VolatilityBands | undefined {
    if (cached === undefined) cached = readStorage() ?? null;
    return cached ?? undefined;
}

export function saveVolatilityBands(bands: VolatilityBands): void {
    const validated = parseVolatilityBands(bands);
    if (validated === undefined) return;
    cached = validated;
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(VOLATILITY_BANDS_STORAGE_KEY, JSON.stringify(validated));
        } catch {
            // Storage is a convenience; the in-memory value still applies for this tab.
        }
    }
    notify();
}

export function clearStoredVolatilityBands(): void {
    cached = null;
    if (typeof window !== "undefined") {
        try {
            window.localStorage.removeItem(VOLATILITY_BANDS_STORAGE_KEY);
        } catch {
            // See saveVolatilityBands: a blocked storage API must not break the UI.
        }
    }
    notify();
}

/** Replace the browser cache with the machine-local preference read from Studio. */
export function hydrateVolatilityBands(bands: VolatilityBands | undefined): void {
    if (bands === undefined) return;
    cached = bands;
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(VOLATILITY_BANDS_STORAGE_KEY, JSON.stringify(bands));
        } catch {
            // The in-memory value still applies; the server remains authoritative.
        }
    }
    notify();
}
