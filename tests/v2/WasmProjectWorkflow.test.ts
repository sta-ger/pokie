// Source-level workflow. Installed/rendered acceptance uses tests/fixtures/wasm/runStudioProjectWorkflow.mjs.
import fs from "fs";
import os from "os";
import path from "path";
import {resolveCliInvocation} from "../../cli/resolveCliInvocation.js";
import {INTERNAL_STUDIO_COMMAND_NAME} from "../../cli/commands/InternalStudioCommand.js";
import {StudioContextResolver} from "../../cli/studio/StudioContextResolver.js";
import {loadProjectDashboardContext} from "../../cli/studio/loadProjectDashboardContext.js";
import {StudioWasmBrowserService} from "../../cli/studio/wasm/StudioWasmBrowserService.js";
import {StudioJobService} from "../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioRoundRecorder} from "../../cli/studio/runtime/StudioRoundRecorder.js";
import {StudioSimulationService} from "../../cli/studio/simulation/StudioSimulationService.js";
import {StudioReplayExecutionService} from "../../cli/studio/replay/StudioReplayExecutionService.js";
import {validatePokieWasmBrowserArtifact} from "../../src/wasm/loadPokieWasmBrowserArtifact.js";
import {instantiatePokieWasm, SeededPokieWasmHost} from "../../src/wasm/PokieWasmRuntime.js";
import {createProductionParityFixture} from "../fixtures/wasm/createProductionParityFixture.js";
import type {VideoSlotSession} from "../../src/session/videoslot/VideoSlotSession.js";
import type {GameBlueprint} from "../../src/generated/GameBlueprint.js";

it("routes positional WASM to a playable Project and hands integrity-bound math to the portable runtime and Studio jobs without prebuilt CLI output", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "v2c22-source-workflow-"));
    const blueprint: GameBlueprint = {
        manifest: {id: "wasm-project-workflow", name: "WASM project workflow", version: "1.0.0"},
        reels: 3, rows: 1, symbols: ["A", "B", "C"], wilds: [], scatters: [],
        reelStrips: [["A", "B", "C"], ["A", "B", "C"], ["A", "B", "C"]], paylines: [[0, 0, 0]],
        availableBets: [0.05, 7.5, 1e-7], paytable: {A: {3: 5}, B: {3: 0}},
    };
    const fixture = await createProductionParityFixture(directory, blueprint);
    const jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
    const browser = new StudioWasmBrowserService(jobs, new StudioRoundRecorder());
    const simulation = new StudioSimulationService();
    const replay = new StudioReplayExecutionService();
    let runtime: Awaited<ReturnType<typeof instantiatePokieWasm>> | undefined;
    try {
        expect(resolveCliInvocation(["node", "pokie", fixture.artifact, "--no-open"], [])).toEqual({commandName: INTERNAL_STUDIO_COMMAND_NAME, args: [fixture.artifact, "--no-open"]});
        const context = new StudioContextResolver().resolve(fixture.artifact);
        expect(await loadProjectDashboardContext(fixture.artifact)).toMatchObject({status: "loaded", type: "wasm", projectRoot: fixture.artifact,
            capabilities: expect.arrayContaining(["wasm.manifest.read", "wasm.runtime.play", "wasm.runtime.serialize", "wasm.runtime.replay"])});
        const artifact = await browser.artifact(context);
        expect(await validatePokieWasmBrowserArtifact(artifact, fixture.artifact)).toEqual(artifact);
        runtime = await instantiatePokieWasm(new Uint8Array(artifact.bytes), artifact.manifest, new SeededPokieWasmHost("0"));
        const portable = runtime.createSession("0");
        const node = fixture.game.createSession({seed: "0"}) as VideoSlotSession;
        try {
            for (const bet of blueprint.availableBets!) {
                node.setBet(bet);
                node.play();
                const before = portable.serialize();
                const round = await portable.play({bet});
                expect(round).toMatchObject({stake: bet, screen: node.getSymbolsCombination().toMatrix(), payout: node.getWinAmount(), credits: node.getCreditsAmount()});
                const restored = runtime.restoreSession(JSON.parse(JSON.stringify(before)));
                try {
                    expect(await restored.play({bet})).toEqual(round);
                } finally {
                    restored.dispose();
                }
            }
        } finally {
            portable.dispose();
        }
        const sim = simulation.start(fixture.artifact, {rounds: 3, seed: "0"});
        const rep = replay.start(fixture.artifact, {round: 3, seed: "0"});
        if (sim.status !== "created" || rep.status !== "created") throw new Error(JSON.stringify({sim, rep}));
        const deadline = Date.now() + 5000;
        while ((simulation.getActiveCount() || replay.getActiveCount()) && Date.now() < deadline) {
            await new Promise<void>(resolve => {
                setImmediate(resolve);
            });
        }
        expect(simulation.getReport(fixture.artifact, sim.job.id)).toMatchObject({status: "ok", report: {rounds: 3}});
        expect(replay.getDownload(fixture.artifact, rep.job.id)).toMatchObject({status: "ok", descriptor: {round: 3, seed: "0"}});
        // A stale sidecar must fail before either the browser handoff or synchronous job admission.
        const sidecar = `${fixture.artifact}.pokie-wasm.json`;
        const manifest = JSON.parse(fs.readFileSync(sidecar, "utf8"));
        fs.writeFileSync(sidecar, JSON.stringify({...manifest, artifact: {...manifest.artifact, sha256: `sha256:${"0".repeat(64)}`}}));
        await expect(browser.artifact(context)).rejects.toThrow(/SHA-256/);
        expect(simulation.start(fixture.artifact, {rounds: 3, seed: "0"})).toMatchObject({status: "unsupported", message: expect.stringContaining("SHA-256")});
        expect(replay.start(fixture.artifact, {round: 3, seed: "0"})).toMatchObject({status: "unsupported", message: expect.stringContaining("SHA-256")});
        expect(simulation.getActiveCount()).toBe(0);
        expect(replay.getActiveCount()).toBe(0);
    } finally {
        await Promise.all([simulation.cancelAll(), replay.cancelAll(), browser.shutdown()]);
        await runtime?.dispose();
        await jobs.completeGracefulShutdown();
        await fixture.release();
        fs.rmSync(directory, {recursive: true, force: true});
    }
});
