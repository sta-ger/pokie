import type {FetchLike} from "../../../cli/client/apiClient.js";
import {ensureSession, restoreSession} from "../../../cli/client/sessionFlow.js";
import type {StorageLike} from "../../../cli/client/sessionStorage.js";
import type {SessionResponse} from "../../../cli/client/types.js";

function storage(): StorageLike & {values: Map<string, string>} {
    const values = new Map<string, string>();
    return {
        values,
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
            values.set(key, value);
        },
        removeItem: (key) => {
            values.delete(key);
        },
    };
}

const restoredSession = {sessionId: "known-session"} as unknown as SessionResponse;

describe("client session restore", () => {
    it("reports an explicitly requested unknown session as not found", async () => {
        const fetchImpl: FetchLike = () => Promise.resolve({ok: false, status: 404, json: () => Promise.resolve({})});

        await expect(restoreSession(fetchImpl, "http://api", "missing")).resolves.toEqual({status: "not-found"});
    });

    it("returns the existing session for a known id", async () => {
        const fetchImpl: FetchLike = () =>
            Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(restoredSession)});

        await expect(restoreSession(fetchImpl, "http://api", "known-session")).resolves.toEqual({
            status: "ok",
            session: restoredSession,
        });
    });

    it("still falls back to a fresh session when a remembered id is stale", async () => {
        const memory = storage();
        memory.setItem("pokie:sessionId", "stale-session");
        const created = {sessionId: "new-session"} as unknown as SessionResponse;
        const fetchImpl: FetchLike = (url, init) =>
            Promise.resolve(url.endsWith("/sessions") && init?.method === "POST"
                ? {ok: true, status: 200, json: () => Promise.resolve(created)}
                : {ok: false, status: 404, json: () => Promise.resolve({})});

        await expect(ensureSession(fetchImpl, memory, "http://api")).resolves.toBe(created);
        expect(memory.getItem("pokie:sessionId")).toBe("new-session");
    });
});
