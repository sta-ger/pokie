import fs from "fs";
import os from "os";
import path from "path";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";

// End-to-end coverage for reelStripGeneration (see docs/cli.md and
// examples/blueprints/generated-reels.blueprint.json): per-reel build-time generation of exact reel
// strips via the existing ReelStripGenerator, mixed freely with literal reels in the same blueprint.
// Exercises the real shipped example so it stays in sync with what "pokie build" actually does,
// mirroring BuildWorkflow.integration.test.ts's use of sample-slot.blueprint.json for the
// literal-reelStrips (and symbolWeights) path.
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

    it("builds the package with every reel materialized as a plain literal array — the runtime module never touches the generation API", async () => {
        const exitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--out", outDir]);
        expect(exitCode).toBe(0);

        const indexJs = fs.readFileSync(path.join(outDir, "dist", "index.js"), "utf-8");
        const embedded = JSON.parse(indexJs.match(/const blueprint = ([\s\S]*?);\n\n/)![1]);

        // The materialized blueprint embedded in the generated module carries plain reelStrips, and
        // the per-reel generation config that produced them is gone — the runtime module only ever
        // sees the same "reelStrips" shape a literal-reelStrips blueprint would have used.
        expect(Object.keys(embedded)).not.toContain("reelStripGeneration");
        expect(embedded.reelStrips).toHaveLength(5);
        expect(embedded.reelStrips[0]).toEqual([
            "A",
            "10",
            "K",
            "10",
            "Q",
            "10",
            "J",
            "10",
            "A",
            "10",
            "K",
            "10",
            "Q",
            "10",
            "J",
            "10",
            "S",
            "W",
        ]);
        expect(embedded.reelStrips[1]).toHaveLength(30);
        expect(embedded.reelStrips[2]).toHaveLength(28);
        expect(embedded.reelStrips[3]).toHaveLength(34);
        expect(embedded.reelStrips[4]).toHaveLength(24);

        // The generated module's own require() list is the runtime contract: only ordinary
        // session/config primitives, never anything from the reel-generation API.
        expect(indexJs).toContain('require("pokie")');
        expect(indexJs).not.toContain("ReelStripGenerator");
        expect(indexJs).not.toContain("ReelStripConstraint");
    });

    it("honors each generated reel's own lockedPositions when materializing it into the built module -- a built package carries no separate reelStripGeneration provenance of its own", async () => {
        const exitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--out", outDir]);
        expect(exitCode).toBe(0);

        const indexJs = fs.readFileSync(path.join(outDir, "dist", "index.js"), "utf-8");
        const embedded = JSON.parse(indexJs.match(/const blueprint = ([\s\S]*?);\n\n/)![1]);

        // Reel 3's generation config declares lockedPositions: {0: "W"} (see the shipped example
        // blueprint) -- materialized straight into the plain reelStrips array embedded in dist/index.js.
        expect(embedded.reelStrips[3][0]).toBe("W");
    });

    it("stores exact, ready-to-use strips: every generated reel has its own declared length and exact symbol counts", async () => {
        const exitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--out", outDir]);
        expect(exitCode).toBe(0);

        const indexJs = fs.readFileSync(path.join(outDir, "dist", "index.js"), "utf-8");
        const embedded = JSON.parse(indexJs.match(/const blueprint = ([\s\S]*?);\n\n/)![1]);

        const countsOf = (strip: string[]) => {
            const counts: Record<string, number> = {};
            for (const symbolId of strip) {
                counts[symbolId] = (counts[symbolId] ?? 0) + 1;
            }
            return counts;
        };

        // Reel 3 uses symbolCounts directly, so its exact per-symbol counts are known up front.
        expect(countsOf(embedded.reelStrips[3])).toEqual({A: 4, K: 5, Q: 7, J: 9, "10": 7, W: 1, S: 1});
    });

    it("is deterministic: building the same blueprint twice, into separate directories, produces byte-identical output", async () => {
        const outDirA = path.join(workDir, "built-game-a");
        const outDirB = path.join(workDir, "built-game-b");

        const first = await new BuildCommand("1.3.0").run([blueprintPath, "--out", outDirA]);
        expect(first).toBe(0);
        const second = await new BuildCommand("1.3.0").run([blueprintPath, "--out", outDirB]);
        expect(second).toBe(0);

        const indexJsA = fs.readFileSync(path.join(outDirA, "dist", "index.js"), "utf-8");
        const indexJsB = fs.readFileSync(path.join(outDirB, "dist", "index.js"), "utf-8");
        expect(indexJsB).toBe(indexJsA);
    });

    it("refuses to rebuild into the same --out once it's already populated -- there is no rebuild/merge recognition", async () => {
        const first = await new BuildCommand("1.3.0").run([blueprintPath, "--out", outDir]);
        expect(first).toBe(0);

        await expect(new BuildCommand("1.3.0").run([blueprintPath, "--out", outDir])).rejects.toThrow(/already exists and is not empty/);
    });

    it("reports a clear per-reel build-time error, via pokie build, when one reel's constraints are unsatisfiable", async () => {
        const blueprint = {
            manifest: {id: "unsatisfiable", name: "Unsatisfiable", version: "0.1.0"},
            reels: 3,
            rows: 3,
            symbols: ["A", "W"],
            wilds: ["W"],
            paytable: {A: {3: 5}},
            reelStripGeneration: [
                {type: "literal", strip: ["A", "W"]},
                {
                    type: "generated",
                    length: 4,
                    symbolCounts: {A: 2, W: 2},
                    seed: 1,
                    maxAttempts: 3,
                    // Two "W"s on a 4-long strip always split the circle into two gaps summing to 4,
                    // so both can never simultaneously be <= 1 -- no arrangement can ever satisfy this.
                    constraints: [{type: "maximumCircularDistance", maximumDistance: 1, symbolIds: ["W"]}],
                },
                {type: "literal", strip: ["A", "W"]},
            ],
        };
        const badBlueprintPath = path.join(workDir, "unsatisfiable.blueprint.json");
        fs.writeFileSync(badBlueprintPath, JSON.stringify(blueprint));

        const exitCode = await new BuildCommand("1.3.0").run([badBlueprintPath, "--out", outDir]);

        expect(exitCode).toBe(1);
        expect(fs.existsSync(outDir)).toBe(false);
        const printedErrors = (console.error as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
        expect(printedErrors).toContain("could not generate its reel strips");
        expect(printedErrors).toContain("reel 1");
        expect(printedErrors).toContain("maximum-circular-distance");
    });
});
