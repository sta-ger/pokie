import {
    GameSessionHandling,
    loadPokieGame,
    OutcomeLibraryBundleWriter,
    OutcomeSourceReplayResult,
    PokieGame,
    PokieGameManifest,
    PokieProject,
    PROJECT_TYPE_CAPABILITIES,
    ProjectResolving,
    ProjectTargetResolver,
    ReplayDescriptor,
} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {ReplayCommand} from "../../../cli/commands/ReplayCommand.js";
import {buildOutcomeLibraryBundleModeInput} from "../../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

function stubProjectResolver(project: PokieProject | undefined): ProjectResolving & {calls: string[]} {
    const calls: string[] = [];
    return {
        calls,
        resolve(targetPath: string) {
            calls.push(targetPath);
            return Promise.resolve(project);
        },
    };
}

function stubReplayOutcomeSource(
    result: OutcomeSourceReplayResult,
): ((project: PokieProject, modeName: string, seed: string, round: number) => Promise<OutcomeSourceReplayResult>) & {
    calls: {project: PokieProject; modeName: string; seed: string; round: number}[];
} {
    const calls: {project: PokieProject; modeName: string; seed: string; round: number}[] = [];
    const fn = (project: PokieProject, modeName: string, seed: string, round: number) => {
        calls.push({project, modeName, seed, round});
        return Promise.resolve(result);
    };
    return Object.assign(fn, {calls});
}

const outcomeLibraryProject: PokieProject = {
    type: "outcomeLibrary",
    rootPath: "/libraries/base",
    capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
    provenance: "test fixture",
};

const stakeAdapterProject: PokieProject = {
    type: "stakeAdapter",
    rootPath: "/stake/base",
    capabilities: PROJECT_TYPE_CAPABILITIES.stakeAdapter,
    provenance: "test fixture",
};

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
    const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

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

        await command.run(["./sample-slot", "--seed", "demo", "--round", "3"]);

        expect(game.createdWith).toEqual({seed: "demo"});

        (console.log as jest.Mock).mockRestore();
    });

    it("prints a machine-readable JSON replay descriptor to stdout", async () => {
        const command = new ReplayCommand(() => Promise.resolve(createFakeGame(manifest)));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./sample-slot", "--seed", "demo", "--round", "3"]);

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

        await command.run(["./sample-slot", "--seed", "demo", "--round", "3", "--out", "replay.json"]);

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

// Proves "pokie replay" crosses the shared runtime-package-materialization boundary (see
// materializeRuntimePackage.ts) exactly once per invocation, and only ever loads against whatever
// runtime path that boundary hands back -- never the caller's own raw packageRoot.
describe("ReplayCommand runtime package materialization boundary", () => {
    const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

    it("resolves the raw packageRoot once and replays against the resolved runtime path instead", async () => {
        const rawPackageRoot = "/blueprints/raw-game.json";
        const resolvedRuntimePath = "/materialized/raw-game";
        const resolveCalls: string[] = [];
        const resolveRuntimePackageRoot = (packageRoot: string) => {
            resolveCalls.push(packageRoot);
            return Promise.resolve({runtimePath: resolvedRuntimePath, release: () => Promise.resolve()});
        };
        const loadCalls: string[] = [];
        const loadGame = (packageRoot: string) => {
            loadCalls.push(packageRoot);
            return Promise.resolve(createFakeGame(manifest));
        };
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const command = new ReplayCommand(loadGame, undefined, undefined, resolveRuntimePackageRoot);

        await command.run([rawPackageRoot, "--round", "1"]);

        logSpy.mockRestore();
        expect(resolveCalls).toEqual([rawPackageRoot]);
        expect(loadCalls).toEqual([resolvedRuntimePath]);
    });

    it("propagates a materialization failure without ever loading or replaying the game", async () => {
        const resolveRuntimePackageRoot = () => Promise.reject(new Error("dependencies phase failed"));
        const loadGame = jest.fn(() => Promise.resolve(createFakeGame(manifest)));
        const command = new ReplayCommand(loadGame, undefined, undefined, resolveRuntimePackageRoot);

        await expect(command.run(["/blueprints/raw-game.json", "--round", "1"])).rejects.toThrow(/dependencies phase failed/);
        expect(loadGame).not.toHaveBeenCalled();
    });
});

// Proves P3-POLISH-21's own replay-side outcome-source boundary: a resolved "outcomeLibrary" project is
// routed through the canonical outcome-source selector/session path (replayOutcomeSourceProject) instead of
// resolveRuntimePackageRoot/loadGame, while a resolved "stakeAdapter" project surfaces the same structured
// missing-capability diagnostic every other unsupported-operation attempt does -- and never reaches
// loadGame either.
describe("ReplayCommand outcome-source routing", () => {
    it("throws when --mode is omitted for a resolved native outcome-library project", async () => {
        const resolveProject = stubProjectResolver(outcomeLibraryProject);
        const loadGame = jest.fn();
        const command = new ReplayCommand(loadGame, undefined, undefined, undefined, resolveProject);

        await expect(command.run(["/libraries/base", "--round", "1", "--seed", "demo"])).rejects.toThrow(/--mode is required/);
        expect(loadGame).not.toHaveBeenCalled();
    });

    it("throws when --seed is omitted for a resolved native outcome-library project", async () => {
        const resolveProject = stubProjectResolver(outcomeLibraryProject);
        const loadGame = jest.fn();
        const command = new ReplayCommand(loadGame, undefined, undefined, undefined, resolveProject);

        await expect(command.run(["/libraries/base", "--round", "1", "--mode", "base"])).rejects.toThrow(/--seed is required/);
        expect(loadGame).not.toHaveBeenCalled();
    });

    it("replays a resolved native outcome-library round through the injected outcome-source replay function, never loading the game", async () => {
        const resolveProject = stubProjectResolver(outcomeLibraryProject);
        const replay = stubReplayOutcomeSource({
            supported: true,
            replay: {
                libraryId: "base-lib",
                libraryHash: "sha256:abc",
                seed: "demo-seed",
                round: 3,
                outcomeId: "2",
                weight: 150,
                totalWin: 5,
                payoutMultiplier: 5,
                timestamp: 0,
                durationMs: 1,
            },
        });
        const loadGame = jest.fn();
        const command = new ReplayCommand(loadGame, undefined, undefined, undefined, resolveProject, replay);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["/libraries/base", "--round", "3", "--seed", "demo-seed", "--mode", "base"]);

        expect(replay.calls).toEqual([{project: outcomeLibraryProject, modeName: "base", seed: "demo-seed", round: 3}]);
        expect(loadGame).not.toHaveBeenCalled();
        const descriptor = JSON.parse(logSpy.mock.calls[0][0]) as {outcomeId: string; libraryId: string};
        expect(descriptor.outcomeId).toBe("2");
        expect(descriptor.libraryId).toBe("base-lib");

        logSpy.mockRestore();
    });

    it("throws the capability diagnostic, rather than attempting package-runtime execution, for a resolved Stake Engine project", async () => {
        const resolveProject = stubProjectResolver(stakeAdapterProject);
        const replay = stubReplayOutcomeSource({
            supported: false,
            diagnostic: {
                detectedType: "stakeAdapter",
                operation: "outcomeSource.replay",
                missingCapability: "outcomeSource.sample",
                alternatives: ["outcomeLibrary"],
                message: '"outcomeSource.replay" is not supported for a "stakeAdapter" project (missing the "outcomeSource.sample" capability). Supported by: outcomeLibrary.',
            },
        });
        const loadGame = jest.fn();
        const command = new ReplayCommand(loadGame, undefined, undefined, undefined, resolveProject, replay);

        await expect(command.run(["/stake/base", "--round", "1", "--seed", "demo", "--mode", "base"])).rejects.toThrow(
            /"outcomeSource\.replay" is not supported for a "stakeAdapter" project/,
        );
        expect(loadGame).not.toHaveBeenCalled();
    });
});

// Real, non-stubbed end-to-end coverage: a real, on-disk outcome-library bundle (built by
// OutcomeLibraryBundleWriter, not mocked), resolved and replayed through the same
// ProjectTargetResolver/replayOutcomeSourceProject path the unit tests above stub out.
describe("ReplayCommand outcome-source routing (integration, real outcome-library bundle)", () => {
    let bundleDir: string;

    beforeEach(async () => {
        bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-replay-outcomesource-test-"));
        fs.rmdirSync(bundleDir);
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
    });

    afterEach(() => {
        fs.rmSync(bundleDir, {recursive: true, force: true});
    });

    it("replays a real bundle's round through the real outcome-source selector path, never loading a game", async () => {
        const loadGame = jest.fn();
        const command = new ReplayCommand(loadGame, undefined, undefined, undefined, new ProjectTargetResolver());
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run([bundleDir, "--round", "1", "--seed", "replay-seed", "--mode", "base"]);

        expect(loadGame).not.toHaveBeenCalled();
        const descriptor = JSON.parse(logSpy.mock.calls[0][0]) as {libraryId: string; outcomeId: string};
        expect(descriptor.libraryId).toBe("base-lib");
        expect(typeof descriptor.outcomeId).toBe("string");

        logSpy.mockRestore();
    });
});
