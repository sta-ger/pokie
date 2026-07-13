import fs from "fs";
import os from "os";
import path from "path";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";

// End-to-end coverage for reelStripGeneration (see docs/cli.md and
// examples/blueprints/generated-reels.blueprint.json): build-time generation of exact reel strips via
// the existing ReelStripGenerator, as an alternative to a literal reelStrips array. Exercises the
// real shipped example so it stays in sync with what "pokie build" actually does, mirroring
// BuildWorkflow.integration.test.ts's use of crazy-fruits.blueprint.json for the literal-reelStrips
// (and symbolWeights) path.
describe("CLI workflow (integration): pokie build with reelStripGeneration", () => {
    const blueprintPath = path.join(__dirname, "..", "..", "examples", "blueprints", "generated-reels.blueprint.json");

    let workDir: string;
    let outDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-build-generated-reels-test-"));
        outDir = path.join(workDir, "built-game");
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
        (console.error as jest.Mock).mockRestore();
    });

    it("builds the package with reelStrips already materialized as a plain literal array — the runtime module never touches the generation API", async () => {
        const exitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--out", outDir]);
        expect(exitCode).toBe(0);

        const indexJs = fs.readFileSync(path.join(outDir, "src", "generated", "index.js"), "utf-8");
        const embedded = JSON.parse(indexJs.match(/const blueprint = ([\s\S]*?);\n\n/)![1]);

        // The materialized blueprint embedded in the generated module carries plain reelStrips, and
        // the generation config that produced them is gone — the runtime module only ever sees the
        // same "reelStrips" shape a literal-reelStrips blueprint would have used.
        expect(Object.keys(embedded)).not.toContain("reelStripGeneration");
        expect(embedded.reelStrips).toHaveLength(5);

        // The generated module's own require() list is the runtime contract: only ordinary
        // session/config primitives, never anything from the reel-generation API.
        expect(indexJs).toContain('require("pokie")');
        expect(indexJs).not.toContain("ReelStripGenerator");
        expect(indexJs).not.toContain("ReelStripConstraint");
    });

    it("records the seed, the original reelStripGeneration config, and a per-reel result in build-info.json", async () => {
        const exitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--out", outDir]);
        expect(exitCode).toBe(0);

        const buildInfo = JSON.parse(fs.readFileSync(path.join(outDir, "src", "generated", "build-info.json"), "utf-8"));

        expect(buildInfo.reelStripGeneration.config.seed).toBe(20260713);
        expect(buildInfo.reelStripGeneration.config.symbolWeights).toEqual({A: 4, K: 6, Q: 8, J: 10, "10": 12, W: 2, S: 2});
        expect(buildInfo.reelStripGeneration.reels).toHaveLength(5);
        expect(buildInfo.reelStripGeneration.reels.every((reel: {success: boolean}) => reel.success)).toBe(true);
        // Every reel gets a different, deterministically derived seed (base seed + reel index).
        expect(buildInfo.reelStripGeneration.reels.map((reel: {seed: number}) => reel.seed)).toEqual([
            20260713, 20260714, 20260715, 20260716, 20260717,
        ]);
    });

    it("stores exact, ready-to-use strips: every reel has the blueprint's declared length and exact symbol counts", async () => {
        const exitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--out", outDir]);
        expect(exitCode).toBe(0);

        // Read the literal reelStrips straight out of the generated source (it's a plain JSON literal
        // embedded in the file, not something requiring the reels API to interpret).
        const indexJs = fs.readFileSync(path.join(outDir, "src", "generated", "index.js"), "utf-8");
        const embedded = JSON.parse(indexJs.match(/const blueprint = ([\s\S]*?);\n\n/)![1]);

        expect(embedded.reelStrips).toHaveLength(5);
        for (const strip of embedded.reelStrips) {
            expect(strip).toHaveLength(32);
            const counts: Record<string, number> = {};
            for (const symbolId of strip) {
                counts[symbolId] = (counts[symbolId] ?? 0) + 1;
            }
            expect(counts).toEqual({A: 3, K: 4, Q: 6, J: 7, "10": 9, W: 1, S: 2});
        }
    });

    it("is deterministic: rebuilding the unchanged blueprint reports an unchanged/no-op status", async () => {
        const first = await new BuildCommand("1.3.0").run([blueprintPath, "--out", outDir]);
        expect(first).toBe(0);
        const firstIndexJs = fs.readFileSync(path.join(outDir, "src", "generated", "index.js"), "utf-8");

        (console.log as jest.Mock).mockClear();
        const second = await new BuildCommand("1.3.0").run([blueprintPath, "--out", outDir]);
        expect(second).toBe(0);

        const secondIndexJs = fs.readFileSync(path.join(outDir, "src", "generated", "index.js"), "utf-8");
        expect(secondIndexJs).toBe(firstIndexJs);

        const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("status           unchanged — deterministic rebuild");
    });

    it("reports a clear build-time error, via pokie build, when reelStripGeneration's constraints are unsatisfiable", async () => {
        const blueprint = {
            manifest: {id: "unsatisfiable", name: "Unsatisfiable", version: "0.1.0"},
            reels: 3,
            rows: 3,
            symbols: ["A", "W"],
            wilds: ["W"],
            paytable: {A: {3: 5}},
            reelStripGeneration: {
                length: 4,
                symbolCounts: {A: 2, W: 2},
                seed: 1,
                maxAttempts: 3,
                // Two "W"s on a 4-long strip always split the circle into two gaps summing to 4, so
                // both can never simultaneously be <= 1 -- no arrangement can ever satisfy this.
                constraints: [{type: "maximumCircularDistance", maximumDistance: 1, symbolIds: ["W"]}],
            },
        };
        const badBlueprintPath = path.join(workDir, "unsatisfiable.blueprint.json");
        fs.writeFileSync(badBlueprintPath, JSON.stringify(blueprint));

        const exitCode = await new BuildCommand("1.3.0").run([badBlueprintPath, "--out", outDir]);

        expect(exitCode).toBe(1);
        expect(fs.existsSync(outDir)).toBe(false);
        const printedErrors = (console.error as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
        expect(printedErrors).toContain("could not generate its reel strips");
        expect(printedErrors).toContain("maximum-circular-distance");
    });
});
