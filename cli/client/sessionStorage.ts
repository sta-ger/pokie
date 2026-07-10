// The subset of the Web Storage API (window.localStorage) this client needs — kept minimal and
// DOM-free so session-flow logic (sessionFlow.ts) is unit-testable with a trivial in-memory fake,
// without needing jsdom. A real window.localStorage structurally satisfies this with zero adapter
// code.
export interface StorageLike {
    getItem(key: string): string | null;

    setItem(key: string, value: string): void;

    removeItem(key: string): void;
}

const SESSION_ID_KEY = "pokie:sessionId";

export function saveSessionId(storage: StorageLike, sessionId: string): void {
    storage.setItem(SESSION_ID_KEY, sessionId);
}

export function loadSessionId(storage: StorageLike): string | null {
    return storage.getItem(SESSION_ID_KEY);
}

export function clearSessionId(storage: StorageLike): void {
    storage.removeItem(SESSION_ID_KEY);
}
