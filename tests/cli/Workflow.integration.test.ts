import {
    GameBlueprint,
    GamePackageGenerator,
    loadPokieGame,
    PokieDevServer,
    PokieDevServerHandling,
    ReplayDescriptor,
    SimulationReport,
    SimulationReportDiff,
} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {DiffCommand} from "../../cli/commands/DiffCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {ServeCommand} from "../../cli/commands/ServeCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";

// End-to-end happy path for the v1.3 tool foundation: validate -> sim -> report -> diff -> replay -> serve,
// run as real commands against the same built game package (the "create"/"init" fixtures elsewhere already
// cover scaffolding; this test starts from an already-built package, as create/init leave one after
// "npm install && npm run build").
describe("CLI workflow (integration, real commands chained against one fixture game package)", () => {
    const fixtureRoot = path.join(__dirname, "fixtures", "playable-game");
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-workflow-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("validates, simulates, reports, diffs, replays, and serves the same package", async () => {
        const exitCode = await new ValidateCommand().run([fixtureRoot]);
        expect(exitCode).toBe(0);

        const beforeFile = path.join(outDir, "before.json");
        const afterFile = path.join(outDir, "after.json");
        await new SimCommand().run([fixtureRoot, "--rounds", "500", "--seed", "before", "--out", beforeFile]);
        await new SimCommand().run([fixtureRoot, "--rounds", "500", "--seed", "after", "--out", afterFile]);

        const beforeReport = JSON.parse(fs.readFileSync(beforeFile, "utf-8")) as SimulationReport;
        expect(beforeReport.game).toEqual({id: "playable-game", name: "Playable Game", version: "1.0.0"});
        expect(beforeReport.rounds).toBe(500);
        expect(beforeReport.seed).toBe("before");

        const reportFile = path.join(outDir, "before.md");
        await new ReportCommand().run([beforeFile, "--format", "markdown", "--out", reportFile]);
        expect(fs.readFileSync(reportFile, "utf-8")).toContain("# Simulation Report: Playable Game");

        const diffFile = path.join(outDir, "diff.json");
        await new DiffCommand().run([beforeFile, afterFile, "--out", diffFile]);
        const diff = JSON.parse(fs.readFileSync(diffFile, "utf-8")) as SimulationReportDiff;
        expect(diff.game.changed).toBe(false);
        expect(diff.seed).toEqual({left: "before", right: "after", changed: true});

        const replayFile = path.join(outDir, "replay.json");
        await new ReplayCommand().run([fixtureRoot, "--seed", "before", "--round", "5", "--out", replayFile]);
        const replay = JSON.parse(fs.readFileSync(replayFile, "utf-8")) as ReplayDescriptor;
        expect(replay.game).toEqual({id: "playable-game", name: "Playable Game", version: "1.0.0"});
        expect(replay.round).toBe(5);

        let server: PokieDevServerHandling | undefined;
        const serveCommand = new ServeCommand(loadPokieGame, (game, options) => {
            server = new PokieDevServer(game, options);
            return server;
        });
        await serveCommand.run([fixtureRoot, "--port", "0"]);
        try {
            const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
            const port = Number(printed.match(/http:\/\/127\.0\.0\.1:(\d+)/)![1]);

            const gameResponse = await fetch(`http://127.0.0.1:${port}/game`);
            expect(await gameResponse.json()).toEqual({id: "playable-game", name: "Playable Game", version: "1.0.0"});

            const sessionResponse = await fetch(`http://127.0.0.1:${port}/sessions`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({seed: "before"}),
            });
            const session = (await sessionResponse.json()) as {sessionId: string};
            expect(session.sessionId).toEqual(expect.any(String));

            const spinResponse = await fetch(`http://127.0.0.1:${port}/sessions/${session.sessionId}/spin`, {
                method: "POST",
            });
            expect(spinResponse.status).toBe(200);
        } finally {
            await server!.stop();
        }
    });
});

function buildDeterminismBlueprint(): GameBlueprint {
    return {
        manifest: {id: "seed-determinism-slot", name: "Seed Determinism Slot", version: "1.0.0"},
        reels: 5,
        rows: 3,
        symbols: ["A", "B", "C", "D", "E"],
        paytable: {A: {3: 5}, B: {3: 3}, C: {3: 2}},
    };
}

// Regression coverage for the fix in src/generated/renderBuiltGameModule.ts: before that fix, a
// "pokie build"-generated package's createSession() ignored the context it was given entirely (see
// PokieGame.createSession's own PokieGameContext param), so replaying the same (seed, round) against
// the same package -- exactly what "pokie replay" does -- produced a different screen every time.
// GamePackageGenerator is the exact same generator "pokie build"/BlueprintProjectMaterializer use (see
// GamePackageGenerator.test.ts and BlueprintProjectMaterializer.ts's own doc comment), so this fixture
// is a real generated package, not a hand-threaded stand-in like tests/cli/fixtures/playable-game.
describe("generated tsPackage round reproducibility (regression: context.seed threading)", () => {
    let outDir: string;
    let projectRoot: string;

    beforeAll(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-determinism-test-"));
        const generator = new GamePackageGenerator("1.3.0");
        const result = generator.generate(buildDeterminismBlueprint(), outDir);
        projectRoot = result.projectRoot;
    });

    afterAll(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
    });

    it("replays the exact same screen for the same (seed, round) across independently loaded sessions", async () => {
        const firstFile = path.join(outDir, "first.json");
        const secondFile = path.join(outDir, "second.json");

        await new ReplayCommand().run([projectRoot, "--seed", "fixture-seed", "--round", "5", "--out", firstFile]);
        await new ReplayCommand().run([projectRoot, "--seed", "fixture-seed", "--round", "5", "--out", secondFile]);

        const first = JSON.parse(fs.readFileSync(firstFile, "utf-8")) as ReplayDescriptor;
        const second = JSON.parse(fs.readFileSync(secondFile, "utf-8")) as ReplayDescriptor;

        expect(first.screen).not.toBeNull();
        expect(first.screen).toEqual(second.screen);
        expect(first.totalWin).toEqual(second.totalWin);
        expect(first.totalBet).toEqual(second.totalBet);
    });

    it("replays a different screen for a different seed at the same round (not just always identical)", async () => {
        const firstFile = path.join(outDir, "seed-a.json");
        const secondFile = path.join(outDir, "seed-b.json");

        await new ReplayCommand().run([projectRoot, "--seed", "fixture-seed-a", "--round", "5", "--out", firstFile]);
        await new ReplayCommand().run([projectRoot, "--seed", "fixture-seed-b", "--round", "5", "--out", secondFile]);

        const first = JSON.parse(fs.readFileSync(firstFile, "utf-8")) as ReplayDescriptor;
        const second = JSON.parse(fs.readFileSync(secondFile, "utf-8")) as ReplayDescriptor;

        expect(first.screen).not.toEqual(second.screen);
    });

    it("advances the deterministic draw sequence with round index, instead of replaying the same draw regardless of round", async () => {
        const roundOneFile = path.join(outDir, "round-1.json");
        const roundFiveFile = path.join(outDir, "round-5.json");

        await new ReplayCommand().run([projectRoot, "--seed", "fixture-seed", "--round", "1", "--out", roundOneFile]);
        await new ReplayCommand().run([projectRoot, "--seed", "fixture-seed", "--round", "5", "--out", roundFiveFile]);

        const roundOne = JSON.parse(fs.readFileSync(roundOneFile, "utf-8")) as ReplayDescriptor;
        const roundFive = JSON.parse(fs.readFileSync(roundFiveFile, "utf-8")) as ReplayDescriptor;

        expect(roundOne.screen).not.toBeNull();
        expect(roundOne.screen).not.toEqual(roundFive.screen);
    });
});
