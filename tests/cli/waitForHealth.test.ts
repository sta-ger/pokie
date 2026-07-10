import {waitForHealth} from "../../cli/waitForHealth.js";

type FakeResponse = {ok: boolean};

function createFakeFetch(responses: (FakeResponse | Error)[]): (url: string) => Promise<FakeResponse> {
    let callIndex = 0;
    return (): Promise<FakeResponse> => {
        const next = responses[Math.min(callIndex, responses.length - 1)];
        callIndex++;
        if (next instanceof Error) {
            return Promise.reject(next);
        }
        return Promise.resolve(next);
    };
}

describe("waitForHealth", () => {
    it("resolves as soon as the fetch responds ok", async () => {
        const fetchImpl = createFakeFetch([{ok: true}]);

        await expect(waitForHealth("http://example.test/health", {fetchImpl: fetchImpl as never})).resolves.toBeUndefined();
    });

    it("retries through non-ok responses and connection errors until one succeeds", async () => {
        const fetchImpl = createFakeFetch([{ok: false}, new Error("ECONNREFUSED"), {ok: true}]);

        await expect(
            waitForHealth("http://example.test/health", {fetchImpl: fetchImpl as never, intervalMs: 1}),
        ).resolves.toBeUndefined();
    });

    it("throws once the timeout elapses without a successful response", async () => {
        const fetchImpl = createFakeFetch([{ok: false}]);

        await expect(
            waitForHealth("http://example.test/health", {fetchImpl: fetchImpl as never, timeoutMs: 20, intervalMs: 5}),
        ).rejects.toThrow(/Timed out waiting for http:\/\/example.test\/health/);
    });
});
