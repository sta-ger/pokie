import {startSimulation, type FetchLike} from "../../../cli/studio-client/src/api/apiClient.js";

describe("startSimulation request body", () => {
    it("sends only the convergence policy fields the server accepts", async () => {
        let body: Record<string, unknown> | undefined;
        const fetchImpl: FetchLike = (_url, init) => {
            body = JSON.parse(String(init?.body)) as Record<string, unknown>;
            return Promise.resolve({
                ok: true,
                status: 202,
                json: () => Promise.resolve({id: "job-1", status: "queued", rounds: 20_000, workers: 1}),
            } as unknown as Awaited<ReturnType<FetchLike>>);
        };

        const result = await startSimulation(fetchImpl, 20_000, "seed", 1, undefined, {
            minRounds: 5_000,
            rtpTolerance: 0.001,
            checkIntervalRounds: 1_000,
            stableChecks: 3,
            checksPerformed: 20,
            consecutiveStableChecks: 0,
            achievedRtpHalfWidth: 0.04637057000112865,
        } as never);

        expect(result.status).toBe("created");
        expect(body).toEqual({
            rounds: 20_000,
            seed: "seed",
            workers: 1,
            convergence: {
                minRounds: 5_000,
                rtpTolerance: 0.001,
                checkIntervalRounds: 1_000,
                stableChecks: 3,
            },
        });
    });

    it("omits a malformed captured policy rather than sending a server-rejected object", async () => {
        let body: Record<string, unknown> | undefined;
        const fetchImpl: FetchLike = (_url, init) => {
            body = JSON.parse(String(init?.body)) as Record<string, unknown>;
            return Promise.resolve({
                ok: true,
                status: 202,
                json: () => Promise.resolve({id: "job-2", status: "queued", rounds: 20_000}),
            } as unknown as Awaited<ReturnType<FetchLike>>);
        };

        await startSimulation(fetchImpl, 20_000, undefined, 1, undefined, {
            minRounds: 5_000,
            rtpTolerance: 0.001,
            checkIntervalRounds: 0,
            checksPerformed: 20,
        } as never);

        expect(body).not.toHaveProperty("convergence");
    });
});
