import {OutcomeLibraryBundleWriter, PokieGame, PokieGameManifest, StakeEngineExporter, StakeEngineExportModeInput} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {InMemoryStudioProjectRegistry} from "../../../cli/studio/InMemoryStudioProjectRegistry.js";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";
import {buildOutcomeLibraryBundleModeInput} from "../../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";
import {buildStakeEngineTestLibrary} from "../../stakeengine/StakeEngineTestFixtures.js";

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

async function waitForTerminal(url: string): Promise<{status: number; body: Record<string, unknown>}> {
    for (let attempt = 0; attempt < 100; attempt++) {
        const response = await get(url);
        const body = response.body as Record<string, unknown>;
        if (["completed", "failed", "cancelled"].includes(String(body.status))) {
            return {status: response.status, body};
        }
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 10);
        });
    }
    throw new Error("Studio job did not reach a terminal state.");
}

function createFakeGame(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            throw new Error("not used by these tests");
        },
    };
}

// Proves P3-POLISH-21's own Studio integration: a resolved "outcomeLibrary"/"stakeAdapter" project opens
// straight into a dedicated "outcome-source" dashboard state (canonical reader metadata/limitations/exact
// analysis, see loadProjectDashboardContext.ts) instead of the permanent "not supported" error it used to
// surface, and its own POST /api/project/outcome-source/sample route draws through the same
// selector/session/server-backed sampleOutcomeSourceProject() PreGeneratedSpinCommandHandler already uses in
// production for a native library -- while a Stake Engine export on that same route always resolves to the
// ordinary structured "outcomeSource.sample" capability diagnostic, never loadPokieGame/package-runtime
// execution (asserted directly: `loadGame` is spied on throughout and must never be called by any of these
// flows).
describe("StudioServer outcome-source project routes", () => {
    let studioRoot: string;
    let server: StudioServer;
    let baseUrl: string;
    let loadGame: jest.Mock;

    beforeEach(async () => {
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-outcome-source-routes-test-"));
        fs.writeFileSync(path.join(studioRoot, "index.html"), "<html>studio</html>");

        loadGame = jest.fn().mockImplementation(() => Promise.resolve(createFakeGame({id: "unused", name: "unused", version: "0.0.0"})));

        const homeService = new StudioHomeService("1.3.0", undefined, loadGame);
        server = new StudioServer({
            pokieVersion: "1.3.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            homeService,
            blueprintService: new StudioBlueprintService("1.3.0", studioRoot, homeService),
            loadGame,
            projectRegistrationService: new StudioProjectRegistrationService(new InMemoryStudioProjectRegistry()),
        });
        const address = await server.start();
        baseUrl = `http://${address.host}:${address.port}`;
    });

    afterEach(async () => {
        await server.stop();
        fs.rmSync(studioRoot, {recursive: true, force: true});
    });

    async function buildNativeLibraryDir(): Promise<string> {
        const bundleDir = path.join(studioRoot, "library");
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
        return bundleDir;
    }

    async function buildStakeExportDir(): Promise<string> {
        const stakeDir = path.join(studioRoot, "stake-export");
        const modes: StakeEngineExportModeInput[] = [{modeName: "base", cost: 1, library: buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1})}];
        await new StakeEngineExporter("1.3.0").exportToDirectory(modes, stakeDir);
        return stakeDir;
    }

    describe("opening a resolved native outcome-library project", () => {
        it("opens into an \"outcome-source\" dashboard carrying the canonical reader's descriptor/limitations/exact analysis", async () => {
            const bundleDir = await buildNativeLibraryDir();

            const opened = await post(`${baseUrl}/api/home/projects/open`, {projectRoot: bundleDir});
            expect(opened.status).toBe(200);

            const {status, body} = await get(`${baseUrl}/api/project/context`);
            expect(status).toBe(200);
            const dashboard = body as {
                status: string;
                project: {type: string; rootPath: string};
                report: {descriptor: {kind: string; streaming: boolean; limitations: string[]}; issues: unknown[]; modes: {modeName: string}[]};
            };
            expect(dashboard.status).toBe("outcome-source");
            expect(dashboard.project.type).toBe("outcomeLibrary");
            expect(dashboard.report.descriptor.kind).toBe("native");
            expect(dashboard.report.descriptor.streaming).toBe(true);
            expect(dashboard.report.descriptor.limitations.length).toBeGreaterThan(0);
            expect(dashboard.report.issues).toEqual([]);
            expect(dashboard.report.modes).toEqual([expect.objectContaining({modeName: "base"})]);

            expect(loadGame).not.toHaveBeenCalled();
        });

        it("draws a real outcome through POST /api/project/outcome-source/sample, the same selector class PreGeneratedSpinCommandHandler uses", async () => {
            const bundleDir = await buildNativeLibraryDir();
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: bundleDir});

            const {status, body} = await post(`${baseUrl}/api/project/outcome-source/sample`, {modeName: "base", seed: "studio-sample-seed"});

            expect(status).toBe(200);
            const result = body as {supported: boolean; selection?: {libraryId: string; outcome: {id: string}}; replay?: {modeName: string; seed: string; round: number}};
            expect(result.supported).toBe(true);
            expect(result.selection?.libraryId).toBe("base-lib");
            expect(typeof result.selection?.outcome.id).toBe("string");
            expect(result.replay).toEqual(expect.objectContaining({modeName: "base", seed: "studio-sample-seed", round: 1}));

            expect(loadGame).not.toHaveBeenCalled();
        });

        it("records a sample draw into the shared history, immediately visible from GET /api/project/rounds", async () => {
            const bundleDir = await buildNativeLibraryDir();
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: bundleDir});

            await post(`${baseUrl}/api/project/outcome-source/sample`, {modeName: "base", seed: "studio-sample-seed"});

            const {status, body} = await get(`${baseUrl}/api/project/rounds`);
            expect(status).toBe(200);
            const entries = body as Array<{
                studioSource?: string;
                studioOperation?: string;
                studioProjectRoot?: string;
                studioSeed?: string | number;
                credits?: number;
                replay?: {modeName: string; seed: string; round: number};
            }>;
            expect(entries).toHaveLength(1);
            expect(entries[0].studioSource).toBe("outcome-source-sample");
            expect(entries[0].studioOperation).toBe("outcome-source-sample");
            expect(entries[0].studioProjectRoot).toBe(bundleDir);
            expect(entries[0].studioSeed).toBe("studio-sample-seed");
            expect(entries[0].credits).toBeUndefined();
            expect(entries[0].replay).toEqual(expect.objectContaining({modeName: "base", seed: "studio-sample-seed", round: 1}));
        });

        it("uses one derived-round descriptor for seeded simulation, Recent Rounds, exact replay, and stale artifact inspection", async () => {
            const bundleDir = await buildNativeLibraryDir();
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: bundleDir});

            const simulation = await post(`${baseUrl}/api/project/simulations`, {rounds: 4, seed: "studio-simulation-seed", modeName: "base"});
            expect(simulation.status).toBe(202);
            const completed = await waitForTerminal(`${baseUrl}/api/project/simulations/${(simulation.body as {id: string}).id}`);
            expect(completed.status).toBe(200);
            expect(completed.body.status).toBe("completed");
            const replay = completed.body.lastReplay as {
                game: {id: string; name: string; version: string};
                libraryId: string;
                libraryHash: string;
                modeName: string;
                selectionAlgorithm: string;
                seed: string;
                round: number;
                outcomeId: string;
                weight: number;
                totalWin: number;
                payoutMultiplier: number;
                stake: number;
                screen: unknown[][];
            };
            expect(replay).toEqual(
                expect.objectContaining({
                    game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                    modeName: "base",
                    selectionAlgorithm: "derived-round-seed-v1",
                    seed: "studio-simulation-seed",
                    round: 4,
                }),
            );

            const rounds = await get(`${baseUrl}/api/project/rounds`);
            expect(rounds.status).toBe(200);
            expect((rounds.body as Array<{replay?: unknown}>)[0].replay).toEqual(expect.objectContaining(replay));

            const inspected = await post(`${baseUrl}/api/project/replays/inspect-artifact`, {
                game: replay.game,
                round: replay.round,
                seed: replay.seed,
                totalBet: replay.stake,
                totalWin: replay.totalWin,
                screen: replay.screen,
                outcomeSource: replay,
            });
            expect(inspected.status).toBe(200);
            expect(inspected.body).toEqual(expect.objectContaining({round: replay.round, seed: replay.seed, modeName: "base"}));

            const stale = await post(`${baseUrl}/api/project/replays/inspect-artifact`, {
                game: replay.game,
                round: replay.round,
                seed: replay.seed,
                totalBet: replay.stake,
                totalWin: replay.totalWin + 1,
                screen: replay.screen,
                outcomeSource: replay,
            });
            expect(stale.status).toBe(400);
            expect((stale.body as {error: string}).error).toMatch(/outer result.*total win.*Restore the original descriptor/i);

            const replayStarted = await post(`${baseUrl}/api/project/replays`, {
                round: replay.round,
                seed: replay.seed,
                modeName: replay.modeName,
                outcomeSource: replay,
            });
            expect(replayStarted.status).toBe(202);
            const replayComplete = await waitForTerminal(`${baseUrl}/api/project/replays/${(replayStarted.body as {id: string}).id}`);
            expect(replayComplete.body.descriptor).toEqual(
                expect.objectContaining({
                    totalBet: replay.stake,
                    totalWin: replay.totalWin,
                    outcomeSource: expect.objectContaining({
                        libraryId: replay.libraryId,
                        libraryHash: replay.libraryHash,
                        outcomeId: replay.outcomeId,
                        selectionAlgorithm: "derived-round-seed-v1",
                    }),
                }),
            );

            const staleStart = await post(`${baseUrl}/api/project/replays`, {
                round: replay.round,
                seed: replay.seed,
                modeName: replay.modeName,
                outcomeSource: {...replay, libraryHash: "sha256:stale"},
            });
            expect(staleStart.status).toBe(400);
            expect((staleStart.body as {error: string}).error).toMatch(/library hash.*Restore\/open the original game/i);
        });

        it("rejects native exact replay when either recorded seed or mode is missing", async () => {
            const bundleDir = await buildNativeLibraryDir();
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: bundleDir});

            const missingSeed = await post(`${baseUrl}/api/project/replays`, {round: 1, modeName: "base"});
            expect(missingSeed.status).toBe(400);
            expect((missingSeed.body as {error: string}).error).toMatch(/without a seed.*Restore the original session seed/i);

            const missingMode = await post(`${baseUrl}/api/project/replays`, {round: 1, seed: "studio-seed"});
            expect(missingMode.status).toBe(400);
            expect((missingMode.body as {error: string}).error).toMatch(/without its recorded mode.*Restore the original mode/i);
        });

        it("rejects a sample request missing modeName with 400, without ever touching the project", async () => {
            const bundleDir = await buildNativeLibraryDir();
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: bundleDir});

            const {status, body} = await post(`${baseUrl}/api/project/outcome-source/sample`, {});

            expect(status).toBe(400);
            expect((body as {error: string}).error).toContain("modeName");
        });
    });

    describe("opening a resolved Stake Engine export project", () => {
        it("opens into an \"outcome-source\" dashboard carrying the Stake reader's own descriptor/limitations/exact analysis", async () => {
            const stakeDir = await buildStakeExportDir();

            const opened = await post(`${baseUrl}/api/home/projects/open`, {projectRoot: stakeDir});
            expect(opened.status).toBe(200);

            const {status, body} = await get(`${baseUrl}/api/project/context`);
            expect(status).toBe(200);
            const dashboard = body as {
                status: string;
                project: {type: string};
                report: {descriptor: {kind: string; streaming: boolean; limitations: string[]}; modes: {modeName: string}[]};
            };
            expect(dashboard.status).toBe("outcome-source");
            expect(dashboard.project.type).toBe("stakeAdapter");
            expect(dashboard.report.descriptor.kind).toBe("stakeEngine");
            expect(dashboard.report.descriptor.streaming).toBe(false);
            expect(dashboard.report.descriptor.limitations.length).toBeGreaterThan(0);
            expect(dashboard.report.modes).toEqual([expect.objectContaining({modeName: "base"})]);

            expect(loadGame).not.toHaveBeenCalled();
        });

        it("returns the structured unsupported-capability diagnostic from POST /api/project/outcome-source/sample, never package-runtime execution", async () => {
            const stakeDir = await buildStakeExportDir();
            await post(`${baseUrl}/api/home/projects/open`, {projectRoot: stakeDir});

            const {status, body} = await post(`${baseUrl}/api/project/outcome-source/sample`, {modeName: "base"});

            expect(status).toBe(200);
            const result = body as {supported: boolean; diagnostic?: {detectedType: string; missingCapability: string; alternatives: string[]}};
            expect(result.supported).toBe(false);
            expect(result.diagnostic?.detectedType).toBe("stakeAdapter");
            expect(result.diagnostic?.missingCapability).toBe("outcomeSource.sample");
            expect(result.diagnostic?.alternatives).toEqual(["outcomeLibrary"]);

            // Never fell through to loadPokieGame/package-runtime handling for the unsupported project.
            expect(loadGame).not.toHaveBeenCalled();
        });
    });

    it("returns 409 for POST /api/project/outcome-source/sample when no outcome-source project is open", async () => {
        const {status, body} = await post(`${baseUrl}/api/project/outcome-source/sample`, {modeName: "base"});

        expect(status).toBe(409);
        expect((body as {error: string}).error).toContain("No active outcome-source project");
    });
});
