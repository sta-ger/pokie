import {
    GameBuildInfo,
    GamePackageInspector,
    GamePackageInspectionReport,
    PokieGame,
    PokieGameManifest,
    PokieGamePackageValidationReport,
} from "pokie";
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
    let inspect: jest.Mock;
    let validate: jest.Mock;

    const scaffoldResult: ScaffoldResult = {
        projectRoot: "/tmp/crazy-fruits",
        manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        createdFiles: ["package.json"],
        updatedFiles: [],
        skippedFiles: [],
    };

    function writeStudioAssets(root: string): void {
        fs.writeFileSync(path.join(root, "index.html"), "<html>studio</html>");
        fs.writeFileSync(path.join(root, "main.js"), "console.log('hi');");
        fs.writeFileSync(path.join(root, "style.css"), "body { margin: 0; }");
    }

    beforeEach(async () => {
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-test-"));
        writeStudioAssets(studioRoot);

        creator = createStubCreator(scaffoldResult);
        loadGame = jest.fn();
        inspect = jest.fn();
        validate = jest.fn();

        server = new StudioServer({
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            gamePackageCreator: creator,
            loadGame,
            gamePackageInspector: {inspect},
            gamePackageValidator: {validate},
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

    describe("Project Dashboard: GET /api/project/context", () => {
        it('reports "empty" when Studio is in home mode', async () => {
            const {status, body} = await get(`${baseUrl}/api/project/context`);

            expect(status).toBe(200);
            expect(body).toEqual({status: "empty"});
        });

        it('reports "loaded" with the game manifest right after opening a project', async () => {
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            loadGame.mockResolvedValue(createFakeGame(manifest));
            await post(`${baseUrl}/api/projects/open`, {projectRoot: "./crazy-fruits"});

            const {status, body} = await get(`${baseUrl}/api/project/context`);

            expect(status).toBe(200);
            expect(body).toEqual({status: "loaded", projectRoot: path.resolve("./crazy-fruits"), game: manifest});
        });

        it('reports "loaded" with the scaffolded manifest right after creating a project', async () => {
            await post(`${baseUrl}/api/projects/create`, {name: "crazy-fruits"});

            const {status, body} = await get(`${baseUrl}/api/project/context`);

            expect(status).toBe(200);
            expect(body).toEqual({
                status: "loaded",
                projectRoot: scaffoldResult.projectRoot,
                game: scaffoldResult.manifest,
            });
            // Creating a project trusts the scaffolder's own manifest — it never re-loads the
            // (likely not yet built) entry module just to populate the dashboard.
            expect(loadGame).not.toHaveBeenCalled();
        });

        it('reports "empty" again after closing a project', async () => {
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            loadGame.mockResolvedValue(createFakeGame(manifest));
            await post(`${baseUrl}/api/projects/open`, {projectRoot: "./crazy-fruits"});

            await post(`${baseUrl}/api/projects/close`);
            const {status, body} = await get(`${baseUrl}/api/project/context`);

            expect(status).toBe(200);
            expect(body).toEqual({status: "empty"});
        });
    });

    describe("Project Dashboard: GET /api/project/inspect", () => {
        it("returns 409 when there is no active project", async () => {
            const {status, body} = await get(`${baseUrl}/api/project/inspect`);

            expect(status).toBe(409);
            expect(body).toEqual({error: "No active project."});
        });

        async function openCrazyFruits(): Promise<void> {
            loadGame.mockResolvedValue(createFakeGame({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"}));
            await post(`${baseUrl}/api/projects/open`, {projectRoot: "./crazy-fruits"});
        }

        it("forwards a generated package's provenance/build-info as-is", async () => {
            await openCrazyFruits();
            const buildInfo: GameBuildInfo = {
                schemaVersion: 1,
                generatedBy: "pokie build",
                pokieVersion: "1.3.0",
                generatedAt: "2026-01-02T03:04:05.000Z",
                blueprintHash: "sha256:abc123",
                source: "crazy-fruits.blueprint.json",
                files: ["package.json", "src/generated/index.js"],
                game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            };
            const report: GamePackageInspectionReport = {
                packageRoot: "./crazy-fruits",
                valid: true,
                packageJson: {name: "crazy-fruits", version: "0.1.0"},
                generated: true,
                buildInfo,
            };
            inspect.mockReturnValue(report);

            const {status, body} = await get(`${baseUrl}/api/project/inspect`);

            expect(status).toBe(200);
            expect(body).toEqual(report);
            expect(inspect).toHaveBeenCalledWith(path.resolve("./crazy-fruits"));
        });

        it("forwards a regular (non-generated) package's inspection report", async () => {
            await openCrazyFruits();
            const report: GamePackageInspectionReport = {
                packageRoot: "./crazy-fruits",
                valid: true,
                packageJson: {name: "crazy-fruits", version: "0.1.0"},
                generated: false,
            };
            inspect.mockReturnValue(report);

            const {status, body} = await get(`${baseUrl}/api/project/inspect`);

            expect(status).toBe(200);
            expect(body).toEqual(report);
        });

        it("forwards a missing/corrupt package.json inspection failure without a stack trace", async () => {
            await openCrazyFruits();
            const report: GamePackageInspectionReport = {
                packageRoot: "./crazy-fruits",
                valid: false,
                generated: false,
                error: '"./crazy-fruits/package.json" does not exist.',
            };
            inspect.mockReturnValue(report);

            const {status, body} = await get(`${baseUrl}/api/project/inspect`);

            expect(status).toBe(200);
            expect(body).toEqual(report);
            expect(JSON.stringify(body)).not.toContain("\\n    at ");
        });
    });

    describe("Project Dashboard: GET /api/project/validate", () => {
        it("returns 409 when there is no active project", async () => {
            const {status, body} = await get(`${baseUrl}/api/project/validate`);

            expect(status).toBe(409);
            expect(body).toEqual({error: "No active project."});
        });

        async function openCrazyFruits(): Promise<void> {
            loadGame.mockResolvedValue(createFakeGame({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"}));
            await post(`${baseUrl}/api/projects/open`, {projectRoot: "./crazy-fruits"});
        }

        it("forwards a fully valid validation report", async () => {
            await openCrazyFruits();
            const report: PokieGamePackageValidationReport = {
                packageRoot: "./crazy-fruits",
                valid: true,
                game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
                errors: [],
                warnings: [],
                suggestions: [],
            };
            validate.mockResolvedValue(report);

            const {status, body} = await get(`${baseUrl}/api/project/validate`);

            expect(status).toBe(200);
            expect(body).toEqual(report);
            expect(validate).toHaveBeenCalledWith(path.resolve("./crazy-fruits"));
        });

        it("forwards a validation report with errors", async () => {
            await openCrazyFruits();
            const report: PokieGamePackageValidationReport = {
                packageRoot: "./crazy-fruits",
                valid: false,
                game: null,
                errors: [{code: "pokie-package-load-failed", severity: "error", message: "boom"}],
                warnings: [],
                suggestions: [],
            };
            validate.mockResolvedValue(report);

            const {status, body} = await get(`${baseUrl}/api/project/validate`);

            expect(status).toBe(200);
            expect(body).toEqual(report);
            expect(JSON.stringify(body)).not.toContain("\\n    at ");
        });

        it("forwards a validation report with only warnings (still valid)", async () => {
            await openCrazyFruits();
            const report: PokieGamePackageValidationReport = {
                packageRoot: "./crazy-fruits",
                valid: true,
                game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
                errors: [],
                warnings: [{code: "pokie-game-description-missing", severity: "warning", message: "No description set."}],
                suggestions: ["Add a description to the manifest."],
            };
            validate.mockResolvedValue(report);

            const {status, body} = await get(`${baseUrl}/api/project/validate`);

            expect(status).toBe(200);
            expect(body).toEqual(report);
        });

        it("keeps Studio responsive after a validation error", async () => {
            await openCrazyFruits();
            validate.mockResolvedValue({
                packageRoot: "./crazy-fruits",
                valid: false,
                game: null,
                errors: [{code: "pokie-package-load-failed", severity: "error", message: "boom"}],
                warnings: [],
                suggestions: [],
            });

            await get(`${baseUrl}/api/project/validate`);
            const health = await get(`${baseUrl}/api/health`);

            expect(health.status).toBe(200);
            expect(health.body).toEqual({status: "ok"});
        });
    });

    describe("starting directly into project mode (pokie . / pokie <path>)", () => {
        let projectStudioRoot: string;
        let projectServer: StudioServer | undefined;

        beforeEach(() => {
            projectStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-project-test-"));
            writeStudioAssets(projectStudioRoot);
        });

        afterEach(async () => {
            await projectServer?.stop();
            fs.rmSync(projectStudioRoot, {recursive: true, force: true});
        });

        it('reports "loading" immediately, then "loaded" once the background load settles', async () => {
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            let resolveLoad: (game: PokieGame) => void = () => undefined;
            const pendingLoad = new Promise<PokieGame>((resolve) => {
                resolveLoad = resolve;
            });
            const slowLoadGame = jest.fn().mockReturnValue(pendingLoad);

            projectServer = new StudioServer({
                host: "127.0.0.1",
                port: 0,
                studioRoot: projectStudioRoot,
                gamePackageCreator: creator,
                loadGame: slowLoadGame,
                initialContext: {mode: "project", projectRoot: "/tmp/crazy-fruits"},
            });
            const address = await projectServer.start();
            const projectBaseUrl = `http://${address.host}:${address.port}`;

            const whileLoading = await get(`${projectBaseUrl}/api/project/context`);
            expect(whileLoading.body).toEqual({status: "loading", projectRoot: "/tmp/crazy-fruits"});

            resolveLoad(createFakeGame(manifest));
            await pendingLoad;
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });

            const afterLoad = await get(`${projectBaseUrl}/api/project/context`);
            expect(afterLoad.body).toEqual({status: "loaded", projectRoot: "/tmp/crazy-fruits", game: manifest});
        });

        it('reports "error" when the entry module fails to load on startup', async () => {
            const failingLoadGame = jest.fn().mockRejectedValue(new Error("Cannot find module './dist/index.js'"));

            projectServer = new StudioServer({
                host: "127.0.0.1",
                port: 0,
                studioRoot: projectStudioRoot,
                gamePackageCreator: creator,
                loadGame: failingLoadGame,
                initialContext: {mode: "project", projectRoot: "/tmp/broken-game"},
            });
            const address = await projectServer.start();
            const projectBaseUrl = `http://${address.host}:${address.port}`;

            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
            const context = await get(`${projectBaseUrl}/api/project/context`);

            expect(context.body).toEqual({
                status: "error",
                projectRoot: "/tmp/broken-game",
                error: "Cannot find module './dist/index.js'",
            });
        });
    });

    describe("GET /api/project/inspect with the real GamePackageInspector (fixtures on disk)", () => {
        let fixtureStudioRoot: string;
        let fixtureServer: StudioServer | undefined;

        beforeEach(() => {
            fixtureStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-inspect-fixture-test-"));
            writeStudioAssets(fixtureStudioRoot);
        });

        afterEach(async () => {
            await fixtureServer?.stop();
            fs.rmSync(fixtureStudioRoot, {recursive: true, force: true});
        });

        async function startServerForProject(projectRoot: string): Promise<string> {
            fixtureServer = new StudioServer({
                host: "127.0.0.1",
                port: 0,
                studioRoot: fixtureStudioRoot,
                gamePackageCreator: creator,
                loadGame,
                gamePackageInspector: new GamePackageInspector(),
                initialContext: {mode: "project", projectRoot},
            });
            const address = await fixtureServer.start();
            return `http://${address.host}:${address.port}`;
        }

        it("reports a real, safe error for a corrupt package.json — never a stack trace", async () => {
            const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-broken-package-json-"));
            try {
                fs.writeFileSync(path.join(projectRoot, "package.json"), "{ this is not json");
                const projectBaseUrl = await startServerForProject(projectRoot);

                const {status, body} = await get(`${projectBaseUrl}/api/project/inspect`);

                expect(status).toBe(200);
                expect(body).toMatchObject({packageRoot: projectRoot, valid: false, generated: false});
                expect((body as {error: string}).error).toContain("is not valid JSON");
                expect(JSON.stringify(body)).not.toContain("\\n    at ");
            } finally {
                fs.rmSync(projectRoot, {recursive: true, force: true});
            }
        });

        it("reports a real, safe error for a missing package.json", async () => {
            const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-missing-package-json-"));
            try {
                const projectBaseUrl = await startServerForProject(projectRoot);

                const {status, body} = await get(`${projectBaseUrl}/api/project/inspect`);

                expect(status).toBe(200);
                expect(body).toMatchObject({packageRoot: projectRoot, valid: false, generated: false});
                expect((body as {error: string}).error).toContain("does not exist");
                expect(JSON.stringify(body)).not.toContain("\\n    at ");
            } finally {
                fs.rmSync(projectRoot, {recursive: true, force: true});
            }
        });

        it("treats a corrupt/unparseable build-info.json as not-generated, not an error", async () => {
            const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-corrupt-build-info-"));
            try {
                fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({name: "a", version: "1.0.0"}));
                fs.mkdirSync(path.join(projectRoot, "src", "generated"), {recursive: true});
                fs.writeFileSync(path.join(projectRoot, "src", "generated", "build-info.json"), "{ not valid json");
                const projectBaseUrl = await startServerForProject(projectRoot);

                const {status, body} = await get(`${projectBaseUrl}/api/project/inspect`);

                expect(status).toBe(200);
                expect(body).toEqual({
                    packageRoot: projectRoot,
                    valid: true,
                    packageJson: {name: "a", version: "1.0.0", description: undefined},
                    generated: false,
                });
            } finally {
                fs.rmSync(projectRoot, {recursive: true, force: true});
            }
        });

        it("treats a build-info.json not written by pokie build as not-generated", async () => {
            const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-wrong-build-info-"));
            try {
                fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({name: "a", version: "1.0.0"}));
                fs.mkdirSync(path.join(projectRoot, "src", "generated"), {recursive: true});
                fs.writeFileSync(
                    path.join(projectRoot, "src", "generated", "build-info.json"),
                    JSON.stringify({generatedBy: "someone-else"}),
                );
                const projectBaseUrl = await startServerForProject(projectRoot);

                const {status, body} = await get(`${projectBaseUrl}/api/project/inspect`);

                expect(status).toBe(200);
                expect(body).toMatchObject({valid: true, generated: false});
            } finally {
                fs.rmSync(projectRoot, {recursive: true, force: true});
            }
        });
    });
});
