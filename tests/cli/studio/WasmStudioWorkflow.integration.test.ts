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
    for (let attempt = 0; attempt < 100; attempt++) {
        const job = getStatus();
        if (job !== undefined && ["completed", "failed", "cancelled"].includes(job.status)) return job;
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
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

    it("cancels queued canonical WASM simulation and replay jobs without retaining a runnable operation", async () => {
        const simulation = new StudioSimulationService(undefined, undefined, undefined, 1);
        const simulationStart = simulation.start(artifactPath, {rounds: 1_000, seed: "cancelled-wasm"});
        expect(simulationStart.status).toBe("created");
        if (simulationStart.status !== "created") throw new Error("expected Studio simulation job");
        expect(simulation.cancel(simulationStart.job.id)).toMatchObject({status: "cancelled"});
        expect(simulation.getActiveCount()).toBe(0);
        await expect(waitForTerminal(() => simulation.getStatus(simulationStart.job.id))).resolves.toMatchObject({status: "cancelled"});
        expect(simulation.getActiveCount()).toBe(0);

        const replay = new StudioReplayExecutionService(undefined, undefined, 1);
        const replayStart = replay.start(artifactPath, {round: 1_000, seed: "cancelled-wasm"});
        expect(replayStart.status).toBe("created");
        if (replayStart.status !== "created") throw new Error("expected Studio replay job");
        expect(replay.cancel(artifactPath, replayStart.job.id)).toMatchObject({status: "cancelled"});
        expect(replay.getActiveCount()).toBe(0);
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
    });
});
