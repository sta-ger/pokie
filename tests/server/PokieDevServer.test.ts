import {
    BuildableFromSessionState,
    ConvertableToSessionState,
    FileSessionRepository,
    GameSessionHandling,
    GameSessionSerializing,
    InMemorySessionRepository,
    InMemoryWallet,
    loadPokieGame,
    PokieDevServer,
    PokieGame,
    PokieGameManifest,
    StakeAmountDetermining,
    VideoSlotWithFreeGamesSession,
    WalletPort,
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

// A custom serializer whose getRoundData() includes a field ("lastSymbolsCombination") that
// getInitialData() never does — proof that PokieDevServer keeps initial/round payloads genuinely
// separate rather than always exposing the union of both, except where GET /sessions/:id
// deliberately merges them for a full post-reload restore (see mergeSerializedPayloads()).
function createCustomSerializerWithRoundOnlyField(): GameSessionSerializing {
    return {
        getInitialData: (session) => ({credits: session.getCreditsAmount(), bet: session.getBet(), availableBets: session.getAvailableBets()}),
        getRoundData: (session) => ({
            credits: session.getCreditsAmount(),
            bet: session.getBet(),
            lastSymbolsCombination: (session as ReturnType<typeof createFakeSession>).getSymbolsCombination().toMatrix(),
        }),
    };
}

function createFakeGameWithCustomSerializer(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => createFakeSession(),
        getSessionSerializer: () => createCustomSerializerWithRoundOnlyField(),
    };
}

type FreeGamesState = {freeSpinsRemaining: number};

type FakeFreeGamesSession = GameSessionHandling &
    ConvertableToSessionState<FreeGamesState> &
    BuildableFromSessionState<FreeGamesState> &
    StakeAmountDetermining & {
        grantFreeSpins(count: number): void;
    };

// A minimal stand-in for a game with an in-progress bonus round (e.g. VideoSlotWithFreeGamesSession's
// free-games state): once granted, free spins pay out without charging a bet, decrementing until none
// remain. Implements ConvertableToSessionState/BuildableFromSessionState so PokieDevServer can persist
// and restore that "still mid-feature" state across a simulated restart, and StakeAmountDetermining so
// PokieDevServer never has to infer "this is a free spin" from the wallet balance (see
// determineStakeAmount's own doc comment).
function createFakeFreeGamesSession(initialCredits = 0): FakeFreeGamesSession {
    let credits = initialCredits;
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
        getStakeAmount: () => (freeSpinsRemaining > 0 ? 0 : bet),
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

    it("sends CORS headers on every response, including errors — needed for a browser-based client on a different origin", async () => {
        const okResponse = await fetch(`${baseUrl}/health`);
        expect(okResponse.headers.get("access-control-allow-origin")).toBe("*");
        expect(okResponse.headers.get("access-control-allow-methods")).toContain("POST");

        const errorResponse = await fetch(`${baseUrl}/unknown`);
        expect(errorResponse.status).toBe(404);
        expect(errorResponse.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("responds to an OPTIONS preflight request with 204 and CORS headers", async () => {
        const response = await fetch(`${baseUrl}/sessions`, {method: "OPTIONS"});

        expect(response.status).toBe(204);
        expect(response.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("never includes rich-serializer-only fields when the loaded game has no getSessionSerializer (backward compat)", async () => {
        const created = await postJson(`${baseUrl}/sessions`);
        const sessionId = created.body.sessionId as string;
        const spun = await postJson(`${baseUrl}/sessions/${sessionId}/spin`);
        const restored = await getJson(`${baseUrl}/sessions/${sessionId}`);

        for (const response of [created, spun, restored]) {
            expect(response.body.availableSymbols).toBeUndefined();
            expect(response.body.paytable).toBeUndefined();
            expect(response.body.reelsSymbols).toBeUndefined();
            expect(response.body.stages).toBeUndefined();
            expect(Object.keys(response.body).sort()).toEqual(
                Object.keys(response.body).filter((key) => ["sessionId", "game", "bet", "win", "credits", "screen"].includes(key)).sort(),
            );
        }
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

    it("adapts a legacy WalletPort (getBalance/setBalance only) into a working transactional spin flow", async () => {
        // Predates debit/credit/reverse entirely — stands in for a consumer's own pre-existing
        // custom WalletPort. PokieDevServer must wrap it in a TransactionalWalletAdapter itself;
        // this test only ever calls the original two-method WalletPort contract.
        class LegacyMapWallet implements WalletPort {
            private readonly balances = new Map<string, number>();
            private readonly initialBalance: number;

            constructor(initialBalance: number) {
                this.initialBalance = initialBalance;
            }

            public getBalance(sessionId: string): Promise<number> {
                return Promise.resolve(this.balances.get(sessionId) ?? this.initialBalance);
            }

            public setBalance(sessionId: string, balance: number): Promise<void> {
                this.balances.set(sessionId, balance);
                return Promise.resolve();
            }
        }

        const game = createFakeGame(manifest); // createFakeSession(): bet 5, round 1 win 0, round 2 win 15
        const server = new PokieDevServer(game, {host: "127.0.0.1", port: 0, wallet: new LegacyMapWallet(1000)});
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}`;

        const created = await postJson(`${baseUrl}/sessions`);
        const sessionId = created.body.sessionId as string;
        expect(created.body.credits).toBe(1000);

        const first = await postJson(`${baseUrl}/sessions/${sessionId}/spin`);
        expect(first.status).toBe(200);
        expect(first.body.credits).toBe(995); // debited through the adapter over the legacy wallet

        const second = await postJson(`${baseUrl}/sessions/${sessionId}/spin`);
        expect(second.status).toBe(200);
        expect(second.body.win).toBe(15);
        expect(second.body.credits).toBe(1005); // credited through the adapter over the legacy wallet

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

    it("keeps a real VideoSlotWithFreeGamesSession's unfinished free-games round free of charge even at a balance comfortably above the bet", async () => {
        // Balance (1000) is far more than enough to cover the bet: this proves the free spin isn't
        // charged because VideoSlotWithFreeGamesSession explicitly reports it via
        // StakeAmountDetermining, not because the wallet balance happened to be too low to charge.
        const game = createRealFreeGamesGame(manifest);
        const server = new PokieDevServer(game, {host: "127.0.0.1", port: 0, wallet: new InMemoryWallet(1000)});
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}`;

        const created = await postJson(`${baseUrl}/sessions`);
        const sessionId = created.body.sessionId as string;
        expect(created.body.credits).toBe(1000);

        game.lastSession?.setFreeGamesSum(3);
        game.lastSession?.setFreeGamesNum(0);
        game.lastSession?.setFreeGamesBank(0);

        const spun = await postJson(`${baseUrl}/sessions/${sessionId}/spin`);

        expect(spun.status).toBe(200);
        expect(spun.body.credits).toBe(1000); // unchanged: no bet charged despite ample balance

        await server.stop();
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

describe("PokieDevServer (integration, real loadPokieGame + fixture game package with a serializer)", () => {
    const fixtureRoot = path.join(__dirname, "..", "cli", "fixtures", "playable-game-with-serializer");
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

    it("POST /sessions returns the full game-specific payload instead of the narrow default DTO", async () => {
        const {status, body} = await postJson(`${baseUrl}/sessions`);

        expect(status).toBe(201);
        expect(body.sessionId).toEqual(expect.any(String));
        expect(body.game).toEqual({id: "playable-game-with-serializer", name: "Playable Game With Serializer", version: "1.0.0"});
        expect(typeof body.credits).toBe("number");
        // Fields only VideoSlotSessionSerializer's getInitialData() produces — proof the rich path
        // ran, not the legacy hand-rolled DTO.
        expect(Array.isArray(body.availableSymbols)).toBe(true);
        expect(typeof body.paytable).toBe("object");
        expect(typeof body.linesDefinitions).toBe("object");
        expect(Array.isArray(body.reelsSymbols)).toBe(true);
    });

    it("POST /sessions/:id/spin returns the rich payload too, with credits always the authoritative wallet balance", async () => {
        const created = await postJson(`${baseUrl}/sessions`);
        const sessionId = created.body.sessionId as string;

        const spun = await postJson(`${baseUrl}/sessions/${sessionId}/spin`);

        expect(spun.status).toBe(200);
        expect(Array.isArray(spun.body.reelsSymbols)).toBe(true);
        expect(typeof spun.body.totalWin).toBe("number");
        expect(spun.body.credits).toBe((created.body.credits as number) - (created.body.bet as number) + (spun.body.totalWin as number));
    });

    it("GET /sessions/:id restores the exact same rich payload captured at the last spin, without reconstructing a fresh round", async () => {
        const created = await postJson(`${baseUrl}/sessions`);
        const sessionId = created.body.sessionId as string;
        const spun = await postJson(`${baseUrl}/sessions/${sessionId}/spin`);

        const restored = await getJson(`${baseUrl}/sessions/${sessionId}`);

        expect(restored.status).toBe(200);
        expect(restored.body.reelsSymbols).toEqual(spun.body.reelsSymbols);
        expect(restored.body.totalWin).toBe(spun.body.totalWin);
        expect(restored.body.credits).toBe(spun.body.credits);
    });
});

describe("PokieDevServer (fake game with a custom serializer whose getRoundData() has a round-only field)", () => {
    let server: PokieDevServer;
    let baseUrl: string;

    beforeEach(async () => {
        const game = createFakeGameWithCustomSerializer({id: "round-only-field-game", name: "Round Only Field Game", version: "1.0.0"});
        server = new PokieDevServer(game, {host: "127.0.0.1", port: 0});
        const address = await server.start();
        baseUrl = `http://${address.host}:${address.port}`;
    });

    afterEach(async () => {
        await server.stop();
    });

    it("POST /sessions never includes the round-only field, since getInitialData() never produces it", async () => {
        const created = await postJson(`${baseUrl}/sessions`);

        expect(created.status).toBe(201);
        expect("lastSymbolsCombination" in created.body).toBe(false);
    });

    it("POST /sessions/:id/spin includes the round-only field, from getRoundData()", async () => {
        const created = await postJson(`${baseUrl}/sessions`);
        const sessionId = created.body.sessionId as string;

        const spun = await postJson(`${baseUrl}/sessions/${sessionId}/spin`);

        expect(spun.status).toBe(200);
        expect(spun.body.lastSymbolsCombination).toEqual([["round-1"]]);
    });

    it("GET /sessions/:id still includes the round-only field after a restore", async () => {
        const created = await postJson(`${baseUrl}/sessions`);
        const sessionId = created.body.sessionId as string;
        const spun = await postJson(`${baseUrl}/sessions/${sessionId}/spin`);

        const restored = await getJson(`${baseUrl}/sessions/${sessionId}`);

        expect(restored.status).toBe(200);
        expect(restored.body.lastSymbolsCombination).toEqual(spun.body.lastSymbolsCombination);
    });
});

// A custom serializer implementing the optional getInitialDebugData()/getRoundDebugData() hooks —
// proof that the server's public/internal split is driven entirely by this explicit, feature-detected
// contract (see GameSessionSerializing) rather than any heuristic over field names. "publicField" is
// also present in getInitialData()/getRoundData()'s own output — client-safe by definition, so it
// stays in every response — while "rngSeed"/"reelStops" only ever appear under the optional debug
// hooks, so they must never leak into a public response, only into `internal.debugData` when a
// request explicitly opts in.
function createCustomSerializerWithDebugData(): GameSessionSerializing {
    return {
        getInitialData: (session) => ({
            credits: session.getCreditsAmount(),
            bet: session.getBet(),
            availableBets: session.getAvailableBets(),
            publicField: "initial",
        }),
        getRoundData: (session) => ({credits: session.getCreditsAmount(), bet: session.getBet(), publicField: "round"}),
        getInitialDebugData: () => ({rngSeed: "seed-initial"}),
        getRoundDebugData: () => ({rngSeed: "seed-round", reelStops: [1, 2, 3]}),
    };
}

function createFakeGameWithDebugSerializer(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => createFakeSession(),
        getSessionSerializer: () => createCustomSerializerWithDebugData(),
    };
}

describe("PokieDevServer (public/internal response split)", () => {
    const manifest: PokieGameManifest = {id: "split-game", name: "Split Game", version: "1.0.0"};

    describe("legacy game package (no getSessionSerializer): internal data is state-only", () => {
        let server: PokieDevServer;
        let baseUrl: string;

        beforeEach(async () => {
            const game = createFakeGame(manifest);
            server = new PokieDevServer(game, {host: "127.0.0.1", port: 0});
            const address = await server.start();
            baseUrl = `http://${address.host}:${address.port}`;
        });

        afterEach(async () => {
            await server.stop();
        });

        it("never includes `internal` by default on any of the three endpoints", async () => {
            const created = await postJson(`${baseUrl}/sessions`);
            const sessionId = created.body.sessionId as string;
            const spun = await postJson(`${baseUrl}/sessions/${sessionId}/spin`);
            const restored = await getJson(`${baseUrl}/sessions/${sessionId}`);

            for (const response of [created, spun, restored]) {
                expect("internal" in response.body).toBe(false);
            }
        });

        it("includes `internal.stateAfter` (but no debugData) when `?debug=1` is explicitly requested", async () => {
            const created = await postJson(`${baseUrl}/sessions?debug=1`);

            expect(created.body.internal).toBeDefined();
            const internal = created.body.internal as Record<string, unknown>;
            expect(internal.stateAfter).toBeDefined();
            expect(internal.stateBefore).toBeUndefined();
            expect(internal.debugData).toBeUndefined();
        });

        it("includes `internal.stateBefore` on a spin response when `?debug=true` is requested", async () => {
            const created = await postJson(`${baseUrl}/sessions`);
            const sessionId = created.body.sessionId as string;

            const spun = await postJson(`${baseUrl}/sessions/${sessionId}/spin?debug=true`);

            const internal = spun.body.internal as Record<string, unknown>;
            expect(internal.stateBefore).toBeDefined();
            expect(internal.stateAfter).toBeDefined();
        });

        it("ignores any `debug` value other than \"1\"/\"true\" and stays public-only", async () => {
            const created = await postJson(`${baseUrl}/sessions?debug=yes`);

            expect("internal" in created.body).toBe(false);
        });
    });

    describe("custom serializer with public-only data (no debug hooks implemented)", () => {
        let server: PokieDevServer;
        let baseUrl: string;

        beforeEach(async () => {
            const game = createFakeGameWithCustomSerializer(manifest);
            server = new PokieDevServer(game, {host: "127.0.0.1", port: 0});
            const address = await server.start();
            baseUrl = `http://${address.host}:${address.port}`;
        });

        afterEach(async () => {
            await server.stop();
        });

        it("still omits `internal.debugData` under `?debug=1` since the serializer implements no debug hooks", async () => {
            const created = await postJson(`${baseUrl}/sessions?debug=1`);
            const sessionId = created.body.sessionId as string;

            const spun = await postJson(`${baseUrl}/sessions/${sessionId}/spin?debug=1`);

            const internal = spun.body.internal as Record<string, unknown>;
            expect(internal.debugData).toBeUndefined();
            expect(internal.stateAfter).toBeDefined();
        });
    });

    describe("custom serializer implementing getInitialDebugData()/getRoundDebugData()", () => {
        let server: PokieDevServer;
        let baseUrl: string;

        beforeEach(async () => {
            const game = createFakeGameWithDebugSerializer(manifest);
            server = new PokieDevServer(game, {host: "127.0.0.1", port: 0});
            const address = await server.start();
            baseUrl = `http://${address.host}:${address.port}`;
        });

        afterEach(async () => {
            await server.stop();
        });

        it("never leaks debug-only fields (rngSeed/reelStops) into the default public response", async () => {
            const created = await postJson(`${baseUrl}/sessions`);
            const sessionId = created.body.sessionId as string;
            const spun = await postJson(`${baseUrl}/sessions/${sessionId}/spin`);
            const restored = await getJson(`${baseUrl}/sessions/${sessionId}`);

            for (const response of [created, spun, restored]) {
                expect("internal" in response.body).toBe(false);
                expect("rngSeed" in response.body).toBe(false);
                expect("reelStops" in response.body).toBe(false);
                // The serializer's own public fields still come through unfiltered, same as any
                // other serializer with no debug hooks at all.
                expect(response.body.publicField).toBeDefined();
            }
        });

        it("surfaces the serializer's debug hook output under `internal.debugData` only when `?debug=1` is requested", async () => {
            const created = await postJson(`${baseUrl}/sessions?debug=1`);
            const sessionId = created.body.sessionId as string;
            const createdInternal = created.body.internal as Record<string, unknown>;
            expect((createdInternal.debugData as Record<string, unknown>).rngSeed).toBe("seed-initial");

            const spun = await postJson(`${baseUrl}/sessions/${sessionId}/spin?debug=1`);
            const spunInternal = spun.body.internal as Record<string, unknown>;
            const spunDebugData = spunInternal.debugData as Record<string, unknown>;
            expect(spunDebugData.rngSeed).toBe("seed-round");
            expect(spunDebugData.reelStops).toEqual([1, 2, 3]);

            // GET /sessions/:id merges the initial and round debug payloads, same as it does for the
            // public initialPayload/roundPayload — round data wins on the overlapping "rngSeed" key.
            const restored = await getJson(`${baseUrl}/sessions/${sessionId}?debug=1`);
            const restoredDebugData = (restored.body.internal as Record<string, unknown>).debugData as Record<string, unknown>;
            expect(restoredDebugData.rngSeed).toBe("seed-round");
            expect(restoredDebugData.reelStops).toEqual([1, 2, 3]);
        });

        it("echoes the spin's requestId under `internal.requestId` when one was given, and omits it otherwise", async () => {
            const created = await postJson(`${baseUrl}/sessions`);
            const sessionId = created.body.sessionId as string;

            const withRequestId = await postJson(`${baseUrl}/sessions/${sessionId}/spin?debug=1`, {requestId: "req-1"});
            expect((withRequestId.body.internal as Record<string, unknown>).requestId).toBe("req-1");

            const withoutRequestId = await postJson(`${baseUrl}/sessions/${sessionId}/spin?debug=1`);
            expect("requestId" in (withoutRequestId.body.internal as Record<string, unknown>)).toBe(false);
        });
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
