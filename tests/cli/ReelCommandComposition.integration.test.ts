import fs from "fs";
import os from "os";
import path from "path";
import {GameBlueprint, GameBlueprintValidator, MinimumCircularDistanceConstraint, ReelStrip, StackConstraint} from "pokie";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {ParCommand} from "../../cli/commands/ParCommand.js";
import {ReelCommand} from "../../cli/commands/ReelCommand.js";

// This uses a single authored Blueprint through each public reel-command lifecycle rather than
// stubbing the generator: preview proves the persisted config is executable, --apply proves a
// partial pinned result remains a valid generated Blueprint, and --materialize proves the literal
// snapshot composes directly with the downstream PAR and package builders.
describe("CLI workflow (integration): pokie reel generate composition", () => {
    const blueprint: GameBlueprint = {
        manifest: {id: "reel-composition", name: "Reel Composition", version: "1.0.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "B", "W"],
        wilds: ["W"],
        paytable: {A: {3: 2}, B: {3: 1}},
        reelStripGeneration: [
            {type: "literal", strip: ["A", "B", "W", "B"]},
            {
                type: "generated",
                length: 6,
                symbolCounts: {A: 2, B: 4},
                seed: 71,
                lockedPositions: {0: "A", 5: "A"},
                constraints: [{type: "stack", symbolIds: ["A"], minimumLength: 2, maximumLength: 2, minimumStacks: 1, maximumStacks: 1}],
            },
            {
                type: "generated",
                length: 8,
                symbolWeights: {A: 2, B: 4, W: 2},
                seed: 72,
                lockedPositions: {1: "W", 4: "W"},
                constraints: [{type: "minimumCircularDistance", symbolIds: ["W"], minimumDistance: 3}],
            },
        ],
    };

    let workDir: string;
    let sourcePath: string;
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-reel-composition-"));
        sourcePath = path.join(workDir, "authored.blueprint.json");
        fs.writeFileSync(sourcePath, `${JSON.stringify(blueprint, null, 4)}\n`, "utf-8");
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it("previews deterministic count/weight, locked-stack, and circular-distance configurations without changing the authored Blueprint", async () => {
        const command = new ReelCommand();
        const original = fs.readFileSync(sourcePath, "utf-8");

        expect(await command.run(["generate", sourcePath, "--format", "json"])).toBe(0);
        const firstTranscript = logSpy.mock.calls[0][0] as string;
        expect(await command.run(["generate", sourcePath, "--format", "json"])).toBe(0);
        const secondTranscript = logSpy.mock.calls[1][0] as string;

        expect(secondTranscript).toBe(firstTranscript);
        expect(fs.readFileSync(sourcePath, "utf-8")).toBe(original);

        const preview = JSON.parse(firstTranscript) as {applied: boolean; reels: Array<{reelIndex: number; strip: string[]}>};
        expect(preview.applied).toBe(false);
        expect(preview.reels.map((reel) => reel.reelIndex)).toEqual([1, 2]);

        const stacked = preview.reels[0].strip;
        expect([stacked[0], stacked[stacked.length - 1]]).toEqual(["A", "A"]);
        expect(new StackConstraint(2, 2, 1, 1, ["A"]).validate(new ReelStrip(stacked))).toEqual([]);

        const weighted = preview.reels[1].strip;
        expect([weighted[1], weighted[4]]).toEqual(["W", "W"]);
        expect(new MinimumCircularDistanceConstraint(3, ["W"]).validate(new ReelStrip(weighted))).toEqual([]);
    });

    it("applies a seed-overridden reel to a valid Blueprint that builds with no manual JSON repair", async () => {
        const appliedPath = path.join(workDir, "applied.blueprint.json");
        const packagePath = path.join(workDir, "package");

        expect(await new ReelCommand().run(["generate", sourcePath, "--reel", "1", "--seed", "999", "--apply", "--out", appliedPath, "--format", "json"])).toBe(0);

        const applied = JSON.parse(fs.readFileSync(appliedPath, "utf-8")) as GameBlueprint;
        expect(applied.reelStrips).toBeUndefined();
        expect(applied.reelStripGeneration?.[1].type).toBe("literal");
        expect(applied.reelStripGeneration?.[2]).toEqual(blueprint.reelStripGeneration?.[2]);
        expect(new GameBlueprintValidator().validate(applied).filter((issue) => issue.severity === "error")).toEqual([]);

        expect(await new BuildCommand("1.3.0").run([appliedPath, "--target", "tsPackage", "--out", packagePath])).toBe(0);
        expect(fs.existsSync(path.join(packagePath, "dist", "index.js"))).toBe(true);
    });

    it("materializes the whole Blueprint into a literal source that PAR exports and builds unchanged", async () => {
        const materializedPath = path.join(workDir, "materialized.blueprint.json");
        const workbookPath = path.join(workDir, "materialized.par.xlsx");
        const packagePath = path.join(workDir, "materialized-package");

        expect(await new ReelCommand().run(["generate", sourcePath, "--materialize", "--out", materializedPath, "--format", "json"])).toBe(0);

        const materialized = JSON.parse(fs.readFileSync(materializedPath, "utf-8")) as GameBlueprint;
        expect(materialized.reelStripGeneration).toBeUndefined();
        expect(materialized.reelStrips).toHaveLength(3);
        expect(new GameBlueprintValidator().validate(materialized).filter((issue) => issue.severity === "error")).toEqual([]);

        expect(await new ParCommand("1.3.0").run(["export", materializedPath, "--out", workbookPath])).toBe(0);
        expect(fs.existsSync(workbookPath)).toBe(true);
        expect(await new BuildCommand("1.3.0").run([materializedPath, "--target", "tsPackage", "--out", packagePath])).toBe(0);
        expect(fs.existsSync(path.join(packagePath, "dist", "index.js"))).toBe(true);
    });
});
