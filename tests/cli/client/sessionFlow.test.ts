import {FetchLike} from "../../../cli/client/apiClient.js";
import {ensureSession} from "../../../cli/client/sessionFlow.js";
import {loadSessionId, StorageLike} from "../../../cli/client/sessionStorage.js";

function createInMemoryStorage(initial?: string): StorageLike {
    const map = new Map<string, string>();
    if (initial !== undefined) {
        map.set("pokie:sessionId", initial);
    }
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
            map.set(key, value);
        },
        removeItem: (key) => {
            map.delete(key);
        },
    };
}

describe("ensureSession", () => {
    it("creates and saves a new session when storage has no sessionId yet", async () => {
        const storage = createInMemoryStorage();
        let createCalls = 0;
        const fetchImpl: FetchLike = (url) => {
            expect(url).toBe("http://api.test/sessions");
            createCalls++;
            return Promise.resolve({
                ok: true,
                status: 201,
                json: () => Promise.resolve({sessionId: "new-session", game: {id: "g", name: "G", version: "1.0.0"}, credits: 1000}),
            });
        };

        const result = await ensureSession(fetchImpl, storage, "http://api.test");

        expect(createCalls).toBe(1);
        expect(result.sessionId).toBe("new-session");
        expect(loadSessionId(storage)).toBe("new-session");
    });

    it("restores the stored session via GET when it still exists on the server", async () => {
        const storage = createInMemoryStorage("existing-session");
        const fetchImpl: FetchLike = (url) => {
            expect(url).toBe("http://api.test/sessions/existing-session");
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({sessionId: "existing-session", game: {id: "g", name: "G", version: "1.0.0"}, credits: 995}),
            });
        };

        const result = await ensureSession(fetchImpl, storage, "http://api.test");

        expect(result.sessionId).toBe("existing-session");
        expect(result.credits).toBe(995);
    });

    it("clears a stale sessionId and creates a fresh session when the stored one 404s", async () => {
        const storage = createInMemoryStorage("stale-session");
        const requestedUrls: string[] = [];
        const fetchImpl: FetchLike = (url) => {
            requestedUrls.push(url);
            if (url.endsWith("/stale-session")) {
                return Promise.resolve({ok: false, status: 404, json: () => Promise.resolve({error: "not found"})});
            }
            return Promise.resolve({
                ok: true,
                status: 201,
                json: () => Promise.resolve({sessionId: "fresh-session", game: {id: "g", name: "G", version: "1.0.0"}, credits: 1000}),
            });
        };

        const result = await ensureSession(fetchImpl, storage, "http://api.test");

        expect(requestedUrls).toEqual(["http://api.test/sessions/stale-session", "http://api.test/sessions"]);
        expect(result.sessionId).toBe("fresh-session");
        expect(loadSessionId(storage)).toBe("fresh-session");
    });
});
