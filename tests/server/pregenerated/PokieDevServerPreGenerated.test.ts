import {
    InMemoryPreGeneratedSessionRepository,
    PokieDevServer,
    PokieGame,
    PokieGameManifest,
    PreGeneratedLibraryProvenanceMismatchError,
    PreGeneratedRoundReplayer,
    RoundArtifactProvenance,
    VersionedPreGeneratedSessionRepository,
    WeightedOutcomeLibrary,
    buildWeightedOutcomeLibrary,
    computeWeightedOutcomeLibraryHash,
} from "pokie";
import {artifactWith} from "../../weightedoutcome/WeightedOutcomeTestFixtures.js";

// Mirrors PreGeneratedSpinCommandHandler.test.ts's own racing-repository helper, one level up: forces
// a version conflict at the HTTP layer by sneaking in an unrelated saveVersioned() the first time
// loadVersioned() is called for a sessionId.
function createRacingSessionRepository(real: InMemoryPreGeneratedSessionRepository): VersionedPreGeneratedSessionRepository {
    let raced = false;
    return {
        load: (sessionId) => real.load(sessionId),
        save: (sessionId, state) => real.save(sessionId, state),
        loadVersioned: async (sessionId) => {
            const versioned = await real.loadVersioned(sessionId);
            if (versioned !== undefined && !raced) {
                raced = true;
                await real.saveVersioned(sessionId, versioned.state, versioned.version);
            }
            return versioned;
        },
        saveVersioned: (sessionId, state, expectedVersion) => real.saveVersioned(sessionId, state, expectedVersion),
    };
}

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

    describe("library provenance vs. loaded game manifest", () => {
        it("throws PreGeneratedLibraryProvenanceMismatchError at construction when the library was built for a different game", () => {
            const otherGameProvenance: RoundArtifactProvenance = {
                game: {id: "a-different-game", name: "A Different Game", version: "9.9.9"},
                pokieVersion: "1.3.0",
            };
            const mismatchedLibrary = buildWeightedOutcomeLibrary({
                libraryId: "mismatched-library",
                outcomes: [
                    {id: "only", weight: 1, artifact: artifactWith({roundId: "only", totalWin: 0, stake: 1, provenance: otherGameProvenance})},
                ],
            });

            expect(
                () =>
                    new PokieDevServer(createFakeGame(manifest), {
                        host: "127.0.0.1",
                        port: 0,
                        preGeneratedOutcomeLibrary: mismatchedLibrary,
                    }),
            ).toThrow(PreGeneratedLibraryProvenanceMismatchError);
        });

        it("starts normally when the library's provenance matches the loaded game's manifest", () => {
            const matchingLibrary = buildLibrary();
            expect(
                () =>
                    new PokieDevServer(createFakeGame(manifest), {
                        host: "127.0.0.1",
                        port: 0,
                        preGeneratedOutcomeLibrary: matchingLibrary,
                    }),
            ).not.toThrow();
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

    describe("409 conflict responses", () => {
        it("returns 409 when a session's own libraryId/libraryHash doesn't match the configured library", async () => {
            const library = buildLibrary();
            const sessionRepository = new InMemoryPreGeneratedSessionRepository();
            const server = new PokieDevServer(createFakeGame(manifest), {
                host: "127.0.0.1",
                port: 0,
                preGeneratedOutcomeLibrary: library,
                preGeneratedSessionRepository: sessionRepository,
            });
            const address = await server.start();
            const baseUrl = `http://${address.host}:${address.port}`;
            try {
                // Simulates a session created against a library that has since been swapped out from
                // under this server (or a stale session persisted from before a redeploy) — directly
                // seeding a mismatched libraryHash rather than going through POST /pregenerated-sessions,
                // which would always stamp the currently configured library's own hash.
                await sessionRepository.save("stale-session", {
                    libraryId: library.libraryId,
                    libraryHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
                    seed: "seed-1",
                    roundsPlayed: 0,
                });

                const {status, body} = await postJson(`${baseUrl}/pregenerated-sessions/stale-session/spin`);

                expect(status).toBe(409);
                expect(typeof body.error).toBe("string");
            } finally {
                await server.stop();
            }
        });

        it("returns 409 and leaves the wallet untouched when the session's version goes stale before it can save", async () => {
            const library = buildLibrary();
            const realRepository = new InMemoryPreGeneratedSessionRepository();
            const racingRepository = createRacingSessionRepository(realRepository);
            const server = new PokieDevServer(createFakeGame(manifest), {
                host: "127.0.0.1",
                port: 0,
                preGeneratedOutcomeLibrary: library,
                preGeneratedSessionRepository: racingRepository,
            });
            const address = await server.start();
            const baseUrl = `http://${address.host}:${address.port}`;
            try {
                const created = await postJson(`${baseUrl}/pregenerated-sessions`, {seed: "seed-1", initialBalance: 1000});
                const sessionId = created.body.sessionId as string;

                const {status, body} = await postJson(`${baseUrl}/pregenerated-sessions/${sessionId}/spin`);

                expect(status).toBe(409);
                expect(typeof body.error).toBe("string");
            } finally {
                await server.stop();
            }
        });
    });
});
