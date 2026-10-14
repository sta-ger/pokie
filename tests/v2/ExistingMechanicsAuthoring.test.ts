import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {ParCommand} from "../../cli/commands/ParCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {StudioPlayService} from "../../cli/studio/runtime/StudioPlayService.js";
import fs from "node:fs";
import path from "node:path";
import * as api from "@fromstan/pokie";
import {existingMechanicsBlueprint, generatedMechanicsGame, mechanicsSession} from "./fixtures/ExistingMechanicsGame.js";

const catalogue = api.AUTHORED_MECHANIC_CATALOG;
const errors = (b: unknown) => new api.GameBlueprintValidator().validate(b).filter(issue => issue.severity === "error");

describe("V2C-12 catalogue-driven public authored workflows", () => {
    let directory: string;
    beforeEach(() => {
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
        directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c12-"));
    });
    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("covers every declared supported variant and composition with a fixture", () => {
        expect(new Set(catalogue.map(row => row.id)).size).toBe(catalogue.length);
        expect(catalogue).toHaveLength(22);
        expect(new Set(catalogue.map(row => row.progression))).toEqual(new Set(["base", "freeGames", "holdAndWin"]));
        for (const row of catalogue) expect(errors(existingMechanicsBlueprint(row))).toEqual([]);
    });

    it.each(catalogue)("$id: validation/build/extraction/real XLSX/seeded continuation/replay/simulation/report", async row => {
        const blueprint = existingMechanicsBlueprint(row);
        expect(errors(blueprint)).toEqual([]);
        const built = new api.GamePackageGenerator("1.3.0").generate(blueprint, directory);
        expect(fs.readFileSync(path.join(built.projectRoot, "dist/index.js"), "utf8")).toBe(api.renderBuiltGameModule(blueprint, "1.3.0"));
        const game = generatedMechanicsGame(blueprint);
        const source = path.join(directory, "source.blueprint.json");
        fs.writeFileSync(source, JSON.stringify(blueprint));
        expect(await new ValidateCommand().run([source])).toBe(0);
        expect(await new BuildCommand("1.3.0").run([source, "--target", "tsPackage", "--out", path.join(directory, "cli-built")])).toBe(0);
        const cliWorkbook = path.join(directory, "cli.xlsx"),
            cliImport = path.join(directory, "cli-import.json");
        expect(await new ParCommand("1.3.0").run(["export", source, "--out", cliWorkbook])).toBe(0);
        expect(await new ParCommand("1.3.0").run(["import", cliWorkbook, "--out", cliImport, "--format", "json"])).toBe(0);
        expect(JSON.parse(fs.readFileSync(cliImport, "utf8")).mechanics).toEqual(blueprint.mechanics);
        const reportPath = path.join(directory, "simulation.json");
        await new SimCommand(() => Promise.resolve(game)).run([built.projectRoot, "--rounds", "30", "--seed", "31", ...(row.modes ? ["--mode", "all"] : []), "--out", reportPath]);
        const cliReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
        if (row.modes) expect(Object.keys(cliReport.modes)).toEqual(blueprint.betModes!.map(mode => mode.id));
        await new ReportCommand().run([reportPath, "--format", "html", "--out", path.join(directory, "report.html")]);
        await new ReplayCommand(() => Promise.resolve(game)).run([built.projectRoot, "--round", "3", "--seed", "31", "--out", path.join(directory, "replay.json")]);
        expect(JSON.parse(fs.readFileSync(path.join(directory, "replay.json"), "utf8")).round).toBe(3);
        const studio = new StudioPlayService(() => Promise.resolve(game));
        try {
            const created = await studio.newSession(built.projectRoot, 31);
            if (created.status !== "ok") throw new Error(JSON.stringify(created));
            const played = await studio.spin(created.session.sessionId, undefined, 0.05, row.modes ? "ante" : undefined, {requestId: "studio", roundId: "studio", delivery: "composite"});
            if (played.status !== "ok") throw new Error(JSON.stringify(played));
        } finally {
            await studio.reset();
        }

        const extracted = await new api.PackageBlueprintExtraction().extract(game);
        expect(extracted.diagnostics.filter(issue => issue.severity !== "warning")).toEqual([]);
        expect(extracted.status).toBe("complete");
        expect(extracted.blueprint?.mechanics).toEqual(blueprint.mechanics);
        const workbook = path.join(directory, "mechanics.xlsx");
        expect((await new api.ParSheetExporter("1.3.0").exportToFile(blueprint, workbook)).filter(issue => issue.severity === "error")).toEqual([]);
        const imported = await new api.ParSheetImporter().importFromFile(workbook);
        expect(imported.issues.filter(issue => issue.severity === "error")).toEqual([]);
        expect(imported.blueprint.mechanics).toEqual(blueprint.mechanics);
        expect(api.computeBlueprintHash(imported.blueprint)).toBe(api.computeBlueprintHash(blueprint));
        const games = [game, generatedMechanicsGame(blueprint, true), generatedMechanicsGame(extracted.blueprint!), generatedMechanicsGame(imported.blueprint)];
        const sessions = games.map(g => mechanicsSession(g));
        for (let round = 0; round < 35; round++) {
            for (const session of sessions) {
                if (!session.hasPendingLogicalRound()) session.setBet(blueprint.availableBets![round % 3]);
                if (row.modes && !session.hasPendingLogicalRound()) session.setBetMode!(round % 3 === 0 && row.progression === "freeGames" ? "buy-more" : "ante");
                expect(session.isSessionStateRestorable()).toBe(true);
                const before = session.getCreditsAmount(),
                    stake = api.determineStakeAmount(session, session.getBet());
                session.play();
                expect(session.getCreditsAmount()).toBeCloseTo(before - stake + session.getWinAmount(), 8);
            }
            const snapshot = JSON.parse(JSON.stringify(sessions[0].toSessionState()));
            for (const session of sessions.slice(1)) {
                expect(session.toSessionState()).toEqual(sessions[0].toSessionState());
                expect(new api.VideoSlotSessionSerializer().getRoundData(session)).toEqual(new api.VideoSlotSessionSerializer().getRoundData(sessions[0]));
            }
            const restored = mechanicsSession(game);
            restored.setBet(sessions[0].getBet());
            restored.setCreditsAmount(sessions[0].getCreditsAmount());
            restored.fromSessionState(snapshot);
            expect(restored.toSessionState()).toEqual(snapshot);
            sessions[3] = restored;
        }
        const replay = new api.ReplayRecorder();
        const recorded = replay.recordAudit(game, mechanicsSession(game), [{kind: "spin", bet: 0.05, ...(row.modes ? {mode: row.progression === "freeGames" ? "buy" : "ante"} : {}), delivery: "composite", roundId: "audit"}], {status: "calculated", sessionId: "s", durability: "detached"}, {seed: 31});
        expect(new api.AuditRoundReplay().replay(game, JSON.parse(JSON.stringify(recorded.audit))).verification).toBe("verified");
        const seeded = replay.record({game, seed: "31", round: 2});
        expect(replay.record({game: games[2], seed: "31", round: 2})).toMatchObject({totalBet: seeded.totalBet, totalWin: seeded.totalWin, screen: seeded.screen});
        for (const mode of blueprint.betModes?.map(mode => mode.id) ?? [undefined]) {
            const session = mechanicsSession(game);
            const runner = new api.AggregateSimulationRunner(session, 40, undefined, undefined, mode ? new api.FixedBetModeForNextSimulationRoundSetting(mode) : undefined);
            const statistics = runner.run().getStatistics();
            const report = new api.SimulationReportBuilder().build({manifest: game.getManifest(), requestedRounds: 40, statistics, seed: "31", durationMs: 1, breakdown: runner.getBreakdownStatistics(), jackpot: runner.getJackpotStatistics(), betMode: mode});
            expect(report.totalBet).toBe(statistics.totalBet);
            expect(report.totalWin).toBe(statistics.totalPayout);
            expect(new api.MarkdownSimulationReportRenderer().render(report)).toContain(row.id);
            expect(new api.HtmlSimulationReportRenderer().render(report)).toContain(row.id);
            expect(JSON.parse(JSON.stringify(report)).totalWin).toBe(report.totalWin);
            if (row.jackpot) expect(report.jackpot).toBeDefined();
        }
    });

    it("rejects conflicts and unknown fields through validation, direct rendering and generation without writing", () => {
        const b = existingMechanicsBlueprint(catalogue.find(row => row.id === "hold-flat")!);
        const invalid = [
            {...b, mechanics: {...b.mechanics, unknown: {}}},
            {...b, mechanics: {...b.mechanics, freeGames: {scatterSymbol: "S", awardsByCount: {3: 2}}}},
            {...b, mechanics: {holdAndWin: {...b.mechanics!.holdAndWin!, retriggerPolicy: "additive"}}},
            {...b, mechanics: {jackpot: {pool: {id: "x", type: "accumulating", seedValue: -1}}}},
        ];
        for (const candidate of invalid) {
            expect(errors(candidate).length).toBeGreaterThan(0);
            expect(() => api.renderBuiltGameModule(candidate as api.GameBlueprint, "1.3.0")).toThrow();
            expect(() => new api.GamePackageGenerator("1.3.0").generate(candidate as api.GameBlueprint, directory)).toThrow();
        }
        expect(fs.readdirSync(directory)).toEqual([]);
    });
});
