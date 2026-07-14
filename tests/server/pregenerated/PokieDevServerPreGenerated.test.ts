import {
    PokieDevServer,
    PokieGame,
    PokieGameManifest,
    PreGeneratedRoundReplayer,
    WeightedOutcomeLibrary,
    buildWeightedOutcomeLibrary,
    computeWeightedOutcomeLibraryHash,
} from "pokie";
import {artifactWith} from "../../weightedoutcome/WeightedOutcomeTestFixtures";

function buildLibrary(): WeightedOutcomeLibrary<string> {
    return buildWeightedOutcomeLibrary({
        libraryId: "server-test-library",
        outcomes: [
            {id: "no-win", weight: 70, artifact: artifactWith({roundId: "no-win", totalWin: 0, stake: 1})},
            {id: "small-win", weight: 25, artifact: artifactWith({roundId: "small-win", totalWin: 5, stake: 1})},
            {id: "jackpot", weight: 5, artifact: artifactWith({roundId: "jackpot", totalWin: 500, stake: 1})},
        ],
    });
}

function createFakeGame(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            throw new Error("createSession must never be called on the pre-generated round path");
        },
    };
}

function createFakeGameWithWorkingSession(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => ({
            getCreditsAmount: () => 1000,
            setCreditsAmount: () => undefined,
            getBet: () => 5,
            setBet: () => undefined,
            getAvailableBets: () => [5],
            canPlayNextGame: () => true,
            play: () => undefined,
            getWinAmount: () => 0,
        }),
    };
}

async function postJson(url: string, body?: unknown): Promise<{status: number; body: Record<string, unknown>}> {
    const response = await fetch(url, {
        method: "POST",
        headers: body === undefined ? undefined : {"Content-Type": "application/json"},
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {status: response.status, body: (await response.json()) as Record<string, unknown>};
}

describe("PokieDevServer — pre-generated rounds (opt-in, additive)", () => {
    const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

    describe("without preGeneratedOutcomeLibrary configured", () => {
        let server: PokieDevServer;
        let baseUrl: string;

        beforeEach(async () => {
            server = new PokieDevServer(createFakeGame(manifest), {host: "127.0.0.1", port: 0});
            const address = await server.start();
            baseUrl = `http://${address.host}:${address.port}`;
        });

        afterEach(async () => {
            await server.stop();
        });

        it("404s on POST /pregenerated-sessions", async () => {
            const {status} = await postJson(`${baseUrl}/pregenerated-sessions`);
            expect(status).toBe(404);
        });

        it("404s on POST /pregenerated-sessions/:id/spin", async () => {
            const {status} = await postJson(`${baseUrl}/pregenerated-sessions/anything/spin`);
            expect(status).toBe(404);
        });

    });

    describe("leaves the existing /sessions routes completely unaffected", () => {
        it("POST /sessions still creates a live session normally when no pre-generated library is configured", async () => {
            const server = new PokieDevServer(createFakeGameWithWorkingSession(manifest), {host: "127.0.0.1", port: 0});
            const address = await server.start();
            try {
                const {status, body} = await postJson(`http://${address.host}:${address.port}/sessions`);
                expect(status).toBe(201);
                expect(typeof body.sessionId).toBe("string");
            } finally {
                await server.stop();
            }
        });
    });

    describe("with preGeneratedOutcomeLibrary configured", () => {
        let library: WeightedOutcomeLibrary<string>;
        let libraryHash: string;
        let server: PokieDevServer;
        let baseUrl: string;

        beforeEach(async () => {
            library = buildLibrary();
            libraryHash = computeWeightedOutcomeLibraryHash(library);
            server = new PokieDevServer(createFakeGame(manifest), {
                host: "127.0.0.1",
                port: 0,
                preGeneratedOutcomeLibrary: library,
            });
            const address = await server.start();
            baseUrl = `http://${address.host}:${address.port}`;
        });

        afterEach(async () => {
            await server.stop();
        });

        it("creates a pre-generated session with an explicit seed and initial balance", async () => {
            const {status, body} = await postJson(`${baseUrl}/pregenerated-sessions`, {seed: "fixed-seed", initialBalance: 1000});

            expect(status).toBe(201);
            expect(typeof body.sessionId).toBe("string");
            expect(body.game).toEqual({id: manifest.id, name: manifest.name, version: manifest.version});
            expect(body.credits).toBe(1000);
        });

        it("spins a pre-generated round, settles the wallet, and returns only public fields by default", async () => {
            const {body: created} = await postJson(`${baseUrl}/pregenerated-sessions`, {seed: "fixed-seed", initialBalance: 1000});
            const sessionId = created.sessionId as string;

            const {status, body} = await postJson(`${baseUrl}/pregenerated-sessions/${sessionId}/spin`);

            expect(status).toBe(200);
            expect(body.sessionId).toBe(sessionId);
            expect(typeof body.roundId).toBe("string");
            expect(typeof body.win).toBe("number");
            expect(typeof body.credits).toBe("number");
            expect(Array.isArray(body.screen)).toBe(true);
            expect(Array.isArray(body.wins)).toBe(true);
            expect(body.internal).toBeUndefined();
            expect(body.selection).toBeUndefined();
        });

        it("returns 404 for spinning an unknown pre-generated session", async () => {
            const {status} = await postJson(`${baseUrl}/pregenerated-sessions/unknown-session/spin`);
            expect(status).toBe(404);
        });

        it("includes the full audit trail only under ?debug=1, matching the library's selection provenance", async () => {
            const {body: created} = await postJson(`${baseUrl}/pregenerated-sessions`, {seed: "debug-seed", initialBalance: 1000});
            const sessionId = created.sessionId as string;

            const {status, body} = await postJson(`${baseUrl}/pregenerated-sessions/${sessionId}/spin?debug=1`);

            expect(status).toBe(200);
            const internal = body.internal as {
                selection: {libraryId: string; libraryHash: string; outcomeId: string; weight: number};
                runtime: {roundId: string; transactions: unknown[]};
                artifact: {roundId: string};
            };
            expect(internal.selection.libraryId).toBe(library.libraryId);
            expect(internal.selection.libraryHash).toBe(libraryHash);
            expect(library.outcomes.some((outcome) => outcome.id === internal.selection.outcomeId)).toBe(true);
            expect(internal.runtime.roundId).toBe(body.roundId);
            expect(internal.artifact.roundId).toBe(internal.selection.outcomeId);
        });

        it("replays an idempotent retry (same requestId) without drawing a new round", async () => {
            const {body: created} = await postJson(`${baseUrl}/pregenerated-sessions`, {seed: "idempotent-seed", initialBalance: 1000});
            const sessionId = created.sessionId as string;

            const first = await postJson(`${baseUrl}/pregenerated-sessions/${sessionId}/spin`, {requestId: "req-1"});
            const second = await postJson(`${baseUrl}/pregenerated-sessions/${sessionId}/spin`, {requestId: "req-1"});

            expect(second.body).toEqual(first.body);
        });

        it("agrees with PreGeneratedRoundReplayer's pure reconstruction of round 1 for the session's own seed", async () => {
            const {body: created} = await postJson(`${baseUrl}/pregenerated-sessions`, {seed: "replayable-seed", initialBalance: 1000});
            const sessionId = created.sessionId as string;

            const {body: spinResponse} = await postJson(`${baseUrl}/pregenerated-sessions/${sessionId}/spin?debug=1`);
            const outcomeId = (spinResponse.internal as {selection: {outcomeId: string}}).selection.outcomeId;

            const replayed = new PreGeneratedRoundReplayer().replay({library, libraryHash, seed: "replayable-seed", round: 1});
            expect(replayed.outcomeId).toBe(outcomeId);
        });
    });
});
