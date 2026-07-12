import {
    GameBuildInfo,
    GamePackageInspector,
    GamePackageInspectionReport,
    GameSessionHandling,
    PokieGame,
    PokieGameManifest,
    PokieGamePackageValidationReport,
} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {GamePackageCreating} from "../../../cli/scaffold/GamePackageCreating.js";
import {ScaffoldResult} from "../../../cli/scaffold/ScaffoldResult.js";
import {InMemoryStudioSimulationRepository} from "../../../cli/studio/simulation/InMemoryStudioSimulationRepository.js";
import {StudioSimulationService} from "../../../cli/studio/simulation/StudioSimulationService.js";
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

async function del(url: string): Promise<{status: number; body: unknown}> {
    const response = await fetch(url, {method: "DELETE"});
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

function createPlayableSession(): GameSessionHandling {
    let credits = 1000;
    let bet = 1;
    let round = 0;
    let winAmount = 0;

    return {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: (value: number) => {
            bet = value;
        },
        getAvailableBets: () => [1, 2, 5],
        canPlayNextGame: () => true,
        play: () => {
            round++;
            winAmount = round % 5 === 0 ? bet * 10 : 0;
            credits = credits - bet + winAmount;
        },
        getWinAmount: () => winAmount,
    };
}

function createPlayableFakeGame(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => createPlayableSession(),
    };
}

// Same StakeAmountDetermining-implementing fake as StudioSimulationService.test.ts's own —
// round % 5 === 4 is an unstaked (free games) round.
function createFreeGamesAwareFakeGame(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            let credits = 1000;
            const bet = 1;
            let round = 0;
            let pendingWin = 0;
            return {
                getCreditsAmount: () => credits,
                setCreditsAmount: (value: number) => {
                    credits = value;
                },
                getBet: () => bet,
                setBet: () => undefined,
                getAvailableBets: () => [1],
                canPlayNextGame: () => true,
                getStakeAmount: () => (round % 5 === 4 ? 0 : bet),
                play: () => {
                    pendingWin = round % 10 === 0 ? 10 : 0;
                    round++;
                    credits = credits - (round % 5 === 0 ? 0 : bet) + pendingWin;
                },
                getWinAmount: () => pendingWin,
            } as unknown as GameSessionHandling;
        },
    };
}

function flushMacrotask(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

async function pollUntilTerminal(url: string): Promise<{status: number; body: {[key: string]: unknown; status: string}}> {
    for (let i = 0; i < 2000; i++) {
        const response = await get(url);
        const body = response.body as {status: string};
        if (body.status !== "queued" && body.status !== "running") {
            return response as {status: number; body: {[key: string]: unknown; status: string}};
        }
        await flushMacrotask();
    }
    throw new Error(`Timed out waiting for ${url} to reach a terminal state.`);
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

    describe("Project Dashboard: Simulation (POST/GET/DELETE /api/project/simulations)", () => {
        it("returns 409 for POST when there is no active project", async () => {
            const {status, body} = await post(`${baseUrl}/api/project/simulations`, {rounds: 1000});

            expect(status).toBe(409);
            expect(body).toEqual({error: "No active project."});
        });

        // Persistent (not "Once"): the simulation's own StudioSimulationService independently calls
        // this same `loadGame` a second time (see StudioSimulationService.run()), so both the Open
        // Project call and the simulation's own load need `game` unless a test explicitly overrides
        // the second call (e.g. with mockResolvedValueOnce/mockRejectedValueOnce, which jest checks
        // ahead of this persistent default).
        async function openCrazyFruits(game: PokieGame): Promise<void> {
            loadGame.mockResolvedValue(game);
            await post(`${baseUrl}/api/projects/open`, {projectRoot: "./crazy-fruits"});
        }

        it("rejects an invalid rounds with 400 and never creates a job", async () => {
            await openCrazyFruits(createPlayableFakeGame({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"}));

            const {status, body} = await post(`${baseUrl}/api/project/simulations`, {rounds: 0});

            expect(status).toBe(400);
            expect(body).toEqual({error: '"rounds" must be a positive integer.'});
        });

        it("rejects a non-integer rounds with 400", async () => {
            await openCrazyFruits(createPlayableFakeGame({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"}));

            const {status, body} = await post(`${baseUrl}/api/project/simulations`, {rounds: 12.5});

            expect(status).toBe(400);
            expect(body).toEqual({error: '"rounds" must be a positive integer.'});
        });

        it("rejects an empty seed with 400", async () => {
            await openCrazyFruits(createPlayableFakeGame({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"}));

            const {status, body} = await post(`${baseUrl}/api/project/simulations`, {rounds: 100, seed: "  "});

            expect(status).toBe(400);
            expect(body).toEqual({error: '"seed" must be a non-empty string when given.'});
        });

        it("starts a simulation, completes it, and returns a full SimulationReport", async () => {
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            await openCrazyFruits(createPlayableFakeGame(manifest));

            const created = await post(`${baseUrl}/api/project/simulations`, {rounds: 200, seed: "demo"});
            expect(created.status).toBe(202);
            const createdBody = created.body as {id: string; status: string};
            expect(createdBody.status).toBe("queued");

            const {status, body} = await pollUntilTerminal(`${baseUrl}/api/project/simulations/${createdBody.id}`);

            expect(status).toBe(200);
            expect(body.status).toBe("completed");
            expect(body.report).toMatchObject({game: manifest, rounds: 200, requestedRounds: 200, seed: "demo"});
            expect(body.statistics).toMatchObject({volatility: expect.any(Number)});
            expect(body.roundsCompleted).toBe(200);
        });

        it("returns 404 for GET of an unknown simulation id", async () => {
            const {status, body} = await get(`${baseUrl}/api/project/simulations/does-not-exist`);

            expect(status).toBe(404);
            expect(body).toEqual({error: 'Unknown simulation id "does-not-exist".'});
        });

        it("returns 404 for DELETE of an unknown simulation id", async () => {
            const {status, body} = await del(`${baseUrl}/api/project/simulations/does-not-exist`);

            expect(status).toBe(404);
            expect(body).toEqual({error: 'Unknown simulation id "does-not-exist".'});
        });

        it("produces a base/freeGames breakdown when the session implements StakeAmountDetermining", async () => {
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            await openCrazyFruits(createFreeGamesAwareFakeGame(manifest));

            const created = await post(`${baseUrl}/api/project/simulations`, {rounds: 50});
            const createdBody = created.body as {id: string};

            const {body} = await pollUntilTerminal(`${baseUrl}/api/project/simulations/${createdBody.id}`);

            const report = body.report as {breakdown: {components: Record<string, {rounds: number}>}; rounds: number};
            expect(report.breakdown).toBeDefined();
            expect(report.breakdown.components.base.rounds).toBe(40);
            expect(report.breakdown.components.freeGames.rounds).toBe(10);
        });

        it("has no breakdown when the session doesn't implement StakeAmountDetermining", async () => {
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            await openCrazyFruits(createPlayableFakeGame(manifest));

            const created = await post(`${baseUrl}/api/project/simulations`, {rounds: 30});
            const createdBody = created.body as {id: string};

            const {body} = await pollUntilTerminal(`${baseUrl}/api/project/simulations/${createdBody.id}`);

            expect((body.report as {breakdown?: unknown}).breakdown).toBeUndefined();
        });

        it("fails the job with a safe error message when the simulation's own load of the game throws", async () => {
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            // Open succeeds (first loadGame call); the simulation's own independent load (second call)
            // fails — e.g. the entry file was removed after the project was opened.
            loadGame.mockResolvedValueOnce(createPlayableFakeGame(manifest));
            await post(`${baseUrl}/api/projects/open`, {projectRoot: "./crazy-fruits"});
            loadGame.mockRejectedValueOnce(new Error("Cannot find module './dist/index.js'"));

            const created = await post(`${baseUrl}/api/project/simulations`, {rounds: 100});
            const createdBody = created.body as {id: string};

            const {body} = await pollUntilTerminal(`${baseUrl}/api/project/simulations/${createdBody.id}`);

            expect(body.status).toBe("failed");
            expect(body.error).toBe("Cannot find module './dist/index.js'");
            expect(JSON.stringify(body)).not.toContain("\\n    at ");
        });

        it("rejects a second POST for the same project with 409 while one is already queued/running", async () => {
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            loadGame.mockResolvedValueOnce(createPlayableFakeGame(manifest));
            await post(`${baseUrl}/api/projects/open`, {projectRoot: "./crazy-fruits"});
            // The simulation's own independent load never resolves — keeps the first job "queued"
            // forever, so the conflict check below can never race.
            loadGame.mockReturnValueOnce(
                new Promise(() => {
                    // never resolves
                }),
            );

            const first = await post(`${baseUrl}/api/project/simulations`, {rounds: 1000});
            const firstBody = first.body as {id: string};
            const second = await post(`${baseUrl}/api/project/simulations`, {rounds: 500});

            expect(second.status).toBe(409);
            expect(second.body).toEqual({
                error: "A simulation is already running for this project.",
                activeJobId: firstBody.id,
            });
        });
    });

    describe("Project Dashboard: Simulation cancellation (controlled chunk pacing)", () => {
        let projectStudioRoot: string;
        let projectServer: StudioServer | undefined;

        beforeEach(() => {
            projectStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-sim-cancel-test-"));
            writeStudioAssets(projectStudioRoot);
        });

        afterEach(async () => {
            await projectServer?.stop();
            fs.rmSync(projectStudioRoot, {recursive: true, force: true});
        });

        function createControlledYield(): {yieldToEventLoop: () => Promise<void>; pendingCount: () => number; release: () => void} {
            const pending: Array<() => void> = [];
            return {
                yieldToEventLoop: () =>
                    new Promise<void>((resolve) => {
                        pending.push(resolve);
                    }),
                pendingCount: () => pending.length,
                release: () => {
                    const resolve = pending.shift();
                    resolve?.();
                },
            };
        }

        it("cancels a running simulation via DELETE, stopping further progress", async () => {
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            const gate = createControlledYield();
            const simulationService = new StudioSimulationService(
                new InMemoryStudioSimulationRepository(),
                () => Promise.resolve(createPlayableFakeGame(manifest)),
                undefined,
                10, // chunkSize
                undefined,
                gate.yieldToEventLoop,
            );

            projectServer = new StudioServer({
                host: "127.0.0.1",
                port: 0,
                studioRoot: projectStudioRoot,
                gamePackageCreator: createStubCreator(scaffoldResult),
                loadGame: () => Promise.resolve(createPlayableFakeGame(manifest)),
                simulationService,
                initialContext: {mode: "project", projectRoot: "/tmp/crazy-fruits"},
            });
            const address = await projectServer.start();
            const projectBaseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${projectBaseUrl}/api/project/simulations`, {rounds: 25});
            const createdBody = created.body as {id: string};
            await flushMacrotask();
            expect(gate.pendingCount()).toBe(1);

            const cancelResponse = await del(`${projectBaseUrl}/api/project/simulations/${createdBody.id}`);
            expect(cancelResponse.status).toBe(200);

            gate.release();
            await flushMacrotask();

            const {body} = await get(`${projectBaseUrl}/api/project/simulations/${createdBody.id}`);
            expect((body as {status: string}).status).toBe("cancelled");
            expect((body as {roundsCompleted: number}).roundsCompleted).toBe(10);
        });

        it("stopping the Studio server during an active simulation resolves cleanly and cancels the job", async () => {
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            const gate = createControlledYield();
            const simulationService = new StudioSimulationService(
                new InMemoryStudioSimulationRepository(),
                () => Promise.resolve(createPlayableFakeGame(manifest)),
                undefined,
                10,
                undefined,
                gate.yieldToEventLoop,
            );

            projectServer = new StudioServer({
                host: "127.0.0.1",
                port: 0,
                studioRoot: projectStudioRoot,
                gamePackageCreator: createStubCreator(scaffoldResult),
                loadGame: () => Promise.resolve(createPlayableFakeGame(manifest)),
                simulationService,
                initialContext: {mode: "project", projectRoot: "/tmp/crazy-fruits"},
            });
            const address = await projectServer.start();
            const projectBaseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${projectBaseUrl}/api/project/simulations`, {rounds: 25});
            const createdBody = created.body as {id: string};
            await flushMacrotask();
            expect(gate.pendingCount()).toBe(1);

            const serverToStop = projectServer;
            projectServer = undefined; // already being stopped — afterEach shouldn't stop it again
            await expect(serverToStop.stop()).resolves.toBeUndefined();

            // stop() only requests cancellation (aborts the controller) — the record transitions to
            // "cancelled" once the paused chunk loop notices, same as a DELETE-triggered cancel.
            gate.release();
            await flushMacrotask();

            expect(simulationService.getStatus(createdBody.id)?.status).toBe("cancelled");
        });
    });
});
