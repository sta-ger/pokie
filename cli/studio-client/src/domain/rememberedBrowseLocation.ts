const STORAGE_KEY_PREFIX = "pokie-studio:browse-location:";

// The "remembered type location" rung of a path field's start-location precedence (see
// resolveBrowseStartLocation.ts) -- the last folder a native/fallback picker was actually pointed at for
// this specific field's own `browseId` (e.g. "create-project-destination"), scoped per browser since
// Studio never persists per-user UI preferences server-side. Wrapped in try/catch: a private-
// browsing/storage-disabled browser must never break Browse, only silently skip this one rung.
export function getRememberedBrowseLocation(browseId: string): string | undefined {
    try {
        return localStorage.getItem(STORAGE_KEY_PREFIX + browseId) ?? undefined;
    } catch {
        return undefined;
    }
}

export function setRememberedBrowseLocation(browseId: string, directory: string): void {
    try {
        localStorage.setItem(STORAGE_KEY_PREFIX + browseId, directory);
    } catch {
        // Best-effort only -- see the doc comment above.
    }
}
