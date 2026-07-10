import {GameSessionHandling, loadPokieGame, PokieDevServer, PokieGame, PokieGameManifest} from "pokie";
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
