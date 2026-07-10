import {loadPokieGame, PokieClientServer, PokieClientServerHandling, PokieDevServer, PokieDevServerHandling, ReplayDescriptor, SimulationReport} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {DevCommand} from "../../cli/commands/DevCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {ServeCommand} from "../../cli/commands/ServeCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";

// End-to-end happy path for "pokie build": the actual example blueprint shipped in
// examples/blueprints/ (see also examples/blueprints/README.md), generated into a package with
// BuildCommand, then run through the same commands' worth of the rest of the CLI foundation as
// Workflow.integration.test.ts covers for "pokie create" output — the point of "pokie build" is
// that its output needs no separate compile step to already satisfy all of them. Exercising the
// shipped example here (rather than an inline duplicate) keeps the example and the docs/cli.md
// workflow section it demonstrates from silently drifting out of sync with what actually works.
describe("CLI workflow (integration): pokie build output passes validate/sim/report/replay/serve/dev", () => {
    const blueprintPath = path.join(__dirname, "..", "..", "examples", "blueprints", "crazy-fruits.blueprint.json");

    let workDir: string;
    let outDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-build-workflow-test-"));
        outDir = path.join(workDir, "built-game");
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("builds, validates, simulates, reports, replays, serves, and dev-serves the generated package", async () => {
        const buildExitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--out", outDir]);
        expect(buildExitCode).toBe(0);
        expect(fs.existsSync(path.join(outDir, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "src", "generated", "index.js"))).toBe(true);

        const validateExitCode = await new ValidateCommand().run([outDir]);
        expect(validateExitCode).toBe(0);

        const simFile = path.join(workDir, "sim.json");
        await new SimCommand().run([outDir, "--rounds", "300", "--seed", "demo", "--out", simFile]);
        const report = JSON.parse(fs.readFileSync(simFile, "utf-8")) as SimulationReport;
        expect(report.game).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});
        expect(report.rounds).toBe(300);

        const reportFile = path.join(workDir, "sim.md");
        await new ReportCommand().run([simFile, "--format", "markdown", "--out", reportFile]);
        expect(fs.readFileSync(reportFile, "utf-8")).toContain("# Simulation Report: Crazy Fruits");

        const replayFile = path.join(workDir, "replay.json");
        await new ReplayCommand().run([outDir, "--seed", "demo", "--round", "5", "--out", replayFile]);
        const replay = JSON.parse(fs.readFileSync(replayFile, "utf-8")) as ReplayDescriptor;
        expect(replay.game).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});
        expect(replay.round).toBe(5);

        let server: PokieDevServerHandling | undefined;
        const serveCommand = new ServeCommand(loadPokieGame, (game, options) => {
            server = new PokieDevServer(game, options);
            return server;
        });
        await serveCommand.run([outDir, "--port", "0"]);
        try {
            const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
            const port = Number(printed.match(/http:\/\/127\.0\.0\.1:(\d+)/)![1]);

            const gameResponse = await fetch(`http://127.0.0.1:${port}/game`);
            expect(await gameResponse.json()).toEqual({
                id: "crazy-fruits",
                name: "Crazy Fruits",
                version: "0.1.0",
                description: "A pokie build example: 5x3, wilds, scatters, weighted reels.",
            });

            const sessionResponse = await fetch(`http://127.0.0.1:${port}/sessions`, {method: "POST"});
            const session = (await sessionResponse.json()) as {sessionId: string};
            const spinResponse = await fetch(`http://127.0.0.1:${port}/sessions/${session.sessionId}/spin`, {method: "POST"});
            expect(spinResponse.status).toBe(200);
        } finally {
            await server!.stop();
        }

        const clientRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-build-workflow-client-"));
        fs.writeFileSync(path.join(clientRoot, "index.html"), "<html>preview</html>");
        let devApiServer: PokieDevServerHandling | undefined;
        let devClientServer: PokieClientServerHandling | undefined;
        const logsBeforeDev = (console.log as jest.Mock).mock.calls.length;
        try {
            const devCommand = new DevCommand(
                loadPokieGame,
                (game, options) => {
                    devApiServer = new PokieDevServer(game, options);
                    return devApiServer;
                },
                {
                    createClientServer: (root, options) => {
                        devClientServer = new PokieClientServer(root, options);
                        return devClientServer;
                    },
                    clientRoot,
                    openBrowser: () => undefined,
                    process: {once: () => undefined} as unknown as NodeJS.Process,
                },
            );

            await devCommand.run([outDir, "--port", "0", "--client-port", "0", "--no-open"]);

            // ServeCommand (above) logs an identically-worded "POKIE dev server ... listening on" line
            // for its own (already-stopped) port — only look at log calls made by this devCommand.run(),
            // not the whole accumulated mock history, or the regex below would match the stale port.
            const printed = (console.log as jest.Mock).mock.calls
                .slice(logsBeforeDev)
                .map((call) => call[0])
                .join("\n");
            const apiPort = Number(printed.match(/POKIE dev server.*http:\/\/127\.0\.0\.1:(\d+)/)![1]);

            const health = await fetch(`http://127.0.0.1:${apiPort}/health`);
            expect(health.status).toBe(200);
        } finally {
            await devApiServer?.stop();
            await devClientServer?.stop();
            fs.rmSync(clientRoot, {recursive: true, force: true});
        }
    });
});
