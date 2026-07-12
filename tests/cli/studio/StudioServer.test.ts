import {
    GameBuildInfo,
    GamePackageInspector,
    GamePackageInspectionReport,
    GameSessionHandling,
    PokieGame,
    PokieGameManifest,
    PokieGamePackageValidationReport,
    SimulationReport,
    SimulationReportBuilding,
} from "pokie";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import {GamePackageCreating} from "../../../cli/scaffold/GamePackageCreating.js";
import {ScaffoldResult} from "../../../cli/scaffold/ScaffoldResult.js";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {InMemoryStudioReplayRepository} from "../../../cli/studio/replay/InMemoryStudioReplayRepository.js";
import {StudioReplayExecutionService} from "../../../cli/studio/replay/StudioReplayExecutionService.js";
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

// FNV-1a, same hashing trick tests/cli/studio/replay/StudioReplayExecutionService.test.ts and the
// "playable-game" fixture both use to turn a seed string into a deterministic 32-bit int.
function hashSeed(seed: string | undefined): number {
    let hash = 0x811c9dc5;
    for (const char of String(seed ?? "")) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

// Genuinely seed-dependent (same seed always plays out identically; a different seed plays out
// differently) — used for the Replay reproducibility tests.
function createSeedAwareFakeGame(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: (context) => {
            const seedValue = hashSeed(context?.seed === undefined ? undefined : String(context.seed));
            let credits = 1000;
            let bet = 1;
            let round = 0;
            let winAmount = 0;
            let screen: unknown[][] = [["-"]];
            return {
                getCreditsAmount: () => credits,
                setCreditsAmount: (value: number) => {
                    credits = value;
                },
                getBet: () => bet,
                setBet: (value: number) => {
                    bet = value;
                },
                getAvailableBets: () => [1],
                canPlayNextGame: () => true,
                play: () => {
                    round++;
                    const symbol = (seedValue + round) % 5;
                    winAmount = symbol === 0 ? bet * 10 : 0;
                    screen = [[`sym-${symbol}-round-${round}`]];
                    credits = credits - bet + winAmount;
                },
                getWinAmount: () => winAmount,
                getSymbolsCombination: () => ({toMatrix: () => screen}),
            } as unknown as GameSessionHandling;
        },
    };
}

// No getSymbolsCombination() at all — screen should come back null.
function createFakeGameWithoutScreen(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            let credits = 1000;
            const bet = 1;
            let winAmount = 0;
            return {
                getCreditsAmount: () => credits,
                setCreditsAmount: (value: number) => {
                    credits = value;
                },
                getBet: () => bet,
                setBet: () => undefined,
                getAvailableBets: () => [1],
                canPlayNextGame: () => true,
                play: () => {
                    winAmount = 0;
                    credits -= bet;
                },
                getWinAmount: () => winAmount,
            };
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

        const homeService = new StudioHomeService(
            "1.0.0",
            undefined,
            creator,
            undefined,
            undefined,
            undefined,
            undefined,
            loadGame,
        );
        server = new StudioServer({
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            homeService,
            blueprintService: new StudioBlueprintService("1.0.0", studioRoot, homeService),
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
        const {status, body} = await get(`${baseUrl}/api/home/recent-projects`);

        expect(status).toBe(200);
        expect(body).toEqual([]);
    });

    it("creates a project via the injected GamePackageCreating without switching Studio's context", async () => {
        const {status, body} = await post(`${baseUrl}/api/home/projects/create`, {destinationDir: process.cwd(), name: "crazy-fruits"});

        expect(status).toBe(201);
        expect(body).toEqual({
            status: "ok",
            projectRoot: scaffoldResult.projectRoot,
            manifest: scaffoldResult.manifest,
            createdFiles: scaffoldResult.createdFiles,
            updatedFiles: scaffoldResult.updatedFiles,
            skippedFiles: scaffoldResult.skippedFiles,
        });
        expect(creator.calls).toEqual([{parentDir: process.cwd(), name: "crazy-fruits"}]);

        // Create only scaffolds and records a recent project — it never transitions Studio into
        // Project mode itself; that only happens via the separate "Open in Studio" action (POST
        // /api/home/projects/open), same as Open Existing Project.
        const context = await get(`${baseUrl}/api/context`);
        expect(context.body).toEqual({mode: "home"});

        const recent = await get(`${baseUrl}/api/home/recent-projects`);
        expect((recent.body as Array<{projectRoot: string}>)[0].projectRoot).toBe(scaffoldResult.projectRoot);
    });

    it("rejects creating a project with a missing name", async () => {
        const {status, body} = await post(`${baseUrl}/api/home/projects/create`, {destinationDir: process.cwd()});

        expect(status).toBe(400);
        expect(body).toEqual({error: '"name" is required.'});
    });

    it("opens a valid project via the injected loadGame and switches to project mode", async () => {
        const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
        loadGame.mockResolvedValue(createFakeGame(manifest));

        const {status, body} = await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});

        expect(status).toBe(200);
        expect(body).toEqual({
            context: {mode: "project", projectRoot: path.resolve("./crazy-fruits")},
            manifest,
        });
        expect(loadGame).toHaveBeenCalledWith("./crazy-fruits");
    });

    it("returns 400 for a projectRoot that fails to load", async () => {
        loadGame.mockRejectedValue(new Error("not a pokie game package"));

        const {status, body} = await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./not-a-game"});

        expect(status).toBe(400);
        expect(body).toEqual({error: "not a pokie game package"});

        const context = await get(`${baseUrl}/api/context`);
        expect(context.body).toEqual({mode: "home"});
    });

    it("closes a project back to home mode", async () => {
        const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
        loadGame.mockResolvedValue(createFakeGame(manifest));
        await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});

        const {status, body} = await post(`${baseUrl}/api/projects/close`);

        expect(status).toBe(200);
        expect(body).toEqual({context: {mode: "home"}});

        const context = await get(`${baseUrl}/api/context`);
        expect(context.body).toEqual({mode: "home"});
    });

    describe("Home nav: recent-projects dedup/missing (through the injected homeService)", () => {
        it("never lists another project's recent entries as duplicates when the same canonical path is opened twice", async () => {
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            loadGame.mockResolvedValue(createFakeGame(manifest));

            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: path.resolve("./crazy-fruits")});

            const {body} = await get(`${baseUrl}/api/home/recent-projects`);
            expect(body).toHaveLength(1);
        });

        it("flags a recent project as missing (without dropping it) once its directory disappears", async () => {
            const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-home-recent-"));
            try {
                fs.writeFileSync(path.join(projectRoot, "package.json"), "{}");
                const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
                loadGame.mockResolvedValue(createFakeGame(manifest));
                await post(`${baseUrl}/api/home/projects/open`, {projectRoot});

                const before = await get(`${baseUrl}/api/home/recent-projects`);
                expect((before.body as Array<{missing: boolean}>)[0].missing).toBe(false);

                fs.rmSync(projectRoot, {recursive: true, force: true});
                const after = await get(`${baseUrl}/api/home/recent-projects`);
                expect(after.body).toEqual([expect.objectContaining({projectRoot, missing: true})]);
            } finally {
                fs.rmSync(projectRoot, {recursive: true, force: true});
            }
        });
    });

    describe("Home nav: Init/Build (real collaborators against real temp directories)", () => {
        let homeStudioRoot: string;
        let homeServer: StudioServer | undefined;
        let homeBaseUrl: string;
        let workDir: string;

        function buildBlueprint(overrides: Record<string, unknown> = {}): Record<string, unknown> {
            return {
                manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
                reels: 3,
                rows: 3,
                symbols: ["A", "B"],
                paytable: {A: {3: 5}, B: {3: 2}},
                ...overrides,
            };
        }

        function writeBlueprintFile(blueprint: unknown): string {
            const filePath = path.join(workDir, "blueprint.json");
            fs.writeFileSync(filePath, JSON.stringify(blueprint));
            return filePath;
        }

        beforeEach(async () => {
            homeStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-home-test-"));
            writeStudioAssets(homeStudioRoot);
            workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-home-work-"));

            const homeService = new StudioHomeService("1.0.0");
            homeServer = new StudioServer({
                host: "127.0.0.1",
                port: 0,
                studioRoot: homeStudioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.0.0", homeStudioRoot, homeService),
            });
            const address = await homeServer.start();
            homeBaseUrl = `http://${address.host}:${address.port}`;
        });

        afterEach(async () => {
            await homeServer?.stop();
            fs.rmSync(homeStudioRoot, {recursive: true, force: true});
            fs.rmSync(workDir, {recursive: true, force: true});
        });

        it("rejects init with a missing directory field", async () => {
            const {status, body} = await post(`${homeBaseUrl}/api/home/projects/init`, {});

            expect(status).toBe(400);
            expect(body).toEqual({error: '"directory" is required.'});
        });

        it("initializes an existing npm project via the real GamePackageScaffolder and records it as recent", async () => {
            fs.writeFileSync(path.join(workDir, "package.json"), JSON.stringify({name: "crazy-fruits", version: "0.1.0"}));

            const {status, body} = await post(`${homeBaseUrl}/api/home/projects/init`, {directory: workDir});

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "ok", manifest: {id: "crazy-fruits"}});
            expect(fs.existsSync(path.join(workDir, "tsconfig.json"))).toBe(true);

            const recent = await get(`${homeBaseUrl}/api/home/recent-projects`);
            expect((recent.body as Array<{projectRoot: string}>)[0].projectRoot).toBe(workDir);
        });

        it("returns a clear, safe error when initializing a directory with no package.json", async () => {
            const {status, body} = await post(`${homeBaseUrl}/api/home/projects/init`, {directory: workDir});

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "error"});
            expect((body as {error: string}).error).toContain("No \"package.json\" found");
            expect(JSON.stringify(body)).not.toContain("\\n    at ");
        });

        it("previews a valid blueprint without writing anything", async () => {
            const blueprintPath = writeBlueprintFile(buildBlueprint());

            const {status, body} = await post(`${homeBaseUrl}/api/home/projects/build/preview`, {blueprintPath});

            expect(status).toBe(200);
            expect(body).toMatchObject({
                status: "ok",
                manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
                reels: 3,
                rows: 3,
                symbolsCount: 2,
                warnings: [],
            });
            expect(typeof (body as {blueprintHash: string}).blueprintHash).toBe("string");
            expect(fs.readdirSync(workDir)).toEqual(["blueprint.json"]);
        });

        it("previews a blueprint that is valid but warnings-only", async () => {
            const blueprintPath = writeBlueprintFile(buildBlueprint({reels: 15}));

            const {body} = await post(`${homeBaseUrl}/api/home/projects/build/preview`, {blueprintPath});

            expect((body as {status: string}).status).toBe("ok");
            expect((body as {warnings: Array<{code: string}>}).warnings[0].code).toBe("blueprint-reels-suspicious");
        });

        it("previews an invalid blueprint with its structural errors", async () => {
            const blueprintPath = writeBlueprintFile(buildBlueprint({reels: 0}));

            const {status, body} = await post(`${homeBaseUrl}/api/home/projects/build/preview`, {blueprintPath});

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "invalid"});
            expect((body as {errors: Array<{code: string}>}).errors[0].code).toBe("blueprint-reels-invalid");
        });

        it("returns a safe load-error for a blueprint file that doesn't exist", async () => {
            const {status, body} = await post(`${homeBaseUrl}/api/home/projects/build/preview`, {
                blueprintPath: path.join(workDir, "does-not-exist.json"),
            });

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "load-error"});
        });

        it("builds a real package via the real GamePackageGenerator and records it as recent", async () => {
            const blueprintPath = writeBlueprintFile(buildBlueprint());
            const outDir = path.join(workDir, "out");

            const {status, body} = await post(`${homeBaseUrl}/api/home/projects/build`, {blueprintPath, outDir});

            expect(status).toBe(201);
            expect(body).toMatchObject({status: "ok", manifest: {id: "crazy-fruits"}, unchanged: false});
            expect(fs.existsSync(path.join(outDir, "src", "generated", "index.js"))).toBe(true);

            const recent = await get(`${homeBaseUrl}/api/home/recent-projects`);
            expect((recent.body as Array<{projectRoot: string}>)[0].projectRoot).toBe(outDir);
        });

        it("rejects building an invalid blueprint with a structured invalid result and writes nothing", async () => {
            const blueprintPath = writeBlueprintFile(buildBlueprint({reels: 0}));
            const outDir = path.join(workDir, "out");

            const {status, body} = await post(`${homeBaseUrl}/api/home/projects/build`, {blueprintPath, outDir});

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "invalid"});
            expect(fs.existsSync(outDir)).toBe(false);
        });

        it("refuses to build over a directory containing files pokie build did not generate", async () => {
            const blueprintPath = writeBlueprintFile(buildBlueprint());
            const outDir = path.join(workDir, "out");
            fs.mkdirSync(outDir, {recursive: true});
            fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify({name: "someone-elses-project"}));

            const {status, body} = await post(`${homeBaseUrl}/api/home/projects/build`, {blueprintPath, outDir});

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "error"});
            expect((body as {error: string}).error).toContain("did not generate: package.json");
        });

        it("opens a just-built project via the Home Open action, transitioning Studio's context in place", async () => {
            const blueprintPath = writeBlueprintFile(buildBlueprint());
            const outDir = path.join(workDir, "out");
            const built = await post(`${homeBaseUrl}/api/home/projects/build`, {blueprintPath, outDir});
            const projectRoot = (built.body as {projectRoot: string}).projectRoot;

            // The generated package's entry module (src/generated/index.js) is plain, already-compiled
            // JS with no further build step — genuinely loadable via the real loadPokieGame, no stub
            // needed, proving the "Open in Studio" action works end-to-end after a real build.
            const opened = await post(`${homeBaseUrl}/api/home/projects/open`, {projectRoot});

            expect(opened.status).toBe(200);
            expect((opened.body as {context: unknown}).context).toEqual({mode: "project", projectRoot});

            const context = await get(`${homeBaseUrl}/api/context`);
            expect(context.body).toEqual({mode: "project", projectRoot});
        });

        describe("POST /api/home/blueprints/validate", () => {
            it("rejects a body with no blueprint field", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/validate`, {});

                expect(status).toBe(400);
                expect(body).toEqual({error: '"blueprint" is required.'});
            });

            it("returns ok with no warnings for a clean blueprint", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/validate`, {blueprint: buildBlueprint()});

                expect(status).toBe(200);
                expect(body).toEqual({status: "ok", warnings: []});
            });

            it("returns ok with warnings for a valid-but-unusual blueprint", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/validate`, {
                    blueprint: buildBlueprint({reels: 15}),
                });

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "ok"});
                expect((body as {warnings: Array<{code: string}>}).warnings[0].code).toBe("blueprint-reels-suspicious");
            });

            it("returns invalid with structural errors for a broken blueprint", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/validate`, {
                    blueprint: buildBlueprint({reels: 0}),
                });

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "invalid"});
                expect((body as {errors: Array<{code: string}>}).errors[0].code).toBe("blueprint-reels-invalid");
            });
        });

        describe("POST /api/home/blueprints/load", () => {
            it("rejects a body with no path field", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/load`, {});

                expect(status).toBe(400);
                expect(body).toEqual({error: '"path" is required.'});
            });

            it("loads and returns the parsed blueprint", async () => {
                const blueprintPath = writeBlueprintFile(buildBlueprint());

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/load`, {path: blueprintPath});

                expect(status).toBe(200);
                expect(body).toEqual({status: "ok", path: blueprintPath, blueprint: buildBlueprint()});
            });

            it("returns a safe load-error for a missing file", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/load`, {
                    path: path.join(workDir, "does-not-exist.json"),
                });

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "load-error"});
                expect(JSON.stringify(body)).not.toContain("\\n    at ");
            });

            it("returns a safe load-error for a path inside Studio's own internal directory", async () => {
                const insidePath = path.join(homeStudioRoot, "index.html");

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/load`, {path: insidePath});

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "load-error"});
                expect((body as {error: string}).error).toContain("internal directory");
            });
        });

        describe("POST /api/home/blueprints/save", () => {
            it("rejects a body with no path field", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/save`, {blueprint: buildBlueprint()});

                expect(status).toBe(400);
                expect(body).toEqual({error: '"path" is required.'});
            });

            it("rejects a body with no blueprint field", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/save`, {
                    path: path.join(workDir, "out.json"),
                });

                expect(status).toBe(400);
                expect(body).toEqual({error: '"blueprint" is required.'});
            });

            it("writes a new file with a stable field order and a trailing newline", async () => {
                const filePath = path.join(workDir, "out.json");

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/save`, {
                    path: filePath,
                    blueprint: buildBlueprint(),
                });

                expect(status).toBe(201);
                expect(body).toEqual({status: "ok", path: filePath});
                const written = fs.readFileSync(filePath, "utf-8");
                expect(written.endsWith("\n")).toBe(true);
                expect(Object.keys(JSON.parse(written))).toEqual(["manifest", "reels", "rows", "symbols", "paytable"]);
            });

            it("returns 409 conflict and writes nothing when the file already exists and overwrite isn't set", async () => {
                const filePath = path.join(workDir, "out.json");
                fs.writeFileSync(filePath, "existing content");

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/save`, {
                    path: filePath,
                    blueprint: buildBlueprint(),
                });

                expect(status).toBe(409);
                expect(body).toMatchObject({status: "conflict", path: filePath});
                expect(fs.readFileSync(filePath, "utf-8")).toBe("existing content");
            });

            it("overwrites the file once overwrite:true is sent, and re-saving unchanged content is byte-identical", async () => {
                const filePath = path.join(workDir, "out.json");

                const first = await post(`${homeBaseUrl}/api/home/blueprints/save`, {path: filePath, blueprint: buildBlueprint()});
                expect(first.status).toBe(201);
                const firstBytes = fs.readFileSync(filePath);

                const second = await post(`${homeBaseUrl}/api/home/blueprints/save`, {
                    path: filePath,
                    blueprint: buildBlueprint(),
                    overwrite: true,
                });

                expect(second.status).toBe(201);
                expect(fs.readFileSync(filePath).equals(firstBytes)).toBe(true);
            });
        });

        describe("POST /api/home/blueprints/build-preview", () => {
            it("returns an ok preview without writing anything", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/build-preview`, {
                    blueprint: buildBlueprint(),
                });

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "ok", manifest: {id: "crazy-fruits"}, reels: 3, rows: 3, symbolsCount: 2});
                expect(fs.readdirSync(workDir)).toEqual([]);
            });

            it("returns invalid for a structurally broken blueprint", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/build-preview`, {
                    blueprint: buildBlueprint({reels: 0}),
                });

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "invalid"});
            });
        });

        describe("POST /api/home/blueprints/build", () => {
            it("builds a real package via the real GamePackageGenerator and records it as recent", async () => {
                const outDir = path.join(workDir, "out");

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/build`, {
                    blueprint: buildBlueprint(),
                    outDir,
                });

                expect(status).toBe(201);
                expect(body).toMatchObject({status: "ok", manifest: {id: "crazy-fruits"}, unchanged: false});
                expect(fs.existsSync(path.join(outDir, "src", "generated", "index.js"))).toBe(true);

                const recent = await get(`${homeBaseUrl}/api/home/recent-projects`);
                expect((recent.body as Array<{projectRoot: string}>)[0].projectRoot).toBe(outDir);
            });

            it("rejects building an invalid blueprint and writes nothing", async () => {
                const outDir = path.join(workDir, "out");

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/build`, {
                    blueprint: buildBlueprint({reels: 0}),
                    outDir,
                });

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "invalid"});
                expect(fs.existsSync(outDir)).toBe(false);
            });

            it("safely rebuilds the same outDir twice (unchanged: true, no conflict)", async () => {
                const outDir = path.join(workDir, "out");

                const first = await post(`${homeBaseUrl}/api/home/blueprints/build`, {blueprint: buildBlueprint(), outDir});
                const second = await post(`${homeBaseUrl}/api/home/blueprints/build`, {blueprint: buildBlueprint(), outDir});

                expect(first.status).toBe(201);
                expect(second.status).toBe(201);
                expect(second.body).toMatchObject({status: "ok", unchanged: true});
            });

            it("refuses to build over a directory containing files pokie build did not generate", async () => {
                const outDir = path.join(workDir, "out");
                fs.mkdirSync(outDir, {recursive: true});
                fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify({name: "someone-elses-project"}));

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/build`, {
                    blueprint: buildBlueprint(),
                    outDir,
                });

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "error"});
                expect((body as {error: string}).error).toContain("did not generate: package.json");
            });

            it("opens a just-built project via the Home Open action, transitioning Studio's context in place (Home -> Project)", async () => {
                const outDir = path.join(workDir, "out");
                const built = await post(`${homeBaseUrl}/api/home/blueprints/build`, {blueprint: buildBlueprint(), outDir});
                const projectRoot = (built.body as {projectRoot: string}).projectRoot;

                const opened = await post(`${homeBaseUrl}/api/home/projects/open`, {projectRoot});

                expect(opened.status).toBe(200);
                expect((opened.body as {context: unknown}).context).toEqual({mode: "project", projectRoot});

                const context = await get(`${homeBaseUrl}/api/context`);
                expect(context.body).toEqual({mode: "project", projectRoot});
            });
        });
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
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});

            const {status, body} = await get(`${baseUrl}/api/project/context`);

            expect(status).toBe(200);
            expect(body).toEqual({status: "loaded", projectRoot: path.resolve("./crazy-fruits"), game: manifest});
        });

        it('stays "empty" after creating a project that is not (yet) opened', async () => {
            await post(`${baseUrl}/api/home/projects/create`, {destinationDir: process.cwd(), name: "crazy-fruits"});

            const {status, body} = await get(`${baseUrl}/api/project/context`);

            expect(status).toBe(200);
            expect(body).toEqual({status: "empty"});
            expect(loadGame).not.toHaveBeenCalled();
        });

        it('reports "loaded" with the scaffolded manifest once the newly created project is explicitly opened', async () => {
            await post(`${baseUrl}/api/home/projects/create`, {destinationDir: process.cwd(), name: "crazy-fruits"});
            loadGame.mockResolvedValue(createFakeGame(scaffoldResult.manifest));

            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: scaffoldResult.projectRoot});
            const {status, body} = await get(`${baseUrl}/api/project/context`);

            expect(status).toBe(200);
            expect(body).toEqual({
                status: "loaded",
                projectRoot: scaffoldResult.projectRoot,
                game: scaffoldResult.manifest,
            });
        });

        it('reports "empty" again after closing a project', async () => {
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            loadGame.mockResolvedValue(createFakeGame(manifest));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});

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
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});
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
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});
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
                homeService: new StudioHomeService(
                    "1.0.0",
                    undefined,
                    creator,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    slowLoadGame,
                ),
                blueprintService: new StudioBlueprintService("1.0.0", projectStudioRoot, new StudioHomeService("1.0.0")),
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
                homeService: new StudioHomeService(
                    "1.0.0",
                    undefined,
                    creator,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    failingLoadGame,
                ),
                blueprintService: new StudioBlueprintService("1.0.0", projectStudioRoot, new StudioHomeService("1.0.0")),
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
                homeService: new StudioHomeService(
                    "1.0.0",
                    undefined,
                    creator,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    loadGame,
                ),
                blueprintService: new StudioBlueprintService("1.0.0", fixtureStudioRoot, new StudioHomeService("1.0.0")),
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
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});
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
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});
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
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});
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
                homeService: new StudioHomeService(
                    "1.0.0",
                    undefined,
                    createStubCreator(scaffoldResult),
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    () => Promise.resolve(createPlayableFakeGame(manifest)),
                ),
                blueprintService: new StudioBlueprintService("1.0.0", projectStudioRoot, new StudioHomeService("1.0.0")),
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
                homeService: new StudioHomeService(
                    "1.0.0",
                    undefined,
                    createStubCreator(scaffoldResult),
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    () => Promise.resolve(createPlayableFakeGame(manifest)),
                ),
                blueprintService: new StudioBlueprintService("1.0.0", projectStudioRoot, new StudioHomeService("1.0.0")),
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

    describe("Project Dashboard: Reports (GET /api/project/reports*)", () => {
        const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

        async function openCrazyFruits(game: PokieGame): Promise<void> {
            loadGame.mockResolvedValue(game);
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});
        }

        async function runToCompletion(rounds: number, seed?: string): Promise<string> {
            const created = await post(`${baseUrl}/api/project/simulations`, seed === undefined ? {rounds} : {rounds, seed});
            const {id} = created.body as {id: string};
            await pollUntilTerminal(`${baseUrl}/api/project/simulations/${id}`);
            return id;
        }

        it("returns 409 for GET /api/project/reports when there is no active project", async () => {
            const {status, body} = await get(`${baseUrl}/api/project/reports`);

            expect(status).toBe(409);
            expect(body).toEqual({error: "No active project."});
        });

        it("returns an empty list when the project has no completed simulations yet", async () => {
            await openCrazyFruits(createPlayableFakeGame(manifest));

            const {status, body} = await get(`${baseUrl}/api/project/reports`);

            expect(status).toBe(200);
            expect(body).toEqual([]);
        });

        it("lists a completed simulation with the required summary fields", async () => {
            await openCrazyFruits(createPlayableFakeGame(manifest));
            const id = await runToCompletion(30, "demo");

            const {status, body} = await get(`${baseUrl}/api/project/reports`);

            expect(status).toBe(200);
            const entries = body as Array<Record<string, unknown>>;
            expect(entries).toHaveLength(1);
            expect(entries[0]).toMatchObject({
                id,
                status: "completed",
                game: {id: "crazy-fruits", version: "0.1.0"},
                requestedRounds: 30,
                actualRounds: 30,
                seed: "demo",
            });
            expect(typeof entries[0].rtp).toBe("number");
            expect(typeof entries[0].hitFrequency).toBe("number");
            expect(typeof entries[0].maxWin).toBe("number");
            expect(typeof entries[0].startedAt).toBe("string");
            expect(typeof entries[0].completedAt).toBe("string");
            expect(typeof entries[0].durationMs).toBe("number");
            expect(typeof entries[0].hasWarnings).toBe("boolean");
        });

        it("never lists a failed simulation (no report to summarize)", async () => {
            loadGame.mockResolvedValueOnce(createPlayableFakeGame(manifest));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});
            loadGame.mockRejectedValueOnce(new Error("boom"));
            await runToCompletion(10);

            const {body} = await get(`${baseUrl}/api/project/reports`);

            expect(body).toEqual([]);
        });

        it("returns the full SimulationReport for a completed job", async () => {
            await openCrazyFruits(createPlayableFakeGame(manifest));
            const id = await runToCompletion(30, "demo");

            const {status, body} = await get(`${baseUrl}/api/project/reports/${id}`);

            expect(status).toBe(200);
            expect(body).toMatchObject({game: manifest, rounds: 30, requestedRounds: 30, seed: "demo"});
        });

        it("returns 404 for an unknown report id", async () => {
            await openCrazyFruits(createPlayableFakeGame(manifest));

            const {status, body} = await get(`${baseUrl}/api/project/reports/does-not-exist`);

            expect(status).toBe(404);
            expect(body).toEqual({error: 'Unknown report id "does-not-exist".'});
        });

        it("returns 409 for a failed simulation (no report available)", async () => {
            loadGame.mockResolvedValueOnce(createPlayableFakeGame(manifest));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});
            loadGame.mockRejectedValueOnce(new Error("boom"));
            const id = await runToCompletion(10);

            const {status, body} = await get(`${baseUrl}/api/project/reports/${id}`);

            expect(status).toBe(409);
            expect(body).toEqual({error: `Simulation "${id}" has no report (status: failed).`});
        });

        it("returns 404 (not a leak) for a report id that belongs to a different project", async () => {
            await openCrazyFruits(createPlayableFakeGame(manifest));
            const idFromProjectA = await runToCompletion(10);

            await post(`${baseUrl}/api/projects/close`);
            loadGame.mockResolvedValue(createPlayableFakeGame({id: "other-game", name: "Other Game", version: "2.0.0"}));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./other-game"});

            const {status, body} = await get(`${baseUrl}/api/project/reports/${idFromProjectA}`);

            expect(status).toBe(404);
            expect(body).toEqual({error: `Unknown report id "${idFromProjectA}".`});
        });

        describe("download (GET /api/project/reports/:id/download)", () => {
            it("returns 400 for a missing/invalid format", async () => {
                await openCrazyFruits(createPlayableFakeGame(manifest));
                const id = await runToCompletion(10);

                const missing = await fetch(`${baseUrl}/api/project/reports/${id}/download`);
                expect(missing.status).toBe(400);

                const invalid = await fetch(`${baseUrl}/api/project/reports/${id}/download?format=csv`);
                expect(invalid.status).toBe(400);
            });

            it("returns 404 for an unknown report id", async () => {
                await openCrazyFruits(createPlayableFakeGame(manifest));

                const response = await fetch(`${baseUrl}/api/project/reports/does-not-exist/download?format=json`);

                expect(response.status).toBe(404);
            });

            it("returns 409 for a simulation with no report", async () => {
                loadGame.mockResolvedValueOnce(createPlayableFakeGame(manifest));
                await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});
                loadGame.mockRejectedValueOnce(new Error("boom"));
                const id = await runToCompletion(10);

                const response = await fetch(`${baseUrl}/api/project/reports/${id}/download?format=json`);

                expect(response.status).toBe(409);
            });

            it("downloads a JSON artifact with correct headers and a parseable body", async () => {
                await openCrazyFruits(createPlayableFakeGame(manifest));
                const id = await runToCompletion(30, "demo");

                const response = await fetch(`${baseUrl}/api/project/reports/${id}/download?format=json`);

                expect(response.status).toBe(200);
                expect(response.headers.get("content-type")).toContain("application/json");
                expect(response.headers.get("content-disposition")).toBe(
                    `attachment; filename="crazy-fruits-0.1.0-${id}.json"`,
                );
                const parsed = JSON.parse(await response.text());
                expect(parsed).toMatchObject({game: manifest, rounds: 30, seed: "demo"});
            });

            it("downloads a Markdown artifact with correct headers and the key metrics", async () => {
                await openCrazyFruits(createPlayableFakeGame(manifest));
                const id = await runToCompletion(30, "demo");

                const response = await fetch(`${baseUrl}/api/project/reports/${id}/download?format=markdown`);

                expect(response.status).toBe(200);
                expect(response.headers.get("content-type")).toContain("text/markdown");
                expect(response.headers.get("content-disposition")).toBe(
                    `attachment; filename="crazy-fruits-0.1.0-${id}.md"`,
                );
                const body = await response.text();
                expect(body).toContain("# Simulation Report: Crazy Fruits");
                expect(body).toContain("RTP");
                expect(body).toContain("Hit frequency");
            });

            it("downloads a full HTML document with correct headers", async () => {
                await openCrazyFruits(createPlayableFakeGame(manifest));
                const id = await runToCompletion(30, "demo");

                const response = await fetch(`${baseUrl}/api/project/reports/${id}/download?format=html`);

                expect(response.status).toBe(200);
                expect(response.headers.get("content-type")).toContain("text/html");
                expect(response.headers.get("content-disposition")).toBe(
                    `attachment; filename="crazy-fruits-0.1.0-${id}.html"`,
                );
                const body = await response.text();
                expect(body).toContain("<!DOCTYPE html>");
                expect(body).toContain("</html>");
            });
        });
    });

    describe("Project Dashboard: Reports edge cases (custom report shapes)", () => {
        let reportsStudioRoot: string;
        let reportsServer: StudioServer | undefined;

        beforeEach(() => {
            reportsStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-reports-edge-test-"));
            writeStudioAssets(reportsStudioRoot);
        });

        afterEach(async () => {
            await reportsServer?.stop();
            fs.rmSync(reportsStudioRoot, {recursive: true, force: true});
        });

        async function startServerWithReportBuilder(reportBuilder: SimulationReportBuilding): Promise<string> {
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            const simulationService = new StudioSimulationService(
                new InMemoryStudioSimulationRepository(),
                () => Promise.resolve(createPlayableFakeGame(manifest)),
                reportBuilder,
            );
            reportsServer = new StudioServer({
                host: "127.0.0.1",
                port: 0,
                studioRoot: reportsStudioRoot,
                homeService: new StudioHomeService(
                    "1.0.0",
                    undefined,
                    createStubCreator(scaffoldResult),
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    () => Promise.resolve(createPlayableFakeGame(manifest)),
                ),
                blueprintService: new StudioBlueprintService("1.0.0", reportsStudioRoot, new StudioHomeService("1.0.0")),
                loadGame: () => Promise.resolve(createPlayableFakeGame(manifest)),
                simulationService,
                initialContext: {mode: "project", projectRoot: "/tmp/crazy-fruits"},
            });
            const address = await reportsServer.start();
            return `http://${address.host}:${address.port}`;
        }

        it("lists and downloads an old-shape report (missing breakdown/warnings/recommendations/reproducibility) without error", async () => {
            const minimalReport: SimulationReport = {
                game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
                requestedRounds: 10,
                rounds: 10,
                seed: null,
                totalBet: 10,
                totalWin: 5,
                rtp: 0.5,
                hitFrequency: 0.2,
                maxWin: 5,
                durationMs: 10,
                spinsPerSecond: 1000,
                // Deliberately no breakdown/warnings/recommendations/reproducibility.
            };
            const projectBaseUrl = await startServerWithReportBuilder({build: () => minimalReport});

            const created = await post(`${projectBaseUrl}/api/project/simulations`, {rounds: 10});
            const {id} = created.body as {id: string};
            await pollUntilTerminal(`${projectBaseUrl}/api/project/simulations/${id}`);

            const list = await get(`${projectBaseUrl}/api/project/reports`);
            expect(list.status).toBe(200);
            expect((list.body as Array<{hasWarnings: boolean}>)[0].hasWarnings).toBe(false);

            const detail = await get(`${projectBaseUrl}/api/project/reports/${id}`);
            expect(detail.status).toBe(200);
            expect(detail.body).toEqual(minimalReport);

            for (const format of ["json", "markdown", "html"]) {
                const response = await fetch(`${projectBaseUrl}/api/project/reports/${id}/download?format=${format}`);
                expect(response.status).toBe(200);
            }
        });

        it("returns a safe 500 (no stack trace) when the renderer throws on a malformed report", async () => {
            const malformedReport = {} as SimulationReport; // missing even `game` — renderers will throw reading report.game.name
            const projectBaseUrl = await startServerWithReportBuilder({build: () => malformedReport});

            const created = await post(`${projectBaseUrl}/api/project/simulations`, {rounds: 10});
            const {id} = created.body as {id: string};
            await pollUntilTerminal(`${projectBaseUrl}/api/project/simulations/${id}`);

            const response = await fetch(`${projectBaseUrl}/api/project/reports/${id}/download?format=markdown`);

            expect(response.status).toBe(500);
            const body = await response.json();
            expect(typeof (body as {error: string}).error).toBe("string");
            expect(JSON.stringify(body)).not.toContain("\\n    at ");
        });
    });

    describe("Project Dashboard: Replay (POST/GET/DELETE /api/project/replays*)", () => {
        const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

        // Persistent (not "Once"): the replay's own StudioReplayExecutionService independently calls
        // this same `loadGame` a second time (see StudioReplayExecutionService.run()), same reasoning
        // as the Simulation describe block's own openCrazyFruits().
        async function openCrazyFruits(game: PokieGame): Promise<void> {
            loadGame.mockResolvedValue(game);
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});
        }

        it("returns 409 for POST when there is no active project", async () => {
            const {status, body} = await post(`${baseUrl}/api/project/replays`, {round: 1});

            expect(status).toBe(409);
            expect(body).toEqual({error: "No active project."});
        });

        it("returns 409 for GET (list) when there is no active project", async () => {
            const {status, body} = await get(`${baseUrl}/api/project/replays`);

            expect(status).toBe(409);
            expect(body).toEqual({error: "No active project."});
        });

        it("rejects an invalid round with 400 and never creates a job", async () => {
            await openCrazyFruits(createSeedAwareFakeGame(manifest));

            const zero = await post(`${baseUrl}/api/project/replays`, {round: 0});
            expect(zero.status).toBe(400);
            expect(zero.body).toEqual({error: '"round" must be a positive integer.'});

            const nonInteger = await post(`${baseUrl}/api/project/replays`, {round: 4.2});
            expect(nonInteger.status).toBe(400);

            expect((await get(`${baseUrl}/api/project/replays`)).body).toEqual([]);
        });

        it("rejects a round above the safety limit with 400", async () => {
            await openCrazyFruits(createSeedAwareFakeGame(manifest));

            const {status, body} = await post(`${baseUrl}/api/project/replays`, {round: 100_000_001});

            expect(status).toBe(400);
            expect(body).toEqual({error: '"round" must not exceed 100000.'});
        });

        it("rejects an empty seed with 400", async () => {
            await openCrazyFruits(createSeedAwareFakeGame(manifest));

            const {status, body} = await post(`${baseUrl}/api/project/replays`, {round: 1, seed: "  "});

            expect(status).toBe(400);
            expect(body).toEqual({error: '"seed" must be a non-empty string when given.'});
        });

        // The core fix this slice is about: POST returns immediately with a queued job, regardless of
        // how large `round` is — it never runs the replay itself inline. See the "stays responsive"
        // test below for the end-to-end proof that other requests aren't blocked either.
        it("returns 202 with a queued job immediately, before the replay itself has run", async () => {
            await openCrazyFruits(createSeedAwareFakeGame(manifest));

            const {status, body} = await post(`${baseUrl}/api/project/replays`, {round: 5, seed: "demo"});

            expect(status).toBe(202);
            const job = body as {id: string; status: string; round: number; seed: string; completedRounds: number};
            expect(job.status).toBe("queued");
            expect(job.round).toBe(5);
            expect(job.seed).toBe("demo");
            expect(job.completedRounds).toBe(0);
            expect(typeof job.id).toBe("string");
        });

        it("runs a replay to completion and returns the full descriptor", async () => {
            await openCrazyFruits(createSeedAwareFakeGame(manifest));

            const created = await post(`${baseUrl}/api/project/replays`, {round: 5, seed: "demo"});
            const createdBody = created.body as {id: string};

            const {status, body} = await pollUntilTerminal(`${baseUrl}/api/project/replays/${createdBody.id}`);

            expect(status).toBe(200);
            expect(body.status).toBe("completed");
            expect(body.descriptor).toMatchObject({game: manifest, round: 5, seed: "demo"});
            expect(body.completedRounds).toBe(5);
        });

        it("produces the exact same descriptor for the same seed/round (reproducibility)", async () => {
            await openCrazyFruits(createSeedAwareFakeGame(manifest));

            const firstCreated = await post(`${baseUrl}/api/project/replays`, {round: 10, seed: "reproducible"});
            const first = await pollUntilTerminal(`${baseUrl}/api/project/replays/${(firstCreated.body as {id: string}).id}`);
            const secondCreated = await post(`${baseUrl}/api/project/replays`, {round: 10, seed: "reproducible"});
            const second = await pollUntilTerminal(`${baseUrl}/api/project/replays/${(secondCreated.body as {id: string}).id}`);

            const firstDescriptor = first.body.descriptor as Record<string, unknown>;
            const secondDescriptor = second.body.descriptor as Record<string, unknown>;
            expect(secondDescriptor).toEqual({...firstDescriptor, timestamp: secondDescriptor.timestamp, durationMs: secondDescriptor.durationMs});
        });

        it("still succeeds for a game that ignores the seed entirely", async () => {
            await openCrazyFruits(createPlayableFakeGame(manifest));

            const created = await post(`${baseUrl}/api/project/replays`, {round: 4, seed: "whatever"});
            const {body} = await pollUntilTerminal(`${baseUrl}/api/project/replays/${(created.body as {id: string}).id}`);

            expect(body.status).toBe("completed");
            expect((body.descriptor as {seed: string}).seed).toBe("whatever");
        });

        it("records screen: null for a session without getSymbolsCombination()", async () => {
            await openCrazyFruits(createFakeGameWithoutScreen(manifest));

            const created = await post(`${baseUrl}/api/project/replays`, {round: 3});
            const {body} = await pollUntilTerminal(`${baseUrl}/api/project/replays/${(created.body as {id: string}).id}`);

            expect(body.status).toBe("completed");
            expect((body.descriptor as {screen: unknown}).screen).toBeNull();
        });

        it("fails the job with a safe message (no stack trace) when loading the game fails", async () => {
            loadGame.mockResolvedValueOnce(createSeedAwareFakeGame(manifest));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});
            loadGame.mockRejectedValueOnce(new Error("Cannot find module './dist/index.js'"));

            const created = await post(`${baseUrl}/api/project/replays`, {round: 3});
            const {body} = await pollUntilTerminal(`${baseUrl}/api/project/replays/${(created.body as {id: string}).id}`);

            expect(body.status).toBe("failed");
            expect(body.error).toBe("Cannot find module './dist/index.js'");
            expect(JSON.stringify(body)).not.toContain("\\n    at ");
        });

        it("rejects a second POST for the same project with 409 while one is already queued/running", async () => {
            loadGame.mockResolvedValueOnce(createSeedAwareFakeGame(manifest));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});
            // The replay's own independent load never resolves — keeps the first job "queued" forever,
            // so the conflict check below can never race.
            loadGame.mockReturnValueOnce(
                new Promise(() => {
                    // never resolves
                }),
            );

            const first = await post(`${baseUrl}/api/project/replays`, {round: 1000});
            const firstBody = first.body as {id: string};
            const second = await post(`${baseUrl}/api/project/replays`, {round: 500});

            expect(second.status).toBe(409);
            expect(second.body).toEqual({
                error: "A replay is already running for this project.",
                activeJobId: firstBody.id,
            });
        });

        it("returns 404 for GET of an unknown replay id", async () => {
            await openCrazyFruits(createSeedAwareFakeGame(manifest));

            const {status, body} = await get(`${baseUrl}/api/project/replays/does-not-exist`);

            expect(status).toBe(404);
            expect(body).toEqual({error: 'Unknown replay id "does-not-exist".'});
        });

        it("returns 404 for DELETE of an unknown replay id", async () => {
            await openCrazyFruits(createSeedAwareFakeGame(manifest));

            const {status, body} = await del(`${baseUrl}/api/project/replays/does-not-exist`);

            expect(status).toBe(404);
            expect(body).toEqual({error: 'Unknown replay id "does-not-exist".'});
        });

        it("lists a project's replays with the required summary fields", async () => {
            await openCrazyFruits(createSeedAwareFakeGame(manifest));
            const created = await post(`${baseUrl}/api/project/replays`, {round: 5, seed: "demo"});
            await pollUntilTerminal(`${baseUrl}/api/project/replays/${(created.body as {id: string}).id}`);

            const {status, body} = await get(`${baseUrl}/api/project/replays`);

            expect(status).toBe(200);
            const entries = body as Array<Record<string, unknown>>;
            expect(entries).toHaveLength(1);
            expect(entries[0]).toMatchObject({status: "completed", game: manifest, round: 5, seed: "demo"});
            expect(typeof entries[0].totalBet).toBe("number");
            expect(typeof entries[0].startedAt).toBe("string");
        });

        it("returns an empty list when the project has no replays yet", async () => {
            await openCrazyFruits(createSeedAwareFakeGame(manifest));

            const {status, body} = await get(`${baseUrl}/api/project/replays`);

            expect(status).toBe(200);
            expect(body).toEqual([]);
        });

        it("downloads a JSON artifact with correct headers and a parseable, matching body once completed", async () => {
            await openCrazyFruits(createSeedAwareFakeGame(manifest));
            const created = await post(`${baseUrl}/api/project/replays`, {round: 5, seed: "demo"});
            const {id} = created.body as {id: string};
            const {body} = await pollUntilTerminal(`${baseUrl}/api/project/replays/${id}`);

            const response = await fetch(`${baseUrl}/api/project/replays/${id}/download`);

            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain("application/json");
            expect(response.headers.get("content-disposition")).toBe(`attachment; filename="crazy-fruits-0.1.0-${id}.json"`);
            expect(JSON.parse(await response.text())).toEqual(body.descriptor);
        });

        it("returns 409 (not-ready) when downloading a replay that hasn't completed yet", async () => {
            loadGame.mockResolvedValueOnce(createSeedAwareFakeGame(manifest));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});
            loadGame.mockReturnValueOnce(
                new Promise(() => {
                    // never resolves — keeps the job "queued"
                }),
            );
            const created = await post(`${baseUrl}/api/project/replays`, {round: 10});
            const {id} = created.body as {id: string};

            const response = await fetch(`${baseUrl}/api/project/replays/${id}/download`);

            expect(response.status).toBe(409);
        });

        it("returns 409 (not-ready) when downloading a failed replay", async () => {
            loadGame.mockResolvedValueOnce(createSeedAwareFakeGame(manifest));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./crazy-fruits"});
            loadGame.mockRejectedValueOnce(new Error("boom"));
            const created = await post(`${baseUrl}/api/project/replays`, {round: 10});
            const {id} = created.body as {id: string};
            await pollUntilTerminal(`${baseUrl}/api/project/replays/${id}`);

            const response = await fetch(`${baseUrl}/api/project/replays/${id}/download`);

            expect(response.status).toBe(409);
        });

        it("returns 404 when downloading an unknown replay id", async () => {
            await openCrazyFruits(createSeedAwareFakeGame(manifest));

            const response = await fetch(`${baseUrl}/api/project/replays/does-not-exist/download`);

            expect(response.status).toBe(404);
        });

        it("returns 404 (not a leak) for a replay id that belongs to a different project", async () => {
            await openCrazyFruits(createSeedAwareFakeGame(manifest));
            const created = await post(`${baseUrl}/api/project/replays`, {round: 3});
            const {id} = created.body as {id: string};
            await pollUntilTerminal(`${baseUrl}/api/project/replays/${id}`);

            await post(`${baseUrl}/api/projects/close`);
            loadGame.mockResolvedValue(createSeedAwareFakeGame({id: "other-game", name: "Other Game", version: "2.0.0"}));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./other-game"});

            const detail = await get(`${baseUrl}/api/project/replays/${id}`);
            expect(detail.status).toBe(404);

            const list = await get(`${baseUrl}/api/project/replays`);
            expect(list.body).toEqual([]);
        });

        it("makes a saved replay unreachable after switching to a different project, even by its own id", async () => {
            await openCrazyFruits(createSeedAwareFakeGame(manifest));
            const created = await post(`${baseUrl}/api/project/replays`, {round: 3});
            const {id} = created.body as {id: string};
            await pollUntilTerminal(`${baseUrl}/api/project/replays/${id}`);

            await post(`${baseUrl}/api/projects/close`);
            loadGame.mockResolvedValue(createSeedAwareFakeGame({id: "another-game", name: "Another Game", version: "3.0.0"}));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./another-game"});

            const download = await fetch(`${baseUrl}/api/project/replays/${id}/download`);
            expect(download.status).toBe(404);
        });
    });

    describe("Project Dashboard: Replay cancellation (controlled chunk pacing)", () => {
        let projectStudioRoot: string;
        let projectServer: StudioServer | undefined;

        beforeEach(() => {
            projectStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-replay-cancel-test-"));
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

        it("cancels a running replay via DELETE, stopping further progress", async () => {
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            const gate = createControlledYield();
            const replayService = new StudioReplayExecutionService(
                new InMemoryStudioReplayRepository(),
                () => Promise.resolve(createPlayableFakeGame(manifest)),
                10, // chunkSize
                undefined,
                gate.yieldToEventLoop,
            );

            projectServer = new StudioServer({
                host: "127.0.0.1",
                port: 0,
                studioRoot: projectStudioRoot,
                homeService: new StudioHomeService(
                    "1.0.0",
                    undefined,
                    createStubCreator(scaffoldResult),
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    () => Promise.resolve(createPlayableFakeGame(manifest)),
                ),
                blueprintService: new StudioBlueprintService("1.0.0", projectStudioRoot, new StudioHomeService("1.0.0")),
                loadGame: () => Promise.resolve(createPlayableFakeGame(manifest)),
                replayService,
                initialContext: {mode: "project", projectRoot: "/tmp/crazy-fruits"},
            });
            const address = await projectServer.start();
            const projectBaseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${projectBaseUrl}/api/project/replays`, {round: 25});
            const createdBody = created.body as {id: string};
            await flushMacrotask();
            expect(gate.pendingCount()).toBe(1);

            const cancelResponse = await del(`${projectBaseUrl}/api/project/replays/${createdBody.id}`);
            expect(cancelResponse.status).toBe(200);

            gate.release();
            await flushMacrotask();

            const {body} = await get(`${projectBaseUrl}/api/project/replays/${createdBody.id}`);
            expect((body as {status: string}).status).toBe("cancelled");
            expect((body as {completedRounds: number}).completedRounds).toBe(10);
            expect((body as {descriptor?: unknown}).descriptor).toBeUndefined();
        });

        it("stopping the Studio server during an active replay resolves cleanly and cancels the job", async () => {
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            const gate = createControlledYield();
            const replayService = new StudioReplayExecutionService(
                new InMemoryStudioReplayRepository(),
                () => Promise.resolve(createPlayableFakeGame(manifest)),
                10,
                undefined,
                gate.yieldToEventLoop,
            );

            projectServer = new StudioServer({
                host: "127.0.0.1",
                port: 0,
                studioRoot: projectStudioRoot,
                homeService: new StudioHomeService(
                    "1.0.0",
                    undefined,
                    createStubCreator(scaffoldResult),
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    () => Promise.resolve(createPlayableFakeGame(manifest)),
                ),
                blueprintService: new StudioBlueprintService("1.0.0", projectStudioRoot, new StudioHomeService("1.0.0")),
                loadGame: () => Promise.resolve(createPlayableFakeGame(manifest)),
                replayService,
                initialContext: {mode: "project", projectRoot: "/tmp/crazy-fruits"},
            });
            const address = await projectServer.start();
            const projectBaseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${projectBaseUrl}/api/project/replays`, {round: 25});
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

            expect(replayService.getStatus("/tmp/crazy-fruits", createdBody.id)?.status).toBe("cancelled");
        });

        // The concrete fix this slice is about: with the chunk loop paused mid-replay (simulating a
        // very late round still in progress), the same HTTP server must still serve completely
        // unrelated requests — health, Inspect, Validate — instead of the event loop being blocked for
        // the replay's entire duration.
        it("keeps serving GET /api/health, /api/project/inspect and /api/project/validate while a replay is running", async () => {
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            const gate = createControlledYield();
            const replayService = new StudioReplayExecutionService(
                new InMemoryStudioReplayRepository(),
                () => Promise.resolve(createPlayableFakeGame(manifest)),
                10,
                undefined,
                gate.yieldToEventLoop,
            );
            const inspectStub = jest.fn().mockReturnValue({packageRoot: "/tmp/crazy-fruits", valid: true, generated: false});
            const validateStub = jest.fn().mockResolvedValue({packageRoot: "/tmp/crazy-fruits", valid: true, game: manifest, errors: [], warnings: [], suggestions: []});

            projectServer = new StudioServer({
                host: "127.0.0.1",
                port: 0,
                studioRoot: projectStudioRoot,
                homeService: new StudioHomeService(
                    "1.0.0",
                    undefined,
                    createStubCreator(scaffoldResult),
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    () => Promise.resolve(createPlayableFakeGame(manifest)),
                ),
                blueprintService: new StudioBlueprintService("1.0.0", projectStudioRoot, new StudioHomeService("1.0.0")),
                loadGame: () => Promise.resolve(createPlayableFakeGame(manifest)),
                gamePackageInspector: {inspect: inspectStub},
                gamePackageValidator: {validate: validateStub},
                replayService,
                initialContext: {mode: "project", projectRoot: "/tmp/crazy-fruits"},
            });
            const address = await projectServer.start();
            const projectBaseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${projectBaseUrl}/api/project/replays`, {round: 99_999});
            await flushMacrotask();
            expect(gate.pendingCount()).toBe(1); // still paused mid-replay, nowhere near done

            const health = await get(`${projectBaseUrl}/api/health`);
            expect(health.status).toBe(200);
            const inspect = await get(`${projectBaseUrl}/api/project/inspect`);
            expect(inspect.status).toBe(200);
            const validate = await get(`${projectBaseUrl}/api/project/validate`);
            expect(validate.status).toBe(200);

            // The replay itself genuinely hasn't progressed past the first chunk this whole time.
            const stillRunning = await get(`${projectBaseUrl}/api/project/replays/${(created.body as {id: string}).id}`);
            expect((stillRunning.body as {status: string}).status).toBe("running");
            expect((stillRunning.body as {completedRounds: number}).completedRounds).toBe(10);
        });
    });

    describe("Project Dashboard: Replay with the real fixture game package", () => {
        let replayStudioRoot: string;
        let replayServer: StudioServer | undefined;

        beforeEach(() => {
            replayStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-replay-fixture-test-"));
            writeStudioAssets(replayStudioRoot);
        });

        afterEach(async () => {
            await replayServer?.stop();
            fs.rmSync(replayStudioRoot, {recursive: true, force: true});
        });

        it("runs a replay against a real fixture game and produces a reproducible descriptor", async () => {
            const fixtureRoot = path.join(__dirname, "..", "fixtures", "playable-game");
            replayServer = new StudioServer({
                host: "127.0.0.1",
                port: 0,
                studioRoot: replayStudioRoot,
                homeService: new StudioHomeService("1.0.0", undefined, createStubCreator(scaffoldResult)),
                blueprintService: new StudioBlueprintService("1.0.0", replayStudioRoot, new StudioHomeService("1.0.0")),
                initialContext: {mode: "project", projectRoot: fixtureRoot},
                replayService: new StudioReplayExecutionService(new InMemoryStudioReplayRepository()),
            });
            const address = await replayServer.start();
            const replayBaseUrl = `http://${address.host}:${address.port}`;

            const firstCreated = await post(`${replayBaseUrl}/api/project/replays`, {round: 20, seed: "demo"});
            const first = await pollUntilTerminal(`${replayBaseUrl}/api/project/replays/${(firstCreated.body as {id: string}).id}`);
            const secondCreated = await post(`${replayBaseUrl}/api/project/replays`, {round: 20, seed: "demo"});
            const second = await pollUntilTerminal(`${replayBaseUrl}/api/project/replays/${(secondCreated.body as {id: string}).id}`);

            expect(first.body.status).toBe("completed");
            expect((first.body.descriptor as {game: unknown}).game).toEqual({
                id: "playable-game",
                name: "Playable Game",
                version: "1.0.0",
            });
            const firstDescriptor = first.body.descriptor as Record<string, unknown>;
            const secondDescriptor = second.body.descriptor as Record<string, unknown>;
            expect(secondDescriptor.totalBet).toBe(firstDescriptor.totalBet);
            expect(secondDescriptor.totalWin).toBe(firstDescriptor.totalWin);
            expect(secondDescriptor.screen).toEqual(firstDescriptor.screen);
        });
    });

    describe("Project Dashboard: Runtime with the real fixture game package", () => {
        let runtimeStudioRoot: string;
        let runtimeServer: StudioServer | undefined;
        const fixtureRoot = path.join(__dirname, "..", "fixtures", "playable-game");

        function createRuntimeServer(initialContext: {mode: "home"} | {mode: "project"; projectRoot: string}): StudioServer {
            return new StudioServer({
                host: "127.0.0.1",
                port: 0,
                studioRoot: runtimeStudioRoot,
                homeService: new StudioHomeService("1.0.0", undefined, createStubCreator(scaffoldResult)),
                blueprintService: new StudioBlueprintService("1.0.0", runtimeStudioRoot, new StudioHomeService("1.0.0")),
                initialContext,
            });
        }

        beforeEach(() => {
            runtimeStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-runtime-fixture-test-"));
            writeStudioAssets(runtimeStudioRoot);
        });

        afterEach(async () => {
            await runtimeServer?.stop();
            fs.rmSync(runtimeStudioRoot, {recursive: true, force: true});
        });

        it("returns 409 'No active project' for every runtime route in Home mode", async () => {
            runtimeServer = createRuntimeServer({mode: "home"});
            const address = await runtimeServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            expect((await get(`${baseUrl}/api/project/runtime`)).status).toBe(409);
            expect((await post(`${baseUrl}/api/project/runtime/start`, {})).status).toBe(409);
            expect((await post(`${baseUrl}/api/project/runtime/stop`)).status).toBe(409);
            expect((await post(`${baseUrl}/api/project/runtime/restart`, {})).status).toBe(409);
            expect((await post(`${baseUrl}/api/project/runtime/sessions`, {})).status).toBe(409);
            expect((await get(`${baseUrl}/api/project/runtime/sessions/unknown`)).status).toBe(409);
            expect((await post(`${baseUrl}/api/project/runtime/sessions/unknown/spins`, {})).status).toBe(409);
        });

        it("reports stopped initially, then running after start on an automatic port, rejects a second start, and stops idempotently", async () => {
            runtimeServer = createRuntimeServer({mode: "project", projectRoot: fixtureRoot});
            const address = await runtimeServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            expect((await get(`${baseUrl}/api/project/runtime`)).body).toEqual({status: "stopped"});

            const started = await post(`${baseUrl}/api/project/runtime/start`, {port: 0});
            expect(started.status).toBe(201);
            expect((started.body as {status: string}).status).toBe("running");
            const runtimePort = (started.body as {port: number}).port;
            expect(runtimePort).toBeGreaterThan(0);

            expect((await get(`${baseUrl}/api/project/runtime`)).body).toMatchObject({status: "running", port: runtimePort});

            const again = await post(`${baseUrl}/api/project/runtime/start`, {port: 0});
            expect(again.status).toBe(409);

            const stopped = await post(`${baseUrl}/api/project/runtime/stop`);
            expect(stopped.status).toBe(200);
            expect(stopped.body).toEqual({status: "stopped"});

            const stoppedAgain = await post(`${baseUrl}/api/project/runtime/stop`);
            expect(stoppedAgain.status).toBe(200);
            expect(stoppedAgain.body).toEqual({status: "stopped"});
        });

        it("creates a session, spins it with debug on, replays a requestId idempotently, and rejects a stale expectedSessionVersion", async () => {
            runtimeServer = createRuntimeServer({mode: "project", projectRoot: fixtureRoot});
            const address = await runtimeServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;
            await post(`${baseUrl}/api/project/runtime/start`, {port: 0, debug: true});

            type SessionResponse = {status: string; session: {sessionId: string; sessionVersion?: number; debug?: unknown}};

            const created = await post(`${baseUrl}/api/project/runtime/sessions`, {});
            expect(created.status).toBe(201);
            const createdBody = created.body as SessionResponse;
            expect(createdBody.status).toBe("ok");
            const sessionId = createdBody.session.sessionId;
            expect(typeof createdBody.session.sessionVersion).toBe("number");
            expect(createdBody.session.debug).toBeDefined();

            const fetched = await get(`${baseUrl}/api/project/runtime/sessions/${sessionId}`);
            expect(fetched.status).toBe(200);

            const spun = await post(`${baseUrl}/api/project/runtime/sessions/${sessionId}/spins`, {requestId: "req-1"});
            expect(spun.status).toBe(200);
            expect((spun.body as SessionResponse).session.debug).toBeDefined();

            const replay = await post(`${baseUrl}/api/project/runtime/sessions/${sessionId}/spins`, {requestId: "req-1"});
            expect(replay.body).toEqual(spun.body);

            const stale = await post(`${baseUrl}/api/project/runtime/sessions/${sessionId}/spins`, {expectedSessionVersion: 999});
            expect(stale.status).toBe(409);
            expect(typeof (stale.body as {error: string}).error).toBe("string");
            expect((stale.body as {reason: string}).reason).toBe("conflict");

            const unknown = await get(`${baseUrl}/api/project/runtime/sessions/does-not-exist`);
            expect(unknown.status).toBe(404);

            await post(`${baseUrl}/api/project/runtime/stop`);
            const notRunning = await post(`${baseUrl}/api/project/runtime/sessions/${sessionId}/spins`, {});
            expect(notRunning.status).toBe(409);
            expect((notRunning.body as {reason: string}).reason).toBe("not-running");
        });

        it("omits the debug bundle (but still reports sessionVersion) when the runtime was started without debug mode", async () => {
            runtimeServer = createRuntimeServer({mode: "project", projectRoot: fixtureRoot});
            const address = await runtimeServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;
            await post(`${baseUrl}/api/project/runtime/start`, {port: 0});

            const created = await post(`${baseUrl}/api/project/runtime/sessions`, {});
            const createdBody = created.body as {status: string; session: {sessionVersion?: number; debug?: unknown}};

            expect(typeof createdBody.session.sessionVersion).toBe("number");
            expect(createdBody.session.debug).toBeUndefined();
        });

        it("stops an active runtime when the project is switched away and back", async () => {
            runtimeServer = createRuntimeServer({mode: "project", projectRoot: fixtureRoot});
            const address = await runtimeServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;
            await post(`${baseUrl}/api/project/runtime/start`, {port: 0});
            expect((await get(`${baseUrl}/api/project/runtime`)).body).toMatchObject({status: "running"});

            await post(`${baseUrl}/api/projects/close`);
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: fixtureRoot});

            expect((await get(`${baseUrl}/api/project/runtime`)).body).toEqual({status: "stopped"});
        });

        it("stops an active runtime — releasing its port — when Studio itself shuts down", async () => {
            runtimeServer = createRuntimeServer({mode: "project", projectRoot: fixtureRoot});
            const address = await runtimeServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;
            const started = await post(`${baseUrl}/api/project/runtime/start`, {port: 0});
            const runtimePort = (started.body as {port: number}).port;

            const serverToStop = runtimeServer;
            runtimeServer = undefined; // already stopped — afterEach shouldn't stop it again
            await serverToStop.stop();

            // The runtime's own port is free again — binding a fresh listener on it succeeds.
            const probe = http.createServer();
            await new Promise<void>((resolve, reject) => {
                probe.once("error", reject);
                probe.listen(runtimePort, "127.0.0.1", () => {
                    resolve();
                });
            });
            await new Promise<void>((resolve) => {
                probe.close(() => {
                    resolve();
                });
            });
        });
    });
});
