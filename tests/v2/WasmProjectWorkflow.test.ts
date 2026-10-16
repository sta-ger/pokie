// Controller-owned installed/rendered workflow. Implementation workers prepare this file; they do not run it.
import fs from "fs";
import path from "path";
import {spawnSync} from "child_process";
import {createProductionParityFixture} from "../fixtures/wasm/createProductionParityFixture.js";
import type {VideoSlotSession} from "../../src/session/videoslot/VideoSlotSession.js";
import type {GameBlueprint} from "../../src/generated/GameBlueprint.js";

it("opens positional WASM in installed Studio and uses production Workers for Play, restore, simulation, replay, cancellation, reload and failure recovery", async () => {
    const candidate = path.resolve(process.env.POKIE_WASM_CANDIDATE_ROOT ?? process.cwd());
    expect(fs.existsSync(path.join(candidate, "dist/cli/pokie.js"))).toBe(true);
    const directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c22-workflow-"));
    const blueprint: GameBlueprint = {
        manifest: {id: "wasm-project-workflow", name: "WASM project workflow", version: "1.0.0"},
        reels: 3, rows: 1, symbols: ["A", "B", "C"], wilds: [], scatters: [],
        reelStrips: [["A", "B", "C"], ["A", "B", "C"], ["A", "B", "C"]], paylines: [[0, 0, 0]],
        availableBets: [0.05, 7.5, 1e-7], paytable: {A: {3: 5}, B: {3: 0}},
    };
    const fixture = await createProductionParityFixture(directory, blueprint);
    try {
        const session = fixture.game.createSession({seed: "0"}) as VideoSlotSession;
        const expected = blueprint.availableBets!.map(bet => {
            session.setBet(bet);
            session.play();
            return {bet, screen: session.getSymbolsCombination().toMatrix(), win: session.getWinAmount(), credits: session.getCreditsAmount()};
        });
        const result = spawnSync(process.execPath, ["tests/fixtures/wasm/studioProjectWorkflow.browser.mjs", candidate, fixture.artifact, JSON.stringify(expected)], {cwd: process.cwd(), encoding: "utf8", timeout: 180000});
        expect({exitCode: result.status, error: result.error?.message, stderr: result.stderr, stdout: result.stdout}).toMatchObject({exitCode: 0, stdout: expect.stringContaining("PASS installed rendered WASM Project production Worker workflow")});
    } finally {
        await fixture.release();
        fs.rmSync(directory, {recursive: true, force: true});
    }
}, 240000);
