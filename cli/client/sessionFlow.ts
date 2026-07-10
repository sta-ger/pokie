import {createSession, FetchLike, getSession} from "./apiClient.js";
import {clearSessionId, loadSessionId, saveSessionId, StorageLike} from "./sessionStorage.js";
import type {SessionResponse} from "./types.js";

// The create-or-restore orchestration behind "save the sessionId, restore it after a reload": if
// storage already has one, try to restore it from the API; a 404/unknown id is treated as stale
// (cleared) rather than fatal, falling back to creating a fresh session either way.
export async function ensureSession(
    fetchImpl: FetchLike,
    storage: StorageLike,
    apiBaseUrl: string,
): Promise<SessionResponse> {
    const existingId = loadSessionId(storage);
    if (existingId !== null) {
        const restored = await getSession(fetchImpl, apiBaseUrl, existingId);
        if (restored.ok && restored.body !== undefined) {
            return restored.body;
        }
        clearSessionId(storage);
    }

    const created = await createSession(fetchImpl, apiBaseUrl);
    saveSessionId(storage, created.sessionId);
    return created;
}
