import {loadPokieGame, PokieClientServer, PokieClientServerHandling, PokieDevServer, PokieDevServerHandling, ReplayDescriptor, SimulationReport} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {DevCommand} from "../../cli/commands/DevCommand.js";
import {InspectCommand} from "../../cli/commands/InspectCommand.js";
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
    const blueprintPath = path.join(__dirname, "..", "..", "examples", "blueprints", "sample-slot.blueprint.json");

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
        const buildExitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--target", "tsPackage", "--out", outDir]);
        expect(buildExitCode).toBe(0);
        // The complete canonical package file set -- same as pokie create/pokie init's own
        // create -> install -> build -> verify lifecycle produces (see BUILT_PACKAGE_FILES).
        expect(fs.existsSync(path.join(outDir, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "package-lock.json"))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "tsconfig.json"))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "README.md"))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "src", "index.ts"))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "dist", "index.js"))).toBe(true);
        // No blueprint/build-info/creation-seed metadata of any kind is left in a newly built package.
        expect(fs.readdirSync(path.join(outDir, "src"))).toEqual(["index.ts"]);

        const validateExitCode = await new ValidateCommand().run([outDir]);
        expect(validateExitCode).toBe(0);

        // A built package carries no build-info of its own to inspect -- pokie inspect reports it
        // as an ordinary package.json summary, same as a hand-authored one.
        const inspectExitCode = await new InspectCommand().run([outDir]);
        expect(inspectExitCode).toBe(0);
        const inspectPrinted = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
        expect(inspectPrinted).toContain('package.json     name: "sample-slot"');

        const simFile = path.join(workDir, "sim.json");
        await new SimCommand().run([outDir, "--rounds", "300", "--seed", "demo", "--out", simFile]);
        const report = JSON.parse(fs.readFileSync(simFile, "utf-8")) as SimulationReport;
        expect(report.game).toEqual({id: "sample-slot", name: "Sample Slot", version: "0.1.0"});
        expect(report.rounds).toBe(300);

        const reportFile = path.join(workDir, "sim.md");
        await new ReportCommand().run([simFile, "--format", "markdown", "--out", reportFile]);
        expect(fs.readFileSync(reportFile, "utf-8")).toContain("# Simulation Report: Sample Slot");

        const replayFile = path.join(workDir, "replay.json");
        await new ReplayCommand().run([outDir, "--seed", "demo", "--round", "5", "--out", replayFile]);
        const replay = JSON.parse(fs.readFileSync(replayFile, "utf-8")) as ReplayDescriptor;
        expect(replay.game).toEqual({id: "sample-slot", name: "Sample Slot", version: "0.1.0"});
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
                id: "sample-slot",
                name: "Sample Slot",
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

    it("registers a direct Outcome build before its analysis, sampling, Replay, and Stake continuation", async () => {
        const finiteBlueprintPath = path.join(workDir, "finite-outcome.blueprint.json");
        fs.writeFileSync(
            finiteBlueprintPath,
            JSON.stringify({
                manifest: {id: "finite-outcome-slot", name: "Finite Outcome Slot", version: "1.0.0"},
                reels: 2,
                rows: 1,
                symbols: ["A", "B"],
                paytable: {A: {2: 5}},
                reelStrips: [["A", "A", "B"], ["A", "B"]],
                availableBets: [1],
            }),
        );
        const outcomeDir = path.join(workDir, "outcomes");
        const stakeDir = path.join(workDir, "stake");
        const reportFile = path.join(workDir, "outcomes-report.json");
        const sampleFile = path.join(workDir, "outcomes-sample.json");
        const replayFile = path.join(workDir, "outcomes-replay.json");

        expect(await new BuildCommand("1.3.0").run([finiteBlueprintPath, "--target", "outcomeLibrary", "--out", outcomeDir])).toBe(0);
        expect(fs.existsSync(path.join(outcomeDir, "manifest.json"))).toBe(true);
        expect(fs.existsSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"))).toBe(true);

        const reusedOutcomeDir = path.join(workDir, "requested-but-reused-outcomes");
        expect(await new BuildCommand("1.3.0").run([finiteBlueprintPath, "--target", "outcomeLibrary", "--out", reusedOutcomeDir])).toBe(0);
        expect(fs.existsSync(reusedOutcomeDir)).toBe(false);
        expect((console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n")).toContain(
            `reused compatible Outcome Project "${outcomeDir}" instead of writing "${reusedOutcomeDir}"`,
        );

        expect(await new ValidateCommand().run([outcomeDir])).toBe(0);
        await new ReportCommand().run([outcomeDir, "--format", "json", "--out", reportFile]);
        expect(JSON.parse(fs.readFileSync(reportFile, "utf-8"))).toMatchObject({rootPath: outcomeDir, modes: [{modeName: "base"}]});

        await new SimCommand().run([outcomeDir, "--mode", "base", "--rounds", "25", "--seed", "direct-outcome", "--out", sampleFile]);
        expect(JSON.parse(fs.readFileSync(sampleFile, "utf-8"))).toMatchObject({modeName: "base", statistics: {rounds: 25}});

        await new ReplayCommand().run([outcomeDir, "--mode", "base", "--seed", "direct-outcome", "--round", "2", "--out", replayFile]);
        expect(JSON.parse(fs.readFileSync(replayFile, "utf-8"))).toMatchObject({round: 2, seed: "direct-outcome"});

        expect(await new BuildCommand("1.3.0").run([finiteBlueprintPath, "--target", "stakeAdapter", "--out", stakeDir])).toBe(0);
        expect(fs.existsSync(path.join(stakeDir, "index.json"))).toBe(true);
    });

    it("refuses to rebuild into the same --out once it's already populated -- there is no rebuild/merge recognition", async () => {
        const first = await new BuildCommand("1.3.0").run([blueprintPath, "--target", "tsPackage", "--out", outDir]);
        expect(first).toBe(0);

        await expect(new BuildCommand("1.3.0").run([blueprintPath, "--target", "tsPackage", "--out", outDir])).rejects.toThrow(
            /already exists and is not empty/,
        );
    });

    it("--dry-run validates and previews the real example blueprint without creating --out at all", async () => {
        const logSpy = console.log as jest.Mock;

        const exitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--target", "tsPackage", "--out", outDir, "--dry-run"]);

        expect(exitCode).toBe(0);
        expect(fs.existsSync(outDir)).toBe(false);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("Dry run");
        expect(printed).toContain('game             Sample Slot (id: "sample-slot", v0.1.0)');
        expect(printed).toContain("blueprint hash   sha256:");
        expect(printed).toContain("would generate   README.md, dist/index.js, package-lock.json, package.json, src/index.ts, tsconfig.json");
    });
});
