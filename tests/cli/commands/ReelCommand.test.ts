import {GameBlueprint} from "pokie";
import {ReelCommand} from "../../../cli/commands/ReelCommand.js";

const baseBlueprint: GameBlueprint = {
    manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
    reels: 3,
    rows: 3,
    symbols: ["A", "B"],
    paytable: {A: {"3": 5}},
    reelStrips: [["A", "B", "A", "B"], ["X", "X", "X", "X"]],
    reelStripGeneration: [
        {type: "literal", strip: ["A", "B", "A"]},
        {type: "generated", length: 4, symbolCounts: {A: 2, B: 2}, seed: 42},
        {type: "generated", length: 4, symbolCounts: {A: 2, B: 2}, seed: 43},
    ],
};

const noReelStripGenerationBlueprint: GameBlueprint = {
    manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
    reels: 1,
    rows: 3,
    symbols: ["A"],
    paytable: {A: {"3": 5}},
};

const allLiteralBlueprint: GameBlueprint = {
    ...noReelStripGenerationBlueprint,
    reelStripGeneration: [{type: "literal", strip: ["A", "A", "A"]}],
};

const impossibleBlueprint: GameBlueprint = {
    manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
    reels: 1,
    rows: 3,
    symbols: ["A"],
    paytable: {A: {"3": 5}},
    reelStripGeneration: [
        {
            type: "generated",
            length: 4,
            symbolCounts: {A: 4},
            seed: 1,
            maxAttempts: 3,
            constraints: [{type: "forbiddenSequence", sequence: ["A", "A"], maximumOccurrences: 0}],
        },
    ],
};

function loaderFor(blueprint: unknown): (filePath: string) => unknown {
    return () => blueprint;
}

describe("ReelCommand", () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    it("has the expected name and description", () => {
        const command = new ReelCommand(loaderFor(baseBlueprint));

        expect(command.getName()).toBe("reel");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("rejects when run with no subcommand", async () => {
        const command = new ReelCommand(loaderFor(baseBlueprint));

        await expect(command.run([])).rejects.toThrow(/Usage: pokie reel generate/);
    });

    it("rejects on an unknown subcommand", async () => {
        const command = new ReelCommand(loaderFor(baseBlueprint));

        await expect(command.run(["bogus"])).rejects.toThrow(/Usage: pokie reel generate/);
    });

    it("throws a descriptive error when no blueprint path is given", async () => {
        const command = new ReelCommand(loaderFor(baseBlueprint));

        await expect(command.run(["generate"])).rejects.toThrow(/Usage: pokie reel generate <blueprint\.json>/);
    });

    it("throws when the blueprint has no reelStripGeneration at all", async () => {
        const command = new ReelCommand(loaderFor(noReelStripGenerationBlueprint));

        await expect(command.run(["generate", "game.json"])).rejects.toThrow(/has no "reelStripGeneration" entries/);
    });

    it("throws when every reelStripGeneration entry is already literal", async () => {
        const command = new ReelCommand(loaderFor(allLiteralBlueprint));

        await expect(command.run(["generate", "game.json"])).rejects.toThrow(/every reel is already literal/);
    });

    it("throws when --reel is out of range", async () => {
        const command = new ReelCommand(loaderFor(baseBlueprint));

        await expect(command.run(["generate", "game.json", "--reel", "9"])).rejects.toThrow(/--reel 9 is out of range/);
    });

    it("throws when --reel points at a literal reel", async () => {
        const command = new ReelCommand(loaderFor(baseBlueprint));

        await expect(command.run(["generate", "game.json", "--reel", "0"])).rejects.toThrow(/is a literal strip, not "generated"/);
    });

    it("throws on an unrecognized --format value", async () => {
        const command = new ReelCommand(loaderFor(baseBlueprint));

        await expect(command.run(["generate", "game.json", "--format", "xml"])).rejects.toThrow(/--format only supports "json"/);
    });

    it("throws on --out with no value", async () => {
        const command = new ReelCommand(loaderFor(baseBlueprint));

        await expect(command.run(["generate", "game.json", "--out"])).rejects.toThrow(/--out requires a file path/);
    });

    it("throws on an unknown option", async () => {
        const command = new ReelCommand(loaderFor(baseBlueprint));

        await expect(command.run(["generate", "game.json", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("previews every generated reel by default, writes nothing, and returns 0", async () => {
        const writeFile = jest.fn();
        const command = new ReelCommand(loaderFor(baseBlueprint), writeFile);

        const exitCode = await command.run(["generate", "game.json"]);

        expect(exitCode).toBe(0);
        expect(writeFile).not.toHaveBeenCalled();
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("reel 1");
        expect(printed).toContain("reel 2");
        expect(printed).not.toContain("reel 0");
        expect(printed).toContain("Dry run -- no files written");
    });

    it("--reel <index> targets only that reel", async () => {
        const writeFile = jest.fn();
        const command = new ReelCommand(loaderFor(baseBlueprint), writeFile);

        const exitCode = await command.run(["generate", "game.json", "--reel", "1", "--format", "json"]);

        expect(exitCode).toBe(0);
        expect(writeFile).not.toHaveBeenCalled();
        const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
        expect(parsed.reels).toHaveLength(1);
        expect(parsed.reels[0].reelIndex).toBe(1);
        expect(parsed.reels[0].success).toBe(true);
        expect(parsed.applied).toBe(false);
    });

    it("--seed overrides every targeted reel's own seed for this run only", async () => {
        const command = new ReelCommand(loaderFor(baseBlueprint));

        await command.run(["generate", "game.json", "--reel", "1", "--seed", "999", "--format", "json"]);

        const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
        expect(parsed.reels[0].seed).toBe(999);
    });

    it("--apply writes the resolved strips back as literal entries, defaulting --out to the blueprint path", async () => {
        const writeFile = jest.fn();
        const command = new ReelCommand(loaderFor(baseBlueprint), writeFile);

        const exitCode = await command.run(["generate", "game.json", "--apply"]);

        expect(exitCode).toBe(0);
        expect(writeFile).toHaveBeenCalledTimes(1);
        const [path, contents] = writeFile.mock.calls[0];
        expect(path).toBe("game.json");
        const written = JSON.parse(contents as string) as GameBlueprint;
        expect(written.reelStripGeneration?.[0]).toEqual({type: "literal", strip: ["A", "B", "A"]});
        expect(written.reelStripGeneration?.[1].type).toBe("literal");
        expect(written.reelStripGeneration?.[2].type).toBe("literal");
        expect((written.reelStripGeneration?.[1] as {strip: string[]}).strip).toHaveLength(4);
    });

    it("--apply --out <file> writes to the given path instead of overwriting the input", async () => {
        const writeFile = jest.fn();
        const command = new ReelCommand(loaderFor(baseBlueprint), writeFile);

        await command.run(["generate", "game.json", "--reel", "1", "--apply", "--out", "custom.json"]);

        expect(writeFile).toHaveBeenCalledTimes(1);
        expect(writeFile.mock.calls[0][0]).toBe("custom.json");
    });

    it("does not write anything (even with --apply) and returns 1 when a targeted reel's constraints are unsatisfiable", async () => {
        const writeFile = jest.fn();
        const command = new ReelCommand(loaderFor(impossibleBlueprint), writeFile);

        const exitCode = await command.run(["generate", "game.json", "--apply", "--format", "json"]);

        expect(exitCode).toBe(1);
        expect(writeFile).not.toHaveBeenCalled();
        const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
        expect(parsed.applied).toBe(false);
        expect(parsed.reels[0].success).toBe(false);
        expect(parsed.reels[0].diagnostics.length).toBeGreaterThan(0);
    });

    it("prints a diff count against the existing reelStrips entry when one is present", async () => {
        const command = new ReelCommand(loaderFor(baseBlueprint));

        await command.run(["generate", "game.json", "--reel", "1", "--seed", "42"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toMatch(/position\(s\) differ from the current reelStrips\[1\]/);
    });
});
