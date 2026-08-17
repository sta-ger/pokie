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

    it("starts a new seeded session instead of restoring a previously saved unseeded session", async () => {
        const storage = createInMemoryStorage("old-session");
        const requestedUrls: string[] = [];
        const requestedBodies: Array<string | undefined> = [];
        const fetchImpl: FetchLike = (url, init) => {
            requestedUrls.push(url);
            requestedBodies.push(init?.body);
            return Promise.resolve({
                ok: true,
                status: 201,
                json: () => Promise.resolve({sessionId: "seeded-session", game: {id: "g", name: "G", version: "1.0.0"}, credits: 1000}),
            });
        };

        const result = await ensureSession(fetchImpl, storage, "http://api.test", undefined, "fixture-round");

        expect(requestedUrls).toEqual(["http://api.test/sessions"]);
        expect(requestedBodies).toEqual([JSON.stringify({seed: "fixture-round"})]);
        expect(result.sessionId).toBe("seeded-session");
        expect(loadSessionId(storage)).toBe("seeded-session");
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

    it("restores the preferred sessionId (Studio's Play tab own ?session= handoff) over whatever storage already has, and saves it", async () => {
        const storage = createInMemoryStorage("stored-session");
        const requestedUrls: string[] = [];
        const fetchImpl: FetchLike = (url) => {
            requestedUrls.push(url);
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({sessionId: "preferred-session", game: {id: "g", name: "G", version: "1.0.0"}, credits: 500}),
            });
        };

        const result = await ensureSession(fetchImpl, storage, "http://api.test", "preferred-session");

        expect(requestedUrls).toEqual(["http://api.test/sessions/preferred-session"]);
        expect(result.sessionId).toBe("preferred-session");
        expect(loadSessionId(storage)).toBe("preferred-session");
    });

    it("falls back to creating a fresh session when the preferred sessionId doesn't exist on the server", async () => {
        const storage = createInMemoryStorage();
        const requestedUrls: string[] = [];
        const fetchImpl: FetchLike = (url) => {
            requestedUrls.push(url);
            if (url.endsWith("/gone-session")) {
                return Promise.resolve({ok: false, status: 404, json: () => Promise.resolve({error: "not found"})});
            }
            return Promise.resolve({
                ok: true,
                status: 201,
                json: () => Promise.resolve({sessionId: "fresh-session", game: {id: "g", name: "G", version: "1.0.0"}, credits: 1000}),
            });
        };

        const result = await ensureSession(fetchImpl, storage, "http://api.test", "gone-session");

        expect(requestedUrls).toEqual(["http://api.test/sessions/gone-session", "http://api.test/sessions"]);
        expect(result.sessionId).toBe("fresh-session");
        expect(loadSessionId(storage)).toBe("fresh-session");
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
