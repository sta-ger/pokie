import {SimulationReport} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {DiffCommand} from "../../../cli/commands/DiffCommand.js";
import {SimCommand} from "../../../cli/commands/SimCommand.js";

const left: SimulationReport = {
    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    requestedRounds: 10000,
    rounds: 9800,
    seed: "demo",
    totalBet: 9800,
    totalWin: 9331.4,
    rtp: 0.9522,
    hitFrequency: 0.241,
    maxWin: 120.5,
    durationMs: 1234,
    spinsPerSecond: 7942,
    reproducibility: {
        game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        seed: "demo",
        requestedRounds: 10000,
        actualRounds: 9800,
        command: "pokie sim <packageRoot> --rounds 10000 --seed demo",
    },
    warnings: [],
    recommendations: [],
};

const right: SimulationReport = {
    ...left,
    rounds: 9850,
    totalBet: 9850,
    totalWin: 9400,
    rtp: 0.98,
    hitFrequency: 0.245,
    maxWin: 250,
    durationMs: 1300,
    spinsPerSecond: 7900,
};

function createStubReadFile(files: Record<string, string>): (file: string) => string {
    return (file: string) => {
        if (!(file in files)) {
            const error = new Error(`ENOENT: no such file or directory, open '${file}'`) as NodeJS.ErrnoException;
            error.code = "ENOENT";
            throw error;
        }
        return files[file];
    };
}

describe("DiffCommand", () => {
    it("has the expected name and description", () => {
        const command = new DiffCommand();

        expect(command.getName()).toBe("diff");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without both report paths", async () => {
        const command = new DiffCommand();

        await expect(command.run([])).rejects.toThrow(/Usage: pokie diff <leftReportJson> <rightReportJson>/);
        await expect(command.run(["only-left.json"])).rejects.toThrow(/Usage: pokie diff <leftReportJson> <rightReportJson>/);
    });

    it("throws a descriptive error for an unknown option", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}));

        await expect(command.run(["left.json", "right.json", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("throws a descriptive error when --format is not json", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}));

        await expect(command.run(["left.json", "right.json", "--format", "xml"])).rejects.toThrow(/--format only supports "json"/);
    });

    it("throws a descriptive error when --out has no value", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}));

        await expect(command.run(["left.json", "right.json", "--out"])).rejects.toThrow(/--out requires a file path/);
    });

    it("throws a clear error when a report file does not exist", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left)}));

        await expect(command.run(["left.json", "missing.json"])).rejects.toThrow(/Could not read simulation report at "missing\.json"/);
    });

    it("throws a clear error when a report file is not valid JSON", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "broken.json": "{not json"}));

        await expect(command.run(["left.json", "broken.json"])).rejects.toThrow(/"broken\.json" is not valid JSON/);
    });

    it("throws a clear error when the JSON does not look like a simulation report", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "other.json": JSON.stringify({foo: "bar"})}));

        await expect(command.run(["left.json", "other.json"])).rejects.toThrow(/does not look like a pokie sim report/);
    });

    it("prints a human-readable diff to the console by default", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Diff: Crazy Fruits (id: "crazy-fruits")');
        expect(printed).toContain("rounds          9800 -> 9850");
        expect(printed).toContain("rtp             95.22% -> 98.00%");

        logSpy.mockRestore();
    });

    it("includes a Warnings section when RTP/hit frequency/max win change noticeably", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("Warnings:");
        expect(printed).toContain("RTP changed by");
        expect(printed).toContain("Max win changed by");

        logSpy.mockRestore();
    });

    it("prints JSON to the console when --format json is given", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json", "--format", "json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        const parsed = JSON.parse(printed);
        expect(parsed.game).toEqual({
            left: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            right: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            changed: false,
        });
        expect(parsed.rtp.left).toBe(0.9522);
        expect(parsed.rtp.right).toBe(0.98);
        expect(Array.isArray(parsed.warnings)).toBe(true);
        expect(parsed.warnings.length).toBeGreaterThan(0);

        logSpy.mockRestore();
    });

    it("writes the JSON diff to --out and logs a confirmation", async () => {
        const writeFile = jest.fn();
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}), writeFile);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json", "--out", "diff.json"]);

        expect(writeFile).toHaveBeenCalledTimes(1);
        const [file, contents] = writeFile.mock.calls[0];
        expect(file).toBe("diff.json");
        const parsed = JSON.parse(contents);
        expect(parsed.rounds).toEqual({left: 9800, right: 9850, delta: 50, percentDelta: parsed.rounds.percentDelta});

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Diff written to "diff.json".');

        logSpy.mockRestore();
    });

    it("does not write a file when --out is not given", async () => {
        const writeFile = jest.fn();
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}), writeFile);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json"]);

        expect(writeFile).not.toHaveBeenCalled();

        (console.log as jest.Mock).mockRestore();
    });
});

describe("DiffCommand (integration, real pokie sim output)", () => {
    const fixtureRoot = path.join(__dirname, "..", "fixtures", "playable-game");
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-diff-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("diffs two reports produced by pokie sim --out", async () => {
        const leftFile = path.join(outDir, "left.json");
        const rightFile = path.join(outDir, "right.json");
        await new SimCommand().run([fixtureRoot, "--rounds", "100", "--seed", "demo", "--out", leftFile]);
        await new SimCommand().run([fixtureRoot, "--rounds", "200", "--seed", "demo", "--out", rightFile]);

        const diffOut = path.join(outDir, "diff.json");
        await new DiffCommand().run([leftFile, rightFile, "--out", diffOut]);

        const diff = JSON.parse(fs.readFileSync(diffOut, "utf-8"));
        expect(diff.rounds.left).toBe(100);
        expect(diff.rounds.right).toBe(200);
        expect(diff.game.changed).toBe(false);
    });
});
