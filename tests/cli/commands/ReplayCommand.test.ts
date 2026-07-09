import {GameSessionHandling, loadPokieGame, PokieGame, PokieGameManifest, ReplayDescriptor} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {ReplayCommand} from "../../../cli/commands/ReplayCommand";

function createFakeSession(): GameSessionHandling & {getSymbolsCombination(): {toMatrix(): string[][]}} {
    let credits = 1000;
    const bet = 1;
    let round = 0;
    let winAmount = 0;

    return {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: () => undefined,
        getAvailableBets: () => [1],
        canPlayNextGame: () => credits >= bet,
        play: () => {
            round++;
            winAmount = round % 5 === 0 ? bet * 10 : 0;
            credits = credits - bet + winAmount;
        },
        getWinAmount: () => winAmount,
        getSymbolsCombination: () => ({toMatrix: () => [[`round-${round}`]]}),
    };
}

function createFakeGame(manifest: PokieGameManifest): PokieGame & {createdWith?: unknown} {
    return {
        getManifest: () => manifest,
        createSession(context) {
            this.createdWith = context;
            return createFakeSession();
        },
    };
}

describe("ReplayCommand", () => {
    const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

    it("has the expected name and description", () => {
        const command = new ReplayCommand();

        expect(command.getName()).toBe("replay");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without a packageRoot", async () => {
        const command = new ReplayCommand();

        await expect(command.run([])).rejects.toThrow(/Usage: pokie replay <packageRoot>/);
    });

    it("throws a descriptive error when --round is missing", async () => {
        const command = new ReplayCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game"])).rejects.toThrow(/--round is required/);
    });

    it("throws a descriptive error for a non-positive --round", async () => {
        const command = new ReplayCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--round", "0"])).rejects.toThrow(/--round must be a positive integer/);
    });

    it("throws a descriptive error for a missing --seed value", async () => {
        const command = new ReplayCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--round", "1", "--seed"])).rejects.toThrow(/--seed requires a value/);
    });

    it("throws a descriptive error for an unknown option", async () => {
        const command = new ReplayCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--round", "1", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("loads the game via the injected loader and forwards the seed as context", async () => {
        const game = createFakeGame(manifest);
        const command = new ReplayCommand(() => Promise.resolve(game));
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./crazy-fruits", "--seed", "demo", "--round", "3"]);

        expect(game.createdWith).toEqual({seed: "demo"});

        (console.log as jest.Mock).mockRestore();
    });

    it("prints a machine-readable JSON replay descriptor to stdout", async () => {
        const command = new ReplayCommand(() => Promise.resolve(createFakeGame(manifest)));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./crazy-fruits", "--seed", "demo", "--round", "3"]);

        expect(logSpy).toHaveBeenCalledTimes(1);
        const descriptor = JSON.parse(logSpy.mock.calls[0][0]) as ReplayDescriptor;
        expect(descriptor.game).toEqual(manifest);
        expect(descriptor.seed).toBe("demo");
        expect(descriptor.round).toBe(3);

        logSpy.mockRestore();
    });

    it("writes the JSON replay artifact when --out is given", async () => {
        const writeFile = jest.fn();
        const command = new ReplayCommand(() => Promise.resolve(createFakeGame(manifest)), writeFile);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./crazy-fruits", "--seed", "demo", "--round", "3", "--out", "replay.json"]);

        expect(writeFile).toHaveBeenCalledTimes(1);
        const [file, contents] = writeFile.mock.calls[0];
        expect(file).toBe("replay.json");
        const descriptor = JSON.parse(contents) as ReplayDescriptor;
        expect(descriptor.round).toBe(3);

        (console.log as jest.Mock).mockRestore();
    });
});

describe("ReplayCommand (integration, real loadPokieGame + fixture game package)", () => {
    const fixtureRoot = path.join(__dirname, "..", "fixtures", "playable-game");
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-replay-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("loads a real game package and writes a replay artifact", async () => {
        const command = new ReplayCommand(loadPokieGame);
        const outFile = path.join(outDir, "replay.json");

        await command.run([fixtureRoot, "--seed", "demo", "--round", "5", "--out", outFile]);

        expect(fs.existsSync(outFile)).toBe(true);
        const descriptor = JSON.parse(fs.readFileSync(outFile, "utf-8")) as ReplayDescriptor;
        expect(descriptor.game).toEqual({id: "playable-game", name: "Playable Game", version: "1.0.0"});
        expect(descriptor.seed).toBe("demo");
        expect(descriptor.round).toBe(5);
        expect(Array.isArray(descriptor.screen)).toBe(true);
    });

    it("produces the same replay JSON (aside from timestamp/durationMs) for the same seed and round", async () => {
        const command = new ReplayCommand(loadPokieGame);
        const firstFile = path.join(outDir, "first.json");
        const secondFile = path.join(outDir, "second.json");

        await command.run([fixtureRoot, "--seed", "reproducible-seed", "--round", "4", "--out", firstFile]);
        await command.run([fixtureRoot, "--seed", "reproducible-seed", "--round", "4", "--out", secondFile]);

        const first = JSON.parse(fs.readFileSync(firstFile, "utf-8")) as ReplayDescriptor;
        const second = JSON.parse(fs.readFileSync(secondFile, "utf-8")) as ReplayDescriptor;

        expect(first.totalBet).toBe(second.totalBet);
        expect(first.totalWin).toBe(second.totalWin);
        expect(first.screen).toEqual(second.screen);
    });

    it("throws a clear error for an invalid packageRoot", async () => {
        const command = new ReplayCommand(loadPokieGame);

        await expect(command.run([path.join(outDir, "does-not-exist"), "--round", "1"])).rejects.toThrow(/package\.json/);
    });
});
