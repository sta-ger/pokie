import {
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
import {DiffCommand} from "../../cli/commands/DiffCommand";
import {ReplayCommand} from "../../cli/commands/ReplayCommand";
import {ReportCommand} from "../../cli/commands/ReportCommand";
import {ServeCommand} from "../../cli/commands/ServeCommand";
import {SimCommand} from "../../cli/commands/SimCommand";
import {ValidateCommand} from "../../cli/commands/ValidateCommand";

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
