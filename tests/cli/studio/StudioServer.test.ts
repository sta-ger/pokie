import {
    buildRoundArtifact,
    buildWeightedOutcomeLibrary,
    computeGameBlueprintHash,
    ExternalArtifactGenerationResult,
    ExternalDeploymentProjectedModeInput,
    ExternalDeploymentTarget,
    ExternalRoundProjector,
    GamePackageInspector,
    GamePackageInspectionReport,
    GameSessionHandling,
    loadPokieGame,
    ManagedOutcomeProjectService,
    OutcomeLibraryBundleWriter,
    PokieGame,
    PokieGameManifest,
    PokieGamePackageValidationReport,
    PokieProject,
    POKIE_WASM_CONTRACT_VERSION,
    ProjectMaterializing,
    ProjectResolving,
    PROJECT_TYPE_CAPABILITIES,
    RoundArtifact,
    RoundArtifactProvenance,
    SimulationReport,
    SimulationReportBuilding,
    StakeEngineExporter,
    StakeEngineExportModeInput,
    STUDIO_OPERATION,
    WeightedOutcomeLibrary,
    WinEvaluationResult,
} from "pokie";
import ExcelJS from "exceljs";
import crypto from "crypto";
import fs from "fs";
import type {IncomingMessage} from "http";
import os from "os";
import path from "path";
import {createStarterGameBlueprint} from "../../../cli/build/createStarterGameBlueprint.js";
import {BlueprintProjectMaterializer} from "../../../cli/materialize/BlueprintProjectMaterializer.js";
import {createMaterializingRuntimePackageResolver} from "../../../cli/materialize/materializeRuntimePackage.js";
import {PackageCommandResult, PackageCommandRunning, runPackageCommand, withLocalPokieInstall} from "../../../cli/prepare/PackageCommandRunner.js";
import {ScaffoldResult} from "../../../cli/scaffold/ScaffoldResult.js";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {createRecommendedBlueprint} from "../../../cli/studio-client/src/domain/blueprintEditorState.js";
import {StudioArtifactBuildService} from "../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {StudioDeploymentService} from "../../../cli/studio/deployment/StudioDeploymentService.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {StudioNativePickerService} from "../../../cli/studio/home/StudioNativePickerService.js";
import {isLoopbackRequest} from "../../../cli/studio/isLoopbackRequest.js";
import {InMemoryStudioProjectRegistry} from "../../../cli/studio/InMemoryStudioProjectRegistry.js";
import {FileStudioProjectRegistry} from "../../../cli/studio/FileStudioProjectRegistry.js";
import {InMemoryStudioReplayRepository} from "../../../cli/studio/replay/InMemoryStudioReplayRepository.js";
import {StudioReplayExecutionService} from "../../../cli/studio/replay/StudioReplayExecutionService.js";
import {StudioPlayService} from "../../../cli/studio/runtime/StudioPlayService.js";
import {InMemoryStudioSimulationRepository} from "../../../cli/studio/simulation/InMemoryStudioSimulationRepository.js";
import {StudioSimulationService} from "../../../cli/studio/simulation/StudioSimulationService.js";
import {StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";
import {buildSourceOutcomeLibraryBundle} from "../../certification/CertificationEvidenceBundleTestFixtures.js";
import {buildFairnessSourceBundle, issueFairnessCommitmentFor} from "../../fairness/FairnessRoundProofTestFixtures.js";
import {buildStakeEngineTestLibrary} from "../../stakeengine/StakeEngineTestFixtures.js";
import {buildOutcomeLibraryBundleModeInput} from "../../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";
import {ensureCompiledTestOutput} from "../../testUtils/ensureCompiledTestOutput.js";
import {REPO_ROOT} from "../../testUtils/offlinePokieDependencyOverride.js";

const COMPILED_CJS_ENTRY = path.join(REPO_ROOT, "dist", "cjs", "index.js");
const COMPILED_CJS_PACKAGE_JSON = path.join(REPO_ROOT, "dist", "cjs", "package.json");
const COMPILED_ESM_WORKER_ENTRY = path.join(REPO_ROOT, "dist", "esm", "simulation", "parallel", "internal", "simulationWorkerEntry.js");
type PendingGameLoad = (game: PokieGame) => void;
type PendingLoadStarted = () => void;

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) {
        Reflect.deleteProperty(process.env, name);
    } else {
        process.env[name] = value;
    }
}

// The materialization tests deliberately exercise the real `npm install` boundary. Invoke the npm bundled
// with this test process's Node runtime directly, preserving the ordinary production command arguments while
// avoiding a test-command policy wrapper injected into PATH.
const runBundledNpmCommand: PackageCommandRunning = (command, args, cwd) => {
    const bundledNpmDirectory = path.dirname(process.execPath);
    const bundledNpm = path.join(bundledNpmDirectory, process.platform === "win32" ? "npm.cmd" : "npm");
    if (!fs.existsSync(bundledNpm)) {
        return runPackageCommand(command, args, cwd);
    }
    return runPackageCommand(command === "npm" ? bundledNpm : command, args, cwd);
};

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

// Same fakes as materializeRuntimePackage.ts's own boundary tests (see
// tests/cli/materialize/BlueprintProjectMaterializer.test.ts) — what's under test here is only whether
// StudioServer's Home Open Project route actually reaches the materializing resolver it was configured
// with, not BlueprintProjectMaterializer's own generate/install/verify lifecycle.
function stubProjectResolver(result: PokieProject | undefined): ProjectResolving & {calls: string[]} {
    const calls: string[] = [];
    return {
        calls,
        resolve(targetPath: string) {
            calls.push(targetPath);
            return Promise.resolve(result);
        },
    };
}

function fakeMaterializer(runtimePath: string): ProjectMaterializing & {calls: PokieProject[]} {
    const calls: PokieProject[] = [];
    return {
        calls,
        materialize(project: PokieProject) {
            calls.push(project);
            return Promise.resolve({runtimePath, ownsRuntimePath: true, release: () => Promise.resolve()});
        },
    };
}

function rejectingMaterializer(message: string): ProjectMaterializing & {calls: PokieProject[]} {
    const calls: PokieProject[] = [];
    return {
        calls,
        materialize(project: PokieProject) {
            calls.push(project);
            return Promise.reject(new Error(message));
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

// The background project-dashboard load (startProjectDashboardLoad) resolves through several chained
// awaits -- including a real outcome-source resolution attempt -- before landing on "loaded"/"error", so
// a single flushed tick isn't always enough for it to settle under load. Polls the same way
// pollUntilTerminal does rather than relying on a fixed number of ticks.
async function pollUntilProjectContextSettled(url: string): Promise<{status: number; body: {[key: string]: unknown; status: string}}> {
    for (let i = 0; i < 2000; i++) {
        const response = await get(url);
        const body = response.body as {status: string};
        if (body.status !== "loading") {
            return response as {status: number; body: {[key: string]: unknown; status: string}};
        }
        await flushMacrotask();
    }
    throw new Error(`Timed out waiting for ${url} to leave "loading".`);
}

describe("StudioServer", () => {
    let studioRoot: string;
    let server: StudioServer;
    let baseUrl: string;
    let loadGame: jest.Mock;
    let inspect: jest.Mock;
    let validate: jest.Mock;

    const scaffoldResult: ScaffoldResult = {
        projectRoot: "/tmp/sample-slot",
        manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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

        loadGame = jest.fn();
        inspect = jest.fn();
        validate = jest.fn();

        const homeService = new StudioHomeService("1.0.0", undefined, loadGame);
        server = new StudioServer({
            pokieVersion: "1.0.0",
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

    it("serves the Outcome Library preflight and durable job lifecycle over HTTP, including retained direct POST compatibility", async () => {
        // This is deliberately an HTTP-level contract test.  The domain service has
        // its own exhaustive producer tests; here we prove Studio does not expose a
        // second, synchronous or bigint-unsafe transport path around its lifecycle.
        await server.stop();
        const projectRoot = fs.mkdtempSync(path.join(studioRoot, "outcome-library-project-"));
        const plan = {status: "unavailable", source: {kind: "unknown", capabilities: []}, target: {kind: "outcomeLibrary", capabilities: []}, steps: [], preflight: {destinationKind: "directory", estimatedWork: "none", losses: [], oneWay: false}} as const;
        let issuedToken = 0;
        const binding = {
            requestKey: expect.any(String), gameId: "http-slot", gameVersion: "1.0.0", configHash: "config-http", destination: path.join(projectRoot, "outcomelibrary"),
        };
        const outcomeService = {
            estimate: jest.fn(() => Promise.resolve({
                status: "ok" as const,
                game: {id: "http-slot", name: "HTTP Slot", version: "1.0.0"}, reelsNumber: 2, reelsSymbolsNumber: 2, reelSizes: [2, 2],
                totalOutcomeSpaceSize: 4, maxOutcomeSpaceSize: 20_000_000, strategy: "exact" as const, expectedRawWork: 4, warnings: [], requiresBounded: false,
                defaults: {compatibilityVersion: "v1", maxExactOutcomeSpaceSize: 20_000_000, boundedSample: {sampleSize: 10_000, seed: "seed"}}, plan, preflightToken: `http-token-${++issuedToken}`,
            })),
            getPreflightBinding: jest.fn((token?: string) => ({
                ...binding,
                requestKey: JSON.stringify({generation: "exact"}),
                // A token is server-owned, but it still has to enforce the
                // same sampled-opt-in eligibility as the compatibility route.
                ...(token === "bounded-token" ? {requiresBounded: true} : {}),
            })),
            rebindCheckpointRequest: jest.fn((_root: string, request: object) => Promise.resolve({request: {...request, preflightToken: `resume-token-${++issuedToken}`}})),
            generate: jest.fn(async (root: string, request: {readonly mode?: string; readonly signal?: AbortSignal; readonly resumeFrom?: unknown}) => {
                if (request.mode === "failure") return {status: "generation-error" as const, code: "weighted-outcome-library-generation-unsupported", error: "Enumeration is unsupported.", plan};
                if (request.mode === "cancel" && request.resumeFrom === undefined) {
                    await new Promise<void>((resolve) => {
                        request.signal?.addEventListener("abort", () => {
                            resolve();
                        }, {once: true});
                    });
                    return {
                        status: "cancelled" as const, processedRawIndex: BigInt(2), progressTotal: BigInt(4),
                        checkpoint: {processedRawIndex: BigInt(2), progressTotal: BigInt(4), sourceEnumerationId: "http-source", grids: new Map()}, recovery: "resume", plan,
                    };
                }
                return {
                    status: "ok" as const, bundleDir: "outcomelibrary", files: [], warnings: [],
                    mode: {modeName: "base", libraryId: "http-library", hash: "http-hash", outcomeCount: 1, totalWeight: 1, rtp: 1},
                    generator: {} as never, coverage: 1, selector: {kind: "bundle" as const, bundleDir: "outcomelibrary", modeName: "base"}, plan,
                };
            }),
        };
        const createOutcomeLibraryServer = () => new StudioServer({
            pokieVersion: "1.0.0", host: "127.0.0.1", port: 0, studioRoot,
            homeService: new StudioHomeService("1.0.0"), blueprintService: new StudioBlueprintService("1.0.0", studioRoot, new StudioHomeService("1.0.0")),
            initialContext: {mode: "project", projectRoot}, outcomeLibraryGenerateService: outcomeService as never,
        });
        const replaceServer = (nextServer: StudioServer): void => {
            server = nextServer;
        };
        let outcomeServer = createOutcomeLibraryServer();
        replaceServer(outcomeServer);
        const address = await outcomeServer.start();
        let outcomeBaseUrl = `http://${address.host}:${address.port}`;

        const estimate = await post(`${outcomeBaseUrl}/api/project/outcome-libraries/generate/estimate`, {generation: "exact", outDir: "outcomelibrary"});
        expect(estimate.status).toBe(200);
        expect(estimate.body).toMatchObject({status: "ok", preflightToken: "http-token-1", strategy: "exact"});

        // Transport validation is a preflight outcome too.  It must retain a
        // stable status and diagnostic for the client recovery model instead
        // of falling back to the server's generic `{error}` envelope.
        expect(await post(`${outcomeBaseUrl}/api/project/outcome-libraries/generate/estimate`, {maxOutcomeSpaceSize: "0"}))
            .toMatchObject({status: 400, body: {status: "invalid", error: expect.stringMatching(/positive integer/i)}});

        // A caller cannot turn a bounded-required preflight into an executable
        // job simply by presenting its token.  This must match the no-token
        // compatibility route's eligibility rule.
        expect(await post(`${outcomeBaseUrl}/api/project/outcome-libraries/generate/jobs`, {
            generation: "exact", preflightToken: "bounded-token",
        })).toMatchObject({status: 409, body: {error: expect.stringMatching(/explicit sampled or bounded coverage/i)}});

        // The legacy URL still creates the pollable job and obtains its server
        // binding itself, rather than performing an unbound synchronous run.
        const created = await post(`${outcomeBaseUrl}/api/project/outcome-libraries/generate`, {generation: "exact", outDir: "outcomelibrary"});
        expect(created.status).toBe(202);
        const jobId = (created.body as {job: {id: string}}).job.id;
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        const completed = await get(`${outcomeBaseUrl}/api/project/outcome-libraries/generate/jobs/${jobId}`);
        expect(completed).toMatchObject({status: 200, body: {id: jobId, status: "completed", result: {status: "ok"}}});

        const failed = await post(`${outcomeBaseUrl}/api/project/outcome-libraries/generate/jobs`, {generation: "exact", mode: "failure"});
        const failedId = (failed.body as {job: {id: string}}).job.id;
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(await get(`${outcomeBaseUrl}/api/project/outcome-libraries/generate/jobs/${failedId}`)).toMatchObject({status: 200, body: {status: "failed", result: {status: "generation-error", code: "weighted-outcome-library-generation-unsupported"}}});

        const cancelled = await post(`${outcomeBaseUrl}/api/project/outcome-libraries/generate/jobs`, {generation: "exact", mode: "cancel"});
        const cancelledId = (cancelled.body as {job: {id: string}}).job.id;
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(await post(`${outcomeBaseUrl}/api/project/outcome-libraries/generate/jobs/${cancelledId}/cancel`)).toMatchObject({status: 200});
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        const checkpointed = await get(`${outcomeBaseUrl}/api/project/outcome-libraries/generate/jobs/${cancelledId}`);
        expect(checkpointed).toMatchObject({status: 200, body: {status: "cancelled", result: {status: "cancelled", processedRawIndex: "2", checkpoint: {id: cancelledId}}}});
        expect(fs.existsSync(path.join(projectRoot, ".pokie", "outcome-library-checkpoints", `${cancelledId}.json`))).toBe(true);

        // Checkpoint discovery is durable: a new HTTP server gets the same
        // cancellation recovery record instead of depending on its old job map.
        await outcomeServer.stop();
        outcomeServer = createOutcomeLibraryServer();
        replaceServer(outcomeServer);
        const restartedAddress = await outcomeServer.start();
        outcomeBaseUrl = `http://${restartedAddress.host}:${restartedAddress.port}`;
        expect(await get(`${outcomeBaseUrl}/api/project/outcome-libraries/generate/jobs`)).toMatchObject({status: 200, body: {jobs: [expect.objectContaining({id: cancelledId, status: "cancelled"})]}});
        const resumed = await post(`${outcomeBaseUrl}/api/project/outcome-libraries/generate/jobs/${cancelledId}/resume`);
        expect(resumed).toMatchObject({status: 202, body: {status: "created", job: {id: cancelledId}}});
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(await get(`${outcomeBaseUrl}/api/project/outcome-libraries/generate/jobs/${cancelledId}`)).toMatchObject({status: 200, body: {status: "completed", result: {status: "ok"}}});
        expect(fs.existsSync(path.join(projectRoot, ".pokie", "outcome-library-checkpoints", `${cancelledId}.json`))).toBe(false);
        expect(outcomeService.rebindCheckpointRequest).toHaveBeenCalled();
    });

    it("reports safe diagnostics on GET /api/studio/diagnostics in home mode", async () => {
        const {status, body} = await get(`${baseUrl}/api/studio/diagnostics`);

        expect(status).toBe(200);
        expect(body).toMatchObject({
            studioVersion: "1.0.0",
            nodeVersion: process.version,
            mode: "home",
            activeSimulationCount: 0,
            activeReplayCount: 0,
            recentProjectStoragePath: "in-memory (no persistent path)",
        });
        expect((body as {projectRoot?: string}).projectRoot).toBeUndefined();
        expect(typeof (body as {uptimeSeconds: number}).uptimeSeconds).toBe("number");
        expect((body as {uptimeSeconds: number}).uptimeSeconds).toBeGreaterThanOrEqual(0);
        expect(JSON.stringify(body)).not.toContain("\\n    at ");
    });

    it("serves index.html for GET /", async () => {
        const response = await fetch(`${baseUrl}/`);

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/html");
        expect(await response.text()).toBe("<html>studio</html>");
    });

    it("serves the app shell for a direct Projects route", async () => {
        const response = await fetch(`${baseUrl}/home/projects`);

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

    it("opens a valid project via the injected loadGame and switches to project mode", async () => {
        const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
        loadGame.mockResolvedValue(createFakeGame(manifest));

        const {status, body} = await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});

        expect(status).toBe(200);
        expect(body).toEqual({
            context: {mode: "project", projectRoot: path.resolve("./sample-slot")},
            manifest,
        });
        expect(loadGame).toHaveBeenCalledWith("./sample-slot");
    });

    it("publishes only the latest overlapping Home open and records only that project", async () => {
        const firstManifest: PokieGameManifest = {id: "first", name: "First", version: "1.0.0"};
        const secondManifest: PokieGameManifest = {id: "second", name: "Second", version: "1.0.0"};
        const completeLoads = new Map<string, PendingGameLoad>();
        const loadStarted = new Map<string, PendingLoadStarted>();
        const firstLoadStarted = new Promise<void>((resolve) => {
            loadStarted.set("./first", resolve);
        });
        const secondLoadStarted = new Promise<void>((resolve) => {
            loadStarted.set("./second", resolve);
        });
        loadGame.mockImplementation((projectRoot: string) => new Promise<PokieGame>((resolve) => {
            completeLoads.set(projectRoot, resolve);
            loadStarted.get(projectRoot)?.();
        }));

        const firstOpen = post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./first"});
        await firstLoadStarted;

        const secondOpen = post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./second"});
        await secondLoadStarted;
        completeLoads.get("./second")?.(createFakeGame(secondManifest));

        expect(await secondOpen).toEqual({
            status: 200,
            body: {
                context: {mode: "project", projectRoot: path.resolve("./second")},
                manifest: secondManifest,
            },
        });

        completeLoads.get("./first")?.(createFakeGame(firstManifest));
        expect(await firstOpen).toEqual({status: 409, body: {error: "Project opening was superseded by a newer request."}});
        expect((await get(`${baseUrl}/api/context`)).body).toEqual({mode: "project", projectRoot: path.resolve("./second")});
        expect((await get(`${baseUrl}/api/project/context`)).body).toMatchObject({status: "loaded", game: secondManifest});
        expect(await get(`${baseUrl}/api/home/recent-projects`)).toMatchObject({
            body: [expect.objectContaining({projectRoot: path.resolve("./second"), name: "Second"})],
        });
    });

    it("keeps a registry registration made during a Home commit through the real file-backed server path", async () => {
        const registryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-registry-overlap-"));
        const registry = new FileStudioProjectRegistry(path.join(registryDirectory, "projects.json"));
        const registrationService = new StudioProjectRegistrationService(registry, {
            resolve: (projectRoot) => Promise.resolve({
                type: "tsPackage",
                rootPath: path.resolve(projectRoot),
                capabilities: ["runtime.execute"],
                provenance: '"package.json" declares a "pokie.entry" field',
            }),
        });
        const manifest: PokieGameManifest = {id: "opening", name: "Opening", version: "1.0.0"};
        loadGame.mockResolvedValue(createFakeGame(manifest));
        const overlapHomeService = new StudioHomeService("1.0.0", undefined, loadGame);
        const overlapServer = new StudioServer({
            pokieVersion: "1.0.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            homeService: overlapHomeService,
            blueprintService: new StudioBlueprintService("1.0.0", studioRoot, overlapHomeService),
            loadGame,
            resolveRuntimePackageRoot: (projectRoot) => Promise.resolve({runtimePath: projectRoot, ownsRuntimePath: false, release: () => Promise.resolve()}),
            gamePackageInspector: {inspect},
            gamePackageValidator: {validate},
            projectRegistrationService: registrationService,
        });

        const originalWriteFile = fs.promises.writeFile.bind(fs.promises);
        let releaseHomeWrite: (() => void) | undefined;
        let notifyHomeWrite: (() => void) | undefined;
        const homeWriteStarted = new Promise<void>((resolve) => {
            notifyHomeWrite = resolve;
        });
        let writeCount = 0;
        const writeSpy = jest.spyOn(fs.promises, "writeFile").mockImplementation(async (...arguments_) => {
            writeCount++;
            if (writeCount === 1) {
                notifyHomeWrite?.();
                await new Promise<void>((resolve) => {
                    releaseHomeWrite = resolve;
                });
            }
            return originalWriteFile(...arguments_);
        });

        try {
            const address = await overlapServer.start();
            const overlapBaseUrl = `http://${address.host}:${address.port}`;
            const opening = post(`${overlapBaseUrl}/api/home/projects/open`, {projectRoot: "./opening"});
            await homeWriteStarted;
            const registering = post(`${overlapBaseUrl}/api/home/projects/registry/register`, {location: "./registered", name: "Registered"});

            await flushMacrotask();
            expect(writeCount).toBe(1);
            releaseHomeWrite?.();

            expect((await opening).status).toBe(200);
            expect((await registering).status).toBe(201);
            expect((await registry.list()).map((candidate) => candidate.location)).toEqual(expect.arrayContaining([
                path.resolve("./opening"),
                path.resolve("./registered"),
            ]));
        } finally {
            writeSpy.mockRestore();
            await overlapServer.stop();
            fs.rmSync(registryDirectory, {recursive: true, force: true});
        }
    });

    it("lets a Home open supersede a pending direct-entry dashboard load", async () => {
        const directManifest: PokieGameManifest = {id: "direct", name: "Direct", version: "1.0.0"};
        const homeManifest: PokieGameManifest = {id: "home", name: "Home", version: "1.0.0"};
        const completeLoads = new Map<string, PendingGameLoad>();
        const loadStarted = new Map<string, PendingLoadStarted>();
        const directLoadStarted = new Promise<void>((resolve) => {
            loadStarted.set("./direct", resolve);
        });
        const homeLoadStarted = new Promise<void>((resolve) => {
            loadStarted.set("./home", resolve);
        });
        loadGame.mockImplementation((projectRoot: string) => new Promise<PokieGame>((resolve) => {
            completeLoads.set(projectRoot, resolve);
            loadStarted.get(projectRoot)?.();
        }));
        const homeService = new StudioHomeService("1.0.0", undefined, loadGame);
        const directServer = new StudioServer({
            pokieVersion: "1.0.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            homeService,
            blueprintService: new StudioBlueprintService("1.0.0", studioRoot, homeService),
            loadGame,
            initialContext: {mode: "project", projectRoot: "./direct"},
        });
        const address = await directServer.start();
        const directBaseUrl = `http://${address.host}:${address.port}`;
        try {
            await directLoadStarted;

            const homeOpen = post(`${directBaseUrl}/api/home/projects/open`, {projectRoot: "./home"});
            await homeLoadStarted;
            completeLoads.get("./home")?.(createFakeGame(homeManifest));
            expect((await homeOpen).status).toBe(200);

            completeLoads.get("./direct")?.(createFakeGame(directManifest));
            await flushMacrotask();
            expect((await get(`${directBaseUrl}/api/context`)).body).toEqual({mode: "project", projectRoot: path.resolve("./home")});
            expect((await get(`${directBaseUrl}/api/project/context`)).body).toMatchObject({status: "loaded", game: homeManifest});
        } finally {
            await directServer.stop();
        }
    });

    it("does not publish or remember a Home open superseded by project close", async () => {
        const manifest: PokieGameManifest = {id: "late", name: "Late", version: "1.0.0"};
        const completeLoads = new Map<string, PendingGameLoad>();
        let signalLateLoadStarted: () => void;
        const lateLoadStarted = new Promise<void>((resolve) => {
            signalLateLoadStarted = resolve;
        });
        loadGame.mockImplementation(() => new Promise<PokieGame>((resolve) => {
            completeLoads.set("./late", resolve);
            signalLateLoadStarted();
        }));

        const opening = post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./late"});
        await lateLoadStarted;
        expect(await post(`${baseUrl}/api/projects/close`)).toEqual({status: 200, body: {context: {mode: "home"}}});

        completeLoads.get("./late")?.(createFakeGame(manifest));
        expect(await opening).toEqual({status: 409, body: {error: "Project opening was superseded by a newer request."}});
        expect((await get(`${baseUrl}/api/context`)).body).toEqual({mode: "home"});
        expect((await get(`${baseUrl}/api/home/recent-projects`)).body).toEqual([]);
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
        const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
        loadGame.mockResolvedValue(createFakeGame(manifest));
        await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});

        const {status, body} = await post(`${baseUrl}/api/projects/close`);

        expect(status).toBe(200);
        expect(body).toEqual({context: {mode: "home"}});

        const context = await get(`${baseUrl}/api/context`);
        expect(context.body).toEqual({mode: "home"});
    });

    // Proves POST /api/home/projects/open on this same StudioServer instance actually reaches a
    // STUDIO_OPERATION materializing resolver through the injected homeService -- the same boundary a
    // direct `pokie <path>`/`pokie studio <path>` launch crosses via StudioServer's own
    // resolveRuntimePackageRoot field (see that field's own doc comment). Each test here builds its own
    // homeService/server pair (rather than reusing the shared beforeEach one, whose homeService defaults
    // to a no-op passthrough resolver) specifically so a materializing resolver is on the request path
    // the HTTP route actually runs.
    describe("Home Open Project runtime package materialization boundary", () => {
        it("returns the PAR recognition/import diagnostic for corrupt and incomplete workbooks without loading a dashboard runtime", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-malformed-par-"));
            const corrupt = path.join(workDir, "corrupt.xlsx");
            const incomplete = path.join(workDir, "incomplete.xlsx");
            fs.writeFileSync(corrupt, "not an XLSX");
            const workbook = new ExcelJS.Workbook();
            workbook.addWorksheet("Manifest");
            await workbook.xlsx.writeFile(incomplete);
            const diagnosticLoadGame = jest.fn();
            const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver("1.0.0", STUDIO_OPERATION);
            const diagnosticHomeService = new StudioHomeService("1.0.0", undefined, diagnosticLoadGame, undefined, resolveRuntimePackageRoot);
            const diagnosticServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot,
                homeService: diagnosticHomeService,
                blueprintService: new StudioBlueprintService("1.0.0", studioRoot, diagnosticHomeService),
                loadGame: diagnosticLoadGame,
            });
            const address = await diagnosticServer.start();
            const diagnosticBaseUrl = `http://${address.host}:${address.port}`;

            try {
                for (const workbookPath of [corrupt, incomplete]) {
                    const {status, body} = await post(`${diagnosticBaseUrl}/api/home/projects/open`, {projectRoot: workbookPath});
                    expect(status).toBe(400);
                    expect(body).toEqual({error: expect.stringMatching(/Cannot prepare a runnable runtime.*PAR workbook recognition.*failed PAR recognition\/import stage.*Next:/)});
                }
                expect(diagnosticLoadGame).not.toHaveBeenCalled();
            } finally {
                await diagnosticServer.stop();
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });

        it("loads the dashboard from the materialized runtime path instead of the raw blueprint path Home was given", async () => {
            const rawProjectRoot = "/blueprints/raw-game.json";
            const materializedRuntimePath = "/materialized/raw-game";
            const project = {type: "blueprint", rootPath: rawProjectRoot, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "test fixture"} as PokieProject;
            const resolveProject = stubProjectResolver(project);
            const materializer = fakeMaterializer(materializedRuntimePath);
            const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver("1.0.0", STUDIO_OPERATION, undefined, {resolveProject, materializer});

            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            const materializingLoadGame = jest.fn().mockResolvedValue(createFakeGame(manifest));
            const materializingHomeService = new StudioHomeService("1.0.0", undefined, materializingLoadGame, undefined, resolveRuntimePackageRoot);
            const materializingServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot,
                homeService: materializingHomeService,
                blueprintService: new StudioBlueprintService("1.0.0", studioRoot, materializingHomeService),
                loadGame: materializingLoadGame,
            });
            const address = await materializingServer.start();
            const materializingBaseUrl = `http://${address.host}:${address.port}`;

            try {
                const {status, body} = await post(`${materializingBaseUrl}/api/home/projects/open`, {projectRoot: rawProjectRoot});

                expect(status).toBe(200);
                expect(resolveProject.calls).toEqual([rawProjectRoot]);
                expect(materializer.calls).toEqual([project]);
                expect(materializingLoadGame).toHaveBeenCalledWith(materializedRuntimePath);
                expect(materializingLoadGame).not.toHaveBeenCalledWith(rawProjectRoot);
                expect(body).toEqual({
                    context: {mode: "project", projectRoot: path.resolve(rawProjectRoot)},
                    manifest,
                });
            } finally {
                await materializingServer.stop();
            }
        });

        it("returns the structured capability diagnostic, not a raw loader error, for a resolved target the studio operation can't run", async () => {
            const rawProjectRoot = "/some/outcome-library";
            const project = {
                type: "outcomeLibrary",
                rootPath: rawProjectRoot,
                capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
                provenance: "test fixture",
            } as PokieProject;
            const resolveProject = stubProjectResolver(project);
            const materializer = rejectingMaterializer("must not be called for a project lacking runtime.execute");
            const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver("1.0.0", STUDIO_OPERATION, undefined, {resolveProject, materializer});

            const diagnosticLoadGame = jest.fn();
            const diagnosticHomeService = new StudioHomeService("1.0.0", undefined, diagnosticLoadGame, undefined, resolveRuntimePackageRoot);
            const diagnosticServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot,
                homeService: diagnosticHomeService,
                blueprintService: new StudioBlueprintService("1.0.0", studioRoot, diagnosticHomeService),
                loadGame: diagnosticLoadGame,
            });
            const address = await diagnosticServer.start();
            const diagnosticBaseUrl = `http://${address.host}:${address.port}`;

            try {
                const {status, body} = await post(`${diagnosticBaseUrl}/api/home/projects/open`, {projectRoot: rawProjectRoot});

                expect(status).toBe(400);
                expect(materializer.calls).toEqual([]);
                expect(diagnosticLoadGame).not.toHaveBeenCalled();
                expect(body).toEqual({
                    error:
                        'This Outcome Library cannot open POKIE Studio. You can open POKIE Studio with POKIE game package. Run "pokie inspect <path>" to see available next actions.',
                });

                const context = await get(`${diagnosticBaseUrl}/api/context`);
                expect(context.body).toEqual({mode: "home"});
            } finally {
                await diagnosticServer.stop();
            }
        });
    });

    // The block above proves StudioServer's HTTP route reaches whatever resolver it was configured
    // with, using fakeMaterializer/rejectingMaterializer as a stand-in for BlueprintProjectMaterializer's
    // own generate/install/verify lifecycle. This block instead wires a *real* BlueprintProjectMaterializer,
    // driven through withLocalPokieInstall bound to `pokiePackageRootWithSpaces` (standing in for "the
    // running POKIE installation's own root directory" -- see cli/pokie.ts's readOwnPackageRoot()) --
    // the identical mechanism createMaterializingRuntimePackageResolver builds for every real CLI/Studio
    // call site (see StudioCommand's own construction), never a Studio-specific stand-in for it -- so it
    // proves Home Open Project materializes a real, genuinely offline runtime through Studio's own HTTP
    // route (the same production offline mechanism BlueprintProjectMaterializer.offline.integration.test.ts
    // proves against the CLI's own boundary), and that a failed install followed by a retry, and a cached
    // second Open, both behave correctly reached through that route. Real npm, with the registry forced
    // unreachable and npm's own offline mode forced on (see beforeAll below) -- so an unpublished
    // pokieVersion alone could never be mistaken for proof that every transitive dependency avoids
    // registry resolution. Slow -- same "pokie-integration" project this whole file already belongs to
    // (see jest.config.mjs).
    describe("Home Open Project runtime package materialization (real BlueprintProjectMaterializer, offline)", () => {
        jest.setTimeout(300000);

        const UNPUBLISHED_POKIE_VERSION = `0.0.0-studio-offline-e2e-unpublished-${crypto.randomBytes(4).toString("hex")}`;

        let materializeCacheRoot: string;
        let blueprintSourceDir: string;
        let materializingServer: StudioServer | undefined;
        // Stands in for "the running POKIE installation's own root directory" at a path shaped the way a
        // real end user's machine easily produces one (e.g. under "Program Files", "My Projects") -- a
        // symlink to this checkout's own REPO_ROOT, so every provenance withLocalPokieDependency's own
        // doc comment lists (a dev checkout, an npm-linked target, a tarball-installed or ordinarily
        // npm-installed copy) is equally well represented: the mechanism only ever cares about the
        // resolved absolute path, never how it got there.
        let pokiePackageRootWithSpaces: string;
        let originalNpmOffline: string | undefined;
        let originalNpmRegistry: string | undefined;

        beforeAll(() => {
            ensureCompiledTestOutput({
                repositoryRoot: REPO_ROOT,
                outputPaths: [COMPILED_CJS_ENTRY, COMPILED_CJS_PACKAGE_JSON, COMPILED_ESM_WORKER_ENTRY],
                lockName: "compiled-runtime",
                command: ["npm", "run", "build-test-runtime"],
            });

            pokiePackageRootWithSpaces = path.join(os.tmpdir(), `pokie studio install root with spaces ${crypto.randomBytes(4).toString("hex")}`);
            fs.symlinkSync(REPO_ROOT, pokiePackageRootWithSpaces, "dir");

            // Forces any npm dependency resolution that isn't already rewritten to a local `file:` spec
            // to fail loudly and immediately, instead of silently succeeding against a reachable registry
            // in a network-connected dev/CI environment -- see this describe block's own doc comment.
            originalNpmOffline = process.env.npm_config_offline;
            originalNpmRegistry = process.env.npm_config_registry;
            process.env["npm_config_offline"] = "true";
            process.env["npm_config_registry"] = "http://127.0.0.1:1/";
        });

        afterAll(() => {
            fs.rmSync(pokiePackageRootWithSpaces, {force: true});
            restoreEnv("npm_config_offline", originalNpmOffline);
            restoreEnv("npm_config_registry", originalNpmRegistry);
        });

        beforeEach(() => {
            materializeCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-materialize-cache-offline-"));
            blueprintSourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-materialize-source-offline-"));
        });

        afterEach(async () => {
            const server = materializingServer;
            materializingServer = undefined;
            if (server) {
                await server.stop();
            }
            fs.rmSync(materializeCacheRoot, {recursive: true, force: true});
            fs.rmSync(blueprintSourceDir, {recursive: true, force: true});
        });

        // Fails the very first "npm install" it's asked to run (a real, structured rejection shaped like
        // a real execFile failure -- a message plus a separate "stderr") and delegates every call after
        // that to `base` -- standing in for a real, transient local npm failure followed by a successful
        // retry, without ever faking BlueprintProjectMaterializer's own recovery logic. Same shape as
        // BlueprintProjectMaterializer.offline.integration.test.ts's own helper.
        function failFirstInstallThenDelegate(base: PackageCommandRunning): PackageCommandRunning & {calls: number} {
            let calls = 0;
            let failed = false;
            const runner = (command: string, args: string[], cwd: string): Promise<PackageCommandResult> => {
                calls++;
                if (args[0] === "install" && !failed) {
                    failed = true;
                    return Promise.reject(
                        Object.assign(new Error("Command failed: npm install\nnpm ERR! simulated transient local npm failure"), {
                            stderr: "npm ERR! simulated transient local npm failure -- e.g. a momentarily locked npm cache",
                        }),
                    );
                }
                return base(command, args, cwd);
            };
            // Object.assign copies a getter's *current value*, not the accessor itself -- defineProperty is
            // what keeps `.calls` live across every subsequent invocation of `runner`. Reflect.defineProperty
            // returns a success boolean, not the target, so the added property needs an explicit cast on
            // `runner` itself afterward.
            Reflect.defineProperty(runner, "calls", {
                get: () => calls,
            });
            return runner as PackageCommandRunning & {calls: number};
        }

        function writeStarterBlueprint(): string {
            const blueprintPath = path.join(blueprintSourceDir, "game.json");
            fs.writeFileSync(blueprintPath, JSON.stringify(createStarterGameBlueprint(), null, 4));
            return blueprintPath;
        }

        // The production materializer wiring, with only the test process's explicit npm executable injected:
        // the generator, validator, local-Pokie dependency installation strategy and resolver are otherwise
        // the same as StudioCommand's defaults. This still proves Home Open Project uses the actual
        // materializing resolver instead of a stand-in.
        async function startDefaultMaterializingServer(): Promise<{baseUrl: string; rawProjectRoot: string}> {
            const rawProjectRoot = writeStarterBlueprint();
            const materializer = new BlueprintProjectMaterializer(
                UNPUBLISHED_POKIE_VERSION,
                undefined,
                undefined,
                undefined,
                withLocalPokieInstall(pokiePackageRootWithSpaces, runBundledNpmCommand),
                undefined,
                materializeCacheRoot,
            );
            const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver(UNPUBLISHED_POKIE_VERSION, STUDIO_OPERATION, undefined, {materializer});

            const homeService = new StudioHomeService("1.0.0", undefined, loadPokieGame, undefined, resolveRuntimePackageRoot);
            materializingServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.0.0", studioRoot, homeService),
                loadGame: loadPokieGame,
            });
            const address = await materializingServer.start();
            return {baseUrl: `http://${address.host}:${address.port}`, rawProjectRoot};
        }

        // Needs a flaky `runCommand` to prove the failed-staging/retry/cache-reuse lifecycle
        // deterministically, so (unlike startDefaultMaterializingServer above) this one still injects a
        // `materializer` -- but built from the exact same real BlueprintProjectMaterializer and
        // withLocalPokieInstall(pokiePackageRootWithSpaces) production uses, wrapped only at the
        // runCommand boundary, and project resolution stays the real default (undefined) ProjectTargetResolver.
        async function startMaterializingServer(runCommand: PackageCommandRunning): Promise<{baseUrl: string; rawProjectRoot: string}> {
            const rawProjectRoot = writeStarterBlueprint();
            const materializer = new BlueprintProjectMaterializer(
                UNPUBLISHED_POKIE_VERSION,
                undefined,
                undefined,
                undefined,
                withLocalPokieInstall(pokiePackageRootWithSpaces, runCommand),
                undefined,
                materializeCacheRoot,
            );
            const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver("1.0.0", STUDIO_OPERATION, undefined, {materializer});

            const homeService = new StudioHomeService("1.0.0", undefined, loadPokieGame, undefined, resolveRuntimePackageRoot);
            materializingServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.0.0", studioRoot, homeService),
                loadGame: loadPokieGame,
            });
            const address = await materializingServer.start();
            return {baseUrl: `http://${address.host}:${address.port}`, rawProjectRoot};
        }

        it("materializes a genuinely loadable runtime through Home Open Project using the production materializing resolver, offline, with an installation path containing spaces, and reuses the cache on a second Open", async () => {
            const {baseUrl, rawProjectRoot} = await startDefaultMaterializingServer();

            const first = await post(`${baseUrl}/api/home/projects/open`, {projectRoot: rawProjectRoot});
            expect(first.status).toBe(200);
            const firstBody = first.body as {context: {projectRoot: string}; manifest: PokieGameManifest};
            expect(firstBody.manifest.id).toBe("starter-slot");

            await post(`${baseUrl}/api/projects/close`);
            const second = await post(`${baseUrl}/api/home/projects/open`, {projectRoot: rawProjectRoot});
            expect(second.status).toBe(200);
            expect((second.body as {manifest: PokieGameManifest}).manifest).toEqual(firstBody.manifest);
        });

        it("retries a transient staged install through Home Open Project so one Open reaches the Workspace, then reuses the cache", async () => {
            const flakyRunner = failFirstInstallThenDelegate(runBundledNpmCommand);
            const {baseUrl, rawProjectRoot} = await startMaterializingServer(flakyRunner);

            const openedAfterAutomaticRetry = await post(`${baseUrl}/api/home/projects/open`, {projectRoot: rawProjectRoot});
            expect(openedAfterAutomaticRetry.status).toBe(200);
            expect(flakyRunner.calls).toBe(2);

            await post(`${baseUrl}/api/projects/close`);
            const cachedAfterAutomaticRetry = await post(`${baseUrl}/api/home/projects/open`, {projectRoot: rawProjectRoot});
            expect(cachedAfterAutomaticRetry.status).toBe(200);
            expect(flakyRunner.calls).toBe(2);
        });
    });

    describe("Home nav: GET /api/home/fs/browse", () => {
        it("lists the studio root's own children when no path is given", async () => {
            fs.mkdirSync(path.join(studioRoot, "games"));

            const {status, body} = await get(`${baseUrl}/api/home/fs/browse`);

            expect(status).toBe(200);
            expect(body).toMatchObject({
                status: "ok",
                resolvedPath: studioRoot,
                displayPath: studioRoot,
                entries: expect.arrayContaining([{name: "games", isDirectory: true}]),
            });
        });

        it("resolves a relative path against the studio root", async () => {
            fs.mkdirSync(path.join(studioRoot, "games"));
            fs.mkdirSync(path.join(studioRoot, "games", "sample-slot"));

            const {status, body} = await get(`${baseUrl}/api/home/fs/browse?path=${encodeURIComponent("games")}`);

            expect(status).toBe(200);
            expect(body).toMatchObject({
                status: "ok",
                resolvedPath: path.join(studioRoot, "games"),
                displayPath: `.${path.sep}games`,
                entries: [{name: "sample-slot", isDirectory: true}],
            });
        });

        it("reports a nonexistent path as a 200 domain-level error, not a 4xx/5xx", async () => {
            const {status, body} = await get(`${baseUrl}/api/home/fs/browse?path=${encodeURIComponent("does-not-exist")}`);

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "error", resolvedPath: path.join(studioRoot, "does-not-exist")});
            expect((body as {error: string}).error).toContain("does not exist");
        });

        it("reports a path that resolves to a file, not a directory, as an error", async () => {
            const {status, body} = await get(`${baseUrl}/api/home/fs/browse?path=${encodeURIComponent("index.html")}`);

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "error"});
            expect((body as {error: string}).error).toContain("is not a directory");
        });

        it("resolves a relative path against an explicit `base` instead of the studio root -- a project-scoped path field's own root", async () => {
            const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-fs-browse-base-"));
            fs.mkdirSync(path.join(projectRoot, "outcomes"));
            try {
                const {status, body} = await get(
                    `${baseUrl}/api/home/fs/browse?path=${encodeURIComponent("outcomes")}&base=${encodeURIComponent(projectRoot)}`,
                );

                expect(status).toBe(200);
                expect(body).toMatchObject({
                    status: "ok",
                    resolvedPath: path.join(projectRoot, "outcomes"),
                    displayPath: `.${path.sep}outcomes`,
                });
            } finally {
                fs.rmSync(projectRoot, {recursive: true, force: true});
            }
        });
    });

    describe("Home nav: GET /api/home/fs/default-location", () => {
        let locationServer: StudioServer | undefined;
        let locationStudioRoot: string;

        afterEach(async () => {
            await locationServer?.stop();
            fs.rmSync(locationStudioRoot, {recursive: true, force: true});
        });

        async function startServerWithPathResolver(pathResolver: {
            resolveIndependentProjectDirectory: jest.Mock;
            resolveBaseDirectory: jest.Mock;
        }): Promise<string> {
            locationStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-default-location-test-"));
            writeStudioAssets(locationStudioRoot);
            const homeService = new StudioHomeService(
                "1.0.0",
                undefined,
                undefined,
                pathResolver as unknown as ConstructorParameters<typeof StudioHomeService>[3],
            );
            locationServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: locationStudioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.0.0", locationStudioRoot, homeService),
            });
            const address = await locationServer.start();
            return `http://${address.host}:${address.port}`;
        }

        it("returns the platform Documents/Home default when no name is given", async () => {
            const locationBaseUrl = await startServerWithPathResolver({
                resolveIndependentProjectDirectory: jest.fn(),
                resolveBaseDirectory: jest.fn().mockReturnValue({status: "valid", directory: "/home/alice/Documents", source: "documents"}),
            });

            const {status, body} = await get(`${locationBaseUrl}/api/home/fs/default-location`);

            expect(status).toBe(200);
            expect(body).toEqual({status: "valid", directory: "/home/alice/Documents", source: "documents"});
        });

        it("uses the Documents/POKIE/<name> policy when a name is given", async () => {
            const resolveIndependentProjectDirectory = jest
                .fn()
                .mockReturnValue({status: "valid", directory: "/home/alice/Documents/POKIE/sample-slot", source: "documents"});
            const locationBaseUrl = await startServerWithPathResolver({
                resolveIndependentProjectDirectory,
                resolveBaseDirectory: jest.fn(),
            });

            const {status, body} = await get(`${locationBaseUrl}/api/home/fs/default-location?name=${encodeURIComponent("sample-slot")}`);

            expect(status).toBe(200);
            expect(body).toEqual({status: "valid", directory: "/home/alice/Documents/POKIE/sample-slot", source: "documents"});
            expect(resolveIndependentProjectDirectory).toHaveBeenCalledWith("sample-slot");
        });

        it("reports unavailable when the resolver can't determine a base directory", async () => {
            const locationBaseUrl = await startServerWithPathResolver({
                resolveIndependentProjectDirectory: jest.fn(),
                resolveBaseDirectory: jest.fn().mockReturnValue({status: "unresolved"}),
            });

            const {status, body} = await get(`${locationBaseUrl}/api/home/fs/default-location`);

            expect(status).toBe(200);
            expect(body).toEqual({status: "unavailable"});
        });
    });

    describe("Home nav: native browse (GET .../native-browse/availability, POST .../native-browse)", () => {
        let nativeServer: StudioServer | undefined;
        let nativeStudioRoot: string;

        afterEach(async () => {
            await nativeServer?.stop();
            fs.rmSync(nativeStudioRoot, {recursive: true, force: true});
        });

        async function startServerWithPicker(nativePickerService: StudioNativePickerService, isLoopbackRequest?: (req: IncomingMessage) => boolean): Promise<string> {
            nativeStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-native-picker-test-"));
            writeStudioAssets(nativeStudioRoot);
            const homeService = new StudioHomeService("1.0.0");
            nativeServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: nativeStudioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.0.0", nativeStudioRoot, homeService),
                nativePickerService,
                isLoopbackRequest,
            });
            const address = await nativeServer.start();
            return `http://${address.host}:${address.port}`;
        }

        it("reports availability from the injected StudioNativePickerService", async () => {
            const nativeBaseUrl = await startServerWithPicker(
                new StudioNativePickerService({platform: "linux", env: {}, homeDir: "/home/alice"}, jest.fn()),
            );

            const {status, body} = await get(`${nativeBaseUrl}/api/home/fs/native-browse/availability`);

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "unavailable"});
        });

        it("returns the selected path on POST /api/home/fs/native-browse", async () => {
            const run = jest.fn().mockResolvedValue({stdout: "/home/alice/games/sample-slot\n", stderr: ""});
            const nativeBaseUrl = await startServerWithPicker(new StudioNativePickerService({platform: "linux", env: {DISPLAY: ":0"}, homeDir: "/home/alice"}, run));

            const {status, body} = await post(`${nativeBaseUrl}/api/home/fs/native-browse`, {kind: "directory", startPath: "/home/alice/games"});

            expect(status).toBe(200);
            expect(body).toEqual({status: "selected", path: "/home/alice/games/sample-slot"});
        });

        it("passes a local file destination through to the host's native Save dialog", async () => {
            const run = jest.fn().mockResolvedValue({stdout: "/home/alice/exports/game.par.xlsx\n", stderr: ""});
            const nativeBaseUrl = await startServerWithPicker(new StudioNativePickerService({platform: "linux", env: {DISPLAY: ":0"}, homeDir: "/home/alice"}, run));

            const {status, body} = await post(`${nativeBaseUrl}/api/home/fs/native-browse`, {
                kind: "file",
                mode: "save",
                startPath: "/home/alice/exports/game.par.xlsx",
                fileFilters: [{name: "PAR sheets", extensions: ["xlsx"]}],
            });

            expect(status).toBe(200);
            expect(body).toEqual({status: "selected", path: "/home/alice/exports/game.par.xlsx"});
            expect(run).toHaveBeenCalledWith("zenity", expect.arrayContaining(["--save", "--confirm-overwrite", "--filename=/home/alice/exports/game.par.xlsx"]));
        });

        it("rejects a request with an invalid kind as a 400", async () => {
            const nativeBaseUrl = await startServerWithPicker(new StudioNativePickerService({platform: "linux", env: {}, homeDir: "/home/alice"}, jest.fn()));

            const {status, body} = await post(`${nativeBaseUrl}/api/home/fs/native-browse`, {kind: "spreadsheet"});

            expect(status).toBe(400);
            expect((body as {error: string}).error).toContain("kind");
        });

        it("rejects a Save dialog request for a directory as a 400", async () => {
            const nativeBaseUrl = await startServerWithPicker(new StudioNativePickerService({platform: "linux", env: {}, homeDir: "/home/alice"}, jest.fn()));

            const {status, body} = await post(`${nativeBaseUrl}/api/home/fs/native-browse`, {kind: "directory", mode: "save"});

            expect(status).toBe(400);
            expect((body as {error: string}).error).toContain("save");
        });

        it("reports the native picker unavailable to a remote caller, without ever consulting the injected picker service, even when the server has a graphical display", async () => {
            const checkAvailability = jest.fn().mockReturnValue({status: "available"});
            const nativePickerService = {checkAvailability, pick: jest.fn()} as unknown as StudioNativePickerService;
            const nativeBaseUrl = await startServerWithPicker(nativePickerService, () => false);

            const {status, body} = await get(`${nativeBaseUrl}/api/home/fs/native-browse/availability`);

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "unavailable"});
            expect(checkAvailability).not.toHaveBeenCalled();
        });

        it("never invokes the injected picker service's pick() for a remote caller's POST /api/home/fs/native-browse, even with a well-formed request", async () => {
            const pick = jest.fn().mockResolvedValue({status: "selected", path: "/home/alice/games/sample-slot"});
            const nativePickerService = {checkAvailability: jest.fn(), pick} as unknown as StudioNativePickerService;
            const nativeBaseUrl = await startServerWithPicker(nativePickerService, () => false);

            const {status, body} = await post(`${nativeBaseUrl}/api/home/fs/native-browse`, {kind: "directory", startPath: "/home/alice/games"});

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "unavailable"});
            expect(pick).not.toHaveBeenCalled();
        });

        it("still consults the injected picker service for a confirmed-local caller", async () => {
            const run = jest.fn().mockResolvedValue({stdout: "/home/alice/games/sample-slot\n", stderr: ""});
            const nativeBaseUrl = await startServerWithPicker(
                new StudioNativePickerService({platform: "linux", env: {DISPLAY: ":0"}, homeDir: "/home/alice"}, run),
                () => true,
            );

            const {status, body} = await post(`${nativeBaseUrl}/api/home/fs/native-browse`, {kind: "directory", startPath: "/home/alice/games"});

            expect(status).toBe(200);
            expect(body).toEqual({status: "selected", path: "/home/alice/games/sample-slot"});
        });
    });

    describe("Home nav: open output folder (POST /api/home/fs/open-folder)", () => {
        let folderServer: StudioServer | undefined;
        let folderStudioRoot: string;
        let folderWorkDir: string;

        afterEach(async () => {
            await folderServer?.stop();
            fs.rmSync(folderStudioRoot, {recursive: true, force: true});
            fs.rmSync(folderWorkDir, {recursive: true, force: true});
        });

        async function startServerWithOpenFolder(
            openFolder: (folderPath: string) => void,
            isLoopbackRequest?: (req: IncomingMessage) => boolean,
        ): Promise<string> {
            folderStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-open-folder-test-"));
            folderWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-open-folder-work-"));
            writeStudioAssets(folderStudioRoot);
            const homeService = new StudioHomeService("1.0.0");
            folderServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: folderStudioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.0.0", folderStudioRoot, homeService),
                openFolder,
                isLoopbackRequest,
            });
            const address = await folderServer.start();
            return `http://${address.host}:${address.port}`;
        }

        it("rejects a body with no path field", async () => {
            const openFolder = jest.fn();
            const folderBaseUrl = await startServerWithOpenFolder(openFolder);

            const {status, body} = await post(`${folderBaseUrl}/api/home/fs/open-folder`, {});

            expect(status).toBe(400);
            expect((body as {error: string}).error).toContain("path");
            expect(openFolder).not.toHaveBeenCalled();
        });

        it("opens an existing directory via the injected openFolder and reports ok", async () => {
            const openFolder = jest.fn();
            const folderBaseUrl = await startServerWithOpenFolder(openFolder);

            const {status, body} = await post(`${folderBaseUrl}/api/home/fs/open-folder`, {path: folderWorkDir});

            expect(status).toBe(200);
            expect(body).toEqual({status: "ok"});
            expect(openFolder).toHaveBeenCalledWith(folderWorkDir);
        });

        it("reports an error, without invoking openFolder, for a path that doesn't exist", async () => {
            const openFolder = jest.fn();
            const folderBaseUrl = await startServerWithOpenFolder(openFolder);
            const missingPath = path.join(folderWorkDir, "does-not-exist");

            const {status, body} = await post(`${folderBaseUrl}/api/home/fs/open-folder`, {path: missingPath});

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "error"});
            expect((body as {message: string}).message).toContain(missingPath);
            expect(openFolder).not.toHaveBeenCalled();
        });

        it("reports an error, without invoking openFolder, for a path that is a file, not a directory", async () => {
            const openFolder = jest.fn();
            const folderBaseUrl = await startServerWithOpenFolder(openFolder);
            const filePath = path.join(folderWorkDir, "a-file.txt");
            fs.writeFileSync(filePath, "hello");

            const {status, body} = await post(`${folderBaseUrl}/api/home/fs/open-folder`, {path: filePath});

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "error"});
            expect(openFolder).not.toHaveBeenCalled();
        });

        it("reports unavailable and never invokes openFolder for a remote caller, even with an existing directory", async () => {
            const openFolder = jest.fn();
            const folderBaseUrl = await startServerWithOpenFolder(openFolder, () => false);

            const {status, body} = await post(`${folderBaseUrl}/api/home/fs/open-folder`, {path: folderWorkDir});

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "unavailable"});
            expect(openFolder).not.toHaveBeenCalled();
        });

        it("reveals a local output file by opening its containing directory", async () => {
            const openFolder = jest.fn();
            const folderBaseUrl = await startServerWithOpenFolder(openFolder);
            const filePath = path.join(folderWorkDir, "artifact.xlsx");
            fs.writeFileSync(filePath, "workbook");

            const {status, body} = await post(`${folderBaseUrl}/api/home/fs/reveal-path`, {path: filePath});

            expect(status).toBe(200);
            expect(body).toEqual({status: "ok"});
            expect(openFolder).toHaveBeenCalledWith(folderWorkDir);
        });

        it("reports reveal as unavailable for a remote caller and does not invoke the host action", async () => {
            const openFolder = jest.fn();
            const folderBaseUrl = await startServerWithOpenFolder(openFolder, () => false);
            const filePath = path.join(folderWorkDir, "artifact.xlsx");
            fs.writeFileSync(filePath, "workbook");

            const {status, body} = await post(`${folderBaseUrl}/api/home/fs/reveal-path`, {path: filePath});

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "unavailable"});
            expect(openFolder).not.toHaveBeenCalled();
        });
    });

    describe("isLoopbackRequest", () => {
        function requestFrom(remoteAddress: string | undefined): IncomingMessage {
            return {socket: {remoteAddress}} as unknown as IncomingMessage;
        }

        it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1"])("treats %s as a confirmed-local caller", (remoteAddress) => {
            expect(isLoopbackRequest(requestFrom(remoteAddress))).toBe(true);
        });

        it.each(["203.0.113.5", "::ffff:203.0.113.5", "172.17.0.2", undefined])("treats %s as a remote caller", (remoteAddress) => {
            expect(isLoopbackRequest(requestFrom(remoteAddress))).toBe(false);
        });
    });

    describe("Home nav: recent-projects dedup/missing (through the injected homeService)", () => {
        it("never lists another project's recent entries as duplicates when the same canonical path is opened twice", async () => {
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            loadGame.mockResolvedValue(createFakeGame(manifest));

            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: path.resolve("./sample-slot")});

            const {body} = await get(`${baseUrl}/api/home/recent-projects`);
            expect(body).toHaveLength(1);
        });

        it("flags a recent project as missing (without dropping it) once its directory disappears", async () => {
            const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-home-recent-"));
            try {
                fs.writeFileSync(path.join(projectRoot, "package.json"), "{}");
                const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
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

    describe("Home nav: Projects registry (GET .../registry, POST .../preview, /register, /remove)", () => {
        let registryStudioRoot: string;
        let registryServer: StudioServer;
        let registryBaseUrl: string;

        function fakeResolver(byPath: Record<string, PokieProject>): ProjectResolving {
            return {
                resolve: (targetPath: string) => Promise.resolve(byPath[path.resolve(targetPath)]),
            };
        }

        beforeEach(async () => {
            registryStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-registry-test-"));
            writeStudioAssets(registryStudioRoot);

            const homeService = new StudioHomeService("1.0.0");
            registryServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: registryStudioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.0.0", registryStudioRoot, homeService),
                projectRegistrationService: new StudioProjectRegistrationService(
                    new InMemoryStudioProjectRegistry(),
                    fakeResolver({
                        "/projects/sample-slot": {
                            type: "tsPackage",
                            rootPath: path.resolve("/projects/sample-slot"),
                            capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage,
                            provenance: '"package.json" declares a "pokie.entry" field',
                        },
                        "/existing/game.par.xlsx": {
                            type: "parWorkbook",
                            rootPath: path.resolve("/existing/game.par.xlsx"),
                            capabilities: PROJECT_TYPE_CAPABILITIES.parWorkbook,
                            provenance: "recognized PAR sheet workbook",
                        },
                    }),
                ),
            });
            const address = await registryServer.start();
            registryBaseUrl = `http://${address.host}:${address.port}`;
        });

        afterEach(async () => {
            await registryServer.stop();
            fs.rmSync(registryStudioRoot, {recursive: true, force: true});
        });

        it("starts with an empty registry", async () => {
            const {status, body} = await get(`${registryBaseUrl}/api/home/projects/registry`);

            expect(status).toBe(200);
            expect(body).toEqual([]);
        });

        it("previews a recognized target without registering it", async () => {
            const {status, body} = await post(`${registryBaseUrl}/api/home/projects/registry/preview`, {location: "/projects/sample-slot"});

            expect(status).toBe(200);
            expect(body).toEqual({
                status: "recognized",
                location: path.resolve("/projects/sample-slot"),
                type: "tsPackage",
                capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage,
                suggestedName: "sample-slot",
            });
            expect((await get(`${registryBaseUrl}/api/home/projects/registry`)).body).toEqual([]);
        });

        it("previews a PAR workbook target as its own recognized type -- routing it is left to the caller", async () => {
            const {status, body} = await post(`${registryBaseUrl}/api/home/projects/registry/preview`, {location: "/existing/game.par.xlsx"});

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "recognized", type: "parWorkbook"});
        });

        it("reports unrecognized rather than erroring for a path that resolves to no known project type", async () => {
            const {status, body} = await post(`${registryBaseUrl}/api/home/projects/registry/preview`, {location: "/not/a/project"});

            expect(status).toBe(200);
            expect(body).toEqual({status: "unrecognized", path: path.resolve("/not/a/project")});
        });

        it("rejects a preview request with no location field", async () => {
            const {status, body} = await post(`${registryBaseUrl}/api/home/projects/registry/preview`, {});

            expect(status).toBe(400);
            expect(body).toEqual({error: '"location" is required.'});
        });

        it("registers a recognized target as origin external and makes it show up in the list", async () => {
            const registered = await post(`${registryBaseUrl}/api/home/projects/registry/register`, {location: "/projects/sample-slot", name: "Sample Slot"});

            expect(registered.status).toBe(201);
            expect(registered.body).toMatchObject({status: "ok", entry: {location: path.resolve("/projects/sample-slot"), name: "Sample Slot", origin: "external"}});

            const {body} = await get(`${registryBaseUrl}/api/home/projects/registry`);
            expect(body).toEqual([expect.objectContaining({location: path.resolve("/projects/sample-slot"), name: "Sample Slot"})]);
        });

        it("returns unrecognized (200) rather than erroring when registering a path with no known project type", async () => {
            const {status, body} = await post(`${registryBaseUrl}/api/home/projects/registry/register`, {location: "/not/a/project"});

            expect(status).toBe(200);
            expect(body).toEqual({status: "unrecognized", path: path.resolve("/not/a/project")});
        });

        it("removes a registered entry", async () => {
            await post(`${registryBaseUrl}/api/home/projects/registry/register`, {location: "/projects/sample-slot"});

            const {status} = await post(`${registryBaseUrl}/api/home/projects/registry/remove`, {location: "/projects/sample-slot"});

            expect(status).toBe(200);
            expect((await get(`${registryBaseUrl}/api/home/projects/registry`)).body).toEqual([]);
        });
    });

    describe("Home nav: Blueprint editor endpoints (real collaborators against real temp directories)", () => {
        let homeStudioRoot: string;
        let homeServer: StudioServer | undefined;
        let homeBaseUrl: string;
        let workDir: string;

        function buildBlueprint(overrides: Record<string, unknown> = {}): Record<string, unknown> {
            return {
                manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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
                pokieVersion: "1.0.0",
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

            // The Blueprint Editor's own guided freshness contract (see BlueprintEditorPage's own
            // revision-bump/handleValidate doc comments) relies on this endpoint never answering from a
            // stale, previously-computed result -- there is no server-side validation cache to go stale
            // in the first place: every request is judged strictly on the exact blueprint it carries,
            // regardless of what an earlier request on the same connection asked about.
            it("never reflects a previous call's own blueprint -- each request is judged strictly on its own body", async () => {
                const broken = await post(`${homeBaseUrl}/api/home/blueprints/validate`, {blueprint: buildBlueprint({reels: 0})});
                expect(broken.body).toMatchObject({status: "invalid"});

                const fixed = await post(`${homeBaseUrl}/api/home/blueprints/validate`, {blueprint: buildBlueprint()});
                expect(fixed.status).toBe(200);
                expect(fixed.body).toEqual({status: "ok", warnings: []});

                const brokenAgain = await post(`${homeBaseUrl}/api/home/blueprints/validate`, {blueprint: buildBlueprint({reels: 0})});
                expect(brokenAgain.body).toMatchObject({status: "invalid"});
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
                expect(body).toEqual({status: "ok", path: blueprintPath, blueprint: buildBlueprint(), blueprintHash: computeGameBlueprintHash(buildBlueprint())});
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

        describe("POST /api/home/blueprints/check-source", () => {
            it("rejects a body with no path field", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/check-source`, {blueprintHash: "abc"});

                expect(status).toBe(400);
                expect(body).toEqual({error: '"path" is required.'});
            });

            it("rejects a body with no blueprintHash field", async () => {
                const blueprintPath = writeBlueprintFile(buildBlueprint());

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/check-source`, {path: blueprintPath});

                expect(status).toBe(400);
                expect(body).toEqual({error: '"blueprintHash" is required and must be a non-empty string.'});
            });

            it("reports 'unchanged' when the on-disk content's hash matches the given hash", async () => {
                const blueprintPath = writeBlueprintFile(buildBlueprint());

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/check-source`, {
                    path: blueprintPath,
                    blueprintHash: computeGameBlueprintHash(buildBlueprint()),
                });

                expect(status).toBe(200);
                expect(body).toEqual({status: "unchanged"});
            });

            // The Blueprint Editor's own external-change detection (see BlueprintEditorPage's own
            // background source-check poll) relies on this: a persisted source mutated by something
            // other than this same caller's own Load/Save round trip (a hand edit, another tool) is
            // reported as "changed", carrying the fresh content back so the caller never needs a second
            // round trip just to see what changed.
            it("reports 'changed' with the fresh blueprint/hash once the on-disk content no longer matches the given hash", async () => {
                const blueprintPath = writeBlueprintFile(buildBlueprint());
                const staleHash = computeGameBlueprintHash(buildBlueprint());
                const mutated = buildBlueprint({rows: 4});
                fs.writeFileSync(blueprintPath, JSON.stringify(mutated));

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/check-source`, {
                    path: blueprintPath,
                    blueprintHash: staleHash,
                });

                expect(status).toBe(200);
                expect(body).toEqual({status: "changed", blueprint: mutated, blueprintHash: computeGameBlueprintHash(mutated)});
            });

            it("returns a safe load-error for a missing file", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/check-source`, {
                    path: path.join(workDir, "does-not-exist.json"),
                    blueprintHash: "abc",
                });

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "load-error"});
                expect(JSON.stringify(body)).not.toContain("\\n    at ");
            });

            it("returns a safe load-error for a path inside Studio's own internal directory", async () => {
                const insidePath = path.join(homeStudioRoot, "index.html");

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/check-source`, {path: insidePath, blueprintHash: "abc"});

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "load-error"});
                expect((body as {error: string}).error).toContain("internal directory");
            });
        });

        describe("POST /api/home/blueprints/random", () => {
            it("rejects a non-integer seed", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/random`, {seed: "not-a-number"});

                expect(status).toBe(400);
                expect(body).toEqual({error: '"seed" must be an integer when given.'});
            });

            it("rejects an unknown preset", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/random`, {preset: "bogus"});

                expect(status).toBe(400);
                expect(body).toEqual({error: '"preset" must be one of: default, variant.'});
            });

            it("generates a valid blueprint with no body", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/random`, {});

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "ok", preset: "default"});
                expect(typeof (body as {seed: number}).seed).toBe("number");
            });

            it("reproduces the exact same blueprint for the same seed and preset", async () => {
                const first = await post(`${homeBaseUrl}/api/home/blueprints/random`, {seed: 99, preset: "variant"});
                const second = await post(`${homeBaseUrl}/api/home/blueprints/random`, {seed: 99, preset: "variant"});

                expect(first.body).toEqual(second.body);
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
                expect(body).toEqual({status: "ok", path: filePath, blueprintHash: computeGameBlueprintHash(buildBlueprint())});
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

        describe("POST /api/home/blueprints/save-managed", () => {
            let managedServer: StudioServer;
            let managedBaseUrl: string;
            let managedWorkDir: string;
            let managedRegistry: InMemoryStudioProjectRegistry;
            let managedProjectRegistrationService: StudioProjectRegistrationService;

            beforeEach(async () => {
                managedWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-managed-work-"));
                const managedLoadGame = jest.fn().mockResolvedValue(createFakeGame({id: "sample-slot", name: "Sample Slot", version: "0.1.0"}));
                const managedHomeService = new StudioHomeService("1.0.0", undefined, managedLoadGame);
                managedRegistry = new InMemoryStudioProjectRegistry();
                managedProjectRegistrationService = new StudioProjectRegistrationService(managedRegistry);
                // Points PokiePathResolver.resolveIndependentProjectDirectory's own "POKIE Projects/<name>"
                // convention at this test's own temp directory instead of the real machine's Documents/Home
                // -- everything else about saveManaged() (writing blueprint.json, registering it) runs for
                // real, against real collaborators, matching this describe block's own "real collaborators
                // against real temp directories" convention.
                const resolveIndependentProjectDirectory = jest.fn((name: string) => ({
                    status: "valid",
                    directory: path.join(managedWorkDir, "POKIE Projects", name),
                    source: "documents",
                }));
                managedServer = new StudioServer({
                    pokieVersion: "1.0.0",
                    host: "127.0.0.1",
                    port: 0,
                    studioRoot: homeStudioRoot,
                    homeService: managedHomeService,
                    blueprintService: new StudioBlueprintService(
                        "1.0.0",
                        homeStudioRoot,
                        managedHomeService,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        {resolveIndependentProjectDirectory} as unknown as ConstructorParameters<typeof StudioBlueprintService>[11],
                    ),
                    projectRegistrationService: managedProjectRegistrationService,
                });
                const address = await managedServer.start();
                managedBaseUrl = `http://${address.host}:${address.port}`;
            });

            afterEach(async () => {
                await managedServer.stop();
                fs.rmSync(managedWorkDir, {recursive: true, force: true});
            });

            it("rejects a body with no blueprint field", async () => {
                const {status, body} = await post(`${managedBaseUrl}/api/home/blueprints/save-managed`, {});

                expect(status).toBe(400);
                expect(body).toEqual({error: '"blueprint" is required.'});
            });

            it("writes to a path chosen from the blueprint's own manifest.id and registers it as a managed project", async () => {
                const expectedPath = path.join(managedWorkDir, "POKIE Projects", "sample-slot", "blueprint.json");

                const {status, body} = await post(`${managedBaseUrl}/api/home/blueprints/save-managed`, {blueprint: buildBlueprint()});

                expect(status).toBe(201);
                expect(body).toMatchObject({
                    status: "ok",
                    path: expectedPath,
                    name: "sample-slot",
                    blueprintHash: computeGameBlueprintHash(buildBlueprint()),
                    registeredProject: {
                        location: expectedPath,
                        name: "sample-slot",
                        origin: "managed",
                        type: "blueprint",
                        status: "ok",
                        lastOpenedAt: expect.any(String),
                    },
                });
                expect(fs.existsSync(expectedPath)).toBe(true);

                const entries = await managedRegistry.list();
                expect(entries).toHaveLength(1);
                expect(entries[0]).toMatchObject({location: expectedPath, name: "sample-slot", origin: "managed", type: "blueprint"});
            });

            // This is the actual fresh Home / Design Game default, rather than the compact server-only
            // fixture above. It closes the boundary the guided Create Project action crosses: its
            // validated Recommended model must be persisted and registered in one request, so the client
            // receives the row it immediately opens into the Workspace.
            it("persists and registers the default Recommended Design Game model", async () => {
                const expectedPath = path.join(managedWorkDir, "POKIE Projects", "starter-slot", "blueprint.json");

                const {status, body} = await post(`${managedBaseUrl}/api/home/blueprints/save-managed`, {
                    blueprint: createRecommendedBlueprint(),
                });

                expect(status).toBe(201);
                expect(body).toMatchObject({
                    status: "ok",
                    path: expectedPath,
                    name: "starter-slot",
                    blueprintHash: computeGameBlueprintHash(createRecommendedBlueprint()),
                    registeredProject: expect.objectContaining({
                        location: expectedPath,
                        origin: "managed",
                        type: "blueprint",
                        status: "ok",
                    }),
                });
                expect(JSON.parse(fs.readFileSync(expectedPath, "utf-8"))).toEqual(createRecommendedBlueprint());
                expect(await managedRegistry.list()).toEqual([
                    expect.objectContaining({location: expectedPath, name: "starter-slot", origin: "managed", type: "blueprint"}),
                ]);
            });

            it("retries a transient managed-project registration so Create Project can open the recommended model", async () => {
                const registerManaged = jest.spyOn(managedProjectRegistrationService, "registerManaged");
                registerManaged.mockRejectedValueOnce(new Error("temporarily locked project registry"));

                const {status, body} = await post(`${managedBaseUrl}/api/home/blueprints/save-managed`, {
                    blueprint: createRecommendedBlueprint(),
                });

                expect(status).toBe(201);
                expect(body).toMatchObject({
                    status: "ok",
                    registeredProject: expect.objectContaining({origin: "managed", type: "blueprint", status: "ok"}),
                });
                expect(registerManaged).toHaveBeenCalledTimes(2);
                expect(await managedRegistry.list()).toHaveLength(1);
            });

            it("serves only declared artwork from a reopened managed Blueprint directory", async () => {
                const projectDirectory = path.join(managedWorkDir, "POKIE Projects", "sample-slot");
                const reference = "assets/symbols/gold.png";
                const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
                const saved = await post(`${managedBaseUrl}/api/home/blueprints/save-managed`, {
                    blueprint: buildBlueprint({symbolArtwork: {A: reference, B: "assets/symbols/missing.png"}}),
                });
                expect(saved.status).toBe(201);
                fs.mkdirSync(path.join(projectDirectory, "assets", "symbols"), {recursive: true});
                fs.writeFileSync(path.join(projectDirectory, reference), png);
                fs.writeFileSync(path.join(projectDirectory, "assets", "symbols", "undeclared.png"), png);

                expect((await post(`${managedBaseUrl}/api/home/projects/open`, {projectRoot: projectDirectory})).status).toBe(200);
                expect((await get(`${managedBaseUrl}/api/project/symbol-artwork`)).body).toEqual({artwork: {A: reference, B: "assets/symbols/missing.png"}});

                const image = await fetch(`${managedBaseUrl}/api/project/symbol-artwork?path=${encodeURIComponent(reference)}`);
                expect(image.status).toBe(200);
                expect(Buffer.from(await image.arrayBuffer())).toEqual(png);

                expect((await post(`${managedBaseUrl}/api/projects/close`)).status).toBe(200);
                expect((await post(`${managedBaseUrl}/api/home/projects/open`, {projectRoot: projectDirectory})).status).toBe(200);
                expect((await get(`${managedBaseUrl}/api/project/symbol-artwork`)).body).toEqual({artwork: {A: reference, B: "assets/symbols/missing.png"}});

                const missing = await get(`${managedBaseUrl}/api/project/symbol-artwork?path=${encodeURIComponent("assets/symbols/missing.png")}`);
                const undeclared = await get(`${managedBaseUrl}/api/project/symbol-artwork?path=${encodeURIComponent("assets/symbols/undeclared.png")}`);
                expect(missing.status).toBe(404);
                expect(undeclared.status).toBe(404);
                expect(missing.body).toEqual({error: "Symbol artwork is missing or invalid."});
                expect(undeclared.body).toEqual({error: "Symbol artwork is missing or invalid."});
            });

            // Mirrors BlueprintEditorPage.tsx's own handleGuidedSave: once a first save-managed call has
            // established a path, every later save in that same editor session goes through the ordinary
            // /save endpoint against that exact path (overwrite:true) rather than calling save-managed
            // again -- so "re-uses the already-established destination without prompting" is this request
            // sequence, not a second save-managed call.
            it("a later save through the ordinary save endpoint re-uses the already-established path and stays a single registry entry", async () => {
                const expectedPath = path.join(managedWorkDir, "POKIE Projects", "sample-slot", "blueprint.json");
                await post(`${managedBaseUrl}/api/home/blueprints/save-managed`, {blueprint: buildBlueprint()});

                const {status, body} = await post(`${managedBaseUrl}/api/home/blueprints/save`, {
                    path: expectedPath,
                    blueprint: buildBlueprint({rows: 4}),
                    overwrite: true,
                });

                expect(status).toBe(201);
                expect((body as {path: string}).path).toBe(expectedPath);
                expect(JSON.parse(fs.readFileSync(expectedPath, "utf-8")).rows).toBe(4);
                expect(await managedRegistry.list()).toHaveLength(1);
            });

            it("does not overwrite an existing managed blueprint.json for the same id on a first save, and registers the new destination instead", async () => {
                const collidingDir = path.join(managedWorkDir, "POKIE Projects", "sample-slot");
                fs.mkdirSync(collidingDir, {recursive: true});
                fs.writeFileSync(path.join(collidingDir, "blueprint.json"), "existing project content");
                const expectedPath = path.join(managedWorkDir, "POKIE Projects", "sample-slot-2", "blueprint.json");

                const {status, body} = await post(`${managedBaseUrl}/api/home/blueprints/save-managed`, {blueprint: buildBlueprint()});

                expect(status).toBe(201);
                expect(body).toMatchObject({
                    status: "ok",
                    path: expectedPath,
                    name: "sample-slot-2",
                    blueprintHash: computeGameBlueprintHash(buildBlueprint()),
                    registeredProject: expect.objectContaining({location: expectedPath, origin: "managed", type: "blueprint", status: "ok"}),
                });
                expect(fs.readFileSync(path.join(collidingDir, "blueprint.json"), "utf-8")).toBe("existing project content");
                expect(fs.existsSync(expectedPath)).toBe(true);

                const entries = await managedRegistry.list();
                expect(entries).toHaveLength(1);
                expect(entries[0]).toMatchObject({location: expectedPath, name: "sample-slot-2", origin: "managed", type: "blueprint"});
            });

            // Covers the PAR Apply -> guided "first Save" lifecycle end to end (see
            // BlueprintEditorPage.tsx's own handleApplyImportedBlueprint/handleGuidedSave): the .xlsx
            // workbook a PAR sheet Apply carried into this request is recorded on the freshly-registered
            // managed project as its own provenance, never as the project's own `location`.
            it("records sourceWorkbookPath on the response and on the registered managed project's own entry when a PAR Apply is behind this first Save", async () => {
                const expectedPath = path.join(managedWorkDir, "POKIE Projects", "sample-slot", "blueprint.json");
                const workbookPath = path.join(managedWorkDir, "in.par.xlsx");
                const workbook = new ExcelJS.Workbook();
                workbook.addWorksheet("Manifest").addRows([["Key", "Value"], ["Id", "sample-slot"], ["Name", "Sample Slot"], ["Version", "0.1.0"], ["Reels", 2], ["Rows", 2]]);
                workbook.addWorksheet("Symbols").addRows([["Symbol", "Wild", "Scatter"], ["A", false, false]]);
                workbook.addWorksheet("Paytable").addRows([["Symbol", "Matches", "Multiplier"], ["A", 2, 5]]);
                await workbook.xlsx.writeFile(workbookPath);
                const applied = await post(`${managedBaseUrl}/api/home/blueprints/par-import`, {path: workbookPath});
                expect(applied.status).toBe(200);
                expect(applied.body).toMatchObject({status: "ok"});
                const appliedBlueprint = (applied.body as {blueprint: unknown}).blueprint;

                const {status, body} = await post(`${managedBaseUrl}/api/home/blueprints/save-managed`, {
                    blueprint: appliedBlueprint,
                    sourceWorkbookPath: workbookPath,
                });

                expect(status).toBe(201);
                expect(body).toMatchObject({
                    status: "ok",
                    path: expectedPath,
                    name: "sample-slot",
                    blueprintHash: computeGameBlueprintHash(appliedBlueprint),
                    sourceWorkbookPath: workbookPath,
                    registeredProject: expect.objectContaining({
                        location: expectedPath,
                        origin: "managed",
                        type: "blueprint",
                        status: "ok",
                        importedFromParSheetPath: workbookPath,
                    }),
                });

                const entries = await managedRegistry.list();
                expect(entries).toHaveLength(1);
                expect(entries[0]).toMatchObject({location: expectedPath, origin: "managed", importedFromParSheetPath: workbookPath});
            });

            it("rejects a non-string sourceWorkbookPath", async () => {
                const {status, body} = await post(`${managedBaseUrl}/api/home/blueprints/save-managed`, {
                    blueprint: buildBlueprint(),
                    sourceWorkbookPath: 42,
                });

                expect(status).toBe(400);
                expect(body).toEqual({error: '"sourceWorkbookPath" must be a string when given.'});
            });
        });

        describe("POST /api/home/blueprints/reel-strip-generation-preview", () => {
            it("rejects a body with no blueprint field", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/reel-strip-generation-preview`, {});

                expect(status).toBe(400);
                expect(body).toEqual({error: '"blueprint" is required.'});
            });

            it("returns ok with an empty reels list when the blueprint has no reelStripGeneration", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/reel-strip-generation-preview`, {
                    blueprint: buildBlueprint(),
                });

                expect(status).toBe(200);
                expect(body).toEqual({status: "ok", errors: [], warnings: [], reels: []});
            });

            it("surfaces a structurally broken blueprint's errors but still resolves an unrelated, well-formed reelStripGeneration", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/reel-strip-generation-preview`, {
                    blueprint: buildBlueprint({reels: 0, reelStripGeneration: [{type: "literal", strip: ["A", "B"]}]}),
                });

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "ok"});
                expect((body as {errors: Array<{code: string}>}).errors.length).toBeGreaterThan(0);
                expect((body as {reels: Array<{reelIndex: number}>}).reels).toHaveLength(1);
            });

            it("resolves a mix of literal and generated reels without writing anything", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/reel-strip-generation-preview`, {
                    blueprint: buildBlueprint({
                        reelStripGeneration: [
                            {type: "literal", strip: ["A", "B"]},
                            {type: "generated", length: 2, symbolCounts: {A: 1, B: 1}, seed: 1},
                            {type: "literal", strip: ["B", "A"]},
                        ],
                    }),
                });

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "ok"});
                const reels = (body as {reels: Array<{reelIndex: number; type: string}>}).reels;
                expect(reels).toHaveLength(3);
                expect(reels[0]).toMatchObject({reelIndex: 0, type: "literal", strip: ["A", "B"]});
                expect(reels[1]).toMatchObject({reelIndex: 1, type: "generated", success: true});
                expect(reels[2]).toMatchObject({reelIndex: 2, type: "literal", strip: ["B", "A"]});
                expect(fs.readdirSync(workDir)).toEqual([]);
            });
        });

        describe("POST /api/home/blueprints/par-import", () => {
            async function writeParSheet(sheets: Record<string, unknown[][]>): Promise<string> {
                const filePath = path.join(workDir, "in.par.xlsx");
                const workbook = new ExcelJS.Workbook();
                for (const [name, rows] of Object.entries(sheets)) {
                    const worksheet = workbook.addWorksheet(name);
                    rows.forEach((row) => worksheet.addRow(row));
                }
                await workbook.xlsx.writeFile(filePath);
                return filePath;
            }

            const validSheets = {
                Manifest: [
                    ["Key", "Value"],
                    ["Id", "sample-slot"],
                    ["Name", "Sample Slot"],
                    ["Version", "0.1.0"],
                    ["Reels", 2],
                    ["Rows", 2],
                ],
                Symbols: [
                    ["Symbol", "Wild", "Scatter"],
                    ["A", false, false],
                ],
                Paytable: [
                    ["Symbol", "Matches", "Multiplier"],
                    ["A", 2, 5],
                ],
            };

            it("rejects a body with no path field", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/par-import`, {});

                expect(status).toBe(400);
                expect(body).toEqual({error: '"path" is required.'});
            });

            it("reads and maps a valid PAR sheet", async () => {
                const filePath = await writeParSheet(validSheets);

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/par-import`, {path: filePath});

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "ok", path: filePath, blueprint: {manifest: {id: "sample-slot"}, reels: 2, rows: 2}, errors: []});
            });

            it("returns a safe load-error for a missing file", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/par-import`, {
                    path: path.join(workDir, "does-not-exist.par.xlsx"),
                });

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "load-error"});
                expect(JSON.stringify(body)).not.toContain("\\n    at ");
            });

            it("returns a safe load-error for a path inside Studio's own internal directory", async () => {
                const insidePath = path.join(homeStudioRoot, "index.html");

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/par-import`, {path: insidePath});

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "load-error"});
                expect((body as {error: string}).error).toContain("internal directory");
            });
        });

        describe("POST /api/home/blueprints/par-export", () => {
            const exportableBlueprint = buildBlueprint({
                reelStrips: [
                    ["A", "B", "A"],
                    ["B", "A", "B"],
                    ["A", "B", "A"],
                ],
            });

            it("rejects a body with no path field", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/par-export`, {blueprint: exportableBlueprint});

                expect(status).toBe(400);
                expect(body).toEqual({error: '"path" is required.'});
            });

            it("rejects a body with no blueprint field", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/par-export`, {
                    path: path.join(workDir, "out.par.xlsx"),
                });

                expect(status).toBe(400);
                expect(body).toEqual({error: '"blueprint" is required.'});
            });

            it("writes a new PAR sheet file", async () => {
                const filePath = path.join(workDir, "out.par.xlsx");

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/par-export`, {
                    path: filePath,
                    blueprint: exportableBlueprint,
                });

                expect(status).toBe(201);
                expect(body).toMatchObject({status: "ok", path: filePath});
                expect(fs.existsSync(filePath)).toBe(true);
            });

            it("returns 409 conflict and writes nothing when the file already exists and overwrite isn't set", async () => {
                const filePath = path.join(workDir, "out.par.xlsx");
                fs.writeFileSync(filePath, "existing content");

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/par-export`, {
                    path: filePath,
                    blueprint: exportableBlueprint,
                });

                expect(status).toBe(409);
                expect(body).toMatchObject({status: "conflict", path: filePath});
                expect(fs.readFileSync(filePath, "utf-8")).toBe("existing content");
            });

            it("materializes a generated reel source into a PAR workbook", async () => {
                const filePath = path.join(workDir, "out.par.xlsx");

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/par-export`, {
                    path: filePath,
                    blueprint: buildBlueprint({
                        reelStripGeneration: [
                            {type: "literal", strip: ["A", "B"]},
                            {type: "literal", strip: ["B", "A"]},
                            {type: "literal", strip: ["A", "B"]},
                        ],
                    }),
                });

                expect(status).toBe(201);
                expect(body).toMatchObject({status: "ok"});
                expect(fs.existsSync(filePath)).toBe(true);
            });

            it("returns a safe error for a path inside Studio's own internal directory", async () => {
                const insidePath = path.join(homeStudioRoot, "out.par.xlsx");

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/par-export`, {
                    path: insidePath,
                    blueprint: exportableBlueprint,
                });

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "error"});
                expect((body as {error: string}).error).toContain("internal directory");
            });
        });

        describe("POST /api/home/blueprints/build-preview", () => {
            it("returns an ok preview without writing anything", async () => {
                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/build-preview`, {
                    blueprint: buildBlueprint(),
                });

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "ok", manifest: {id: "sample-slot"}, reels: 3, rows: 3, symbolsCount: 2});
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
                expect(body).toMatchObject({status: "ok", manifest: {id: "sample-slot"}});
                expect(fs.existsSync(path.join(outDir, "dist", "index.js"))).toBe(true);

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

            it("refuses to rebuild the same outDir twice -- there is no rebuild/merge recognition", async () => {
                const outDir = path.join(workDir, "out");

                const first = await post(`${homeBaseUrl}/api/home/blueprints/build`, {blueprint: buildBlueprint(), outDir});
                const second = await post(`${homeBaseUrl}/api/home/blueprints/build`, {blueprint: buildBlueprint(), outDir});

                expect(first.status).toBe(201);
                expect(second.status).toBe(200);
                expect(second.body).toMatchObject({status: "error"});
                expect((second.body as {error: string}).error).toContain("already exists and is not empty");
            });

            it("refuses to build into a directory that already has content, whatever put it there", async () => {
                const outDir = path.join(workDir, "out");
                fs.mkdirSync(outDir, {recursive: true});
                fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify({name: "someone-elses-project"}));

                const {status, body} = await post(`${homeBaseUrl}/api/home/blueprints/build`, {
                    blueprint: buildBlueprint(),
                    outDir,
                });

                expect(status).toBe(200);
                expect(body).toMatchObject({status: "error"});
                expect((body as {error: string}).error).toContain("already exists and is not empty");
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
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            loadGame.mockResolvedValue(createFakeGame(manifest));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});

            const {status, body} = await get(`${baseUrl}/api/project/context`);

            expect(status).toBe(200);
            expect(body).toEqual({status: "loaded", projectRoot: path.resolve("./sample-slot"), game: manifest});
        });

        it('stays "empty" after creating a project that is not (yet) opened', async () => {
            await post(`${baseUrl}/api/home/projects/create`, {destinationDir: process.cwd(), name: "sample-slot"});

            const {status, body} = await get(`${baseUrl}/api/project/context`);

            expect(status).toBe(200);
            expect(body).toEqual({status: "empty"});
            expect(loadGame).not.toHaveBeenCalled();
        });

        it('reports "loaded" with the scaffolded manifest once the newly created project is explicitly opened', async () => {
            await post(`${baseUrl}/api/home/projects/create`, {destinationDir: process.cwd(), name: "sample-slot"});
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
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            loadGame.mockResolvedValue(createFakeGame(manifest));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});

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

        async function openSampleSlot(): Promise<void> {
            loadGame.mockResolvedValue(createFakeGame({id: "sample-slot", name: "Sample Slot", version: "0.1.0"}));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});
        }

        it("forwards a package's inspection report as-is", async () => {
            await openSampleSlot();
            const report: GamePackageInspectionReport = {
                packageRoot: "./sample-slot",
                valid: true,
                packageJson: {name: "sample-slot", version: "0.1.0"},
            };
            inspect.mockReturnValue(report);

            const {status, body} = await get(`${baseUrl}/api/project/inspect`);

            expect(status).toBe(200);
            expect(body).toEqual(report);
            expect(inspect).toHaveBeenCalledWith(path.resolve("./sample-slot"));
        });

        it("forwards a missing/corrupt package.json inspection failure without a stack trace", async () => {
            await openSampleSlot();
            const report: GamePackageInspectionReport = {
                packageRoot: "./sample-slot",
                valid: false,
                error: '"./sample-slot/package.json" does not exist.',
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

        async function openSampleSlot(): Promise<void> {
            loadGame.mockResolvedValue(createFakeGame({id: "sample-slot", name: "Sample Slot", version: "0.1.0"}));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});
        }

        it("forwards a fully valid validation report", async () => {
            await openSampleSlot();
            const report: PokieGamePackageValidationReport = {
                packageRoot: "./sample-slot",
                valid: true,
                game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                errors: [],
                warnings: [],
                suggestions: [],
            };
            validate.mockResolvedValue(report);

            const {status, body} = await get(`${baseUrl}/api/project/validate`);

            expect(status).toBe(200);
            expect(body).toEqual(report);
            expect(validate).toHaveBeenCalledWith(path.resolve("./sample-slot"));
        });

        it("forwards a validation report with errors", async () => {
            await openSampleSlot();
            const report: PokieGamePackageValidationReport = {
                packageRoot: "./sample-slot",
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
            await openSampleSlot();
            const report: PokieGamePackageValidationReport = {
                packageRoot: "./sample-slot",
                valid: true,
                game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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
            await openSampleSlot();
            validate.mockResolvedValue({
                packageRoot: "./sample-slot",
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
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            let resolveLoad: (game: PokieGame) => void = () => undefined;
            const pendingLoad = new Promise<PokieGame>((resolve) => {
                resolveLoad = resolve;
            });
            const slowLoadGame = jest.fn().mockReturnValue(pendingLoad);

            projectServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: projectStudioRoot,
                homeService: new StudioHomeService("1.0.0", undefined, slowLoadGame),
                blueprintService: new StudioBlueprintService("1.0.0", projectStudioRoot, new StudioHomeService("1.0.0")),
                loadGame: slowLoadGame,
                initialContext: {mode: "project", projectRoot: "/tmp/sample-slot"},
            });
            const address = await projectServer.start();
            const projectBaseUrl = `http://${address.host}:${address.port}`;

            const whileLoading = await get(`${projectBaseUrl}/api/project/context`);
            expect(whileLoading.body).toEqual({status: "loading", projectRoot: "/tmp/sample-slot"});

            resolveLoad(createFakeGame(manifest));
            await pendingLoad;
            const afterLoad = await pollUntilProjectContextSettled(`${projectBaseUrl}/api/project/context`);
            expect(afterLoad.body).toEqual({status: "loaded", projectRoot: "/tmp/sample-slot", game: manifest});
        });

        it('reports "error" when the entry module fails to load on startup', async () => {
            const failingLoadGame = jest.fn().mockRejectedValue(new Error("Cannot find module './dist/index.js'"));

            projectServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: projectStudioRoot,
                homeService: new StudioHomeService("1.0.0", undefined, failingLoadGame),
                blueprintService: new StudioBlueprintService("1.0.0", projectStudioRoot, new StudioHomeService("1.0.0")),
                loadGame: failingLoadGame,
                initialContext: {mode: "project", projectRoot: "/tmp/broken-game"},
            });
            const address = await projectServer.start();
            const projectBaseUrl = `http://${address.host}:${address.port}`;

            const context = await pollUntilProjectContextSettled(`${projectBaseUrl}/api/project/context`);

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
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: fixtureStudioRoot,
                homeService: new StudioHomeService("1.0.0", undefined, loadGame),
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
                expect(body).toMatchObject({packageRoot: projectRoot, valid: false});
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
                expect(body).toMatchObject({packageRoot: projectRoot, valid: false});
                expect((body as {error: string}).error).toContain("does not exist");
                expect(JSON.stringify(body)).not.toContain("\\n    at ");
            } finally {
                fs.rmSync(projectRoot, {recursive: true, force: true});
            }
        });
    });

    // Regression coverage for resolved-project-type awareness: opening a "blueprint" `projectRoot`
    // (a single JSON file, not a directory) must never probe `<blueprint.json>/package.json` --
    // that throws ENOTDIR, not a normal "invalid" report -- and must run GameBlueprintValidator/the
    // blueprint's own manifest instead of PokieGamePackageValidator/package.json (see
    // resolveOpenedProjectType/inspectBlueprintProject/validateBlueprintProject's own doc comments).
    describe("GET /api/project/inspect and /api/project/validate for a resolved 'blueprint' project (real fixtures on disk)", () => {
        let blueprintStudioRoot: string;
        let blueprintWorkDir: string;
        let blueprintServer: StudioServer | undefined;

        beforeEach(() => {
            blueprintStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-blueprint-inspect-studio-test-"));
            writeStudioAssets(blueprintStudioRoot);
            blueprintWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-blueprint-inspect-work-test-"));
        });

        afterEach(async () => {
            await blueprintServer?.stop();
            fs.rmSync(blueprintStudioRoot, {recursive: true, force: true});
            fs.rmSync(blueprintWorkDir, {recursive: true, force: true});
        });

        function buildBlueprint(overrides: Record<string, unknown> = {}): Record<string, unknown> {
            return {
                manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                reels: 3,
                rows: 3,
                symbols: ["A", "B"],
                paytable: {A: {3: 5}, B: {3: 2}},
                ...overrides,
            };
        }

        function writeBlueprintFile(blueprint: unknown): string {
            const filePath = path.join(blueprintWorkDir, "blueprint.json");
            fs.writeFileSync(filePath, JSON.stringify(blueprint));
            return filePath;
        }

        async function startServerForBlueprintProject(projectRoot: string): Promise<string> {
            const homeService = new StudioHomeService("1.0.0");
            blueprintServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: blueprintStudioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.0.0", blueprintStudioRoot, homeService),
                initialContext: {mode: "project", projectRoot},
            });
            const address = await blueprintServer.start();
            return `http://${address.host}:${address.port}`;
        }

        it("inspects a valid blueprint's own manifest fields, never probing <blueprint.json>/package.json", async () => {
            const blueprintPath = writeBlueprintFile(buildBlueprint());
            const projectBaseUrl = await startServerForBlueprintProject(blueprintPath);

            const {status, body} = await get(`${projectBaseUrl}/api/project/inspect`);

            expect(status).toBe(200);
            expect(body).toEqual({
                packageRoot: blueprintPath,
                valid: true,
                packageJson: {name: "Sample Slot", version: "0.1.0", description: undefined},
            });
        });

        it("reports a safe load-error (never an ENOTDIR) when inspecting a corrupt blueprint file", async () => {
            const blueprintPath = path.join(blueprintWorkDir, "blueprint.json");
            fs.writeFileSync(blueprintPath, "{ this is not json");
            const projectBaseUrl = await startServerForBlueprintProject(blueprintPath);

            const {status, body} = await get(`${projectBaseUrl}/api/project/inspect`);

            expect(status).toBe(200);
            expect(body).toMatchObject({packageRoot: blueprintPath, valid: false});
            expect(JSON.stringify(body)).not.toContain("ENOTDIR");
            expect(JSON.stringify(body)).not.toContain("\\n    at ");
        });

        it("validates a clean blueprint via GameBlueprintValidator with no errors/warnings", async () => {
            const blueprintPath = writeBlueprintFile(buildBlueprint());
            const projectBaseUrl = await startServerForBlueprintProject(blueprintPath);

            const {status, body} = await get(`${projectBaseUrl}/api/project/validate`);

            expect(status).toBe(200);
            expect(body).toEqual({
                packageRoot: blueprintPath,
                valid: true,
                game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                errors: [],
                warnings: [],
                suggestions: [],
            });
        });

        it("reports GameBlueprintValidator's own structural errors for a broken blueprint, never PokieGamePackageValidator's package.json-oriented errors", async () => {
            const blueprintPath = writeBlueprintFile(buildBlueprint({reels: 0}));
            const projectBaseUrl = await startServerForBlueprintProject(blueprintPath);

            const {status, body} = await get(`${projectBaseUrl}/api/project/validate`);

            expect(status).toBe(200);
            const view = body as PokieGamePackageValidationReport;
            expect(view.valid).toBe(false);
            expect(view.errors.map((error) => error.code)).toContain("blueprint-reels-invalid");
            expect(JSON.stringify(body)).not.toContain("ENOTDIR");
        });

        it("reports a safe load-error (never an ENOTDIR) when validating a corrupt blueprint file", async () => {
            const blueprintPath = path.join(blueprintWorkDir, "blueprint.json");
            fs.writeFileSync(blueprintPath, "{ this is not json");
            const projectBaseUrl = await startServerForBlueprintProject(blueprintPath);

            const {status, body} = await get(`${projectBaseUrl}/api/project/validate`);

            expect(status).toBe(200);
            const view = body as PokieGamePackageValidationReport;
            expect(view.valid).toBe(false);
            expect(view.game).toBeNull();
            expect(view.errors[0]?.code).toBe("blueprint-load-failed");
            expect(JSON.stringify(body)).not.toContain("ENOTDIR");
        });
    });

    // Regression coverage for P5-POLISH-05: opening a resolved "outcomeLibrary"/"stakeAdapter"
    // `projectRoot` must never reach GamePackageInspector/PokieGamePackageValidator, which assume a
    // package.json-bearing directory neither type has -- Inspect/Validate route through
    // OutcomeSourceProjectAnalyzer's own canonical readers instead (see
    // inspectOutcomeSourceProject/validateOutcomeSourceProject's own doc comments).
    describe("GET /api/project/inspect and /api/project/validate for resolved 'outcomeLibrary'/'stakeAdapter' projects (real fixtures on disk)", () => {
        let libraryStudioRoot: string;
        let libraryWorkDir: string;
        let libraryServer: StudioServer | undefined;
        let libraryInspect: jest.Mock;
        let libraryValidate: jest.Mock;

        beforeEach(() => {
            libraryStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-library-inspect-studio-test-"));
            writeStudioAssets(libraryStudioRoot);
            libraryWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-library-inspect-work-test-"));
            libraryInspect = jest.fn();
            libraryValidate = jest.fn();
        });

        afterEach(async () => {
            await libraryServer?.stop();
            fs.rmSync(libraryStudioRoot, {recursive: true, force: true});
            fs.rmSync(libraryWorkDir, {recursive: true, force: true});
        });

        async function startServerForProject(projectRoot: string): Promise<string> {
            const homeService = new StudioHomeService("1.0.0");
            libraryServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: libraryStudioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.0.0", libraryStudioRoot, homeService),
                gamePackageInspector: {inspect: libraryInspect},
                gamePackageValidator: {validate: libraryValidate},
                initialContext: {mode: "project", projectRoot},
            });
            const address = await libraryServer.start();
            return `http://${address.host}:${address.port}`;
        }

        async function buildNativeLibraryDir(): Promise<string> {
            const bundleDir = path.join(libraryWorkDir, "library");
            await new OutcomeLibraryBundleWriter("1.0.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
            return bundleDir;
        }

        async function buildStakeExportDir(): Promise<string> {
            const stakeDir = path.join(libraryWorkDir, "stake-export");
            const modes: StakeEngineExportModeInput[] = [
                {modeName: "base", cost: 1, library: buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1})},
            ];
            await new StakeEngineExporter("1.0.0").exportToDirectory(modes, stakeDir);
            return stakeDir;
        }

        describe("a resolved native outcome-library bundle", () => {
            it("inspects it as valid through OutcomeSourceProjectAnalyzer, never probing package.json", async () => {
                const bundleDir = await buildNativeLibraryDir();
                const projectBaseUrl = await startServerForProject(bundleDir);

                const {status, body} = await get(`${projectBaseUrl}/api/project/inspect`);

                expect(status).toBe(200);
                expect(body).toEqual({packageRoot: bundleDir, valid: true});
                expect(libraryInspect).not.toHaveBeenCalled();
            });

            it("validates it with no errors/warnings through OutcomeSourceProjectAnalyzer, never PokieGamePackageValidator", async () => {
                const bundleDir = await buildNativeLibraryDir();
                const projectBaseUrl = await startServerForProject(bundleDir);

                const {status, body} = await get(`${projectBaseUrl}/api/project/validate`);

                expect(status).toBe(200);
                expect(body).toEqual({packageRoot: bundleDir, valid: true, game: null, errors: [], warnings: [], suggestions: []});
                expect(libraryValidate).not.toHaveBeenCalled();
            });

            it("reports the bundle validator's own structural error (never an ENOTDIR/package.json error) for a bundle missing a mode's own index file", async () => {
                const bundleDir = await buildNativeLibraryDir();
                const manifest = JSON.parse(fs.readFileSync(path.join(bundleDir, "manifest.json"), "utf-8")) as {modes: Array<{indexFile: string}>};
                fs.rmSync(path.join(bundleDir, manifest.modes[0].indexFile));
                const projectBaseUrl = await startServerForProject(bundleDir);

                const {status, body} = await get(`${projectBaseUrl}/api/project/validate`);

                expect(status).toBe(200);
                const view = body as PokieGamePackageValidationReport;
                expect(view.valid).toBe(false);
                expect(view.game).toBeNull();
                expect(view.errors.length).toBeGreaterThan(0);
                expect(JSON.stringify(body)).not.toContain("ENOTDIR");
                expect(libraryValidate).not.toHaveBeenCalled();
            });
        });

        describe("a resolved Stake Engine export directory", () => {
            it("inspects it as valid through OutcomeSourceProjectAnalyzer, never probing package.json", async () => {
                const stakeDir = await buildStakeExportDir();
                const projectBaseUrl = await startServerForProject(stakeDir);

                const {status, body} = await get(`${projectBaseUrl}/api/project/inspect`);

                expect(status).toBe(200);
                expect(body).toEqual({packageRoot: stakeDir, valid: true});
                expect(libraryInspect).not.toHaveBeenCalled();
            });

            it("validates it with no errors/warnings through OutcomeSourceProjectAnalyzer, never PokieGamePackageValidator", async () => {
                const stakeDir = await buildStakeExportDir();
                const projectBaseUrl = await startServerForProject(stakeDir);

                const {status, body} = await get(`${projectBaseUrl}/api/project/validate`);

                expect(status).toBe(200);
                expect(body).toEqual({packageRoot: stakeDir, valid: true, game: null, errors: [], warnings: [], suggestions: []});
                expect(libraryValidate).not.toHaveBeenCalled();
            });
        });
    });

    // Regression coverage for P5-POLISH-06: GET /api/project/gameModel's own resolved-project-type
    // dispatch (see buildProjectGameModel's own doc comment) -- a "blueprint" project's full tracked
    // source, a tsPackage's package.json-only identity, a wasm project's manifest-only identity, and an
    // outcomeLibrary/stakeAdapter project's honest "no game model" -- never an invented one.
    describe("Project Dashboard: GET /api/project/gameModel", () => {
        it("returns 409 when there is no active project", async () => {
            const {status, body} = await get(`${baseUrl}/api/project/gameModel`);

            expect(status).toBe(409);
            expect(body).toEqual({error: "No active project."});
        });
    });

    describe("GET /api/project/gameModel for a resolved 'blueprint' project (real fixtures on disk)", () => {
        let gameModelStudioRoot: string;
        let gameModelWorkDir: string;
        let gameModelServer: StudioServer | undefined;

        beforeEach(() => {
            gameModelStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-gamemodel-blueprint-studio-test-"));
            writeStudioAssets(gameModelStudioRoot);
            gameModelWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-gamemodel-blueprint-work-test-"));
        });

        afterEach(async () => {
            await gameModelServer?.stop();
            fs.rmSync(gameModelStudioRoot, {recursive: true, force: true});
            fs.rmSync(gameModelWorkDir, {recursive: true, force: true});
        });

        function writeBlueprintFile(blueprint: unknown): string {
            const filePath = path.join(gameModelWorkDir, "blueprint.json");
            fs.writeFileSync(filePath, JSON.stringify(blueprint));
            return filePath;
        }

        async function startServerForBlueprintProject(projectRoot: string): Promise<string> {
            const homeService = new StudioHomeService("1.0.0");
            gameModelServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: gameModelStudioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.0.0", gameModelStudioRoot, homeService),
                initialContext: {mode: "project", projectRoot},
            });
            const address = await gameModelServer.start();
            return `http://${address.host}:${address.port}`;
        }

        it("projects the tracked Blueprint source's full game model, never probing <blueprint.json>/package.json", async () => {
            const blueprintPath = writeBlueprintFile({
                manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                reels: 3,
                rows: 3,
                symbols: ["A", "B"],
                paytable: {A: {3: 5}, B: {3: 2}},
                availableBets: [1, 2, 5],
            });
            const projectBaseUrl = await startServerForBlueprintProject(blueprintPath);

            const {status, body} = await get(`${projectBaseUrl}/api/project/gameModel`);

            expect(status).toBe(200);
            expect(body).toMatchObject({
                basics: {status: "available", data: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}},
                layout: {status: "available", data: {reels: 3, rows: 3}},
                limits: {status: "available", data: {minBet: 1, maxBet: 5}},
            });
        });

        it("reports a safe unavailable reason (never an ENOTDIR) for a corrupt blueprint file", async () => {
            const blueprintPath = path.join(gameModelWorkDir, "blueprint.json");
            fs.writeFileSync(blueprintPath, "{ this is not json");
            const projectBaseUrl = await startServerForBlueprintProject(blueprintPath);

            const {status, body} = await get(`${projectBaseUrl}/api/project/gameModel`);

            expect(status).toBe(200);
            const view = body as {basics: {status: string; reason: string}};
            expect(view.basics.status).toBe("unavailable");
            expect(JSON.stringify(body)).not.toContain("ENOTDIR");
            expect(JSON.stringify(body)).not.toContain("\\n    at ");
        });

        it("re-rolls the reels section's own dynamic inspection sample via ?sharedWeightsSampleSeed, for the Game Model Reels view's own \"New sample\" action", async () => {
            const blueprintPath = writeBlueprintFile({
                manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                reels: 2,
                rows: 1,
                symbols: ["A", "B"],
                paytable: {A: {3: 5}, B: {3: 2}},
                symbolWeights: {A: 1, B: 3},
            });
            const projectBaseUrl = await startServerForBlueprintProject(blueprintPath);

            const defaultResult = await get(`${projectBaseUrl}/api/project/gameModel`);
            const rerolledResult = await get(`${projectBaseUrl}/api/project/gameModel?sharedWeightsSampleSeed=99`);

            expect(defaultResult.status).toBe(200);
            expect(rerolledResult.status).toBe(200);
            const rerolledReels = (rerolledResult.body as {reels: {status: string; data: {sharedWeightsSample: {seed: number}}}}).reels;
            expect(rerolledReels.status).toBe("available");
            expect(rerolledReels.data.sharedWeightsSample.seed).toEqual(99);
            expect(rerolledResult.body).not.toEqual(defaultResult.body);
        });
    });

    describe("GET /api/project/gameModel for a resolved 'tsPackage' project (real fixtures on disk)", () => {
        let packageStudioRoot: string;
        let packageServer: StudioServer | undefined;

        beforeEach(() => {
            packageStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-gamemodel-package-studio-test-"));
            writeStudioAssets(packageStudioRoot);
        });

        afterEach(async () => {
            await packageServer?.stop();
            fs.rmSync(packageStudioRoot, {recursive: true, force: true});
        });

        it("exposes only package.json's own version/description, never its \"name\" as identity, and never invents symbols/reels/paytable", async () => {
            const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-gamemodel-package-work-test-"));
            try {
                fs.writeFileSync(
                    path.join(projectRoot, "package.json"),
                    JSON.stringify({name: "a-package", version: "1.0.0", description: "A game"}),
                );
                const homeService = new StudioHomeService("1.0.0");
                packageServer = new StudioServer({
                    pokieVersion: "1.0.0",
                    host: "127.0.0.1",
                    port: 0,
                    studioRoot: packageStudioRoot,
                    homeService,
                    blueprintService: new StudioBlueprintService("1.0.0", packageStudioRoot, homeService),
                    gamePackageInspector: new GamePackageInspector(),
                    initialContext: {mode: "project", projectRoot},
                });
                const address = await packageServer.start();
                const projectBaseUrl = `http://${address.host}:${address.port}`;

                const {status, body} = await get(`${projectBaseUrl}/api/project/gameModel`);

                expect(status).toBe(200);
                // package.json's "name" is an npm package identifier, not necessarily the game's own id or
                // display name (pokie init lets --package-name and --game-id diverge freely), so it must never
                // be asserted as basics.data.name/id -- only surfaced, transparently, inside each unavailable
                // section's own reason string.
                const basics = (body as {basics: {status: string; data?: {name?: string}}}).basics;
                expect(basics.data?.name).toBeUndefined();
                expect(body).toMatchObject({
                    basics: {status: "available", data: {version: "1.0.0", description: "A game"}},
                    symbols: {status: "unavailable", reason: expect.stringContaining("a-package")},
                    reels: {status: "unavailable"},
                    paytable: {status: "unavailable"},
                });
            } finally {
                fs.rmSync(projectRoot, {recursive: true, force: true});
            }
        });
    });

    describe("GET /api/project/gameModel for a resolved 'wasm' project (real fixtures on disk)", () => {
        let wasmStudioRoot: string;
        let wasmServer: StudioServer | undefined;

        beforeEach(() => {
            wasmStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-gamemodel-wasm-studio-test-"));
            writeStudioAssets(wasmStudioRoot);
        });

        afterEach(async () => {
            await wasmServer?.stop();
            fs.rmSync(wasmStudioRoot, {recursive: true, force: true});
        });

        it("exposes only the WASM component's own manifest identity, never inventing symbols/reels/paytable", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-gamemodel-wasm-work-test-"));
            try {
                const wasmFile = path.join(workDir, "game.wasm");
                fs.writeFileSync(wasmFile, "not real wasm bytes, extension only");
                fs.writeFileSync(
                    `${wasmFile}.pokie-wasm.json`,
                    JSON.stringify({
                        schemaVersion: POKIE_WASM_CONTRACT_VERSION,
                        component: {id: "sample-component", version: "0.1.0"},
                        serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
                        host: {rng: "pokie.rng.v1", services: []},
                        capabilities: [],
                    }),
                );
                const homeService = new StudioHomeService("1.0.0");
                wasmServer = new StudioServer({
                    pokieVersion: "1.0.0",
                    host: "127.0.0.1",
                    port: 0,
                    studioRoot: wasmStudioRoot,
                    homeService,
                    blueprintService: new StudioBlueprintService("1.0.0", wasmStudioRoot, homeService),
                    initialContext: {mode: "project", projectRoot: wasmFile},
                });
                const address = await wasmServer.start();
                const projectBaseUrl = `http://${address.host}:${address.port}`;

                const {status, body} = await get(`${projectBaseUrl}/api/project/gameModel`);

                expect(status).toBe(200);
                expect(body).toMatchObject({
                    basics: {status: "available", data: {id: "sample-component", version: "0.1.0"}},
                    symbols: {status: "unavailable"},
                    reels: {status: "unavailable"},
                    paytable: {status: "unavailable"},
                });
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });
    });

    describe("GET /api/project/gameModel for resolved 'outcomeLibrary'/'stakeAdapter' projects (real fixtures on disk)", () => {
        let outcomeStudioRoot: string;
        let outcomeWorkDir: string;
        let outcomeServer: StudioServer | undefined;

        beforeEach(() => {
            outcomeStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-gamemodel-outcome-studio-test-"));
            writeStudioAssets(outcomeStudioRoot);
            outcomeWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-gamemodel-outcome-work-test-"));
        });

        afterEach(async () => {
            await outcomeServer?.stop();
            fs.rmSync(outcomeStudioRoot, {recursive: true, force: true});
            fs.rmSync(outcomeWorkDir, {recursive: true, force: true});
        });

        it("never invents a game model for a resolved native outcome-library bundle", async () => {
            const bundleDir = path.join(outcomeWorkDir, "library");
            await new OutcomeLibraryBundleWriter("1.0.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
            const homeService = new StudioHomeService("1.0.0");
            outcomeServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: outcomeStudioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.0.0", outcomeStudioRoot, homeService),
                initialContext: {mode: "project", projectRoot: bundleDir},
            });
            const address = await outcomeServer.start();
            const projectBaseUrl = `http://${address.host}:${address.port}`;

            const {status, body} = await get(`${projectBaseUrl}/api/project/gameModel`);

            expect(status).toBe(200);
            const view = body as {basics: {status: string; reason: string}};
            expect(view.basics.status).toBe("unavailable");
            expect(view.basics.reason).toContain("pre-generated outcome source");
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
        async function openSampleSlot(game: PokieGame): Promise<void> {
            loadGame.mockResolvedValue(game);
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});
        }

        it("rejects an invalid rounds with 400 and never creates a job", async () => {
            await openSampleSlot(createPlayableFakeGame({id: "sample-slot", name: "Sample Slot", version: "0.1.0"}));

            const {status, body} = await post(`${baseUrl}/api/project/simulations`, {rounds: 0});

            expect(status).toBe(400);
            expect(body).toEqual({error: '"rounds" must be a positive integer.'});
        });

        it("rejects a non-integer rounds with 400", async () => {
            await openSampleSlot(createPlayableFakeGame({id: "sample-slot", name: "Sample Slot", version: "0.1.0"}));

            const {status, body} = await post(`${baseUrl}/api/project/simulations`, {rounds: 12.5});

            expect(status).toBe(400);
            expect(body).toEqual({error: '"rounds" must be a positive integer.'});
        });

        it("rejects an empty seed with 400", async () => {
            await openSampleSlot(createPlayableFakeGame({id: "sample-slot", name: "Sample Slot", version: "0.1.0"}));

            const {status, body} = await post(`${baseUrl}/api/project/simulations`, {rounds: 100, seed: "  "});

            expect(status).toBe(400);
            expect(body).toEqual({error: '"seed" must be a non-empty string when given.'});
        });

        it("starts a simulation, completes it, and returns a full SimulationReport", async () => {
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            await openSampleSlot(createPlayableFakeGame(manifest));

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

        it("defaults workers to 1 and reports it on the created job/report", async () => {
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            await openSampleSlot(createPlayableFakeGame(manifest));

            const created = await post(`${baseUrl}/api/project/simulations`, {rounds: 50});
            const createdBody = created.body as {id: string; workers: number};
            expect(createdBody.workers).toBe(1);

            const {body} = await pollUntilTerminal(`${baseUrl}/api/project/simulations/${createdBody.id}`);
            expect(body.workers).toBe(1);
            expect((body.report as {workers?: number} | undefined)?.workers).toBe(1);
        });

        it("rejects an invalid workers value with 400", async () => {
            await openSampleSlot(createPlayableFakeGame({id: "sample-slot", name: "Sample Slot", version: "0.1.0"}));

            const response = await post(`${baseUrl}/api/project/simulations`, {rounds: 50, workers: 0});

            expect(response.status).toBe(400);
            expect((response.body as {error: string}).error).toMatch(/"workers" must be an integer between 1 and/);
        });

        it("returns 404 for GET of an unknown simulation id", async () => {
            await openSampleSlot(createPlayableFakeGame({id: "sample-slot", name: "Sample Slot", version: "0.1.0"}));

            const {status, body} = await get(`${baseUrl}/api/project/simulations/does-not-exist`);

            expect(status).toBe(404);
            expect(body).toEqual({error: 'Unknown simulation id "does-not-exist".'});
        });

        it("returns 404 for DELETE of an unknown simulation id", async () => {
            await openSampleSlot(createPlayableFakeGame({id: "sample-slot", name: "Sample Slot", version: "0.1.0"}));

            const {status, body} = await del(`${baseUrl}/api/project/simulations/does-not-exist`);

            expect(status).toBe(404);
            expect(body).toEqual({error: 'Unknown simulation id "does-not-exist".'});
        });

        it("produces a base/freeGames breakdown when the session implements StakeAmountDetermining", async () => {
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            await openSampleSlot(createFreeGamesAwareFakeGame(manifest));

            const created = await post(`${baseUrl}/api/project/simulations`, {rounds: 50});
            const createdBody = created.body as {id: string};

            const {body} = await pollUntilTerminal(`${baseUrl}/api/project/simulations/${createdBody.id}`);

            const report = body.report as {breakdown: {components: Record<string, {rounds: number}>}; rounds: number};
            expect(report.breakdown).toBeDefined();
            expect(report.breakdown.components.base.rounds).toBe(40);
            expect(report.breakdown.components.freeGames.rounds).toBe(10);
        });

        it("has no breakdown when the session doesn't implement StakeAmountDetermining", async () => {
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            await openSampleSlot(createPlayableFakeGame(manifest));

            const created = await post(`${baseUrl}/api/project/simulations`, {rounds: 30});
            const createdBody = created.body as {id: string};

            const {body} = await pollUntilTerminal(`${baseUrl}/api/project/simulations/${createdBody.id}`);

            expect((body.report as {breakdown?: unknown}).breakdown).toBeUndefined();
        });

        it("fails the job with a safe error message when the simulation's own load of the game throws", async () => {
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            // Open succeeds (first loadGame call); the simulation's own independent load (second call)
            // fails — e.g. the entry file was removed after the project was opened.
            loadGame.mockResolvedValueOnce(createPlayableFakeGame(manifest));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});
            loadGame.mockRejectedValueOnce(new Error("Cannot find module './dist/index.js'"));

            const created = await post(`${baseUrl}/api/project/simulations`, {rounds: 100});
            const createdBody = created.body as {id: string};

            const {body} = await pollUntilTerminal(`${baseUrl}/api/project/simulations/${createdBody.id}`);

            expect(body.status).toBe("failed");
            expect(body.error).toBe("Cannot find module './dist/index.js'");
            expect(JSON.stringify(body)).not.toContain("\\n    at ");
        });

        it("rejects a second POST for the same project with 409 while one is already queued/running", async () => {
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            loadGame.mockResolvedValueOnce(createPlayableFakeGame(manifest));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});
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
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
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
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: projectStudioRoot,
                homeService: new StudioHomeService(
                    "1.0.0",
                    undefined,
                    () => Promise.resolve(createPlayableFakeGame(manifest)),
                ),
                blueprintService: new StudioBlueprintService("1.0.0", projectStudioRoot, new StudioHomeService("1.0.0")),
                loadGame: () => Promise.resolve(createPlayableFakeGame(manifest)),
                simulationService,
                initialContext: {mode: "project", projectRoot: "/tmp/sample-slot"},
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
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
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
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: projectStudioRoot,
                homeService: new StudioHomeService(
                    "1.0.0",
                    undefined,
                    () => Promise.resolve(createPlayableFakeGame(manifest)),
                ),
                blueprintService: new StudioBlueprintService("1.0.0", projectStudioRoot, new StudioHomeService("1.0.0")),
                loadGame: () => Promise.resolve(createPlayableFakeGame(manifest)),
                simulationService,
                initialContext: {mode: "project", projectRoot: "/tmp/sample-slot"},
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

    describe("project switch cancels the old project's active jobs", () => {
        let projectStudioRoot: string;
        let projectServer: StudioServer | undefined;

        beforeEach(() => {
            projectStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-switch-cancel-test-"));
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

        it("POST /api/projects/close cancels the old project's active simulation and replay", async () => {
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            const simGate = createControlledYield();
            const replayGate = createControlledYield();
            const simulationService = new StudioSimulationService(
                new InMemoryStudioSimulationRepository(),
                () => Promise.resolve(createPlayableFakeGame(manifest)),
                undefined,
                10, // chunkSize
                undefined,
                simGate.yieldToEventLoop,
            );
            const replayService = new StudioReplayExecutionService(
                new InMemoryStudioReplayRepository(),
                () => Promise.resolve(createPlayableFakeGame(manifest)),
                10, // chunkSize
                undefined,
                replayGate.yieldToEventLoop,
            );

            projectServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: projectStudioRoot,
                homeService: new StudioHomeService(
                    "1.0.0",
                    undefined,
                    () => Promise.resolve(createPlayableFakeGame(manifest)),
                ),
                blueprintService: new StudioBlueprintService("1.0.0", projectStudioRoot, new StudioHomeService("1.0.0")),
                loadGame: () => Promise.resolve(createPlayableFakeGame(manifest)),
                simulationService,
                replayService,
                initialContext: {mode: "project", projectRoot: "/tmp/sample-slot"},
            });
            const address = await projectServer.start();
            const projectBaseUrl = `http://${address.host}:${address.port}`;

            await post(`${projectBaseUrl}/api/project/simulations`, {rounds: 25});
            await post(`${projectBaseUrl}/api/project/replays`, {round: 25});
            await flushMacrotask();
            expect(simGate.pendingCount()).toBe(1);
            expect(replayGate.pendingCount()).toBe(1);
            expect(simulationService.getActiveCount()).toBe(1);
            expect(replayService.getActiveCount()).toBe(1);

            const diagnostics = await get(`${projectBaseUrl}/api/studio/diagnostics`);
            expect(diagnostics.status).toBe(200);
            expect(diagnostics.body).toMatchObject({
                mode: "project",
                projectRoot: "/tmp/sample-slot",
                activeSimulationCount: 1,
                activeReplayCount: 1,
            });
            expect(JSON.stringify(diagnostics.body)).not.toContain("\\n    at ");

            const closeResponse = await post(`${projectBaseUrl}/api/projects/close`);
            expect(closeResponse.status).toBe(200);

            // cancel() only requests cancellation (aborts the controller) — the records transition to
            // "cancelled" once their paused chunk loops notice, same as an explicit DELETE-triggered
            // cancel (see the Simulation/Replay cancellation describe blocks above).
            simGate.release();
            replayGate.release();
            await flushMacrotask();

            expect(simulationService.getActiveCount()).toBe(0);
            expect(replayService.getActiveCount()).toBe(0);
        });
    });

    describe("Project Dashboard: Reports (GET /api/project/reports*)", () => {
        const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

        async function openSampleSlot(game: PokieGame): Promise<void> {
            loadGame.mockResolvedValue(game);
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});
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
            await openSampleSlot(createPlayableFakeGame(manifest));

            const {status, body} = await get(`${baseUrl}/api/project/reports`);

            expect(status).toBe(200);
            expect(body).toEqual([]);
        });

        it("lists a completed simulation with the required summary fields", async () => {
            await openSampleSlot(createPlayableFakeGame(manifest));
            const id = await runToCompletion(30, "demo");

            const {status, body} = await get(`${baseUrl}/api/project/reports`);

            expect(status).toBe(200);
            const entries = body as Array<Record<string, unknown>>;
            expect(entries).toHaveLength(1);
            expect(entries[0]).toMatchObject({
                id,
                status: "completed",
                game: {id: "sample-slot", version: "0.1.0"},
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
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});
            loadGame.mockRejectedValueOnce(new Error("boom"));
            await runToCompletion(10);

            const {body} = await get(`${baseUrl}/api/project/reports`);

            expect(body).toEqual([]);
        });

        it("returns the full SimulationReport (plus statistics) for a completed job", async () => {
            await openSampleSlot(createPlayableFakeGame(manifest));
            const id = await runToCompletion(30, "demo");

            const {status, body} = await get(`${baseUrl}/api/project/reports/${id}`);

            expect(status).toBe(200);
            const detail = body as {report: {game: unknown; rounds: number; requestedRounds: number; seed: string}; statistics?: {volatility: number}};
            expect(detail.report).toMatchObject({game: manifest, rounds: 30, requestedRounds: 30, seed: "demo"});
            expect(typeof detail.statistics?.volatility).toBe("number");
        });

        it("returns identical statistics whether the report is fetched right after completion or later, as if historical", async () => {
            await openSampleSlot(createPlayableFakeGame(manifest));
            const id = await runToCompletion(30, "demo");

            const first = await get(`${baseUrl}/api/project/reports/${id}`);
            const second = await get(`${baseUrl}/api/project/reports/${id}`);

            expect(first.body).toEqual(second.body);
        });

        it("returns 404 for an unknown report id", async () => {
            await openSampleSlot(createPlayableFakeGame(manifest));

            const {status, body} = await get(`${baseUrl}/api/project/reports/does-not-exist`);

            expect(status).toBe(404);
            expect(body).toEqual({error: 'Unknown report id "does-not-exist".'});
        });

        it("returns 409 for a failed simulation (no report available)", async () => {
            loadGame.mockResolvedValueOnce(createPlayableFakeGame(manifest));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});
            loadGame.mockRejectedValueOnce(new Error("boom"));
            const id = await runToCompletion(10);

            const {status, body} = await get(`${baseUrl}/api/project/reports/${id}`);

            expect(status).toBe(409);
            expect(body).toEqual({error: `Simulation "${id}" has no report (status: failed).`});
        });

        it("returns 404 (not a leak) for a report id that belongs to a different project", async () => {
            await openSampleSlot(createPlayableFakeGame(manifest));
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
                await openSampleSlot(createPlayableFakeGame(manifest));
                const id = await runToCompletion(10);

                const missing = await fetch(`${baseUrl}/api/project/reports/${id}/download`);
                expect(missing.status).toBe(400);

                const invalid = await fetch(`${baseUrl}/api/project/reports/${id}/download?format=csv`);
                expect(invalid.status).toBe(400);
            });

            it("returns 404 for an unknown report id", async () => {
                await openSampleSlot(createPlayableFakeGame(manifest));

                const response = await fetch(`${baseUrl}/api/project/reports/does-not-exist/download?format=json`);

                expect(response.status).toBe(404);
            });

            it("returns 409 for a simulation with no report", async () => {
                loadGame.mockResolvedValueOnce(createPlayableFakeGame(manifest));
                await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});
                loadGame.mockRejectedValueOnce(new Error("boom"));
                const id = await runToCompletion(10);

                const response = await fetch(`${baseUrl}/api/project/reports/${id}/download?format=json`);

                expect(response.status).toBe(409);
            });

            it("downloads a JSON artifact with correct headers and a parseable body", async () => {
                await openSampleSlot(createPlayableFakeGame(manifest));
                const id = await runToCompletion(30, "demo");

                const response = await fetch(`${baseUrl}/api/project/reports/${id}/download?format=json`);

                expect(response.status).toBe(200);
                expect(response.headers.get("content-type")).toContain("application/json");
                expect(response.headers.get("content-disposition")).toBe(
                    `attachment; filename="sample-slot-0.1.0-${id}.json"`,
                );
                const parsed = JSON.parse(await response.text());
                expect(parsed).toMatchObject({game: manifest, rounds: 30, seed: "demo"});
            });

            it("downloads a Markdown artifact with correct headers and the key metrics", async () => {
                await openSampleSlot(createPlayableFakeGame(manifest));
                const id = await runToCompletion(30, "demo");

                const response = await fetch(`${baseUrl}/api/project/reports/${id}/download?format=markdown`);

                expect(response.status).toBe(200);
                expect(response.headers.get("content-type")).toContain("text/markdown");
                expect(response.headers.get("content-disposition")).toBe(
                    `attachment; filename="sample-slot-0.1.0-${id}.md"`,
                );
                const body = await response.text();
                expect(body).toContain("# Simulation Report: Sample Slot");
                expect(body).toContain("RTP");
                expect(body).toContain("Hit frequency");
            });

            it("downloads a full HTML document with correct headers", async () => {
                await openSampleSlot(createPlayableFakeGame(manifest));
                const id = await runToCompletion(30, "demo");

                const response = await fetch(`${baseUrl}/api/project/reports/${id}/download?format=html`);

                expect(response.status).toBe(200);
                expect(response.headers.get("content-type")).toContain("text/html");
                expect(response.headers.get("content-disposition")).toBe(
                    `attachment; filename="sample-slot-0.1.0-${id}.html"`,
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
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            const simulationService = new StudioSimulationService(
                new InMemoryStudioSimulationRepository(),
                () => Promise.resolve(createPlayableFakeGame(manifest)),
                reportBuilder,
            );
            reportsServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: reportsStudioRoot,
                homeService: new StudioHomeService(
                    "1.0.0",
                    undefined,
                    () => Promise.resolve(createPlayableFakeGame(manifest)),
                ),
                blueprintService: new StudioBlueprintService("1.0.0", reportsStudioRoot, new StudioHomeService("1.0.0")),
                loadGame: () => Promise.resolve(createPlayableFakeGame(manifest)),
                simulationService,
                initialContext: {mode: "project", projectRoot: "/tmp/sample-slot"},
            });
            const address = await reportsServer.start();
            return `http://${address.host}:${address.port}`;
        }

        it("lists and downloads an old-shape report (missing breakdown/warnings/recommendations/reproducibility) without error", async () => {
            const minimalReport: SimulationReport = {
                game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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
            expect((detail.body as {report: unknown}).report).toEqual(minimalReport);
            expect((detail.body as {statistics?: {volatility: number}}).statistics).toBeDefined();

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
        const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

        // Persistent (not "Once"): the replay's own StudioReplayExecutionService independently calls
        // this same `loadGame` a second time (see StudioReplayExecutionService.run()), same reasoning
        // as the Simulation describe block's own openSampleSlot().
        async function openSampleSlot(game: PokieGame): Promise<void> {
            loadGame.mockResolvedValue(game);
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});
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
            await openSampleSlot(createSeedAwareFakeGame(manifest));

            const zero = await post(`${baseUrl}/api/project/replays`, {round: 0});
            expect(zero.status).toBe(400);
            expect(zero.body).toEqual({error: '"round" must be a positive integer.'});

            const nonInteger = await post(`${baseUrl}/api/project/replays`, {round: 4.2});
            expect(nonInteger.status).toBe(400);

            expect((await get(`${baseUrl}/api/project/replays`)).body).toEqual([]);
        });

        it("rejects a round above the safety limit with 400", async () => {
            await openSampleSlot(createSeedAwareFakeGame(manifest));

            const {status, body} = await post(`${baseUrl}/api/project/replays`, {round: 100_000_001});

            expect(status).toBe(400);
            expect(body).toEqual({error: '"round" must not exceed 100000.'});
        });

        it("rejects an empty seed with 400", async () => {
            await openSampleSlot(createSeedAwareFakeGame(manifest));

            const {status, body} = await post(`${baseUrl}/api/project/replays`, {round: 1, seed: "  "});

            expect(status).toBe(400);
            expect(body).toEqual({error: '"seed" must be a non-empty string when given.'});
        });

        // The core fix this slice is about: POST returns immediately with a queued job, regardless of
        // how large `round` is — it never runs the replay itself inline. See the "stays responsive"
        // test below for the end-to-end proof that other requests aren't blocked either.
        it("returns 202 with a queued job immediately, before the replay itself has run", async () => {
            await openSampleSlot(createSeedAwareFakeGame(manifest));

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
            await openSampleSlot(createSeedAwareFakeGame(manifest));

            const created = await post(`${baseUrl}/api/project/replays`, {round: 5, seed: "demo"});
            const createdBody = created.body as {id: string};

            const {status, body} = await pollUntilTerminal(`${baseUrl}/api/project/replays/${createdBody.id}`);

            expect(status).toBe(200);
            expect(body.status).toBe("completed");
            expect(body.descriptor).toMatchObject({game: manifest, round: 5, seed: "demo"});
            expect(body.completedRounds).toBe(5);
        });

        it("returns 400 for a simulationId that doesn't reference a completed simulation for this project", async () => {
            await openSampleSlot(createSeedAwareFakeGame(manifest));

            const {status, body} = await post(`${baseUrl}/api/project/replays`, {round: 3, seed: "demo", simulationId: "does-not-exist"});

            expect(status).toBe(400);
            expect(body).toEqual({error: 'Unknown or incomplete simulation "does-not-exist" to sample from.'});
            expect((await get(`${baseUrl}/api/project/rounds`)).body).toEqual([]);
        });

        // Proves the Replay tab's "Recent Simulation" source -- picking a round from a completed
        // simulation report and reproducing it -- reaches StudioRoundRecorder exactly like every other
        // round-producing action in Studio (see StudioServer.recordSimulationSampleReplay), unlike a
        // plain "Recreate from seed" reproduction (no `simulationId`), which the test right after this
        // one proves is deliberately left unrecorded.
        it("records a round selected from a completed simulation into the shared history, immediately visible from GET /api/project/rounds", async () => {
            await openSampleSlot(createSeedAwareFakeGame(manifest));
            const projectRoot = (await get(`${baseUrl}/api/context`)).body as {projectRoot: string};

            const simCreated = await post(`${baseUrl}/api/project/simulations`, {rounds: 10, seed: "sim-seed"});
            const simBody = simCreated.body as {id: string};
            await pollUntilTerminal(`${baseUrl}/api/project/simulations/${simBody.id}`);

            const replayCreated = await post(`${baseUrl}/api/project/replays`, {round: 3, seed: "sim-seed", simulationId: simBody.id});
            expect(replayCreated.status).toBe(202);
            const replayBody = replayCreated.body as {id: string};
            const {status, body} = await pollUntilTerminal(`${baseUrl}/api/project/replays/${replayBody.id}`);
            expect(status).toBe(200);
            expect(body.status).toBe("completed");
            const descriptor = body.descriptor as {sessionId: string; totalBet: number; totalWin: number};

            const {status: spinsStatus, body: spinsBody} = await get(`${baseUrl}/api/project/rounds`);
            expect(spinsStatus).toBe(200);
            const entries = spinsBody as Array<{
                sessionId: string;
                bet?: number;
                win?: number;
                debug?: {artifact?: unknown};
                studioSource?: string;
                studioOperation?: string;
                studioProjectRoot?: string;
                studioSeed?: string | number;
                studioRound?: number;
            }>;
            expect(entries).toHaveLength(1);
            expect(entries[0].sessionId).toBe(descriptor.sessionId);
            expect(entries[0].bet).toBe(descriptor.totalBet);
            expect(entries[0].win).toBe(descriptor.totalWin);
            // createSeedAwareFakeGame has no getWinEvaluationResult(), so it isn't video-slot-shaped
            // enough to build a real RoundArtifact from (see StudioReplayExecutionService.hasVideoSlotShape)
            // -- `debug` must stay genuinely absent here, never fabricated, matching descriptor.artifact
            // itself also being undefined for this exact fake game.
            expect(descriptor).not.toHaveProperty("artifact");
            expect(entries[0].debug).toBeUndefined();
            expect(entries[0].studioSource).toBe("simulation-sample");
            expect(entries[0].studioOperation).toBe("simulation-sample");
            expect(entries[0].studioProjectRoot).toBe(projectRoot.projectRoot);
            expect(entries[0].studioSeed).toBe("sim-seed");
            expect(entries[0].studioRound).toBe(1);
        });

        it("never records a plain 'Recreate from seed' reproduction (no simulationId) into the shared history", async () => {
            await openSampleSlot(createSeedAwareFakeGame(manifest));

            const created = await post(`${baseUrl}/api/project/replays`, {round: 3, seed: "demo"});
            await pollUntilTerminal(`${baseUrl}/api/project/replays/${(created.body as {id: string}).id}`);

            expect((await get(`${baseUrl}/api/project/rounds`)).body).toEqual([]);
        });

        it("delivers stateBefore/stateAfter through the HTTP job response end to end", async () => {
            await openSampleSlot(createSeedAwareFakeGame(manifest));

            const created = await post(`${baseUrl}/api/project/replays`, {round: 5, seed: "demo"});
            const createdBody = created.body as {id: string};

            const {status, body} = await pollUntilTerminal(`${baseUrl}/api/project/replays/${createdBody.id}`);

            expect(status).toBe(200);
            const descriptor = body.descriptor as {stateBefore?: Record<string, unknown>; stateAfter?: Record<string, unknown>};
            expect(descriptor.stateBefore).toBeDefined();
            expect(descriptor.stateAfter).toBeDefined();
            expect(descriptor.stateBefore).not.toHaveProperty("initialDebugPayload");
            expect(descriptor.stateAfter).not.toHaveProperty("roundDebugPayload");
        });

        it("produces the exact same descriptor for the same seed/round (reproducibility)", async () => {
            await openSampleSlot(createSeedAwareFakeGame(manifest));

            const firstCreated = await post(`${baseUrl}/api/project/replays`, {round: 10, seed: "reproducible"});
            const first = await pollUntilTerminal(`${baseUrl}/api/project/replays/${(firstCreated.body as {id: string}).id}`);
            const secondCreated = await post(`${baseUrl}/api/project/replays`, {round: 10, seed: "reproducible"});
            const second = await pollUntilTerminal(`${baseUrl}/api/project/replays/${(secondCreated.body as {id: string}).id}`);

            const firstDescriptor = first.body.descriptor as Record<string, unknown>;
            const secondDescriptor = second.body.descriptor as Record<string, unknown>;
            // sessionId is expected to vary since a fresh replay session is minted per request;
            // timestamp/durationMs are wall-clock and also expected to vary between runs.
            expect(secondDescriptor).toEqual({
                ...firstDescriptor,
                sessionId: secondDescriptor.sessionId,
                timestamp: secondDescriptor.timestamp,
                durationMs: secondDescriptor.durationMs,
            });
            expect(firstDescriptor.sessionId).not.toBe(secondDescriptor.sessionId);
        });

        it("still succeeds for a game that ignores the seed entirely", async () => {
            await openSampleSlot(createPlayableFakeGame(manifest));

            const created = await post(`${baseUrl}/api/project/replays`, {round: 4, seed: "whatever"});
            const {body} = await pollUntilTerminal(`${baseUrl}/api/project/replays/${(created.body as {id: string}).id}`);

            expect(body.status).toBe("completed");
            expect((body.descriptor as {seed: string}).seed).toBe("whatever");
        });

        it("records screen: null for a session without getSymbolsCombination()", async () => {
            await openSampleSlot(createFakeGameWithoutScreen(manifest));

            const created = await post(`${baseUrl}/api/project/replays`, {round: 3});
            const {body} = await pollUntilTerminal(`${baseUrl}/api/project/replays/${(created.body as {id: string}).id}`);

            expect(body.status).toBe("completed");
            expect((body.descriptor as {screen: unknown}).screen).toBeNull();
        });

        it("fails the job with a safe message (no stack trace) when loading the game fails", async () => {
            loadGame.mockResolvedValueOnce(createSeedAwareFakeGame(manifest));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});
            loadGame.mockRejectedValueOnce(new Error("Cannot find module './dist/index.js'"));

            const created = await post(`${baseUrl}/api/project/replays`, {round: 3});
            const {body} = await pollUntilTerminal(`${baseUrl}/api/project/replays/${(created.body as {id: string}).id}`);

            expect(body.status).toBe("failed");
            expect(body.error).toBe("Cannot find module './dist/index.js'");
            expect(JSON.stringify(body)).not.toContain("\\n    at ");
        });

        it("rejects a second POST for the same project with 409 while one is already queued/running", async () => {
            loadGame.mockResolvedValueOnce(createSeedAwareFakeGame(manifest));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});
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
            await openSampleSlot(createSeedAwareFakeGame(manifest));

            const {status, body} = await get(`${baseUrl}/api/project/replays/does-not-exist`);

            expect(status).toBe(404);
            expect(body).toEqual({error: 'Unknown replay id "does-not-exist".'});
        });

        it("returns 404 for DELETE of an unknown replay id", async () => {
            await openSampleSlot(createSeedAwareFakeGame(manifest));

            const {status, body} = await del(`${baseUrl}/api/project/replays/does-not-exist`);

            expect(status).toBe(404);
            expect(body).toEqual({error: 'Unknown replay id "does-not-exist".'});
        });

        it("lists a project's replays with the required summary fields", async () => {
            await openSampleSlot(createSeedAwareFakeGame(manifest));
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
            await openSampleSlot(createSeedAwareFakeGame(manifest));

            const {status, body} = await get(`${baseUrl}/api/project/replays`);

            expect(status).toBe(200);
            expect(body).toEqual([]);
        });

        it("downloads a JSON artifact with correct headers and a parseable, matching body once completed", async () => {
            await openSampleSlot(createSeedAwareFakeGame(manifest));
            const created = await post(`${baseUrl}/api/project/replays`, {round: 5, seed: "demo"});
            const {id} = created.body as {id: string};
            const {body} = await pollUntilTerminal(`${baseUrl}/api/project/replays/${id}`);

            const response = await fetch(`${baseUrl}/api/project/replays/${id}/download`);

            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain("application/json");
            expect(response.headers.get("content-disposition")).toBe(`attachment; filename="sample-slot-0.1.0-${id}.json"`);
            expect(JSON.parse(await response.text())).toEqual(body.descriptor);
        });

        it("returns 409 (not-ready) when downloading a replay that hasn't completed yet", async () => {
            loadGame.mockResolvedValueOnce(createSeedAwareFakeGame(manifest));
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});
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
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});
            loadGame.mockRejectedValueOnce(new Error("boom"));
            const created = await post(`${baseUrl}/api/project/replays`, {round: 10});
            const {id} = created.body as {id: string};
            await pollUntilTerminal(`${baseUrl}/api/project/replays/${id}`);

            const response = await fetch(`${baseUrl}/api/project/replays/${id}/download`);

            expect(response.status).toBe(409);
        });

        it("returns 404 when downloading an unknown replay id", async () => {
            await openSampleSlot(createSeedAwareFakeGame(manifest));

            const response = await fetch(`${baseUrl}/api/project/replays/does-not-exist/download`);

            expect(response.status).toBe(404);
        });

        it("returns 404 (not a leak) for a replay id that belongs to a different project", async () => {
            await openSampleSlot(createSeedAwareFakeGame(manifest));
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
            await openSampleSlot(createSeedAwareFakeGame(manifest));
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

    describe("Project Dashboard: POST /api/project/replays/inspect-artifact", () => {
        const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

        async function openSampleSlot(game: PokieGame): Promise<void> {
            loadGame.mockResolvedValue(game);
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: "./sample-slot"});
        }

        const validProvenance: RoundArtifactProvenance = {game: manifest, pokieVersion: "1.0.0"};
        const validArtifact: RoundArtifact = {
            schemaVersion: 1,
            roundId: "replay:demo:5",
            provenance: validProvenance,
            betMode: "base",
            stake: 1,
            totalWin: 0,
            payoutMultiplier: 0,
            screen: [["a"]],
            steps: [{index: 0, screen: [["a"]], totalWin: 0, wins: []}],
            wins: [],
        };

        it("returns 409 when there is no active project", async () => {
            const {status, body} = await post(`${baseUrl}/api/project/replays/inspect-artifact`, {round: 5, seed: "demo"});

            expect(status).toBe(409);
            expect(body).toEqual({error: "No active project."});
        });

        it("validates the outer round/seed and returns no warnings for a well-formed nested artifact", async () => {
            await openSampleSlot(createPlayableFakeGame(manifest));

            const {status, body} = await post(`${baseUrl}/api/project/replays/inspect-artifact`, {
                round: 5,
                seed: "demo",
                artifact: validArtifact,
            });

            expect(status).toBe(200);
            expect(body).toEqual({round: 5, seed: "demo", artifactWarnings: []});
        });

        it("accepts a body without a seed or a nested artifact", async () => {
            await openSampleSlot(createPlayableFakeGame(manifest));

            const {status, body} = await post(`${baseUrl}/api/project/replays/inspect-artifact`, {round: 3});

            expect(status).toBe(200);
            expect(body).toEqual({round: 3, artifactWarnings: []});
        });

        it("rejects an invalid outer round with 400 (the malformed-artifact case for round/seed)", async () => {
            await openSampleSlot(createPlayableFakeGame(manifest));

            const {status, body} = await post(`${baseUrl}/api/project/replays/inspect-artifact`, {round: 0, artifact: validArtifact});

            expect(status).toBe(400);
            expect(body).toEqual({error: '"round" must be a positive integer.'});
        });

        it("rejects a request body that isn't a JSON object", async () => {
            await openSampleSlot(createPlayableFakeGame(manifest));

            const {status, body} = await post(`${baseUrl}/api/project/replays/inspect-artifact`, "not-an-object");

            expect(status).toBe(400);
            expect(body).toEqual({error: "Request body must be a JSON object."});
        });

        it("returns 200 with non-empty artifactWarnings for a structurally invalid nested artifact (malformed artifact, non-fatal)", async () => {
            await openSampleSlot(createPlayableFakeGame(manifest));

            const malformed = {...validArtifact, steps: "not-an-array"};

            const {status, body} = await post(`${baseUrl}/api/project/replays/inspect-artifact`, {round: 5, seed: "demo", artifact: malformed});

            expect(status).toBe(200);
            const parsed = body as {round: number; seed?: string; artifactWarnings: string[]};
            expect(parsed.round).toBe(5);
            expect(parsed.artifactWarnings.length).toBeGreaterThan(0);
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
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            const gate = createControlledYield();
            const replayService = new StudioReplayExecutionService(
                new InMemoryStudioReplayRepository(),
                () => Promise.resolve(createPlayableFakeGame(manifest)),
                10, // chunkSize
                undefined,
                gate.yieldToEventLoop,
            );

            projectServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: projectStudioRoot,
                homeService: new StudioHomeService(
                    "1.0.0",
                    undefined,
                    () => Promise.resolve(createPlayableFakeGame(manifest)),
                ),
                blueprintService: new StudioBlueprintService("1.0.0", projectStudioRoot, new StudioHomeService("1.0.0")),
                loadGame: () => Promise.resolve(createPlayableFakeGame(manifest)),
                replayService,
                initialContext: {mode: "project", projectRoot: "/tmp/sample-slot"},
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
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            const gate = createControlledYield();
            const replayService = new StudioReplayExecutionService(
                new InMemoryStudioReplayRepository(),
                () => Promise.resolve(createPlayableFakeGame(manifest)),
                10,
                undefined,
                gate.yieldToEventLoop,
            );

            projectServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: projectStudioRoot,
                homeService: new StudioHomeService(
                    "1.0.0",
                    undefined,
                    () => Promise.resolve(createPlayableFakeGame(manifest)),
                ),
                blueprintService: new StudioBlueprintService("1.0.0", projectStudioRoot, new StudioHomeService("1.0.0")),
                loadGame: () => Promise.resolve(createPlayableFakeGame(manifest)),
                replayService,
                initialContext: {mode: "project", projectRoot: "/tmp/sample-slot"},
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

            expect(replayService.getStatus("/tmp/sample-slot", createdBody.id)?.status).toBe("cancelled");
        });

        // The concrete fix this slice is about: with the chunk loop paused mid-replay (simulating a
        // very late round still in progress), the same HTTP server must still serve completely
        // unrelated requests — health, Inspect, Validate — instead of the event loop being blocked for
        // the replay's entire duration.
        it("keeps serving GET /api/health, /api/project/inspect and /api/project/validate while a replay is running", async () => {
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            const gate = createControlledYield();
            const replayService = new StudioReplayExecutionService(
                new InMemoryStudioReplayRepository(),
                () => Promise.resolve(createPlayableFakeGame(manifest)),
                10,
                undefined,
                gate.yieldToEventLoop,
            );
            const inspectStub = jest.fn().mockReturnValue({packageRoot: "/tmp/sample-slot", valid: true});
            const validateStub = jest.fn().mockResolvedValue({packageRoot: "/tmp/sample-slot", valid: true, game: manifest, errors: [], warnings: [], suggestions: []});

            projectServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: projectStudioRoot,
                homeService: new StudioHomeService(
                    "1.0.0",
                    undefined,
                    () => Promise.resolve(createPlayableFakeGame(manifest)),
                ),
                blueprintService: new StudioBlueprintService("1.0.0", projectStudioRoot, new StudioHomeService("1.0.0")),
                loadGame: () => Promise.resolve(createPlayableFakeGame(manifest)),
                gamePackageInspector: {inspect: inspectStub},
                gamePackageValidator: {validate: validateStub},
                replayService,
                initialContext: {mode: "project", projectRoot: "/tmp/sample-slot"},
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
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: replayStudioRoot,
                homeService: new StudioHomeService("1.0.0"),
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

    describe("Project Dashboard: Play (POST /api/project/play/session, /api/project/play/sessions/:id/spin)", () => {
        let playStudioRoot: string;
        let playServer: StudioServer | undefined;
        const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

        function createPlayServer(initialContext: {mode: "home"} | {mode: "project"; projectRoot: string}): StudioServer {
            return new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: playStudioRoot,
                homeService: new StudioHomeService("1.0.0", undefined, () => Promise.resolve(createPlayableFakeGame(manifest))),
                blueprintService: new StudioBlueprintService("1.0.0", playStudioRoot, new StudioHomeService("1.0.0")),
                // Injected as a whole, already-constructed instance (its own fake loadGame) -- same
                // reasoning as simulationService/replayService elsewhere in this file: what's under test
                // here is StudioServer's own routing/wiring, not StudioPlayService's own domain logic
                // (already covered by StudioPlayService.test.ts), so this never crosses the real
                // materialization boundary against a nonexistent projectRoot.
                playService: new StudioPlayService(() => Promise.resolve(createPlayableFakeGame(manifest))),
                initialContext,
            });
        }

        beforeEach(() => {
            playStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-play-test-"));
            writeStudioAssets(playStudioRoot);
        });

        afterEach(async () => {
            await playServer?.stop();
            fs.rmSync(playStudioRoot, {recursive: true, force: true});
        });

        it("returns 409 'No active project' for both Play routes in Home mode", async () => {
            playServer = createPlayServer({mode: "home"});
            const address = await playServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            expect((await post(`${baseUrl}/api/project/play/session`, {})).status).toBe(409);
            expect((await post(`${baseUrl}/api/project/play/sessions/unknown/spin`, {})).status).toBe(409);
        });

        it("creates a real session directly (no host/port/server involved) and spins it, returning credits/win straight from the settled round", async () => {
            playServer = createPlayServer({mode: "project", projectRoot: "/tmp/sample-slot"});
            const address = await playServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${baseUrl}/api/project/play/session`, {});
            expect(created.status).toBe(201);
            const createdBody = created.body as {status: string; session: {sessionId: string; credits: number; win?: number}};
            expect(createdBody.status).toBe("ok");
            expect(createdBody.session.credits).toBe(1000);
            expect(createdBody.session.win).toBeUndefined();
            const sessionId = createdBody.session.sessionId;

            const spun = await post(`${baseUrl}/api/project/play/sessions/${sessionId}/spin`, {});
            expect(spun.status).toBe(200);
            const spunBody = spun.body as {status: string; session: {credits: number; win: number}};
            expect(spunBody.status).toBe("ok");
            expect(spunBody.session.credits).toBe(999);
            expect(spunBody.session.win).toBe(0);
        });

        it("spinning an unknown sessionId returns 404, never a runtime-shaped 'not running' error", async () => {
            playServer = createPlayServer({mode: "project", projectRoot: "/tmp/sample-slot"});
            const address = await playServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const response = await post(`${baseUrl}/api/project/play/sessions/does-not-exist/spin`, {});
            expect(response.status).toBe(404);
        });

        it("rejects a malformed seed with a 400, never reaching the play service", async () => {
            playServer = createPlayServer({mode: "project", projectRoot: "/tmp/sample-slot"});
            const address = await playServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const response = await post(`${baseUrl}/api/project/play/session`, {seed: {nested: true}});
            expect(response.status).toBe(400);
        });

        it("returns to 'No active project' for both Play routes once the project is closed", async () => {
            playServer = createPlayServer({mode: "project", projectRoot: "/tmp/sample-slot"});
            const address = await playServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${baseUrl}/api/project/play/session`, {});
            const sessionId = (created.body as {session: {sessionId: string}}).session.sessionId;

            const closed = await post(`${baseUrl}/api/projects/close`);
            expect(closed.status).toBe(200);

            expect((await post(`${baseUrl}/api/project/play/session`, {})).status).toBe(409);
            expect((await post(`${baseUrl}/api/project/play/sessions/${sessionId}/spin`, {})).status).toBe(409);
        });
    });

    // P5-POLISH-11's own scenario controls -- POST .../find-any-win, POST .../find-symbol-win -- plus
    // find-free-games (the canonical shared "custom scenario" abstraction, see
    // StudioPlayService.findFreeGames()'s own doc comment). Routing-level only (400/404/409,
    // request/response shape, selected-symbol propagation): the underlying search semantics (repeated real
    // spins, PlayUntilAnyWinStrategy/PlayUntilSymbolWinStrategy/PlayFreeGamesStrategy, deterministic seed
    // reproducibility) are already covered in depth by StudioPlayService.test.ts.
    describe("Project Dashboard: Play scenario controls (POST /api/project/play/sessions/:id/find-any-win, /find-symbol-win, /find-free-games)", () => {
        let scenarioStudioRoot: string;
        let scenarioServer: StudioServer | undefined;
        const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

        // Wins on round 3 exactly, so findAnyWin has a real, small, deterministic number of real spins to
        // run through rather than either winning trivially on the first attempt or exhausting a large bound.
        function createWinsOnThirdRoundGame(): PokieGame {
            return {
                getManifest: () => manifest,
                createSession: () => {
                    let credits = 1000;
                    const bet = 1;
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
                        canPlayNextGame: () => true,
                        play: () => {
                            round++;
                            winAmount = round === 3 ? 10 : 0;
                            credits = credits - bet + winAmount;
                        },
                        getWinAmount: () => winAmount,
                    } as unknown as GameSessionHandling;
                },
            };
        }

        // Triggers free games on round 3 exactly -- same reasoning as createWinsOnThirdRoundGame above,
        // but VideoSlotSessionHandling-shaped (getSymbolsCombination/getWinEvaluationResult, so "full"
        // capture can actually build a RoundArtifact) and reporting a real getWonFreeGamesNumber()/
        // getFreeGamesNum()/getFreeGamesSum()/getFreeGamesBank() (GameWithFreeGamesSessionHandling) so
        // StudioPlayService.findFreeGames()'s own feature-detection recognizes it as free-games-capable.
        function createTriggersFreeGamesOnThirdRoundGame(): PokieGame {
            return {
                getManifest: () => manifest,
                createSession: () => {
                    let credits = 1000;
                    const bet = 1;
                    let round = 0;
                    let wonFreeGames = 0;
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
                            round++;
                            wonFreeGames = round === 3 ? 3 : 0;
                            credits -= bet;
                        },
                        getWinAmount: () => 0,
                        getSymbolsCombination: () => ({toMatrix: () => [[wonFreeGames > 0 ? "Scatter" : "A"]]}),
                        getWinEvaluationResult: () => new WinEvaluationResult<string>(),
                        getWonFreeGamesNumber: () => wonFreeGames,
                        getFreeGamesNum: () => 0,
                        getFreeGamesSum: () => 0,
                        getFreeGamesBank: () => 0,
                    } as unknown as GameSessionHandling;
                },
            };
        }

        function createScenarioServer(
            initialContext: {mode: "home"} | {mode: "project"; projectRoot: string},
            loadGame: () => Promise<PokieGame> = () => Promise.resolve(createWinsOnThirdRoundGame()),
            maxFindScenarioSpins: number | undefined = undefined,
        ): StudioServer {
            return new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: scenarioStudioRoot,
                homeService: new StudioHomeService("1.0.0", undefined, () => Promise.resolve(createWinsOnThirdRoundGame())),
                blueprintService: new StudioBlueprintService("1.0.0", scenarioStudioRoot, new StudioHomeService("1.0.0")),
                playService: new StudioPlayService(loadGame, undefined, undefined, undefined, undefined, maxFindScenarioSpins),
                initialContext,
            });
        }

        beforeEach(() => {
            scenarioStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-play-scenario-test-"));
            writeStudioAssets(scenarioStudioRoot);
        });

        afterEach(async () => {
            await scenarioServer?.stop();
            fs.rmSync(scenarioStudioRoot, {recursive: true, force: true});
        });

        it("returns 409 'No active project' for all three scenario routes in Home mode", async () => {
            scenarioServer = createScenarioServer({mode: "home"});
            const address = await scenarioServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            expect((await post(`${baseUrl}/api/project/play/sessions/unknown/find-any-win`, {})).status).toBe(409);
            expect((await post(`${baseUrl}/api/project/play/sessions/unknown/find-symbol-win`, {symbolId: "A"})).status).toBe(409);
            expect((await post(`${baseUrl}/api/project/play/sessions/unknown/find-free-games`, {})).status).toBe(409);
        });

        it("find-any-win runs real spins server-side until one actually wins, returning that settled round", async () => {
            scenarioServer = createScenarioServer({mode: "project", projectRoot: "/tmp/sample-slot"});
            const address = await scenarioServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${baseUrl}/api/project/play/session`, {});
            const sessionId = (created.body as {session: {sessionId: string}}).session.sessionId;

            const found = await post(`${baseUrl}/api/project/play/sessions/${sessionId}/find-any-win`, {});

            expect(found.status).toBe(200);
            const foundBody = found.body as {status: string; session: {win: number; credits: number}};
            expect(foundBody.status).toBe("ok");
            expect(foundBody.session.win).toBe(10);
            // 3 real spins settled: 2 losses (-1 each) then a 10-credit win (-1 + 10).
            expect(foundBody.session.credits).toBe(1000 - 1 - 1 - 1 + 10);
        });

        it("find-symbol-win rejects a missing symbolId with 400, never reaching the play service", async () => {
            scenarioServer = createScenarioServer({mode: "project", projectRoot: "/tmp/sample-slot"});
            const address = await scenarioServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${baseUrl}/api/project/play/session`, {});
            const sessionId = (created.body as {session: {sessionId: string}}).session.sessionId;

            const response = await post(`${baseUrl}/api/project/play/sessions/${sessionId}/find-symbol-win`, {});

            expect(response.status).toBe(400);
        });

        it("find-symbol-win propagates the given symbolId through to the play service, reporting an honest error for a non-video-slot game rather than a 500", async () => {
            scenarioServer = createScenarioServer({mode: "project", projectRoot: "/tmp/sample-slot"});
            const address = await scenarioServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${baseUrl}/api/project/play/session`, {});
            const sessionId = (created.body as {session: {sessionId: string}}).session.sessionId;

            const response = await post(`${baseUrl}/api/project/play/sessions/${sessionId}/find-symbol-win`, {symbolId: "A"});

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "error",
                error: "This game doesn't report per-symbol win details, so Find symbol win isn't available for it.",
            });
        });

        it("find-any-win against an unknown sessionId returns 404, never a 500", async () => {
            scenarioServer = createScenarioServer({mode: "project", projectRoot: "/tmp/sample-slot"});
            const address = await scenarioServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const response = await post(`${baseUrl}/api/project/play/sessions/does-not-exist/find-any-win`, {});

            expect(response.status).toBe(404);
        });

        it("find-any-win reports an honest 'error' (never hangs) once a small maxFindScenarioSpins bound is exhausted", async () => {
            scenarioServer = createScenarioServer(
                {mode: "project", projectRoot: "/tmp/sample-slot"},
                () => Promise.resolve(createPlayableFakeGame(manifest)),
                3,
            );
            const address = await scenarioServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${baseUrl}/api/project/play/session`, {});
            const sessionId = (created.body as {session: {sessionId: string}}).session.sessionId;

            const found = await post(`${baseUrl}/api/project/play/sessions/${sessionId}/find-any-win`, {});

            expect(found.status).toBe(200);
            expect(found.body).toEqual({status: "error", error: "No matching round was found within 3 spins."});
        });

        it("find-free-games runs real spins server-side until one actually triggers free games, returning that settled round", async () => {
            scenarioServer = createScenarioServer(
                {mode: "project", projectRoot: "/tmp/sample-slot"},
                () => Promise.resolve(createTriggersFreeGamesOnThirdRoundGame()),
            );
            const address = await scenarioServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${baseUrl}/api/project/play/session`, {});
            const sessionId = (created.body as {session: {sessionId: string}}).session.sessionId;

            const found = await post(`${baseUrl}/api/project/play/sessions/${sessionId}/find-free-games`, {});

            expect(found.status).toBe(200);
            const foundBody = found.body as {
                status: string;
                session: {credits: number; debug?: {artifact?: {featureEvents?: {type: string}[]}}};
            };
            expect(foundBody.status).toBe("ok");
            expect(foundBody.session.debug?.artifact?.featureEvents?.some((event) => event.type === "freeGamesTriggered")).toBe(true);
            // 3 real spins settled, each costing the bet -- proves this ran genuine spins, not a single check.
            expect(foundBody.session.credits).toBe(1000 - 1 - 1 - 1);
        });

        it("records a find-free-games round into the shared history, immediately visible from GET /api/project/rounds, tagged with the real 'find-free-games' operation", async () => {
            // Built directly (not via createScenarioServer, which injects its own standalone
            // StudioPlayService so maxFindScenarioSpins can be overridden per-test -- its recorder is
            // never the one GET /api/project/rounds reads from). Omitting `playService` here lets
            // StudioServer construct its own playService wired to its own shared `roundRecorder` (see
            // StudioServer's own constructor doc comment), the same wiring a real `pokie studio` process
            // uses -- and the same pattern createOutcomeSourceServer below already relies on for its own
            // "records a Play tab round..." test.
            const loadGame = () => Promise.resolve(createTriggersFreeGamesOnThirdRoundGame());
            scenarioServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: scenarioStudioRoot,
                homeService: new StudioHomeService("1.0.0", undefined, loadGame),
                blueprintService: new StudioBlueprintService("1.0.0", scenarioStudioRoot, new StudioHomeService("1.0.0")),
                loadGame,
                initialContext: {mode: "project", projectRoot: "/tmp/sample-slot"},
            });
            const address = await scenarioServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${baseUrl}/api/project/play/session`, {});
            const sessionId = (created.body as {session: {sessionId: string}}).session.sessionId;

            const found = await post(`${baseUrl}/api/project/play/sessions/${sessionId}/find-free-games`, {});
            expect(found.status).toBe(200);
            expect((found.body as {status: string}).status).toBe("ok");

            // The exact same shared StudioRoundRecorder Replay's "Session Spin" list reads from -- proves
            // this real, settled round (produced by a real RoundArtifact, per the previous test) is
            // immediately visible there too, tagged with the real "find-free-games" operation, never
            // demoted to a bare "spin". Every real spin along the 3-round search is recorded (see
            // StudioRoundRecorder's own doc comment), most-recent-first -- entries[0] is the winning round.
            const {status, body} = await get(`${baseUrl}/api/project/rounds`);
            expect(status).toBe(200);
            const entries = body as Array<{sessionId: string; studioOperation?: string; debug?: {artifact?: {featureEvents?: {type: string}[]}}}>;
            expect(entries).toHaveLength(3);
            expect(entries.every((entry) => entry.sessionId === sessionId && entry.studioOperation === "find-free-games")).toBe(true);
            expect(entries[0].debug?.artifact?.featureEvents?.some((event) => event.type === "freeGamesTriggered")).toBe(true);
        });

        it("find-free-games rejects with an honest 'error' for a game that doesn't support free games, never a 500", async () => {
            scenarioServer = createScenarioServer({mode: "project", projectRoot: "/tmp/sample-slot"});
            const address = await scenarioServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${baseUrl}/api/project/play/session`, {});
            const sessionId = (created.body as {session: {sessionId: string}}).session.sessionId;

            const response = await post(`${baseUrl}/api/project/play/sessions/${sessionId}/find-free-games`, {});

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "error",
                error: "This game doesn't support free games, so Find free games isn't available for it.",
            });
        });

        it("find-free-games against an unknown sessionId returns 404, never a 500", async () => {
            scenarioServer = createScenarioServer({mode: "project", projectRoot: "/tmp/sample-slot"});
            const address = await scenarioServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const response = await post(`${baseUrl}/api/project/play/sessions/does-not-exist/find-free-games`, {});

            expect(response.status).toBe(404);
        });
    });

    // Proves P5-POLISH-10's own Outcome Source fix: a resolved "outcomeLibrary"/"stakeAdapter" project
    // opened straight into Play (initialContext -- no runtime.execute capability, no `pokie.entry` package
    // at all) is resolved through the same ProjectTargetResolver-backed routing ServeCommand/the Outcome
    // Library sample route already use, never assumed to be a loadable package (asserted directly:
    // `loadGame` is spied on throughout and must never be called).
    describe("Project Dashboard: Play with a resolved Outcome Source project", () => {
        let outcomeStudioRoot: string;
        let outcomeServer: StudioServer | undefined;

        beforeEach(() => {
            outcomeStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-server-play-outcome-source-test-"));
            writeStudioAssets(outcomeStudioRoot);
        });

        afterEach(async () => {
            await outcomeServer?.stop();
            fs.rmSync(outcomeStudioRoot, {recursive: true, force: true});
        });

        async function buildLibraryBundle(): Promise<string> {
            const bundleDir = path.join(outcomeStudioRoot, "library");
            await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
            return bundleDir;
        }

        async function buildStakeExportDir(): Promise<string> {
            const stakeDir = path.join(outcomeStudioRoot, "stake-export");
            const modes: StakeEngineExportModeInput[] = [
                {modeName: "base", cost: 1, library: buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1})},
            ];
            await new StakeEngineExporter("1.3.0").exportToDirectory(modes, stakeDir);
            return stakeDir;
        }

        function createOutcomeSourceServer(projectRoot: string, loadGame: jest.Mock): StudioServer {
            return new StudioServer({
                pokieVersion: "1.3.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: outcomeStudioRoot,
                homeService: new StudioHomeService("1.3.0", undefined, loadGame),
                blueprintService: new StudioBlueprintService("1.3.0", outcomeStudioRoot, new StudioHomeService("1.3.0")),
                loadGame,
                initialContext: {mode: "project", projectRoot},
            });
        }

        it("plays a resolved native outcome-library project through its own real adapter, returning a real drawn round", async () => {
            const bundleDir = await buildLibraryBundle();
            const loadGame = jest.fn(() => Promise.resolve(createPlayableFakeGame({id: "unused", name: "unused", version: "0.0.0"})));
            outcomeServer = createOutcomeSourceServer(bundleDir, loadGame);
            const address = await outcomeServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${baseUrl}/api/project/play/session`, {});
            expect(created.status).toBe(201);
            const createdBody = created.body as {status: string; session: {sessionId: string; game: {id: string}; win?: number}};
            expect(createdBody.status).toBe("ok");
            expect(createdBody.session.game.id).toBe("sample-slot");
            expect(createdBody.session.win).toBeUndefined();
            const sessionId = createdBody.session.sessionId;

            const spun = await post(`${baseUrl}/api/project/play/sessions/${sessionId}/spin`, {});
            expect(spun.status).toBe(200);
            const spunBody = spun.body as {
                status: string;
                session: {win: number; bet: number; screen: unknown; debug?: {artifact?: unknown; artifactUnavailableReason?: string}};
            };
            expect(spunBody.status).toBe("ok");
            expect(typeof spunBody.session.win).toBe("number");
            expect(typeof spunBody.session.bet).toBe("number");
            expect(spunBody.session.screen).toBeDefined();
            expect(spunBody.session.debug?.artifact).toBeDefined();
            expect(spunBody.session.debug?.artifactUnavailableReason).toBeUndefined();

            expect(loadGame).not.toHaveBeenCalled();
        });

        it("records a Play tab round played against a resolved outcome-library project into the shared history, immediately visible from GET /api/project/rounds", async () => {
            const bundleDir = await buildLibraryBundle();
            const loadGame = jest.fn(() => Promise.resolve(createPlayableFakeGame({id: "unused", name: "unused", version: "0.0.0"})));
            outcomeServer = createOutcomeSourceServer(bundleDir, loadGame);
            const address = await outcomeServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${baseUrl}/api/project/play/session`, {seed: "play-outcome-seed"});
            const sessionId = (created.body as {session: {sessionId: string}}).session.sessionId;
            await post(`${baseUrl}/api/project/play/sessions/${sessionId}/spin`, {});

            const {status, body} = await get(`${baseUrl}/api/project/rounds`);
            expect(status).toBe(200);
            const entries = body as Array<{
                sessionId: string;
                studioSource?: string;
                studioOperation?: string;
                studioProjectRoot?: string;
                studioSeed?: string | number;
                studioRound?: number;
            }>;
            expect(entries).toHaveLength(1);
            expect(entries[0].sessionId).toBe(sessionId);
            expect(entries[0].studioSource).toBe("play-outcome-source");
            expect(entries[0].studioOperation).toBe("spin");
            expect(entries[0].studioProjectRoot).toBe(bundleDir);
            expect(entries[0].studioSeed).toBe("play-outcome-seed");
            expect(entries[0].studioRound).toBe(1);
        });

        it.each(["", "   "])("rejects a blank outcome-library Play seed with a helpful 400 before an exact replay descriptor can be produced (%p)", async (seed) => {
            const bundleDir = await buildLibraryBundle();
            outcomeServer = createOutcomeSourceServer(bundleDir, jest.fn());
            const address = await outcomeServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const response = await post(`${baseUrl}/api/project/play/session`, {seed});
            expect(response.status).toBe(400);
            expect(response.body).toEqual({error: expect.stringMatching(/seed.*non-empty.*best-effort/i)});
        });

        it("plays an explicitly-requested non-first mode of a multi-mode outcome library through POST /api/project/play/session, and records that real mode into the shared round history", async () => {
            const bundleDir = path.join(outcomeStudioRoot, "multi-mode-library");
            await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(
                [buildOutcomeLibraryBundleModeInput("base", "base-lib"), buildOutcomeLibraryBundleModeInput("buyFeature", "buy-lib")],
                bundleDir,
            );
            const loadGame = jest.fn(() => Promise.resolve(createPlayableFakeGame({id: "unused", name: "unused", version: "0.0.0"})));
            outcomeServer = createOutcomeSourceServer(bundleDir, loadGame);
            const address = await outcomeServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${baseUrl}/api/project/play/session`, {seed: "multi-mode-play-seed", modeName: "buyFeature"});
            expect(created.status).toBe(201);
            const createdBody = created.body as {status: string; session: {sessionId: string; debug?: {artifact?: {roundId?: string}}}};
            expect(createdBody.status).toBe("ok");
            const sessionId = createdBody.session.sessionId;

            const spun = await post(`${baseUrl}/api/project/play/sessions/${sessionId}/spin`, {});
            expect(spun.status).toBe(200);
            const spunBody = spun.body as {status: string; session: {debug?: {artifact?: {roundId?: string}}}};
            expect(spunBody.status).toBe("ok");
            expect(spunBody.session.debug?.artifact?.roundId).toMatch(/^buy-lib-/);

            const {body: roundsBody} = await get(`${baseUrl}/api/project/rounds`);
            const entries = roundsBody as Array<{studioModeName?: string}>;
            expect(entries).toHaveLength(1);
            expect(entries[0].studioModeName).toBe("buyFeature");
        });

        it("rejects a Play session request for a mode name that isn't part of this library, naming every real mode, rather than silently falling back to the first mode", async () => {
            const bundleDir = path.join(outcomeStudioRoot, "multi-mode-library-unknown-mode");
            await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(
                [buildOutcomeLibraryBundleModeInput("base", "base-lib"), buildOutcomeLibraryBundleModeInput("buyFeature", "buy-lib")],
                bundleDir,
            );
            const loadGame = jest.fn(() => Promise.resolve(createPlayableFakeGame({id: "unused", name: "unused", version: "0.0.0"})));
            outcomeServer = createOutcomeSourceServer(bundleDir, loadGame);
            const address = await outcomeServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${baseUrl}/api/project/play/session`, {modeName: "bonus"});
            expect(created.status).toBe(200);
            const createdBody = created.body as {status: string; error: string};
            expect(createdBody.status).toBe("failed");
            expect(createdBody.error).toContain('"bonus" is not a mode of this outcome library');
            expect(createdBody.error).toContain("base");
            expect(createdBody.error).toContain("buyFeature");
        });

        it("reports the resolver-derived 'outcomeSource.sample' capability diagnostic for a resolved Stake Engine export, never loadPokieGame", async () => {
            const stakeDir = await buildStakeExportDir();
            const loadGame = jest.fn(() => Promise.resolve(createPlayableFakeGame({id: "unused", name: "unused", version: "0.0.0"})));
            outcomeServer = createOutcomeSourceServer(stakeDir, loadGame);
            const address = await outcomeServer.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const created = await post(`${baseUrl}/api/project/play/session`, {});
            expect(created.status).toBe(200);
            const createdBody = created.body as {status: string; error: string};
            expect(createdBody.status).toBe("failed");
            expect(createdBody.error).toContain("This Stake Engine export cannot sample an outcome");
            expect(createdBody.error).toContain("Outcome Library");

            expect(loadGame).not.toHaveBeenCalled();
        });
    });

    describe("Project Dashboard: Deployment (GET /api/project/deployment/targets, POST /api/project/deployment/runs)", () => {
        let deploymentStudioRoot: string;
        let deploymentProjectRoot: string;
        let deploymentServer: StudioServer | undefined;

        function buildDeploymentTestLibrary(libraryId: string): WeightedOutcomeLibrary<string> {
            const provenance: RoundArtifactProvenance = {game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}, pokieVersion: "1.0.0"};
            const artifact = buildRoundArtifact({
                roundId: `${libraryId}-0`,
                provenance,
                betMode: "base",
                stake: 1,
                steps: [{screen: [["A"]], winEvaluationResult: new WinEvaluationResult()}],
            });
            return buildWeightedOutcomeLibrary({libraryId, outcomes: [{id: "0", weight: 1, artifact}]});
        }

        function writeLibraryFile(fileName: string, library: WeightedOutcomeLibrary<string>): void {
            fs.writeFileSync(path.join(deploymentProjectRoot, fileName), JSON.stringify(library));
        }

        beforeEach(() => {
            deploymentStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-deployment-studio-test-"));
            writeStudioAssets(deploymentStudioRoot);
            deploymentProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-deployment-project-test-"));
        });

        afterEach(async () => {
            await deploymentServer?.stop();
            fs.rmSync(deploymentStudioRoot, {recursive: true, force: true});
            fs.rmSync(deploymentProjectRoot, {recursive: true, force: true});
        });

        async function startServerForProject(projectRoot: string | undefined, deploymentService?: StudioDeploymentService): Promise<string> {
            const homeService = new StudioHomeService("1.0.0");
            deploymentServer = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: deploymentStudioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.0.0", deploymentStudioRoot, homeService),
                initialContext: projectRoot !== undefined ? {mode: "project", projectRoot} : {mode: "home"},
                deploymentService,
            });
            const address = await deploymentServer.start();
            return `http://${address.host}:${address.port}`;
        }

        class NoOpRoundProjector implements ExternalRoundProjector {
            public project(_artifact: RoundArtifact): Record<string, never> {
                return {};
            }
        }

        // The real resolveCurrentBuildModeIds default would try to actually load deploymentProjectRoot as
        // a built pokie package (see resolveCurrentBuildModeIds.ts) and fail, since these fixture project
        // directories are never actually built -- which run() now treats as a rejection (see
        // StudioDeploymentService's own doc comment). Every test below that isn't specifically exercising
        // that current-build-modes check supplies this stand-in instead, so it isn't accidentally
        // exercised as a side effect of an unrelated scenario.
        function deploymentServiceForBuildModes(modeIds: readonly string[] | undefined): StudioDeploymentService {
            return new StudioDeploymentService(undefined, undefined, undefined, undefined, undefined, undefined, () => Promise.resolve(modeIds), undefined, "test-pokie-version");
        }

        // A target whose generator returns a structurally malformed result (content of the wrong
        // type) — exercises the exact scenario this stabilization pass fixed: the real diagnostics
        // must surface as an "artifactValidation" ERROR, never hidden behind a "generation"/"skipped"
        // misattribution. See computeDeploymentStages.test.ts for the same scenario at the unit level.
        function malformedGeneratorDeploymentService(): StudioDeploymentService {
            const malformedTarget: ExternalDeploymentTarget = {
                id: "local-json-example",
                version: "1.0.0",
                requirements: {},
                capabilities: [],
                roundProjector: new NoOpRoundProjector(),
                artifactGenerator: {
                    generate: (_modes: readonly ExternalDeploymentProjectedModeInput[]): ExternalArtifactGenerationResult =>
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        ({artifacts: [{relativePath: "index.json", content: 12345 as any}], issues: []}) as ExternalArtifactGenerationResult,
                },
            };
            return new StudioDeploymentService(undefined, () => malformedTarget, undefined, undefined, undefined, undefined, () => Promise.resolve(["base"]), undefined, "test-pokie-version");
        }

        it("returns 409 for GET targets, GET build-modes, and POST runs when there is no active project", async () => {
            const homeBaseUrl = await startServerForProject(undefined);

            const targetsResponse = await get(`${homeBaseUrl}/api/project/deployment/targets`);
            expect(targetsResponse.status).toBe(409);
            expect(targetsResponse.body).toEqual({error: "No active project."});

            const buildModesResponse = await get(`${homeBaseUrl}/api/project/deployment/build-modes`);
            expect(buildModesResponse.status).toBe(409);
            expect(buildModesResponse.body).toEqual({error: "No active project."});

            const runResponse = await post(`${homeBaseUrl}/api/project/deployment/runs`, {
                targetId: "local-json-example",
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}],
            });
            expect(runResponse.status).toBe(409);
            expect(runResponse.body).toEqual({error: "No active project."});
        });

        // The Configure step's own mode picker is backed by GET /api/project/deployment/build-modes,
        // resolved server-side from the same authoritative current-build resolver POST .../runs itself
        // checks a request against (see StudioDeploymentService.getBuildModes/resolveCurrentBuildModeIds's
        // own doc comments) — never the mutable tracked source blueprint, so this must reflect the current
        // build even when the injected resolver reports modes a fixture project's own (never-built) source
        // wouldn't have.
        it("returns the current build's own modes from GET /api/project/deployment/build-modes", async () => {
            const projectBaseUrl = await startServerForProject(deploymentProjectRoot, deploymentServiceForBuildModes(["base", "bonus"]));

            const {status, body} = await get(`${projectBaseUrl}/api/project/deployment/build-modes`);

            expect(status).toBe(200);
            expect(body).toEqual({status: "ok", modeIds: ["base", "bonus"]});
        });

        it("returns unavailable from GET /api/project/deployment/build-modes when the project has no current build", async () => {
            const projectBaseUrl = await startServerForProject(deploymentProjectRoot, deploymentServiceForBuildModes(undefined));

            const {status, body} = await get(`${projectBaseUrl}/api/project/deployment/build-modes`);

            expect(status).toBe(200);
            expect(body).toEqual({status: "unavailable"});
        });

        it("lists exactly the local example target with its requirements/capabilities", async () => {
            const projectBaseUrl = await startServerForProject(deploymentProjectRoot);

            const {status, body} = await get(`${projectBaseUrl}/api/project/deployment/targets`);

            expect(status).toBe(200);
            expect(body).toEqual([
                {
                    id: "local-json-example",
                    version: "1.0.0",
                    requirements: {requiresHomogeneousProvenance: true},
                    capabilities: expect.arrayContaining(["roundArtifact.featureEvents", "roundArtifact.debugMetadata", "multiMode"]),
                },
            ]);
        });

        it("rejects a malformed run request body with 400 and never touches the SDK", async () => {
            const projectBaseUrl = await startServerForProject(deploymentProjectRoot);

            const emptyTargetId = await post(`${projectBaseUrl}/api/project/deployment/runs`, {targetId: "", modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}]});
            expect(emptyTargetId.status).toBe(400);
            expect((emptyTargetId.body as {error: string}).error).toMatch(/targetId/);

            const emptyModes = await post(`${projectBaseUrl}/api/project/deployment/runs`, {targetId: "local-json-example", modes: []});
            expect(emptyModes.status).toBe(400);
            expect((emptyModes.body as {error: string}).error).toMatch(/modes/);
        });

        it("returns an unavailable planner terminal for an unknown targetId, without ever reading a library file", async () => {
            const projectBaseUrl = await startServerForProject(deploymentProjectRoot);

            const {status, body} = await post(`${projectBaseUrl}/api/project/deployment/runs`, {
                targetId: "does-not-exist",
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "does-not-exist-either.json"}}],
            });

            expect(status).toBe(200);
            expect(body).toMatchObject({
                status: "unavailable",
                error: 'Unknown deployment target "does-not-exist".',
                plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}},
            });
        });

        it("returns 400, in domain language, when a mode isn't part of the active project's own current build — even for a request that never went through the Configure UI", async () => {
            const projectBaseUrl = await startServerForProject(deploymentProjectRoot, deploymentServiceForBuildModes(["bonus"]));
            writeLibraryFile("base.json", buildDeploymentTestLibrary("lib"));

            const {status, body} = await post(`${projectBaseUrl}/api/project/deployment/runs`, {
                targetId: "local-json-example",
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}],
            });

            expect(status).toBe(200);
            expect((body as {error: string}).error).toBe('mode "base" isn\'t part of this project\'s current build -- rebuild the project, then pick from: bonus.');
            expect((body as {plan: {status: string}}).plan.status).toBe("unavailable");
        });

        it("deploys a mode that is part of the active project's own current build", async () => {
            const projectBaseUrl = await startServerForProject(deploymentProjectRoot, deploymentServiceForBuildModes(["base"]));
            writeLibraryFile("base.json", buildDeploymentTestLibrary("lib"));

            const {status, body} = await post(`${projectBaseUrl}/api/project/deployment/runs`, {
                targetId: "local-json-example",
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}],
                publish: false,
            });

            expect(status).toBe(200);
            expect((body as {publish: boolean}).publish).toBe(false);
        });

        it("returns 400, in domain language, when the active project has no inspectable current build at all — never reaching library loading", async () => {
            const readFile = jest.fn(() => {
                throw new Error("library file should not be read when the current build isn't known");
            });
            const service = new StudioDeploymentService(undefined, undefined, readFile, undefined, undefined, undefined, () => Promise.resolve(undefined), undefined, "test-pokie-version");
            const projectBaseUrl = await startServerForProject(deploymentProjectRoot, service);
            writeLibraryFile("base.json", buildDeploymentTestLibrary("lib"));

            const {status, body} = await post(`${projectBaseUrl}/api/project/deployment/runs`, {
                targetId: "local-json-example",
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}],
            });

            expect(status).toBe(200);
            expect((body as {error: string}).error).toBe(
                'This project has no current build to deploy against -- run "pokie build" (or the Certification tab\'s own build step), then try again.',
            );
            expect((body as {plan: {status: string}}).plan.status).toBe("unavailable");
            expect(readFile).not.toHaveBeenCalled();
        });

        it("returns 400, in domain language, when a bundle librarySelector's modeName differs from its own deployment row's mode — never reaching library loading", async () => {
            const projectBaseUrl = await startServerForProject(deploymentProjectRoot, deploymentServiceForBuildModes(["base", "bonus"]));

            const {status, body} = await post(`${projectBaseUrl}/api/project/deployment/runs`, {
                targetId: "local-json-example",
                modes: [{modeName: "base", librarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "bonus"}}],
            });

            expect(status).toBe(200);
            expect((body as {error: string}).error).toBe(
                'mode "base"\'s library selector names mode "bonus" -- a bundle/Stake Engine selector must name the exact same mode as its own deployment row.',
            );
            expect((body as {plan: {status: string}}).plan.status).toBe("unavailable");
        });

        it("returns the authoritative unavailable plan when a raw selector names a missing file", async () => {
            const projectBaseUrl = await startServerForProject(deploymentProjectRoot, deploymentServiceForBuildModes(["base"]));

            const {status, body} = await post(`${projectBaseUrl}/api/project/deployment/runs`, {
                targetId: "local-json-example",
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "missing.json"}}],
            });

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "unavailable", plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}}});
        });

        it("returns the authoritative unavailable plan when a raw selector escapes the project root", async () => {
            const projectBaseUrl = await startServerForProject(deploymentProjectRoot, deploymentServiceForBuildModes(["base"]));

            const {status, body} = await post(`${projectBaseUrl}/api/project/deployment/runs`, {
                targetId: "local-json-example",
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "../outside.json"}}],
            });

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "unavailable", plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}}});
        });

        it("returns the authoritative unavailable plan before parsing a raw selector", async () => {
            const projectBaseUrl = await startServerForProject(deploymentProjectRoot, deploymentServiceForBuildModes(["base"]));
            fs.writeFileSync(path.join(deploymentProjectRoot, "base.json"), "{ not json");

            const {status, body} = await post(`${projectBaseUrl}/api/project/deployment/runs`, {
                targetId: "local-json-example",
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}],
            });

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "unavailable", plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}}});
        });

        it("does not preview a raw selector: the unavailable plan reaches the terminal API result", async () => {
            const projectBaseUrl = await startServerForProject(deploymentProjectRoot, deploymentServiceForBuildModes(["base"]));
            writeLibraryFile("base.json", buildDeploymentTestLibrary("lib"));

            const {status, body} = await post(`${projectBaseUrl}/api/project/deployment/runs`, {
                targetId: "local-json-example",
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}],
                publish: false,
            });

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "unavailable", publish: false, plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}}});
            expect(fs.existsSync(path.join(deploymentProjectRoot, "deployment"))).toBe(false);
        });

        it("does not deploy a raw selector: the unavailable plan suppresses delivery", async () => {
            const projectBaseUrl = await startServerForProject(deploymentProjectRoot, deploymentServiceForBuildModes(["base"]));
            writeLibraryFile("base.json", buildDeploymentTestLibrary("lib"));

            const {status, body} = await post(`${projectBaseUrl}/api/project/deployment/runs`, {
                targetId: "local-json-example",
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}],
                publish: true,
            });

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "unavailable", publish: true, plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}}});
            expect(fs.existsSync(path.join(deploymentProjectRoot, "deployment"))).toBe(false);
        });

        it("does not apply compatibility inference to raw JSON selectors", async () => {
            const projectBaseUrl = await startServerForProject(deploymentProjectRoot, deploymentServiceForBuildModes(["base"]));
            fs.writeFileSync(path.join(deploymentProjectRoot, "base.json"), JSON.stringify({schemaVersion: 1, libraryId: "", outcomes: []}));

            const {status, body} = await post(`${projectBaseUrl}/api/project/deployment/runs`, {
                targetId: "local-json-example",
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}],
                publish: true,
            });

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "unavailable", plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}}});
            expect(fs.existsSync(path.join(deploymentProjectRoot, "deployment"))).toBe(false);
        });

        it("does not generate an artifact for a raw selector after planner rejection", async () => {
            const projectBaseUrl = await startServerForProject(deploymentProjectRoot, malformedGeneratorDeploymentService());
            writeLibraryFile("base.json", buildDeploymentTestLibrary("lib"));

            const {status, body} = await post(`${projectBaseUrl}/api/project/deployment/runs`, {
                targetId: "local-json-example",
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}],
                publish: true,
            });

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "unavailable", plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}}});
            expect(fs.existsSync(path.join(deploymentProjectRoot, "deployment"))).toBe(false);
        });
    });

    describe("Project Dashboard: Certification (POST /api/project/certification/validate-source, /build)", () => {
        let certStudioRoot: string;
        let certProjectRoot: string;
        let certServer: StudioServer | undefined;

        beforeEach(() => {
            certStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-cert-studio-test-"));
            writeStudioAssets(certStudioRoot);
            certProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-cert-project-test-"));
        });

        afterEach(async () => {
            await certServer?.stop();
            fs.rmSync(certStudioRoot, {recursive: true, force: true});
            fs.rmSync(certProjectRoot, {recursive: true, force: true});
        });

        async function startServerForProject(projectRoot: string | undefined): Promise<string> {
            const homeService = new StudioHomeService("1.3.0");
            certServer = new StudioServer({
                pokieVersion: "1.3.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: certStudioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.3.0", certStudioRoot, homeService),
                initialContext: projectRoot !== undefined ? {mode: "project", projectRoot} : {mode: "home"},
            });
            const address = await certServer.start();
            return `http://${address.host}:${address.port}`;
        }

        it("returns 409 for both routes when there is no active project", async () => {
            const homeBaseUrl = await startServerForProject(undefined);

            const validateResponse = await post(`${homeBaseUrl}/api/project/certification/validate-source`, {bundleDir: "bundle"});
            expect(validateResponse.status).toBe(409);

            const buildResponse = await post(`${homeBaseUrl}/api/project/certification/build`, {
                bundleDir: "bundle",
                outDir: "certification",
                modes: [{modeName: "base", seed: "s", sampleCount: 1}],
            });
            expect(buildResponse.status).toBe(409);
        });

        it("rejects malformed request bodies with 400 for both routes", async () => {
            const projectBaseUrl = await startServerForProject(certProjectRoot);

            const missingBundleDir = await post(`${projectBaseUrl}/api/project/certification/validate-source`, {});
            expect(missingBundleDir.status).toBe(400);
            expect((missingBundleDir.body as {error: string}).error).toMatch(/bundleDir/);

            const missingModes = await post(`${projectBaseUrl}/api/project/certification/build`, {bundleDir: "bundle", outDir: "certification"});
            expect(missingModes.status).toBe(400);
            expect((missingModes.body as {error: string}).error).toMatch(/modes/);
        });

        it("validates a real source bundle deeply, then builds a certification bundle from it", async () => {
            await buildSourceOutcomeLibraryBundle(path.join(certProjectRoot, "bundle"), ["base"]);
            const projectBaseUrl = await startServerForProject(certProjectRoot);

            const validateResponse = await post(`${projectBaseUrl}/api/project/certification/validate-source`, {bundleDir: "bundle"});
            expect(validateResponse.status).toBe(200);
            expect(validateResponse.body).toEqual({status: "ok", errors: [], warnings: []});

            const buildResponse = await post(`${projectBaseUrl}/api/project/certification/build`, {
                bundleDir: "bundle",
                outDir: "certification",
                modes: [{modeName: "base", seed: "cert-seed-1", sampleCount: 5}],
            });
            expect(buildResponse.status).toBe(200);
            const view = buildResponse.body as {status: string; manifest?: {modes: {modeName: string}[]}; files?: string[]};
            expect(view.status).toBe("ok");
            expect(view.manifest?.modes.map((mode) => mode.modeName)).toEqual(["base"]);
            expect(fs.existsSync(path.join(certProjectRoot, "certification", "manifest.json"))).toBe(true);
        });

        it("returns an error view (no manifest) when a requested mode isn't in the source bundle", async () => {
            await buildSourceOutcomeLibraryBundle(path.join(certProjectRoot, "bundle"), ["base"]);
            const projectBaseUrl = await startServerForProject(certProjectRoot);

            const {status, body} = await post(`${projectBaseUrl}/api/project/certification/build`, {
                bundleDir: "bundle",
                outDir: "certification",
                modes: [{modeName: "bonus", seed: "cert-seed-1", sampleCount: 5}],
            });

            expect(status).toBe(200);
            const view = body as {status: string; errors: unknown[]; manifest?: unknown};
            expect(view.status).toBe("error");
            expect(view.errors.length).toBeGreaterThan(0);
            expect(view.manifest).toBeUndefined();
        });

        it("returns a load-error view (never a 400) for a bundleDir that resolves outside the project root", async () => {
            const projectBaseUrl = await startServerForProject(certProjectRoot);

            const {status, body} = await post(`${projectBaseUrl}/api/project/certification/validate-source`, {bundleDir: "../outside"});

            expect(status).toBe(200);
            const view = body as {status: string; error?: string};
            expect(view.status).toBe("load-error");
            expect(view.error).toContain("outside the project root");
        });
    });

    describe("Project Dashboard: Provably Fair (POST /api/project/fairness/configure, /generate, /verify)", () => {
        let fairnessStudioRoot: string;
        let fairnessProjectRoot: string;
        let fairnessServer: StudioServer | undefined;

        beforeEach(() => {
            fairnessStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-fairness-studio-test-"));
            writeStudioAssets(fairnessStudioRoot);
            fairnessProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-fairness-project-test-"));
        });

        afterEach(async () => {
            await fairnessServer?.stop();
            fs.rmSync(fairnessStudioRoot, {recursive: true, force: true});
            fs.rmSync(fairnessProjectRoot, {recursive: true, force: true});
        });

        async function startServerForProject(projectRoot: string | undefined): Promise<string> {
            const homeService = new StudioHomeService("1.3.0");
            fairnessServer = new StudioServer({
                pokieVersion: "1.3.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: fairnessStudioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.3.0", fairnessStudioRoot, homeService),
                initialContext: projectRoot !== undefined ? {mode: "project", projectRoot} : {mode: "home"},
            });
            const address = await fairnessServer.start();
            return `http://${address.host}:${address.port}`;
        }

        it("returns 409 for all three routes when there is no active project", async () => {
            const homeBaseUrl = await startServerForProject(undefined);

            const configureResponse = await post(`${homeBaseUrl}/api/project/fairness/configure`, {
                bundleDir: "bundle",
                modeName: "base",
                serverSeed: "s",
                clientSeed: "c",
                nonce: 0,
            });
            expect(configureResponse.status).toBe(409);

            const generateResponse = await post(`${homeBaseUrl}/api/project/fairness/generate`, {bundleDir: "bundle", commitment: {}, serverSeed: "s"});
            expect(generateResponse.status).toBe(409);

            const verifyResponse = await post(`${homeBaseUrl}/api/project/fairness/verify`, {proof: {}});
            expect(verifyResponse.status).toBe(409);
        });

        it("rejects malformed request bodies with 400 for all three routes", async () => {
            const projectBaseUrl = await startServerForProject(fairnessProjectRoot);

            const badConfigure = await post(`${projectBaseUrl}/api/project/fairness/configure`, {bundleDir: "bundle", modeName: "base"});
            expect(badConfigure.status).toBe(400);

            const badGenerate = await post(`${projectBaseUrl}/api/project/fairness/generate`, {bundleDir: "bundle"});
            expect(badGenerate.status).toBe(400);

            const badVerify = await post(`${projectBaseUrl}/api/project/fairness/verify`, {});
            expect(badVerify.status).toBe(400);
        });

        it("runs the full configure -> generate -> verify flow against a real bundle", async () => {
            await buildFairnessSourceBundle(path.join(fairnessProjectRoot, "bundle"), ["base"]);
            const projectBaseUrl = await startServerForProject(fairnessProjectRoot);

            const configureResponse = await post(`${projectBaseUrl}/api/project/fairness/configure`, {
                bundleDir: "bundle",
                modeName: "base",
                serverSeed: "operator-server-seed",
                clientSeed: "player-client-seed",
                nonce: 0,
            });
            expect(configureResponse.status).toBe(200);
            const configureView = configureResponse.body as {status: string; commitment?: unknown};
            expect(configureView.status).toBe("ok");

            const generateResponse = await post(`${projectBaseUrl}/api/project/fairness/generate`, {
                bundleDir: "bundle",
                commitment: configureView.commitment,
                serverSeed: "operator-server-seed",
            });
            expect(generateResponse.status).toBe(200);
            const generateView = generateResponse.body as {status: string; proof?: {outcomeId: string}};
            expect(generateView.status).toBe("ok");

            const verifyResponse = await post(`${projectBaseUrl}/api/project/fairness/verify`, {
                proof: generateView.proof,
                commitment: configureView.commitment,
                sourceBundleDir: "bundle",
            });
            expect(verifyResponse.status).toBe(200);
            const verifyView = verifyResponse.body as {status: string; errors: unknown[]};
            expect(verifyView.status).toBe("ok");
            expect(verifyView.errors).toEqual([]);
        });

        it("reports a mismatch error for a tampered proof, never a thrown error", async () => {
            await buildFairnessSourceBundle(path.join(fairnessProjectRoot, "bundle"), ["base"]);
            const commitment = await issueFairnessCommitmentFor(path.join(fairnessProjectRoot, "bundle"), "base", {serverSeed: "operator-server-seed"});
            const projectBaseUrl = await startServerForProject(fairnessProjectRoot);

            const generateResponse = await post(`${projectBaseUrl}/api/project/fairness/generate`, {
                bundleDir: "bundle",
                commitment,
                serverSeed: "operator-server-seed",
            });
            const generateView = generateResponse.body as {status: string; proof: {outcomeId: string}};
            expect(generateView.status).toBe("ok");
            const tamperedProof = {...generateView.proof, outcomeId: `not-${generateView.proof.outcomeId}`};

            const {status, body} = await post(`${projectBaseUrl}/api/project/fairness/verify`, {
                proof: tamperedProof,
                commitment,
                sourceBundleDir: "bundle",
            });

            expect(status).toBe(200);
            const view = body as {status: string; errors: {code: string}[]};
            expect(view.status).toBe("ok");
            expect(view.errors.length).toBeGreaterThan(0);
        });

        it("reports a build-error (never a 500) when the revealed serverSeed doesn't match the commitment", async () => {
            await buildFairnessSourceBundle(path.join(fairnessProjectRoot, "bundle"), ["base"]);
            const commitment = await issueFairnessCommitmentFor(path.join(fairnessProjectRoot, "bundle"), "base", {serverSeed: "operator-server-seed"});
            const projectBaseUrl = await startServerForProject(fairnessProjectRoot);

            const {status, body} = await post(`${projectBaseUrl}/api/project/fairness/generate`, {
                bundleDir: "bundle",
                commitment,
                serverSeed: "a-different-seed",
            });

            expect(status).toBe(200);
            const view = body as {status: string; code?: string};
            expect(view.status).toBe("build-error");
            expect(view.code).toBeDefined();
        });

        it("returns a load-error view (never a 400) for a bundleDir that resolves outside the project root", async () => {
            const projectBaseUrl = await startServerForProject(fairnessProjectRoot);

            const {status, body} = await post(`${projectBaseUrl}/api/project/fairness/configure`, {
                bundleDir: "../outside",
                modeName: "base",
                serverSeed: "s",
                clientSeed: "c",
                nonce: 0,
            });

            expect(status).toBe(200);
            const view = body as {status: string; error?: string};
            expect(view.status).toBe("load-error");
            expect(view.error).toContain("outside the project root");
        });
    });

    describe("Project Dashboard: Stake Engine Export (POST /api/project/stakeengine/validate, /export)", () => {
        let stakeStudioRoot: string;
        let stakeProjectRoot: string;
        let stakeServer: StudioServer | undefined;

        beforeEach(() => {
            stakeStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-stakeengine-studio-test-"));
            writeStudioAssets(stakeStudioRoot);
            stakeProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-stakeengine-project-test-"));
        });

        afterEach(async () => {
            await stakeServer?.stop();
            fs.rmSync(stakeStudioRoot, {recursive: true, force: true});
            fs.rmSync(stakeProjectRoot, {recursive: true, force: true});
        });

        async function startServerForProject(projectRoot: string | undefined): Promise<string> {
            const homeService = new StudioHomeService("1.3.0");
            stakeServer = new StudioServer({
                pokieVersion: "1.3.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: stakeStudioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.3.0", stakeStudioRoot, homeService),
                initialContext: projectRoot !== undefined ? {mode: "project", projectRoot} : {mode: "home"},
            });
            const address = await stakeServer.start();
            return `http://${address.host}:${address.port}`;
        }

        function writeLibrary(relativePath: string, options: {libraryId: string; betMode: string; stake: number}): void {
            const library = buildStakeEngineTestLibrary(options);
            fs.writeFileSync(path.join(stakeProjectRoot, relativePath), JSON.stringify(library));
        }

        it("returns 409 for both routes when there is no active project", async () => {
            const homeBaseUrl = await startServerForProject(undefined);

            const validateResponse = await post(`${homeBaseUrl}/api/project/stakeengine/validate`, {
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}],
            });
            expect(validateResponse.status).toBe(409);

            const exportResponse = await post(`${homeBaseUrl}/api/project/stakeengine/export`, {
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}],
                outDir: "stakeengine",
            });
            expect(exportResponse.status).toBe(409);
        });

        it("rejects malformed request bodies with 400 for both routes", async () => {
            const projectBaseUrl = await startServerForProject(stakeProjectRoot);

            const missingModes = await post(`${projectBaseUrl}/api/project/stakeengine/validate`, {});
            expect(missingModes.status).toBe(400);
            expect((missingModes.body as {error: string}).error).toMatch(/modes/);

            const missingOutDir = await post(`${projectBaseUrl}/api/project/stakeengine/export`, {
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}],
            });
            expect(missingOutDir.status).toBe(400);
            expect((missingOutDir.body as {error: string}).error).toMatch(/outDir/);
        });

        it("returns a planner-owned unavailable terminal result for an empty Stake action", async () => {
            const projectBaseUrl = await startServerForProject(stakeProjectRoot);

            const response = await post(`${projectBaseUrl}/api/project/stakeengine/export`, {
                modes: [],
                outDir: "stakeengine",
            });

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                status: "unavailable",
                plan: {status: "unavailable", source: {capabilities: []}, target: {kind: "stakeAdapter"}},
            });
            expect(fs.existsSync(path.join(stakeProjectRoot, "stakeengine"))).toBe(false);
        });

        it("returns an unavailable plan for raw JSON before Stake validation or export", async () => {
            writeLibrary("base.json", {libraryId: "base-lib", betMode: "base", stake: 1});
            const projectBaseUrl = await startServerForProject(stakeProjectRoot);

            const validateResponse = await post(`${projectBaseUrl}/api/project/stakeengine/validate`, {
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}],
            });
            expect(validateResponse.status).toBe(200);
            expect(validateResponse.body).toMatchObject({status: "unavailable", plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}}});

            const exportResponse = await post(`${projectBaseUrl}/api/project/stakeengine/export`, {
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}],
                outDir: "stakeengine",
            });
            expect(exportResponse.status).toBe(200);
            expect(exportResponse.body).toMatchObject({status: "unavailable", plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}}});
            expect(fs.existsSync(path.join(stakeProjectRoot, "stakeengine", "index.json"))).toBe(false);
        });

        it("does not let an occupied destination bypass a raw selector's unavailable boundary", async () => {
            writeLibrary("base.json", {libraryId: "base-lib", betMode: "base", stake: 1});
            fs.mkdirSync(path.join(stakeProjectRoot, "stakeengine"));
            fs.writeFileSync(path.join(stakeProjectRoot, "stakeengine", "unrelated.txt"), "pre-existing");
            const projectBaseUrl = await startServerForProject(stakeProjectRoot);

            const conflictResponse = await post(`${projectBaseUrl}/api/project/stakeengine/export`, {
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}],
                outDir: "stakeengine",
            });
            expect(conflictResponse.status).toBe(200);
            expect(conflictResponse.body).toMatchObject({status: "unavailable", plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}}});
            expect(fs.readFileSync(path.join(stakeProjectRoot, "stakeengine", "unrelated.txt"), "utf-8")).toBe("pre-existing");
        });

        it("retains the unavailable planner boundary when raw export asks to overwrite", async () => {
            writeLibrary("base.json", {libraryId: "base-lib", betMode: "base", stake: 1});
            fs.mkdirSync(path.join(stakeProjectRoot, "stakeengine"));
            fs.writeFileSync(path.join(stakeProjectRoot, "stakeengine", "unrelated.txt"), "pre-existing");
            const projectBaseUrl = await startServerForProject(stakeProjectRoot);

            const {status, body} = await post(`${projectBaseUrl}/api/project/stakeengine/export`, {
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}],
                outDir: "stakeengine",
                overwrite: true,
            });

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "unavailable", plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}}});
            expect(fs.readFileSync(path.join(stakeProjectRoot, "stakeengine", "unrelated.txt"), "utf-8")).toBe("pre-existing");
        });

        // "overwrite: true" only ever unlocks replacing a directory a *prior* "pokie stakeengine export"
        // run itself produced (recognized via that run's own pokie-manifest.json) -- never an arbitrary
        // unrelated directory, which the previous test confirms stays refused regardless of `overwrite`.
        it("does not make raw selector overwrite retry executable", async () => {
            writeLibrary("base.json", {libraryId: "base-lib", betMode: "base", stake: 1});
            const projectBaseUrl = await startServerForProject(stakeProjectRoot);

            const firstExport = await post(`${projectBaseUrl}/api/project/stakeengine/export`, {
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}],
                outDir: "stakeengine",
            });
            expect(firstExport.status).toBe(200);
            expect(firstExport.body).toMatchObject({status: "unavailable", plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}}});

            writeLibrary("bonus.json", {libraryId: "bonus-lib", betMode: "bonus", stake: 1});
            const conflictResponse = await post(`${projectBaseUrl}/api/project/stakeengine/export`, {
                modes: [{modeName: "bonus", librarySelector: {kind: "json", path: "bonus.json"}, cost: 1}],
                outDir: "stakeengine",
            });
            expect(conflictResponse.status).toBe(200);
            expect(conflictResponse.body).toMatchObject({status: "unavailable", plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}}});

            const overwriteResponse = await post(`${projectBaseUrl}/api/project/stakeengine/export`, {
                modes: [{modeName: "bonus", librarySelector: {kind: "json", path: "bonus.json"}, cost: 1}],
                outDir: "stakeengine",
                overwrite: true,
            });
            expect(overwriteResponse.status).toBe(200);
            expect(overwriteResponse.body).toMatchObject({status: "unavailable", plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}}});
        });

        it("does not infer Stake compatibility from a raw selector", async () => {
            writeLibrary("base.json", {libraryId: "base-lib", betMode: "base", stake: 1});
            const projectBaseUrl = await startServerForProject(stakeProjectRoot);

            const {status, body} = await post(`${projectBaseUrl}/api/project/stakeengine/export`, {
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1 / 3}],
                outDir: "stakeengine",
            });

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "unavailable", plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}}});
        });

        it("returns an unavailable plan for a raw selector outside the project root", async () => {
            const projectBaseUrl = await startServerForProject(stakeProjectRoot);

            const {status, body} = await post(`${projectBaseUrl}/api/project/stakeengine/validate`, {
                modes: [{modeName: "base", librarySelector: {kind: "json", path: "../outside.json"}, cost: 1}],
            });

            expect(status).toBe(200);
            expect(body).toMatchObject({status: "unavailable", plan: {status: "unavailable", diagnostic: {code: "unrecognized-source"}}});
        });
    });

    describe("Project Dashboard: Build/Export artifacts (GET /api/project/artifacts/targets, POST /api/project/artifacts/preview, POST /api/project/artifacts/build)", () => {
        let artifactStudioRoot: string;
        let artifactWorkDir: string;
        let artifactServer: StudioServer | undefined;

        beforeEach(() => {
            artifactStudioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-artifacts-studio-test-"));
            writeStudioAssets(artifactStudioRoot);
            artifactWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-artifacts-work-test-"));
        });

        afterEach(async () => {
            await artifactServer?.stop();
            fs.rmSync(artifactStudioRoot, {recursive: true, force: true});
            fs.rmSync(artifactWorkDir, {recursive: true, force: true});
        });

        async function startServerForProject(projectRoot: string | undefined): Promise<string> {
            const homeService = new StudioHomeService("1.3.0");
            artifactServer = new StudioServer({
                pokieVersion: "1.3.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: artifactStudioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.3.0", artifactStudioRoot, homeService),
                initialContext: projectRoot !== undefined ? {mode: "project", projectRoot} : {mode: "home"},
            });
            const address = await artifactServer.start();
            return `http://${address.host}:${address.port}`;
        }

        async function waitForArtifactBuildJob(projectBaseUrl: string, id: string): Promise<{status: string; result?: unknown}> {
            for (let attempt = 0; attempt < 1200; attempt += 1) {
                const response = await get(`${projectBaseUrl}/api/project/artifacts/build/${id}`);
                expect(response.status).toBe(200);
                const job = response.body as {status: string; result?: unknown};
                if (job.status !== "queued" && job.status !== "running") return job;
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 10);
                });
            }
            throw new Error(`Artifact build job "${id}" did not finish.`);
        }

        function writeBlueprintFile(overrides: Record<string, unknown> = {}): string {
            const filePath = path.join(artifactWorkDir, "blueprint.json");
            fs.writeFileSync(
                filePath,
                JSON.stringify({
                    manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                    reels: 3,
                    rows: 3,
                    symbols: ["A", "B"],
                    paytable: {A: {3: 5}, B: {3: 2}},
                    ...overrides,
                }),
            );
            return filePath;
        }

        it("returns 409 for every route when there is no active project", async () => {
            const homeBaseUrl = await startServerForProject(undefined);

            const targetsResponse = await get(`${homeBaseUrl}/api/project/artifacts/targets`);
            expect(targetsResponse.status).toBe(409);

            const previewResponse = await post(`${homeBaseUrl}/api/project/artifacts/preview`, {target: "tsPackage"});
            expect(previewResponse.status).toBe(409);

            const buildResponse = await post(`${homeBaseUrl}/api/project/artifacts/build`, {target: "tsPackage"});
            expect(buildResponse.status).toBe(409);
        });

        it("rejects a malformed preview or build request with 400", async () => {
            const blueprintPath = writeBlueprintFile();
            const projectBaseUrl = await startServerForProject(blueprintPath);

            const missingPreviewTarget = await post(`${projectBaseUrl}/api/project/artifacts/preview`, {});
            expect(missingPreviewTarget.status).toBe(400);
            expect((missingPreviewTarget.body as {error: string}).error).toMatch(/target/);

            const unknownPreviewTarget = await post(`${projectBaseUrl}/api/project/artifacts/preview`, {target: "bogus"});
            expect(unknownPreviewTarget.status).toBe(400);

            const missingTarget = await post(`${projectBaseUrl}/api/project/artifacts/build`, {});
            expect(missingTarget.status).toBe(400);
            expect((missingTarget.body as {error: string}).error).toMatch(/target/);

            const unknownTarget = await post(`${projectBaseUrl}/api/project/artifacts/build`, {target: "bogus"});
            expect(unknownTarget.status).toBe(400);
        });

        it("lists the registry-owned Blueprint targets, including Outcome and Stake prerequisite flows", async () => {
            const blueprintPath = writeBlueprintFile();
            const projectBaseUrl = await startServerForProject(blueprintPath);

            const {status, body} = await get(`${projectBaseUrl}/api/project/artifacts/targets`);

            expect(status).toBe(200);
            const targets = body as {target: string; supported: boolean}[];
            expect(new Set(targets.map((entry) => entry.target))).toEqual(new Set(["blueprint", "tsPackage", "outcomeLibrary", "stakeAdapter", "parWorkbook"]));
            const byTarget = new Map(targets.map((entry) => [entry.target, entry.supported]));
            expect(byTarget.get("tsPackage")).toBe(true);
            expect(byTarget.get("outcomeLibrary")).toBe(true);
            expect(byTarget.get("stakeAdapter")).toBe(true);
        });

        it("builds a tsPackage from a blueprint project to the default sibling destination, agreeing with BuildCommand's own default", async () => {
            const blueprintPath = writeBlueprintFile();
            const projectBaseUrl = await startServerForProject(blueprintPath);

            const started = await post(`${projectBaseUrl}/api/project/artifacts/build`, {target: "tsPackage"});

            expect(started.status).toBe(202);
            const job = (started.body as {job: {id: string; status: string}}).job;
            expect(job.status).toBe("queued");
            const completed = await waitForArtifactBuildJob(projectBaseUrl, job.id);
            expect(completed.status).toBe("completed");
            const view = completed.result as {status: string; outputPath?: string; sourceType?: string};
            expect(view.status).toBe("ok");
            expect(view.outputPath).toBe(path.join(artifactWorkDir, "tsPackage"));
            expect(view.sourceType).toBe("blueprint");
            expect(fs.existsSync(path.join(artifactWorkDir, "tsPackage", "package.json"))).toBe(true);
        });

        it("builds Blueprint Stake through the authoritative Outcome prerequisite", async () => {
            const blueprintPath = writeBlueprintFile();
            const projectBaseUrl = await startServerForProject(blueprintPath);

            const started = await post(`${projectBaseUrl}/api/project/artifacts/build`, {target: "stakeAdapter"});

            expect(started.status).toBe(202);
            const job = (started.body as {job: {id: string; status: string}}).job;
            expect(job.status).toBe("queued");
            const completed = await waitForArtifactBuildJob(projectBaseUrl, job.id);
            expect(completed.status).toBe("completed");
            const view = completed.result as {status: string; outputPath?: string; sourceType?: string};
            expect(view.status).toBe("ok");
            expect(view.sourceType).toBe("blueprint");
            expect(fs.existsSync(path.join(view.outputPath!, "index.json"))).toBe(true);
        });

        it("keeps every registered PAR-to-Stake root durable after the real Studio build job", async () => {
            const workbookPath = path.join(artifactWorkDir, "source.par.xlsx");
            fs.copyFileSync(path.join(__dirname, "..", "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);
            const projectRegistry = new InMemoryStudioProjectRegistry();
            const registrationService = new StudioProjectRegistrationService(projectRegistry);
            const homeService = new StudioHomeService("1.3.0");
            artifactServer = new StudioServer({
                pokieVersion: "1.3.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: artifactStudioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.3.0", artifactStudioRoot, homeService),
                projectRegistrationService: registrationService,
                initialContext: {mode: "project", projectRoot: workbookPath},
            });
            const address = await artifactServer.start();
            const projectBaseUrl = `http://${address.host}:${address.port}`;

            const started = await post(`${projectBaseUrl}/api/project/artifacts/build`, {target: "stakeAdapter"});
            expect(started.status).toBe(202);
            const job = (started.body as {job: {id: string}}).job;
            const completed = await waitForArtifactBuildJob(projectBaseUrl, job.id);
            expect(completed.status).toBe("completed");
            const entries = await registrationService.list();

            expect(entries.length).toBeGreaterThanOrEqual(3);
            expect(entries.filter((entry) => entry.status !== "ok" || !fs.existsSync(entry.location))).toEqual([]);
            expect(entries.some((entry) => entry.location.includes(".pokie-par-import-"))).toBe(false);
        });

        it("cancels an active Blueprint Outcome publish through the HTTP job route without publishing a managed project", async () => {
            const blueprintPath = writeBlueprintFile({
                manifest: {id: "cancellable-outcome-slot", name: "Cancellable Outcome Slot", version: "1.0.0"},
                reels: 3,
                rows: 1,
                symbols: ["A", "B", "C", "D", "E", "F", "G"],
                paytable: {A: {3: 1}},
                reelStrips: Array.from({length: 3}, () => ["A", "B", "C", "D", "E", "F", "G"]),
                availableBets: [1],
            });
            const destination = path.join(artifactWorkDir, "cancelled-outcome-library");
            const registryPath = path.join(artifactWorkDir, ".pokie", "managed-outcome-projects.json");
            // Keep the complete production chain: Studio -> real ArtifactBuilderRegistry -> real
            // BlueprintStakeOutcomeLibraryWorkflow -> real ManagedOutcomeProjectService.  The distinct
            // outcome space yields while the canonical writer is actively publishing, giving
            // the HTTP Cancel route a real in-flight bundle to interrupt.
            const artifactBuildService = new StudioArtifactBuildService(
                "1.3.0",
                undefined,
                undefined,
                undefined,
                new ManagedOutcomeProjectService(),
            );
            const homeService = new StudioHomeService("1.3.0");
            artifactServer = new StudioServer({
                pokieVersion: "1.3.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot: artifactStudioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.3.0", artifactStudioRoot, homeService),
                artifactBuildService,
                initialContext: {mode: "project", projectRoot: blueprintPath},
            });
            const address = await artifactServer.start();
            const projectBaseUrl = `http://${address.host}:${address.port}`;

            const started = await post(`${projectBaseUrl}/api/project/artifacts/build`, {target: "outcomeLibrary", outDir: destination});
            expect(started.status).toBe(202);
            const job = (started.body as {job: {id: string; status: string}}).job;
            expect(job.status).toBe("queued");

            let activeJob: {id: string; status: string; progress?: {message?: string}} | undefined;
            for (let attempt = 0; attempt < 1200; attempt += 1) {
                const response = await get(`${projectBaseUrl}/api/project/artifacts/build/${job.id}`);
                expect(response.status).toBe(200);
                const current = response.body as {id: string; status: string; progress?: {message?: string}};
                if (current.progress?.message?.startsWith("Writing Outcome mode")) {
                    activeJob = current;
                    break;
                }
                if (current.status !== "queued" && current.status !== "running") break;
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 10);
                });
            }
            expect(activeJob).toEqual(expect.objectContaining({id: job.id, status: "running"}));

            const cancelled = await post(`${projectBaseUrl}/api/project/artifacts/build/${job.id}/cancel`);
            expect(cancelled.status).toBe(200);
            expect(cancelled.body).toMatchObject({id: job.id, status: "running", cancellationRequested: true});

            let terminalJob: {id: string; status: string; cancellationRequested: boolean; result?: {status: string}} | undefined;
            for (let attempt = 0; attempt < 1200; attempt += 1) {
                const response = await get(`${projectBaseUrl}/api/project/artifacts/build/${job.id}`);
                expect(response.status).toBe(200);
                const current = response.body as {id: string; status: string; cancellationRequested: boolean; result?: {status: string}};
                if (current.status !== "queued" && current.status !== "running") {
                    terminalJob = current;
                    break;
                }
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 10);
                });
            }

            expect(terminalJob).toEqual(expect.objectContaining({
                id: job.id,
                status: "cancelled",
                cancellationRequested: true,
                result: expect.objectContaining({status: "cancelled"}),
            }));
            expect(fs.existsSync(destination)).toBe(false);
            expect(fs.readdirSync(artifactWorkDir).filter((entry) => entry.startsWith("cancelled-outcome-library.staging-"))).toEqual([]);
            expect(fs.existsSync(registryPath)).toBe(false);
        });

        it("returns a conflict (409) for a pre-existing non-empty destination and never writes to it", async () => {
            const blueprintPath = writeBlueprintFile();
            const destination = path.join(artifactWorkDir, "tsPackage");
            fs.mkdirSync(destination);
            fs.writeFileSync(path.join(destination, "unrelated.txt"), "pre-existing");
            const projectBaseUrl = await startServerForProject(blueprintPath);

            const started = await post(`${projectBaseUrl}/api/project/artifacts/build`, {target: "tsPackage"});

            expect(started.status).toBe(202);
            const job = (started.body as {job: {id: string}}).job;
            const completed = await waitForArtifactBuildJob(projectBaseUrl, job.id);
            expect(completed.status).toBe("failed");
            expect((completed.result as {status: string}).status).toBe("conflict");
            expect(fs.readdirSync(destination)).toEqual(["unrelated.txt"]);
        });

        it("builds to an explicit outDir when given", async () => {
            const blueprintPath = writeBlueprintFile();
            const projectBaseUrl = await startServerForProject(blueprintPath);
            const explicitOut = path.join(artifactWorkDir, "my-custom-out");

            const started = await post(`${projectBaseUrl}/api/project/artifacts/build`, {target: "tsPackage", outDir: explicitOut});

            expect(started.status).toBe(202);
            const job = (started.body as {job: {id: string; status: string}}).job;
            expect(job.status).toBe("queued");
            const completed = await waitForArtifactBuildJob(projectBaseUrl, job.id);
            expect(completed.status).toBe("completed");
            expect((completed.result as {outputPath?: string}).outputPath).toBe(explicitOut);
        });

        it("previews a tsPackage build against the same default sibling destination build() itself would use, without writing anything", async () => {
            const blueprintPath = writeBlueprintFile();
            const projectBaseUrl = await startServerForProject(blueprintPath);
            const expectedDestination = path.join(artifactWorkDir, "tsPackage");

            const {status, body} = await post(`${projectBaseUrl}/api/project/artifacts/preview`, {target: "tsPackage"});

            expect(status).toBe(200);
            const view = body as {status: string; target?: string; destination?: string; destinationKind?: string; plannedOutputs?: string[]; sourceType?: string};
            expect(view.status).toBe("ok");
            expect(view.target).toBe("tsPackage");
            expect(view.destination).toBe(expectedDestination);
            expect(view.destinationKind).toBe("directory");
            expect(view.plannedOutputs).toEqual(["Runnable TypeScript game package directory"]);
            expect(view.sourceType).toBe("blueprint");
            expect(fs.existsSync(expectedDestination)).toBe(false);
        });

        it("previews an explicit outDir when given", async () => {
            const blueprintPath = writeBlueprintFile();
            const projectBaseUrl = await startServerForProject(blueprintPath);
            const explicitOut = path.join(artifactWorkDir, "my-custom-out");

            const {status, body} = await post(`${projectBaseUrl}/api/project/artifacts/preview`, {target: "tsPackage", outDir: explicitOut});

            expect(status).toBe(200);
            expect((body as {destination?: string}).destination).toBe(explicitOut);
        });

        it("previews the Blueprint Stake prerequisite build", async () => {
            const blueprintPath = writeBlueprintFile();
            const projectBaseUrl = await startServerForProject(blueprintPath);

            const {status, body} = await post(`${projectBaseUrl}/api/project/artifacts/preview`, {target: "stakeAdapter"});

            expect(status).toBe(200);
            const view = body as {status: string; sourceType?: string};
            expect(view.status).toBe("ok");
            expect(view.sourceType).toBe("blueprint");
        });

        it("previews a conflict (409) for a pre-existing non-empty destination, agreeing with what build() itself would report, and never writes to it", async () => {
            const blueprintPath = writeBlueprintFile();
            const destination = path.join(artifactWorkDir, "tsPackage");
            fs.mkdirSync(destination);
            fs.writeFileSync(path.join(destination, "unrelated.txt"), "pre-existing");
            const projectBaseUrl = await startServerForProject(blueprintPath);

            const {status, body} = await post(`${projectBaseUrl}/api/project/artifacts/preview`, {target: "tsPackage"});

            expect(status).toBe(409);
            const view = body as {status: string; target?: string; destination?: string; message?: string};
            expect(view.status).toBe("conflict");
            expect(view.target).toBe("tsPackage");
            expect(view.destination).toBe(destination);
            expect(view.message).toMatch(/already exists and is not empty/);
            expect(fs.readdirSync(destination)).toEqual(["unrelated.txt"]);
        });
    });
});
