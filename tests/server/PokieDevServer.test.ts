import {
    BuildableFromSessionState,
    ConvertableToSessionState,
    FileSessionRepository,
    GameSessionHandling,
    InMemorySessionRepository,
    InMemoryWallet,
    loadPokieGame,
    PokieDevServer,
    PokieGame,
    PokieGameManifest,
    VideoSlotWithFreeGamesSession,
} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";

function createFakeSession(): GameSessionHandling & {getSymbolsCombination(): {toMatrix(): string[][]}} {
    let credits = 1000;
    const bet = 5;
    let round = 0;
    let winAmount = 0;

    return {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: () => undefined,
        getAvailableBets: () => [bet],
        canPlayNextGame: () => credits >= bet,
        play: () => {
            round++;
            winAmount = round % 2 === 0 ? bet * 3 : 0;
            credits = credits - bet + winAmount;
        },
        getWinAmount: () => winAmount,
        getSymbolsCombination: () => ({toMatrix: () => [[`round-${round}`]]}),
    };
}

function createFakeGame(manifest: PokieGameManifest): PokieGame & {createdWith?: unknown} {
    return {
        getManifest: () => manifest,
        createSession(context) {
            this.createdWith = context;
            return createFakeSession();
        },
    };
}

type FreeGamesState = {freeSpinsRemaining: number};

type FakeFreeGamesSession = GameSessionHandling &
    ConvertableToSessionState<FreeGamesState> &
    BuildableFromSessionState<FreeGamesState> & {
        grantFreeSpins(count: number): void;
    };

// A minimal stand-in for a game with an in-progress bonus round (e.g. VideoSlotWithFreeGamesSession's
// free-games state): once granted, free spins pay out without charging a bet, decrementing until none
// remain. Implements ConvertableToSessionState/BuildableFromSessionState so PokieDevServer can persist
// and restore that "still mid-feature" state across a simulated restart.
function createFakeFreeGamesSession(): FakeFreeGamesSession {
    let credits = 0;
    const bet = 5;
    let winAmount = 0;
    let freeSpinsRemaining = 0;

    return {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: () => undefined,
        getAvailableBets: () => [bet],
        canPlayNextGame: () => true,
        play: () => {
            if (freeSpinsRemaining > 0) {
                freeSpinsRemaining--;
                winAmount = 20;
            } else {
                winAmount = 0;
                credits -= bet;
            }
        },
        getWinAmount: () => winAmount,
        toSessionState: () => ({freeSpinsRemaining}),
        fromSessionState(value: FreeGamesState) {
            freeSpinsRemaining = value.freeSpinsRemaining;
            return this;
        },
        grantFreeSpins: (count: number) => {
            freeSpinsRemaining = count;
        },
    };
}

function createFakeFreeGamesGame(manifest: PokieGameManifest): PokieGame & {lastSession?: FakeFreeGamesSession} {
    return {
        getManifest: () => manifest,
        createSession() {
            const session = createFakeFreeGamesSession();
            this.lastSession = session;
            return session;
        },
    };
}

function createRealFreeGamesGame(
    manifest: PokieGameManifest,
): PokieGame & {lastSession?: VideoSlotWithFreeGamesSession} {
    return {
        getManifest: () => manifest,
        createSession() {
            const session = new VideoSlotWithFreeGamesSession();
            this.lastSession = session;
            return session;
        },
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

async function getJson(url: string): Promise<{status: number; body: Record<string, unknown>}> {
    const response = await fetch(url);
    return {status: response.status, body: (await response.json()) as Record<string, unknown>};
}

describe("PokieDevServer (fake game, real HTTP over an ephemeral port)", () => {
    const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
    let game: PokieGame & {createdWith?: unknown};
    let server: PokieDevServer;
    let baseUrl: string;

    beforeEach(async () => {
        game = createFakeGame(manifest);
        // No wallet configured: the default InMemoryWallet seeds a new session's balance from the
        // fake session's own default credits (1000) — see the "replaceable session storage" describe
        // block below for the explicit-wallet-vs-default-wallet distinction this relies on.
        server = new PokieDevServer(game, {host: "127.0.0.1", port: 0});
        const address = await server.start();
        baseUrl = `http://${address.host}:${address.port}`;
    });

    afterEach(async () => {
        await server.stop();
    });

    it("responds to GET /health", async () => {
        const {status, body} = await getJson(`${baseUrl}/health`);

        expect(status).toBe(200);
        expect(body).toEqual({status: "ok"});
    });

    it("responds to GET /game with the game manifest", async () => {
        const {status, body} = await getJson(`${baseUrl}/game`);

        expect(status).toBe(200);
        expect(body).toEqual(manifest);
    });

    it("creates a session on POST /sessions", async () => {
        const {status, body} = await postJson(`${baseUrl}/sessions`);

        expect(status).toBe(201);
        expect(typeof body.sessionId).toBe("string");
        expect((body.sessionId as string).length).toBeGreaterThan(0);
        expect(body.game).toEqual({id: manifest.id, name: manifest.name, version: manifest.version});
        expect(body.bet).toBe(5);
        expect(body.credits).toBe(1000);
        expect(body.win).toBeUndefined();
    });

    it("forwards an optional seed from the POST /sessions body as context", async () => {
        await postJson(`${baseUrl}/sessions`, {seed: "demo-seed"});

        expect(game.createdWith).toEqual({seed: "demo-seed"});
    });

    it("changes session state on POST /sessions/:sessionId/spin", async () => {
        const created = await postJson(`${baseUrl}/sessions`);
        const sessionId = created.body.sessionId as string;

        const first = await postJson(`${baseUrl}/sessions/${sessionId}/spin`);
        expect(first.status).toBe(200);
        expect(first.body.sessionId).toBe(sessionId);
        expect(first.body.game).toEqual({id: manifest.id, name: manifest.name, version: manifest.version});
        expect(first.body.bet).toBe(5);
        expect(first.body.win).toBe(0);
        expect(first.body.credits).toBe(995);
        expect(first.body.screen).toEqual([["round-1"]]);

        const second = await postJson(`${baseUrl}/sessions/${sessionId}/spin`);
        expect(second.body.win).toBe(15);
        expect(second.body.credits).toBe(1005);
        expect(second.body.screen).toEqual([["round-2"]]);
    });

    it("returns the same result for a repeated requestId on POST /sessions/:sessionId/spin, without spinning again", async () => {
        const created = await postJson(`${baseUrl}/sessions`);
        const sessionId = created.body.sessionId as string;

        const first = await postJson(`${baseUrl}/sessions/${sessionId}/spin`, {requestId: "retry-1"});
        expect(first.status).toBe(200);
        expect(first.body.win).toBe(0);
        expect(first.body.credits).toBe(995);
        expect(first.body.screen).toEqual([["round-1"]]);

        const replay = await postJson(`${baseUrl}/sessions/${sessionId}/spin`, {requestId: "retry-1"});
        expect(replay.body).toEqual(first.body);

        // A distinct requestId spins for real, proving the replay above didn't just coincidentally match.
        const nextRequest = await postJson(`${baseUrl}/sessions/${sessionId}/spin`, {requestId: "retry-2"});
        expect(nextRequest.body.win).toBe(15);
        expect(nextRequest.body.credits).toBe(1005);
    });

    it("returns 400 when the spin request body's requestId is not a string", async () => {
        const created = await postJson(`${baseUrl}/sessions`);
        const sessionId = created.body.sessionId as string;

        const {status, body} = await postJson(`${baseUrl}/sessions/${sessionId}/spin`, {requestId: 42});

        expect(status).toBe(400);
        expect(typeof body.error).toBe("string");
    });

    it("returns 404 for an unknown sessionId", async () => {
        const {status, body} = await postJson(`${baseUrl}/sessions/does-not-exist/spin`);

        expect(status).toBe(404);
        expect(typeof body.error).toBe("string");
    });

    it("restores session state on GET /sessions/:sessionId, before and after a spin", async () => {
        const created = await postJson(`${baseUrl}/sessions`);
        const sessionId = created.body.sessionId as string;

        const restoredBeforeSpin = await getJson(`${baseUrl}/sessions/${sessionId}`);
        expect(restoredBeforeSpin.status).toBe(200);
        expect(restoredBeforeSpin.body.sessionId).toBe(sessionId);
        expect(restoredBeforeSpin.body.game).toEqual({id: manifest.id, name: manifest.name, version: manifest.version});
        expect(restoredBeforeSpin.body.bet).toBe(5);
        expect(restoredBeforeSpin.body.win).toBe(0);
        expect(restoredBeforeSpin.body.credits).toBe(1000);

        const spun = await postJson(`${baseUrl}/sessions/${sessionId}/spin`);
        expect(spun.body.win).toBe(0);
        expect(spun.body.credits).toBe(995);

        const restoredAfterSpin = await getJson(`${baseUrl}/sessions/${sessionId}`);
        expect(restoredAfterSpin.status).toBe(200);
        expect(restoredAfterSpin.body.sessionId).toBe(sessionId);
        expect(restoredAfterSpin.body.bet).toBe(5);
        expect(restoredAfterSpin.body.win).toBe(0);
        expect(restoredAfterSpin.body.credits).toBe(995);
        expect(restoredAfterSpin.body.screen).toEqual([["round-1"]]);
    });

    it("returns 404 for GET /sessions/:sessionId with an unknown sessionId", async () => {
        const {status, body} = await getJson(`${baseUrl}/sessions/does-not-exist`);

        expect(status).toBe(404);
        expect(typeof body.error).toBe("string");
    });

    it("returns 404 for an unknown route", async () => {
        const {status, body} = await getJson(`${baseUrl}/unknown`);

        expect(status).toBe(404);
        expect(typeof body.error).toBe("string");
    });
});

describe("PokieDevServer (replaceable session storage: DI, restart, unknown sessions)", () => {
    const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

    it("restores session state through a shared SessionRepository across independent server instances (simulated restart)", async () => {
        const game = createFakeGame(manifest);
        const sharedRepository = new InMemorySessionRepository();

        const serverA = new PokieDevServer(game, {host: "127.0.0.1", port: 0, sessionRepository: sharedRepository});
        const addressA = await serverA.start();
        const baseUrlA = `http://${addressA.host}:${addressA.port}`;

        const created = await postJson(`${baseUrlA}/sessions`);
        const sessionId = created.body.sessionId as string;
        const spun = await postJson(`${baseUrlA}/sessions/${sessionId}/spin`);
        expect(spun.status).toBe(200);

        await serverA.stop();

        // serverB has its own empty liveSessions cache and its own default InMemoryWallet — only
        // sessionRepository is shared, simulating a process restart against durable storage.
        const serverB = new PokieDevServer(game, {host: "127.0.0.1", port: 0, sessionRepository: sharedRepository});
        const addressB = await serverB.start();
        const baseUrlB = `http://${addressB.host}:${addressB.port}`;

        const restored = await getJson(`${baseUrlB}/sessions/${sessionId}`);
        expect(restored.status).toBe(200);
        expect(restored.body.bet).toBe(spun.body.bet);
        expect(restored.body.win).toBe(spun.body.win);
        expect(restored.body.screen).toEqual(spun.body.screen);
        // Credits are explicitly not part of the persisted state: a fresh default InMemoryWallet
        // means the balance resets even though the game state (bet/win/screen) survived.
        expect(restored.body.credits).toBe(0);

        // The reconstructed session (credits: 0, bet: 5) correctly can't play the next round anymore
        // — this also proves the spin path's own cache-miss reconstruction ran (GET never reconstructs
        // a live session at all), and that the new canPlayNextGame() gate applies to it just the same.
        const spunAgain = await postJson(`${baseUrlB}/sessions/${sessionId}/spin`);
        expect(spunAgain.status).toBe(400);
        expect(typeof spunAgain.body.error).toBe("string");

        await serverB.stop();
    });

    it("returns 404 on GET for an unknown sessionId with a custom SessionRepository", async () => {
        const game = createFakeGame(manifest);
        const server = new PokieDevServer(game, {
            host: "127.0.0.1",
            port: 0,
            sessionRepository: new InMemorySessionRepository(),
        });
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}`;

        const {status, body} = await getJson(`${baseUrl}/sessions/does-not-exist`);

        expect(status).toBe(404);
        expect(typeof body.error).toBe("string");
    });

    it("seeds the default wallet from the session's own starting credits when no wallet is configured", async () => {
        const game = createFakeGame(manifest); // createFakeSession() defaults its own internal credits to 1000
        const server = new PokieDevServer(game, {host: "127.0.0.1", port: 0});
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}`;

        const {body} = await postJson(`${baseUrl}/sessions`);

        expect(body.credits).toBe(1000);

        await server.stop();
    });

    it("honors an explicitly configured wallet initial balance instead of the session's own default credits", async () => {
        const game = createFakeGame(manifest); // createFakeSession() defaults its own internal credits to 1000
        const server = new PokieDevServer(game, {
            host: "127.0.0.1",
            port: 0,
            wallet: new InMemoryWallet(250),
        });
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}`;

        const {body} = await postJson(`${baseUrl}/sessions`);

        expect(body.credits).toBe(250);

        await server.stop();
    });

    it("keeps a real VideoSlotWithFreeGamesSession's unfinished free-games round going at a 0 wallet balance, across a simulated restart", async () => {
        const game = createRealFreeGamesGame(manifest);
        const sharedRepository = new InMemorySessionRepository();

        const serverA = new PokieDevServer(game, {
            host: "127.0.0.1",
            port: 0,
            sessionRepository: sharedRepository,
            wallet: new InMemoryWallet(0),
        });
        const addressA = await serverA.start();
        const baseUrlA = `http://${addressA.host}:${addressA.port}`;

        const created = await postJson(`${baseUrlA}/sessions`);
        const sessionId = created.body.sessionId as string;
        expect(created.body.credits).toBe(0);

        // Force the just-created live session into an unfinished free-games round (1 of 3 played)
        // directly via its own setters, rather than relying on an actual scatter win, so the test
        // stays deterministic regardless of the session's randomly generated reel combinations.
        game.lastSession?.setFreeGamesSum(3);
        game.lastSession?.setFreeGamesNum(0);
        game.lastSession?.setFreeGamesBank(0);

        const spun = await postJson(`${baseUrlA}/sessions/${sessionId}/spin`);
        expect(spun.status).toBe(200); // canPlayNextGame() is true despite 0 credits: free games are unfinished
        expect(spun.body.credits).toBe(0); // free spin: bet is never charged while free games are in progress

        await serverA.stop();

        // serverB reconstructs a brand-new VideoSlotWithFreeGamesSession (freeGamesNum/Sum/Bank default
        // back to 0) — only if PokieDevServer restores the persisted featureState onto it does its
        // canPlayNextGame() still see an unfinished round and let this spin through despite the fresh
        // wallet's 0 balance (the server's own canPlayNextGame() gate is unchanged and still applies).
        const serverB = new PokieDevServer(game, {
            host: "127.0.0.1",
            port: 0,
            sessionRepository: sharedRepository,
            wallet: new InMemoryWallet(0),
        });
        const addressB = await serverB.start();
        const baseUrlB = `http://${addressB.host}:${addressB.port}`;

        const spunAfterRestart = await postJson(`${baseUrlB}/sessions/${sessionId}/spin`);

        expect(spunAfterRestart.status).toBe(200);
        expect(spunAfterRestart.body.credits).toBe(0);

        await serverB.stop();
    });

    it("blocks a spin when canPlayNextGame() returns false, leaving session/repository/wallet state unchanged", async () => {
        const game = createFakeGame(manifest); // canPlayNextGame(): credits >= bet, bet is 5
        const server = new PokieDevServer(game, {host: "127.0.0.1", port: 0, wallet: new InMemoryWallet(2)});
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}`;

        const created = await postJson(`${baseUrl}/sessions`);
        const sessionId = created.body.sessionId as string;
        expect(created.body.credits).toBe(2);

        const blocked = await postJson(`${baseUrl}/sessions/${sessionId}/spin`);

        expect(blocked.status).toBe(400);
        expect(typeof blocked.body.error).toBe("string");

        // Nothing about the session should have moved: same bet/win/screen/credits as right after
        // creation — no play(), no repository write, no wallet write happened for the blocked spin.
        const afterBlocked = await getJson(`${baseUrl}/sessions/${sessionId}`);
        expect(afterBlocked.body.bet).toBe(created.body.bet);
        expect(afterBlocked.body.win).toBe(0);
        expect(afterBlocked.body.credits).toBe(2);
        expect(afterBlocked.body.screen).toEqual(created.body.screen);

        await server.stop();
    });

    it("still spins a session with a 0 balance when canPlayNextGame() returns true (e.g. an active free-games feature)", async () => {
        const game = createFakeFreeGamesGame(manifest);
        const server = new PokieDevServer(game, {host: "127.0.0.1", port: 0});
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}`;

        const created = await postJson(`${baseUrl}/sessions`);
        const sessionId = created.body.sessionId as string;
        expect(created.body.credits).toBe(0); // the fake free-games session's own default credits

        game.lastSession?.grantFreeSpins(3);
        const spun = await postJson(`${baseUrl}/sessions/${sessionId}/spin`);

        expect(spun.status).toBe(200);
        expect(spun.body.win).toBe(20);
        expect(spun.body.credits).toBe(0); // free spin: no bet charged, balance stays at 0

        await server.stop();
    });
});

describe("PokieDevServer (integration, real loadPokieGame + fixture game package)", () => {
    const fixtureRoot = path.join(__dirname, "..", "cli", "fixtures", "playable-game");
    let server: PokieDevServer;
    let baseUrl: string;

    beforeEach(async () => {
        const game = await loadPokieGame(fixtureRoot);
        server = new PokieDevServer(game, {host: "127.0.0.1", port: 0});
        const address = await server.start();
        baseUrl = `http://${address.host}:${address.port}`;
    });

    afterEach(async () => {
        await server.stop();
    });

    it("loads the fixture game package and serves its manifest", async () => {
        const {body} = await getJson(`${baseUrl}/game`);

        expect(body).toEqual({id: "playable-game", name: "Playable Game", version: "1.0.0"});
    });

    it("creates a session and spins it, returning a screen matrix", async () => {
        const created = await postJson(`${baseUrl}/sessions`);
        const sessionId = created.body.sessionId as string;

        const spun = await postJson(`${baseUrl}/sessions/${sessionId}/spin`);

        expect(spun.status).toBe(200);
        expect(spun.body.sessionId).toBe(sessionId);
        expect(spun.body.game).toEqual({id: "playable-game", name: "Playable Game", version: "1.0.0"});
        expect(typeof spun.body.bet).toBe("number");
        expect(typeof spun.body.win).toBe("number");
        expect(typeof spun.body.credits).toBe("number");
        expect(Array.isArray(spun.body.screen)).toBe(true);
    });
});

describe("PokieDevServer (integration, FileSessionRepository across a simulated restart)", () => {
    const fixtureRoot = path.join(__dirname, "..", "cli", "fixtures", "playable-game");
    let directory: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-devserver-filerepo-test-"));
    });

    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("restores a session's bet/win/screen after stopping one server and starting another over the same directory", async () => {
        const gameA = await loadPokieGame(fixtureRoot);
        const serverA = new PokieDevServer(gameA, {
            host: "127.0.0.1",
            port: 0,
            sessionRepository: new FileSessionRepository(directory),
        });
        const addressA = await serverA.start();
        const baseUrlA = `http://${addressA.host}:${addressA.port}`;

        const created = await postJson(`${baseUrlA}/sessions`, {seed: "restart-demo"});
        const sessionId = created.body.sessionId as string;
        const spun = await postJson(`${baseUrlA}/sessions/${sessionId}/spin`);
        expect(spun.status).toBe(200);

        await serverA.stop();

        const gameB = await loadPokieGame(fixtureRoot);
        const serverB = new PokieDevServer(gameB, {
            host: "127.0.0.1",
            port: 0,
            sessionRepository: new FileSessionRepository(directory),
        });
        const addressB = await serverB.start();
        const baseUrlB = `http://${addressB.host}:${addressB.port}`;

        const restored = await getJson(`${baseUrlB}/sessions/${sessionId}`);
        expect(restored.status).toBe(200);
        expect(restored.body.bet).toBe(spun.body.bet);
        expect(restored.body.win).toBe(spun.body.win);
        expect(restored.body.screen).toEqual(spun.body.screen);

        await serverB.stop();
    });

    it("returns 404 for an unknown sessionId with a FileSessionRepository", async () => {
        const game = await loadPokieGame(fixtureRoot);
        const server = new PokieDevServer(game, {
            host: "127.0.0.1",
            port: 0,
            sessionRepository: new FileSessionRepository(directory),
        });
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}`;

        const {status, body} = await getJson(`${baseUrl}/sessions/does-not-exist`);

        expect(status).toBe(404);
        expect(typeof body.error).toBe("string");

        await server.stop();
    });

    it("returns 404 instead of 500 when a session's persisted file is corrupted", async () => {
        const game = await loadPokieGame(fixtureRoot);
        const server = new PokieDevServer(game, {
            host: "127.0.0.1",
            port: 0,
            sessionRepository: new FileSessionRepository(directory),
        });
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}`;

        const created = await postJson(`${baseUrl}/sessions`);
        const sessionId = created.body.sessionId as string;

        const [fileName] = fs.readdirSync(directory);
        fs.writeFileSync(path.join(directory, fileName), "{not valid json", "utf-8");

        const {status, body} = await getJson(`${baseUrl}/sessions/${sessionId}`);

        expect(status).toBe(404);
        expect(typeof body.error).toBe("string");

        await server.stop();
    });
});
