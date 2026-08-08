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
            const result = body as {supported: boolean; selection?: {libraryId: string; outcome: {id: string}}};
            expect(result.supported).toBe(true);
            expect(result.selection?.libraryId).toBe("base-lib");
            expect(typeof result.selection?.outcome.id).toBe("string");

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
            }>;
            expect(entries).toHaveLength(1);
            expect(entries[0].studioSource).toBe("outcome-source-sample");
            expect(entries[0].studioOperation).toBe("outcome-source-sample");
            expect(entries[0].studioProjectRoot).toBe(bundleDir);
            expect(entries[0].studioSeed).toBe("studio-sample-seed");
            expect(entries[0].credits).toBeUndefined();
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
