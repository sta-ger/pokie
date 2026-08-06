import {createSession, FetchLike, getSession} from "./apiClient.js";
import {clearSessionId, loadSessionId, saveSessionId, StorageLike} from "./sessionStorage.js";
import type {SessionResponse} from "./types.js";

// The create-or-restore orchestration behind "save the sessionId, restore it after a reload": if
// `preferredSessionId` is given (e.g. Studio's Play tab embeds this player with `?session=<id>`,
// pointing it at a session Studio already created/restored through its own API -- see PlayTab.tsx's own
// doc comment for why that must be the exact same session, not a second, unrelated one this player would
// otherwise create on its own), it's tried first, ahead of whatever storage already has. Otherwise falls
// back to storage's own remembered sessionId. Either way, a 404/unknown id is treated as stale (cleared)
// rather than fatal, falling back to creating a fresh session.
export async function ensureSession(
    fetchImpl: FetchLike,
    storage: StorageLike,
    apiBaseUrl: string,
    preferredSessionId?: string,
): Promise<SessionResponse> {
    const existingId = preferredSessionId ?? loadSessionId(storage);
    if (existingId !== null && existingId !== undefined) {
        const restored = await getSession(fetchImpl, apiBaseUrl, existingId);
        if (restored.ok && restored.body !== undefined) {
            saveSessionId(storage, existingId);
            return restored.body;
        }
        clearSessionId(storage);
    }

    const created = await createSession(fetchImpl, apiBaseUrl);
    saveSessionId(storage, created.sessionId);
    return created;
}
