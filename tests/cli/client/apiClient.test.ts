import {createSession, FetchLike, getSession, spin} from "../../../cli/client/apiClient.js";

type FakeCall = {url: string; init?: {method?: string; headers?: Record<string, string>; body?: string}};

function createFakeFetch(handler: (call: FakeCall) => {ok: boolean; status: number; body: unknown}): {
    fetchImpl: FetchLike;
    calls: FakeCall[];
} {
    const calls: FakeCall[] = [];
    const fetchImpl: FetchLike = (url, init) => {
        calls.push({url, init});
        const response = handler({url, init});
        return Promise.resolve({ok: response.ok, status: response.status, json: () => Promise.resolve(response.body)});
    };
    return {fetchImpl, calls};
}

describe("apiClient", () => {
    describe("createSession", () => {
        it("POSTs to /sessions with no body when no seed is given", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({
                ok: true,
                status: 201,
                body: {sessionId: "s1", game: {id: "g", name: "G", version: "1.0.0"}, credits: 1000},
            }));

            const result = await createSession(fetchImpl, "http://api.test", undefined);

            expect(calls).toEqual([{url: "http://api.test/sessions", init: {method: "POST", headers: undefined, body: undefined}}]);
            expect(result.sessionId).toBe("s1");
        });

        it("POSTs a JSON seed body when a seed is given", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({
                ok: true,
                status: 201,
                body: {sessionId: "s1", game: {id: "g", name: "G", version: "1.0.0"}, credits: 1000},
            }));

            await createSession(fetchImpl, "http://api.test", "demo-seed");

            expect(calls[0].init?.body).toBe(JSON.stringify({seed: "demo-seed"}));
            expect(calls[0].init?.headers).toEqual({"Content-Type": "application/json"});
        });

        it("throws when the API responds non-ok", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 500, body: {}}));

            await expect(createSession(fetchImpl, "http://api.test")).rejects.toThrow(/HTTP 500/);
        });
    });

    describe("getSession", () => {
        it("returns ok:true with the body on success", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({
                ok: true,
                status: 200,
                body: {sessionId: "s1", game: {id: "g", name: "G", version: "1.0.0"}, credits: 995},
            }));

            const result = await getSession(fetchImpl, "http://api.test", "s1");

            expect(calls[0].url).toBe("http://api.test/sessions/s1");
            expect(result).toEqual({ok: true, body: {sessionId: "s1", game: {id: "g", name: "G", version: "1.0.0"}, credits: 995}});
        });

        it("returns ok:false without a body on a 404", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 404, body: {error: "not found"}}));

            const result = await getSession(fetchImpl, "http://api.test", "does-not-exist");

            expect(result).toEqual({ok: false});
        });

        it("encodes the sessionId in the URL", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: {sessionId: "a/b", game: {}, credits: 0}}));

            await getSession(fetchImpl, "http://api.test", "a/b");

            expect(calls[0].url).toBe("http://api.test/sessions/a%2Fb");
        });
    });

    describe("spin", () => {
        it("POSTs to /sessions/:id/spin with no body when no requestId is given", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({
                ok: true,
                status: 200,
                body: {sessionId: "s1", game: {id: "g", name: "G", version: "1.0.0"}, credits: 995, win: 0},
            }));

            await spin(fetchImpl, "http://api.test", "s1");

            expect(calls).toEqual([
                {url: "http://api.test/sessions/s1/spin", init: {method: "POST", headers: undefined, body: undefined}},
            ]);
        });

        it("includes a JSON requestId body when given", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({
                ok: true,
                status: 200,
                body: {sessionId: "s1", game: {}, credits: 995},
            }));

            await spin(fetchImpl, "http://api.test", "s1", "req-1");

            expect(calls[0].init?.body).toBe(JSON.stringify({requestId: "req-1"}));
        });

        it("throws with the server's own error message when the spin is blocked", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: "cannot play next round"}}));

            await expect(spin(fetchImpl, "http://api.test", "s1")).rejects.toThrow("cannot play next round");
        });

        it("falls back to a generic message when the error body isn't parseable JSON", async () => {
            const fetchImpl: FetchLike = () =>
                Promise.resolve({
                    ok: false,
                    status: 500,
                    json: () => Promise.reject(new Error("not json")),
                });

            await expect(spin(fetchImpl, "http://api.test", "s1")).rejects.toThrow(/HTTP 500/);
        });
    });
});
