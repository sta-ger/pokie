import {GamePackageGenerator, RandomGameBlueprintGenerator} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {runSmokeSimulation} from "../../../cli/build/runSmokeSimulation.js";

// Real-package coverage for runSmokeSimulation itself: builds an actual on-disk game package from a
// real RandomGameBlueprintGenerator blueprint (no stubs anywhere in the chain) and simulates it, so the
// shape evaluateRandomBuildQualityGates relies on (roundsRequested/maxWin/averageBet, not just
// rounds/rtp/hitFrequency) is verified against the real ParallelSimulationRunner output, not a fixture.
describe("runSmokeSimulation", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-smoke-simulation-test-"));
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("simulates a real generated random package and reports finite rounds/roundsRequested/maxWin/averageBet", async () => {
        const {blueprint, seed} = new RandomGameBlueprintGenerator().generate({seed: 4242});
        const {projectRoot} = new GamePackageGenerator("1.3.0").generate(blueprint, workDir);

        const outcome = await runSmokeSimulation(projectRoot, seed);

        expect(outcome.ok).toBe(true);
        if (!outcome.ok) {
            throw new Error("expected a successful outcome");
        }
        expect(outcome.roundsRequested).toBe(200);
        expect(outcome.rounds).toBe(outcome.roundsRequested);
        expect(Number.isFinite(outcome.rtp)).toBe(true);
        expect(Number.isFinite(outcome.hitFrequency)).toBe(true);
        expect(Number.isFinite(outcome.maxWin)).toBe(true);
        expect(outcome.maxWin).toBeGreaterThanOrEqual(0);
        expect(outcome.averageBet).toBeGreaterThan(0);
    });

    it("reports a failure without throwing when the package root doesn't contain a loadable game", async () => {
        const outcome = await runSmokeSimulation(workDir, 1);

        expect(outcome.ok).toBe(false);
    });
});
