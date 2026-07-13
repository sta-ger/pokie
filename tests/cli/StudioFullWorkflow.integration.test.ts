import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {InMemoryStudioReplayRepository} from "../../cli/studio/replay/InMemoryStudioReplayRepository.js";
import {StudioReplayExecutionService} from "../../cli/studio/replay/StudioReplayExecutionService.js";
import {InMemoryStudioSimulationRepository} from "../../cli/studio/simulation/InMemoryStudioSimulationRepository.js";
import {StudioSimulationService} from "../../cli/studio/simulation/StudioSimulationService.js";
import {StudioServer} from "../../cli/studio/StudioServer.js";

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

function writeStudioAssets(root: string): void {
    fs.writeFileSync(path.join(root, "index.html"), "<html>studio</html>");
    fs.writeFileSync(path.join(root, "main.js"), "console.log('hi');");
    fs.writeFileSync(path.join(root, "style.css"), "body { margin: 0; }");
}

function buildBlueprint(id: string): Record<string, unknown> {
    return {
        manifest: {id, name: id, version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "B"],
        paytable: {A: {3: 5}, B: {3: 2}},
    };
}

// The full 18-step Studio session the stabilization pass asks for, driven over real HTTP against one
// running StudioServer instance for the whole test — no mocked loadGame/inspector/validator anywhere,
// so Home → Build → Open → Inspect → Validate → Simulation → Reports → Replay → Runtime all exercise
// the real collaborators (GamePackageGenerator, GamePackageInspector, PokieGamePackageValidator,
// loadPokieGame) exactly as a real user session would, the same way BuildWorkflow.integration.test.ts
// proves a `pokie build` output needs no separate compile step. Real StudioSimulationService/
// StudioReplayExecutionService instances (rather than StudioServer's own defaults) are injected only so
// step 18 can assert getActiveCount() after shutdown — everything else about them is unmodified.
describe("POKIE Studio full workflow (integration): Home -> Project -> Runtime -> Home -> isolation -> shutdown", () => {
    let studioRoot: string;
    let workDir: string;
    let server: StudioServer | undefined;
    let baseUrl: string;
    let simulationService: StudioSimulationService;
    let replayService: StudioReplayExecutionService;

    beforeEach(async () => {
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-full-workflow-test-"));
        writeStudioAssets(studioRoot);
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-full-workflow-work-"));

        const homeService = new StudioHomeService("1.0.0");
        simulationService = new StudioSimulationService(new InMemoryStudioSimulationRepository());
        replayService = new StudioReplayExecutionService(new InMemoryStudioReplayRepository());
        server = new StudioServer({
            pokieVersion: "1.0.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            homeService,
            blueprintService: new StudioBlueprintService("1.0.0", studioRoot, homeService),
            simulationService,
            replayService,
        });
        const address = await server.start();
        baseUrl = `http://${address.host}:${address.port}`;
    });

    afterEach(async () => {
        await server?.stop();
        fs.rmSync(studioRoot, {recursive: true, force: true});
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("runs the full 18-step session with no leftover jobs or open ports at the end", async () => {
        // 1. Launch Home.
        const home = await get(`${baseUrl}/api/context`);
        expect(home.body).toEqual({mode: "home"});

        // 2. Create project (via the Blueprint Editor's real Build flow — GamePackageGenerator, no stub).
        const blueprintPath = path.join(workDir, "crazy-fruits.blueprint.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(buildBlueprint("crazy-fruits")));
        const outDir = path.join(workDir, "crazy-fruits-out");
        const built = await post(`${baseUrl}/api/home/projects/build`, {blueprintPath, outDir});
        expect(built.status).toBe(201);
        const projectRoot = (built.body as {projectRoot: string}).projectRoot;

        // 3. Open.
        const opened = await post(`${baseUrl}/api/home/projects/open`, {projectRoot});
        expect(opened.status).toBe(200);
        expect((opened.body as {context: unknown}).context).toEqual({mode: "project", projectRoot});

        // 4. Inspect.
        const inspected = await get(`${baseUrl}/api/project/inspect`);
        expect(inspected.status).toBe(200);
        expect(inspected.body).toMatchObject({valid: true, generated: true});

        // 5. Validate.
        const validated = await get(`${baseUrl}/api/project/validate`);
        expect(validated.status).toBe(200);
        expect(validated.body).toMatchObject({valid: true, game: {id: "crazy-fruits"}});

        // 6. Simulation (run to completion).
        const simCreated = await post(`${baseUrl}/api/project/simulations`, {rounds: 40, seed: "demo"});
        expect(simCreated.status).toBe(202);
        const simId = (simCreated.body as {id: string}).id;
        const simCompleted = await pollUntilTerminal(`${baseUrl}/api/project/simulations/${simId}`);
        expect(simCompleted.body.status).toBe("completed");

        // 7. Open + download its Report.
        const reportsList = await get(`${baseUrl}/api/project/reports`);
        expect(reportsList.body).toEqual([expect.objectContaining({id: simId, status: "completed"})]);
        const reportDetail = await get(`${baseUrl}/api/project/reports/${simId}`);
        expect(reportDetail.status).toBe(200);
        const downloaded = await fetch(`${baseUrl}/api/project/reports/${simId}/download?format=json`);
        expect(downloaded.status).toBe(200);
        expect(downloaded.headers.get("content-type")).toContain("application/json");

        // 8. Replay.
        const replayCreated = await post(`${baseUrl}/api/project/replays`, {round: 20, seed: "demo"});
        expect(replayCreated.status).toBe(202);
        const replayId = (replayCreated.body as {id: string}).id;
        const replayCompleted = await pollUntilTerminal(`${baseUrl}/api/project/replays/${replayId}`);
        expect(replayCompleted.body.status).toBe("completed");

        // 9. Start Runtime.
        const runtimeStarted = await post(`${baseUrl}/api/project/runtime/start`, {port: 0});
        expect(runtimeStarted.status).toBe(201);
        const runtimePort = (runtimeStarted.body as {port: number}).port;
        expect(runtimePort).toBeGreaterThan(0);

        // 10. Create session.
        type SessionResponse = {status: string; session: {sessionId: string; sessionVersion?: number}};
        const sessionCreated = await post(`${baseUrl}/api/project/runtime/sessions`, {});
        expect(sessionCreated.status).toBe(201);
        const sessionId = (sessionCreated.body as SessionResponse).session.sessionId;

        // 11. Spin.
        const spun = await post(`${baseUrl}/api/project/runtime/sessions/${sessionId}/spins`, {requestId: "req-1"});
        expect(spun.status).toBe(200);

        // 12. Repeat the same requestId (idempotent).
        const repeated = await post(`${baseUrl}/api/project/runtime/sessions/${sessionId}/spins`, {requestId: "req-1"});
        expect(repeated.body).toEqual(spun.body);

        // 13. Spin with a stale expectedSessionVersion (409 conflict).
        const stale = await post(`${baseUrl}/api/project/runtime/sessions/${sessionId}/spins`, {expectedSessionVersion: 999});
        expect(stale.status).toBe(409);
        expect((stale.body as {reason: string}).reason).toBe("conflict");

        // 14. Stop Runtime.
        const runtimeStopped = await post(`${baseUrl}/api/project/runtime/stop`);
        expect(runtimeStopped.status).toBe(200);
        expect(runtimeStopped.body).toEqual({status: "stopped"});

        // 15. Return to Home.
        const closed = await post(`${baseUrl}/api/projects/close`);
        expect(closed.status).toBe(200);
        expect((await get(`${baseUrl}/api/context`)).body).toEqual({mode: "home"});

        // 16. Open a second, distinct project.
        const secondBlueprintPath = path.join(workDir, "lucky-sevens.blueprint.json");
        fs.writeFileSync(secondBlueprintPath, JSON.stringify(buildBlueprint("lucky-sevens")));
        const secondOutDir = path.join(workDir, "lucky-sevens-out");
        const secondBuilt = await post(`${baseUrl}/api/home/projects/build`, {blueprintPath: secondBlueprintPath, outDir: secondOutDir});
        expect(secondBuilt.status).toBe(201);
        const secondProjectRoot = (secondBuilt.body as {projectRoot: string}).projectRoot;
        const secondOpened = await post(`${baseUrl}/api/home/projects/open`, {projectRoot: secondProjectRoot});
        expect(secondOpened.status).toBe(200);

        // 17. Verify isolation: the first project's reports/replays are unreachable from the second.
        expect((await get(`${baseUrl}/api/project/reports`)).body).toEqual([]);
        expect((await get(`${baseUrl}/api/project/reports/${simId}`)).status).toBe(404);
        expect((await get(`${baseUrl}/api/project/replays`)).body).toEqual([]);
        expect((await get(`${baseUrl}/api/project/replays/${replayId}`)).status).toBe(404);

        // 18. Shutdown Studio with no leftover jobs/open ports.
        const serverToStop = server;
        server = undefined; // already being stopped — afterEach shouldn't stop it again
        await serverToStop?.stop();
        expect(simulationService.getActiveCount()).toBe(0);
        expect(replayService.getActiveCount()).toBe(0);

        const probe = http.createServer();
        await new Promise<void>((resolve, reject) => {
            probe.once("error", reject);
            probe.listen(runtimePort, "127.0.0.1", () => resolve());
        });
        await new Promise<void>((resolve) => {
            probe.close(() => resolve());
        });
    });
});
