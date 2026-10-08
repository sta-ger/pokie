import {createProductionParityFixture} from "../../fixtures/wasm/createProductionParityFixture.js";
import {ReplayRecorder} from "../../../src/replay/ReplayRecorder.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import type {StudioRuntimeSessionView} from "../../../cli/studio/runtime/StudioRuntimeSessionView.js";
import type {PokieWasmSessionState, PokieWasmRuntime} from "../../../src/wasm/PokieWasmRuntimeApi.js";
import fs from "fs";
import os from "os";
import path from "path";
import {PROJECT_TYPE_CAPABILITIES} from "pokie";
import {WasmArtifactBuilder} from "../../../src/project/WasmArtifactBuilder.js";
import {loadProjectDashboardContext} from "../../../cli/studio/loadProjectDashboardContext.js";
import {StudioPlayService} from "../../../cli/studio/runtime/StudioPlayService.js";
import {StudioSimulationService} from "../../../cli/studio/simulation/StudioSimulationService.js";
import {StudioReplayExecutionService} from "../../../cli/studio/replay/StudioReplayExecutionService.js";
import {StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";
import {loadPokieWasmFileRuntime} from "../../../src/wasm/node/PokieWasmFileRuntimeAdapter.js";
import {createCanonicalWasmFixture} from "../../fixtures/wasm/createCanonicalWasmFixture.js";

const blueprint = {
    manifest: {id: "studio-wasm", name: "Studio WASM", version: "1.0.0"},
    reels: 3,
    rows: 2,
    symbols: ["A", "B"],
    reelStrips: [["A", "B"], ["B", "A"], ["A", "B"]],
    paytable: {A: {3: 2}, B: {3: 1}},
};

async function waitForTerminal(getStatus: () => {status: string} | undefined): Promise<{status: string}> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
        const job = getStatus();
        if (job !== undefined && ["completed", "failed", "cancelled"].includes(job.status)) return job;
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 10);
        });
    }
    throw new Error("Studio WASM job did not reach a terminal state.");
}

describe("canonical WASM Studio workflow", () => {
    let workDir: string;
    let artifactPath: string;

    beforeEach(async () => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-wasm-workflow-"));
        const sourcePath = path.join(workDir, "source.blueprint.json");
        artifactPath = path.join(workDir, "game.wasm");
        fs.writeFileSync(sourcePath, JSON.stringify(blueprint));
        await new WasmArtifactBuilder("1.3.0").build(
            {type: "blueprint", rootPath: sourcePath, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "test"},
            artifactPath,
        );
    });

    afterEach(() => fs.rmSync(workDir, {recursive: true, force: true}));

    it("opens canonical WASM through the ordinary dashboard, then plays, simulates, and deterministically replays it", async () => {
        const registration = new StudioProjectRegistrationService();
        await expect(registration.registerExternal(artifactPath)).resolves.toMatchObject({
            status: "ok",
            entry: {type: "wasm", capabilities: expect.arrayContaining(["wasm.runtime.execute", "wasm.manifest.read"])},
        });
        await expect(registration.recordOpened(artifactPath)).resolves.toMatchObject({
            status: "ok",
            entry: {type: "wasm", capabilities: expect.arrayContaining(["wasm.runtime.execute", "wasm.manifest.read"])},
        });
        await expect(loadProjectDashboardContext(artifactPath)).resolves.toMatchObject({
            status: "loaded",
            type: "wasm",
            game: {id: "studio-wasm", version: "1.0.0"},
            capabilities: expect.arrayContaining(["wasm.runtime.execute", "wasm.manifest.read"]),
        });

        const play = new StudioPlayService();
        const opened = await play.newSession(artifactPath, "studio-seed");
        expect(opened.status).toBe("ok");
        if (opened.status !== "ok") throw new Error(opened.error);
        await expect(play.spin(opened.session.sessionId)).resolves.toMatchObject({status: "ok", session: {game: {id: "studio-wasm"}}});
        const secondPlayRound = await play.spin(opened.session.sessionId);
        if (secondPlayRound.status !== "ok") throw new Error("expected second portable play round");
        const playScreen = secondPlayRound.session.screen;
        if (playScreen === undefined) throw new Error("expected a portable WASM screen");
        expect(playScreen).toHaveLength(3);
        expect(playScreen.every((reel) => reel.length === 2 && reel.every((symbol) => symbol !== undefined && symbol !== null))).toBe(true);

        const simulation = new StudioSimulationService(undefined, undefined, undefined, 1);
        const simulationStart = simulation.start(artifactPath, {rounds: 3, seed: "studio-seed"});
        expect(simulationStart.status).toBe("created");
        if (simulationStart.status !== "created") throw new Error("expected Studio simulation job");
        await expect(waitForTerminal(() => simulation.getStatus(simulationStart.job.id))).resolves.toMatchObject({status: "completed"});

        const replay = new StudioReplayExecutionService(undefined, undefined, 1);
        const replayStart = replay.start(artifactPath, {round: 2, seed: "studio-seed"});
        expect(replayStart.status).toBe("created");
        if (replayStart.status !== "created") throw new Error("expected Studio replay job");
        await expect(waitForTerminal(() => replay.getStatus(artifactPath, replayStart.job.id))).resolves.toMatchObject({status: "completed"});
        const replayDownload = replay.getDownload(artifactPath, replayStart.job.id);
        expect(replayDownload).toMatchObject({status: "ok", descriptor: {seed: "studio-seed", round: 2}});
        if (replayDownload.status !== "ok") throw new Error("expected replay descriptor");
        expect(replayDownload.descriptor.screen).toEqual(secondPlayRound.session.screen);
        expect(replayDownload.descriptor.screen?.every((reel) => reel.length === 2 && reel.every((symbol) => symbol !== undefined && symbol !== null))).toBe(true);
        expect(replayDownload.descriptor.stateAfter).toEqual(secondPlayRound.session.debug?.stateAfter);
    });

    it("transports Node-compatible initial state, Play, chunked Replay, and Simulation through the real Studio routes", async () => {
        const fixture = await createProductionParityFixture(workDir);
        const home = new StudioHomeService("1.3.0");
        const replayService = new StudioReplayExecutionService(undefined, undefined, 1);
        const simulationService = new StudioSimulationService(undefined, undefined, undefined, 1);
        const server = new StudioServer({
            pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot: workDir,
            homeService: home, blueprintService: new StudioBlueprintService("1.3.0", workDir, home),
            projectRegistrationService: new StudioProjectRegistrationService(),
            jobService: new StudioJobService(new FileStudioJobRepository(path.join(workDir, "jobs"))),
            replayService, simulationService, initialContext: {mode: "project", projectRoot: fixture.artifact},
        });
        const address = await server.start();
        const base = `http://${address.host}:${address.port}`;
        const post = (route: string, body: unknown) => fetch(`${base}${route}`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
        try {
            const opened = await post("/api/project/play/session", {seed: "0"});
            expect(opened.status).toBe(201);
            const initial = await opened.json() as {session: StudioRuntimeSessionView};
            expect(initial.session.debug?.stateAfter).toMatchObject({schemaVersion: "pokie.state.v2", drawCount: 2, sequence: 0, credits: 1000, rngState: expect.any(Number)});
            const node = fixture.game.createSession({seed: "0"});
            expect((initial.session.debug?.stateAfter as PokieWasmSessionState).rngState).toEqual((node as unknown as {toSessionState(): {rngState: number}}).toSessionState().rngState);
            const states: unknown[] = [initial.session.debug?.stateAfter];
            for (let round = 1; round <= 4; round++) {
                node.setBet(1);
                node.play();
                const response = await post(`/api/project/play/sessions/${initial.session.sessionId}/spin`, {bet: 1});
                expect(response.status).toBe(200);
                const body = await response.json() as {session: StudioRuntimeSessionView};
                expect(body.session).toMatchObject({win: node.getWinAmount(), credits: node.getCreditsAmount(), screen: (node as unknown as {getSymbolsCombination(): {toMatrix(): string[][]}}).getSymbolsCombination().toMatrix()});
                expect(body.session.debug?.stateBefore).toEqual(states[round - 1]);
                states.push(body.session.debug?.stateAfter);
                expect(Buffer.byteLength(JSON.stringify(body.session.debug?.stateAfter))).toBeLessThanOrEqual(192);
                expect(body.session.debug?.stateAfter).not.toHaveProperty("draws");
            }
            for (const round of [1, 4]) {
                const started = await post("/api/project/replays", {seed: "0", round});
                expect(started.status).toBe(202);
                const job = await started.json() as {id: string};
                await expect(waitForTerminal(() => replayService.getStatus(fixture.artifact, job.id))).resolves.toMatchObject({status: "completed"});
                const downloaded = await fetch(`${base}/api/project/replays/${job.id}/download`);
                expect(downloaded.status).toBe(200);
                const descriptor = await downloaded.json();
                const expected = new ReplayRecorder().record({game: fixture.game, seed: "0", round});
                expect(descriptor).toMatchObject({round, totalBet: expected.totalBet, totalWin: expected.totalWin, screen: expected.screen, stateBefore: states[round - 1], stateAfter: states[round]});
            }
            const started = await post("/api/project/simulations", {seed: "0", rounds: 4});
            expect(started.status).toBe(202);
            const job = await started.json() as {id: string};
            await expect(waitForTerminal(() => simulationService.getStatus(job.id))).resolves.toMatchObject({status: "completed"});
            const downloaded = await fetch(`${base}/api/project/reports/${job.id}`);
            expect(downloaded.status).toBe(200);
            const expected = new ReplayRecorder().record({game: fixture.game, seed: "0", round: 4});
            expect(await downloaded.json()).toMatchObject({report: {totalBet: expected.totalBet, totalWin: expected.totalWin}});
            expect(replayService.getActiveCount()).toBe(0);
            expect(simulationService.getActiveCount()).toBe(0);
        } finally {
            await server.stop();
            await fixture.release();
        }
    });

    it("keeps 10000-round Studio simulation and chunked durable replay compact", async () => {
        const fixture = createCanonicalWasmFixture({reelStrips: [["A"], ["A"]]});
        fs.writeFileSync(artifactPath, fixture.bytes);
        fs.writeFileSync(`${artifactPath}.pokie-wasm.json`, JSON.stringify(fixture.manifest));
        const jobsDirectory = path.join(workDir, "compact-jobs");
        const jobs = new StudioJobService(new FileStudioJobRepository(jobsDirectory));
        const simulation = new StudioSimulationService(undefined, undefined, undefined, 1000);
        simulation.attachJobService(jobs);
        const started = simulation.start(artifactPath, {rounds: 10000, seed: "compact-measurement"});
        if (started.status !== "created") throw new Error("expected simulation");
        await expect(waitForTerminal(() => simulation.getStatus(started.job.id))).resolves.toMatchObject({status: "completed"});
        expect(simulation.getReport(artifactPath, started.job.id)).toMatchObject({status: "ok", report: {rounds: 10000, totalBet: 10000, totalWin: 20000, workers: 1}});
        const replay = new StudioReplayExecutionService(undefined, undefined, 1000);
        replay.attachJobService(jobs);
        const replayStart = replay.start(artifactPath, {round: 10000, seed: "compact-measurement"});
        if (replayStart.status !== "created") throw new Error("expected replay");
        await expect(waitForTerminal(() => replay.getStatus(artifactPath, replayStart.job.id))).resolves.toMatchObject({status: "completed"});
        const download = replay.getDownload(artifactPath, replayStart.job.id);
        if (download.status !== "ok") throw new Error("expected descriptor");
        expect(download.descriptor).toMatchObject({round: 10000, totalBet: 10000, totalWin: 20000, stateBefore: {schemaVersion: "pokie.state.v2", sequence: 9999}, stateAfter: {schemaVersion: "pokie.state.v2", sequence: 10000}});
        for (const state of [download.descriptor.stateBefore, download.descriptor.stateAfter]) {
            expect(Buffer.byteLength(JSON.stringify(state))).toBeLessThanOrEqual(192);
            expect(state).not.toHaveProperty("draws");
        }
        const persisted = new FileStudioJobRepository(jobsDirectory).get(replayStart.job.id);
        expect(persisted?.result).toMatchObject({detail: {descriptor: download.descriptor}});
        expect(Buffer.byteLength(JSON.stringify(persisted))).toBeLessThan(5000);
        expect(replay.getActiveCount()).toBe(0);
        expect(simulation.getActiveCount()).toBe(0);
        await replay.cancelAll();
        await simulation.cancelAll();
    });

    it.each(["cancel", "runtime-failure", "disposal-failure"] as const)("drains real compact simulation/replay continuation on %s and starts a clean next job", async (failure) => {
        const fixture = createCanonicalWasmFixture({reelStrips: [["A"], ["A"]]});
        fs.writeFileSync(artifactPath, fixture.bytes);
        fs.writeFileSync(`${artifactPath}.pokie-wasm.json`, JSON.stringify(fixture.manifest));
        for (const surface of ["simulation", "replay"] as const) {
            let fail = true;
            let captured: PokieWasmSessionState | undefined;
            let actual: PokieWasmRuntime | undefined;
            const loader: typeof loadPokieWasmFileRuntime = async (file, host) => {
                const runtime = await loadPokieWasmFileRuntime(file, host);
                actual = runtime;
                return {
                    ...runtime,
                    createSession: (seed, options) => {
                        expect(options?.trace).toBeUndefined();
                        const session = runtime.createSession(seed, options);
                        return {...session, play: async (command) => {
                            if (fail && failure === "runtime-failure") throw new Error("injected round failure");
                            const round = await session.play(command);
                            captured = session.serialize();
                            return round;
                        }};
                    },
                    replay: async (state, commands, options) => {
                        expect(options?.trace).toBeUndefined();
                        if (fail && failure === "runtime-failure") throw new Error("injected replay failure");
                        const result = await runtime.replay(state, commands, options);
                        captured = result.stateAfter;
                        return result;
                    },
                    dispose: () => {
                        runtime.dispose();
                        if (fail && failure === "disposal-failure") throw new Error("injected release failure");
                    },
                };
            };
            let cancel = (): void => undefined;
            const yieldToEventLoop = (): Promise<void> => {
                if (fail && failure === "cancel") cancel();
                return Promise.resolve();
            };
            const completed = jest.fn();
            const simulation = new StudioSimulationService(undefined, undefined, undefined, 1, undefined, yieldToEventLoop, undefined, undefined, undefined, undefined, undefined, completed, undefined, loader);
            const replay = new StudioReplayExecutionService(undefined, undefined, 1, undefined, yieldToEventLoop, undefined, undefined, completed, undefined, undefined, loader);
            const service = surface === "simulation" ? simulation : replay;
            const started = surface === "simulation" ? simulation.start(artifactPath, {rounds: 3, seed: "0"}) : replay.start(artifactPath, {round: 3, seed: "0"});
            if (started.status !== "created") throw new Error("expected job");
            cancel = () => {
                if (surface === "simulation") simulation.cancel(started.job.id);
                else replay.cancel(artifactPath, started.job.id);
            };
            const status = () => surface === "simulation" ? simulation.getStatus(started.job.id) : replay.getStatus(artifactPath, started.job.id);
            await expect(waitForTerminal(status)).resolves.toMatchObject({status: failure === "cancel" ? "cancelled" : "failed"});
            expect(service.getActiveCount()).toBe(0);
            expect(completed).not.toHaveBeenCalled();
            expect(surface === "simulation" ? simulation.getReport(artifactPath, started.job.id) : replay.getDownload(artifactPath, started.job.id)).toMatchObject({status: "not-ready"});
            if (captured !== undefined) {
                expect(captured.schemaVersion).toBe("pokie.state.v2");
                expect(Buffer.byteLength(JSON.stringify(captured))).toBeLessThanOrEqual(192);
            }
            expect(() => actual!.createSession("0")).toThrow(/disposed/);
            // Cleanup failure remains observable to server shutdown; retry must still start cleanly.
            if (failure === "disposal-failure") await expect(service.cancelAll()).rejects.toThrow(/release failure/);
            else await service.cancelAll();
            fail = false;
            const next = surface === "simulation" ? simulation.start(artifactPath, {rounds: 2, seed: "0"}) : replay.start(artifactPath, {round: 2, seed: "0"});
            if (next.status !== "created") throw new Error("expected clean retry");
            await expect(waitForTerminal(() => surface === "simulation" ? simulation.getStatus(next.job.id) : replay.getStatus(artifactPath, next.job.id))).resolves.toMatchObject({status: "completed"});
            expect(completed).toHaveBeenCalledTimes(1);
            expect(service.getActiveCount()).toBe(0);
            if (failure === "disposal-failure") await expect(service.cancelAll()).rejects.toThrow(/release failure/);
            else await service.cancelAll();
        }
    });

    it("cancels queued canonical WASM simulation and replay jobs without retaining a runnable operation", async () => {
        const simulation = new StudioSimulationService(undefined, undefined, undefined, 1);
        const simulationStart = simulation.start(artifactPath, {rounds: 1_000, seed: "cancelled-wasm"});
        expect(simulationStart.status).toBe("created");
        if (simulationStart.status !== "created") throw new Error("expected Studio simulation job");
        // Cancel requests cleanup; active ownership lasts until the runtime drains.
        expect(simulation.cancel(simulationStart.job.id)).toMatchObject({id: simulationStart.job.id});
        expect(simulation.getActiveCount()).toBe(1);
        await expect(waitForTerminal(() => simulation.getStatus(simulationStart.job.id))).resolves.toMatchObject({status: "cancelled"});
        expect(simulation.getActiveCount()).toBe(0);

        const replay = new StudioReplayExecutionService(undefined, undefined, 1);
        const replayStart = replay.start(artifactPath, {round: 1_000, seed: "cancelled-wasm"});
        expect(replayStart.status).toBe("created");
        if (replayStart.status !== "created") throw new Error("expected Studio replay job");
        expect(replay.cancel(artifactPath, replayStart.job.id)).toMatchObject({id: replayStart.job.id});
        expect(replay.getActiveCount()).toBe(1);
        await expect(waitForTerminal(() => replay.getStatus(artifactPath, replayStart.job.id))).resolves.toMatchObject({status: "cancelled"});
        expect(replay.getActiveCount()).toBe(0);
    });

    it("replays a replay-only canonical WASM artifact without enabling session play or serialization", async () => {
        const fixture = createCanonicalWasmFixture({id: "studio-replay-only", capabilities: ["runtime.replay"]});
        fs.writeFileSync(artifactPath, fixture.bytes);
        fs.writeFileSync(`${artifactPath}.pokie-wasm.json`, JSON.stringify(fixture.manifest));
        await expect(loadProjectDashboardContext(artifactPath)).resolves.toMatchObject({
            status: "loaded",
            capabilities: ["wasm.manifest.read", "wasm.canonical", "wasm.runtime.replay"],
        });

        const replay = new StudioReplayExecutionService(undefined, undefined, 1);
        const started = replay.start(artifactPath, {round: 2, seed: "studio-replay-only"});
        expect(started.status).toBe("created");
        if (started.status !== "created") throw new Error("expected Studio replay job");
        await expect(waitForTerminal(() => replay.getStatus(artifactPath, started.job.id))).resolves.toMatchObject({status: "completed"});
        const download = replay.getDownload(artifactPath, started.job.id);
        expect(download).toMatchObject({status: "ok", descriptor: {game: {id: "studio-replay-only"}}});
        if (download.status !== "ok") throw new Error("expected replay descriptor");
        expect(download.descriptor).not.toHaveProperty("stateBefore");
        expect(download.descriptor).not.toHaveProperty("stateAfter");
    });

    it("drops an active portable session when artifact integrity is stale", async () => {
        const play = new StudioPlayService();
        const opened = await play.newSession(artifactPath, "studio-seed");
        if (opened.status !== "ok") throw new Error(opened.error);
        fs.writeFileSync(artifactPath, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));

        await expect(play.spin(opened.session.sessionId)).resolves.toMatchObject({status: "error", error: expect.stringMatching(/cannot play a game round|does not match/i)});
        await expect(play.spin(opened.session.sessionId)).resolves.toEqual({status: "not-found"});
    });

    it("revalidates replacement bytes when simulation and replay acquire their own portable runtimes", async () => {
        fs.writeFileSync(artifactPath, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));

        const simulation = new StudioSimulationService(undefined, undefined, undefined, 1);
        const simulationStart = simulation.start(artifactPath, {rounds: 1, seed: "stale"});
        expect(simulationStart.status).toBe("created");
        if (simulationStart.status !== "created") throw new Error("expected Studio simulation job");
        await expect(waitForTerminal(() => simulation.getStatus(simulationStart.job.id))).resolves.toMatchObject({status: "failed", error: expect.stringMatching(/integrity|canonical|descriptor|module/i)});

        const replay = new StudioReplayExecutionService(undefined, undefined, 1);
        const replayStart = replay.start(artifactPath, {round: 1, seed: "stale"});
        expect(replayStart.status).toBe("created");
        if (replayStart.status !== "created") throw new Error("expected Studio replay job");
        await expect(waitForTerminal(() => replay.getStatus(artifactPath, replayStart.job.id))).resolves.toMatchObject({status: "failed", error: expect.stringMatching(/integrity|canonical|descriptor|module/i)});
        expect(replay.getActiveCount()).toBe(0);
        expect(simulation.getActiveCount()).toBe(0);
        expect(replay.getDownload(artifactPath, replayStart.job.id).status).not.toBe("ok");
    });
});
