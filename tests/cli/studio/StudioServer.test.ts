import {PokieGame, PokieGameManifest} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {GamePackageCreating} from "../../../cli/scaffold/GamePackageCreating.js";
import {ScaffoldResult} from "../../../cli/scaffold/ScaffoldResult.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";

async function get(url: string): Promise<{status: number; body: unknown}> {
    const response = await fetch(url);
    return {status: response.status, body: await response.json()};
}

async function post(url: string, body?: unknown): Promise<{status: number; body: unknown}> {
    const response = await fetch(url, {
        method: "POST",
        headers: body === undefined ? undefined : {"Content-Type": "application/json"},
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {status: response.status, body: await response.json()};
}

function createStubCreator(result: ScaffoldResult): GamePackageCreating & {calls: Array<{parentDir: string; name: string}>} {
    return {
        calls: [],
        create(parentDir: string, name: string): ScaffoldResult {
            this.calls.push({parentDir, name});
            return result;
        },
    };
}

function createFakeGame(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            throw new Error("not used by these tests");
        },
    };
}

describe("StudioServer", () => {
    let studioRoot: string;
    let server: StudioServer;
    let baseUrl: string;
    let creator: ReturnType<typeof createStubCreator>;
    let loadGame: jest.Mock;

    const scaffoldResult: ScaffoldResult = {
        projectRoot: "/tmp/crazy-fruits",
        manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        createdFiles: ["package.json"],
        updatedFiles: [],
        skippedFiles: [],
    };

    beforeEach(async () => {
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-test-"));
        fs.writeFileSync(path.join(studioRoot, "index.html"), "<html>studio</html>");
        fs.writeFileSync(path.join(studioRoot, "main.js"), "console.log('hi');");
        fs.writeFileSync(path.join(studioRoot, "style.css"), "body { margin: 0; }");

        creator = createStubCreator(scaffoldResult);
        loadGame = jest.fn();

        server = new StudioServer({
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            gamePackageCreator: creator,
            loadGame,
        });
        const address = await server.start();
        baseUrl = `http://${address.host}:${address.port}`;
    });

    afterEach(async () => {
        await server.stop();
        fs.rmSync(studioRoot, {recursive: true, force: true});
    });

    it("responds ok on GET /api/health", async () => {
        const {status, body} = await get(`${baseUrl}/api/health`);

        expect(status).toBe(200);
        expect(body).toEqual({status: "ok"});
    });

    it("defaults to home mode on GET /api/context", async () => {
        const {status, body} = await get(`${baseUrl}/api/context`);

        expect(status).toBe(200);
        expect(body).toEqual({mode: "home"});
    });

    it("serves index.html for GET /", async () => {
        const response = await fetch(`${baseUrl}/`);

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/html");
        expect(await response.text()).toBe("<html>studio</html>");
    });

    it("returns 404 for a file that doesn't exist", async () => {
        const response = await fetch(`${baseUrl}/does-not-exist.js`);

        expect(response.status).toBe(404);
    });

    it("returns 404 for an unknown API route", async () => {
        const {status} = await get(`${baseUrl}/api/does-not-exist`);

        expect(status).toBe(404);
    });

    it("starts with an empty recent-projects list", async () => {
        const {status, body} = await get(`${baseUrl}/api/recent-projects`);

        expect(status).toBe(200);
        expect(body).toEqual([]);
    });

    it("creates a project via the injected GamePackageCreating and switches to project mode", async () => {
        const {status, body} = await post(`${baseUrl}/api/projects/create`, {name: "crazy-fruits"});

        expect(status).toBe(201);
        expect(body).toEqual({
            context: {mode: "project", projectRoot: scaffoldResult.projectRoot},
            manifest: scaffoldResult.manifest,
        });
        expect(creator.calls).toEqual([{parentDir: process.cwd(), name: "crazy-fruits"}]);

        const context = await get(`${baseUrl}/api/context`);
        expect(context.body).toEqual({mode: "project", projectRoot: scaffoldResult.projectRoot});

        const recent = await get(`${baseUrl}/api/recent-projects`);
        expect((recent.body as Array<{projectRoot: string}>)[0].projectRoot).toBe(scaffoldResult.projectRoot);
    });

    it("rejects creating a project with a missing name", async () => {
        const {status, body} = await post(`${baseUrl}/api/projects/create`, {});

        expect(status).toBe(400);
        expect(body).toEqual({error: '"name" is required.'});
    });

    it("opens a valid project via the injected loadGame and switches to project mode", async () => {
        const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
        loadGame.mockResolvedValue(createFakeGame(manifest));

        const {status, body} = await post(`${baseUrl}/api/projects/open`, {projectRoot: "./crazy-fruits"});

        expect(status).toBe(200);
        expect(body).toEqual({
            context: {mode: "project", projectRoot: path.resolve("./crazy-fruits")},
            manifest,
        });
        expect(loadGame).toHaveBeenCalledWith("./crazy-fruits");
    });

    it("returns 400 for a projectRoot that fails to load", async () => {
        loadGame.mockRejectedValue(new Error("not a pokie game package"));

        const {status, body} = await post(`${baseUrl}/api/projects/open`, {projectRoot: "./not-a-game"});

        expect(status).toBe(400);
        expect(body).toEqual({error: "not a pokie game package"});

        const context = await get(`${baseUrl}/api/context`);
        expect(context.body).toEqual({mode: "home"});
    });

    it("closes a project back to home mode", async () => {
        const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
        loadGame.mockResolvedValue(createFakeGame(manifest));
        await post(`${baseUrl}/api/projects/open`, {projectRoot: "./crazy-fruits"});

        const {status, body} = await post(`${baseUrl}/api/projects/close`);

        expect(status).toBe(200);
        expect(body).toEqual({context: {mode: "home"}});

        const context = await get(`${baseUrl}/api/context`);
        expect(context.body).toEqual({mode: "home"});
    });
});
