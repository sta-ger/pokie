import {describeReplayResult} from "../../cli/studio-client/src/domain/interpret/Replay.js";
import {StudioSimulationService} from "../../cli/studio/simulation/StudioSimulationService.js";
import {buildSimulationReportDownload} from "../../cli/studio/simulation/buildSimulationReportDownload.js";
import {describeSimulationReport} from "../../cli/studio-client/src/domain/interpret/Simulation.js";
import ExcelJS from "exceljs";
import {createPackageExtractionTestEnvironment, PACKAGE_EXTRACTION_TEST_TIMEOUT} from "./fixtures/PackageExtractionFixture.js";
import {mergeJackpotStatisticsSnapshots} from "../../src/simulation/JackpotStatisticsMerging.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {ParCommand} from "../../cli/commands/ParCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {StudioPlayService} from "../../cli/studio/runtime/StudioPlayService.js";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import path from "node:path";
import * as api from "@fromstan/pokie";
import {assertWorkflowRejections, existingMechanicsBlueprint, generatedMechanicsGame, mechanicsSession, replayModesBlueprint} from "./fixtures/ExistingMechanicsGame.js";

const catalogue = api.AUTHORED_MECHANIC_CATALOG;
const errors = (b: unknown) => new api.GameBlueprintValidator().validate(b).filter(issue => issue.severity === "error");

it("starts a fresh completed purchase bank through direct, generated TypeScript and logical callers", () => {
    const blueprint = replayModesBlueprint();
    blueprint.paytable.A = {3: 2};
    for (const typed of [false, true]) {
        const direct = mechanicsSession(generatedMechanicsGame(blueprint, typed));
        const logical = mechanicsSession(generatedMechanicsGame(blueprint, typed));
        const runtime = new api.SessionRuntime(logical);
        for (let purchase = 0; purchase < 3; purchase++) {
            direct.setBetMode!("buy");
            direct.play();
            direct.play();
            const result = runtime.execute({kind: "spin", roundId: `purchase:${purchase}`, bet: 0.05, mode: "buy", delivery: "composite"});
            expect(result).toMatchObject({status: "played", logicalRound: {status: "completed", totalStake: 0.5, totalWin: 0.2}});
            expect(direct.getCreditsAmount()).toBeCloseTo(10000 - (purchase + 1) * 0.3);
            expect(logical.getCreditsAmount()).toBeCloseTo(direct.getCreditsAmount());
        }
        runtime.release();
    }
});

describe("V2C-12 catalogue-driven public authored workflows", () => {
    let restoreTemporaryDirectory: () => void;
    beforeAll(() => {
        restoreTemporaryDirectory = createPackageExtractionTestEnvironment();
    });
    afterAll(() => {
        restoreTemporaryDirectory();
    });

    let directory: string;
    let workflow: Promise<void> | undefined;
    beforeEach(() => {
        workflow = undefined;
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
        directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c12-"));
    });
    afterEach(async () => {
        // A Jest timeout does not cancel its async callback. Drain the owned operation
        // before removing its files or allowing the next row to install console spies.
        await workflow?.catch(() => undefined);
        jest.restoreAllMocks();
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("retains candidate authentication across the complete V2C-34 mechanics gate correction", () => {
        // Synthetic reader fixtures only: no product build/install or acceptance collection.
        execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from "node:assert/strict";
            import {mkdir, readFile, symlink, unlink, writeFile} from "node:fs/promises";
            import {execFileSync} from "node:child_process";
            import path from "node:path";
            import {candidateFixture, P911_TOOLING_DESCENDANT_PATHS} from ${JSON.stringify(pathToFileURL(path.resolve("tests/testUtils/createP911CandidateFixture.mjs")).href)};
            import {readP911Candidate, readP911CandidateFromEnvironment, readP911SmokeCandidateFromEnvironment, validateP911SmokeCandidateIdentity} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p9-11-candidate.mjs")).href)};
            import {authenticateP805ProductTree} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p8-05-release-handoff.mjs")).href)};
            const fixture = await candidateFixture(${JSON.stringify(directory)});
            const options = {repository: fixture.repository};
            const git = args => execFileSync("git", args, {cwd: fixture.repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();
            const commit = () => {
                git(["add", "."]);
                git(["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "bounded gate fixture"]);
                return git(["rev-parse", "HEAD"]);
            };
            const original = await readP911Candidate(fixture.reference, options);
            const paths = ["tests/cli/commands/BuildCommand.test.ts", "tests/cli/studio/StudioServer.test.ts", "tests/v2/ExistingMechanicsAuthoring.test.ts",
                "scripts/p8-05-release-handoff.mjs", "scripts/p9-11-candidate.mjs", "tests/testUtils/createP911CandidateFixture.mjs"];
            for (const file of paths) {
                assert.ok(P911_TOOLING_DESCENDANT_PATHS.includes(file), "missing correction fixture: " + file);
                await writeFile(path.join(fixture.repository, file), "changed bounded gate tooling");
            }
            const reviewedId = commit();
            const environment = {POKIE_P911_CANDIDATE_HANDOFF: fixture.reference.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256,
                POKIE_PACK_SMOKE_CANDIDATE_ID: reviewedId, POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256: original.archiveSha256};
            const direct = await readP911Candidate(fixture.reference, options);
            const selectors = [readP911CandidateFromEnvironment, readP911SmokeCandidateFromEnvironment];
            for (const selector of selectors) {
                const selected = await selector(environment, options);
                assert.deepEqual(selected, direct);
                assert.deepEqual(selected.equivalence.changedEvidenceAndTooling, [...paths].sort());
                assert.deepEqual({...selected, equivalence: original.equivalence}, original);
                await assert.rejects(selector({...environment, POKIE_P911_CANDIDATE_HANDOFF_SHA256: "0".repeat(64)}, options), /receipt digest mismatch/);
                await assert.rejects(async () => selector({...environment, POKIE_P805_RELEASE_HANDOFF: "conflict"}, options), /cannot be combined/);
            }
            validateP911SmokeCandidateIdentity(direct, environment, options);
            const legacy = () => authenticateP805ProductTree(original.candidateId, git(["rev-parse", "HEAD"]), fixture.repository);
            assert.deepEqual(legacy().changedToolingAndEvidencePaths, [...paths].sort());
            for (const file of ["tests/v2/ExistingMechanicsAuthoring.extra.test.ts", "src/index.ts", "cli/pokie.ts", "package.json", "package-lock.json", "tsconfig.prod.json", "generate-barrels.js"]) {
                const target = path.join(fixture.repository, file);
                await mkdir(path.dirname(target), {recursive: true});
                await writeFile(target, "changed protected input");
                commit();
                for (const selector of selectors) await assert.rejects(selector(environment, options), /product\\/build inputs changed/);
                assert.throws(legacy, /changes product or build inputs/);
                git(["reset", "--hard", reviewedId]);
            }
            const admitted = path.join(fixture.repository, "tests/v2/ExistingMechanicsAuthoring.test.ts");
            await unlink(admitted);
            await symlink("nonregular-target", admitted);
            commit();
            for (const selector of selectors) await assert.rejects(selector(environment, options), /nonregular tooling/);
            assert.throws(legacy, /nonregular Git entries/);
            git(["reset", "--hard", reviewedId]);
            for (const reference of [fixture.handoff.browserDriver, fixture.handoff.buildReceipt, fixture.handoff.installReceipt,
                {path: fixture.handoff.archivePath}, {path: path.join(direct.packageRoot, "dist/cli/pokie.js")}]) {
                const bytes = await readFile(reference.path);
                await writeFile(reference.path, "changed pinned input");
                for (const selector of selectors) await assert.rejects(selector(environment, options),
                    /authenticated controller browser driver required|receipt digest mismatch|archive digest mismatch|stale installed asset/);
                await writeFile(reference.path, bytes);
            }
            assert.deepEqual(await readP911SmokeCandidateFromEnvironment(environment, options), direct);
        `], {timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
    });

    it("covers every declared supported variant and composition with a fixture", () => {
        expect(new Set(catalogue.map(row => row.id)).size).toBe(catalogue.length);
        expect(catalogue).toHaveLength(22);
        expect(new Set(catalogue.map(row => row.progression))).toEqual(new Set(["base", "freeGames", "holdAndWin"]));
        for (const row of catalogue) expect(errors(existingMechanicsBlueprint(row))).toEqual([]);
    });

    it.each(catalogue)("$id: exact grants, locks, awards, reset and mode lifecycle", row => {
        const blueprint = existingMechanicsBlueprint(row);
        blueprint.paytable = {A: {3: 2}};
        let screens = Array.from({length: 6}, () => ["A", "A", "A"]);
        if (row.progression === "freeGames") screens = [["S", "S", "A"], ["S", "S", "S"], ["S", "S", "S"], ["A", "A", "A"], ["A", "A", "A"], ["A", "A", "A"]];
        if (row.progression === "holdAndWin") screens = [["C", "A", "A"], ["A", "A", "A"], ["A", "M", "A"], ["A", "A", "A"], ["A", "A", "A"], ["A", "A", "A"]];
        screens.push(["J", "A", "A"], ["J", "A", "A"], ["A", "A", "A"]);
        // Seed 31's reel stops after the initialization screen (1024-symbol strips).
        // This is an authored finite reel fixture; execution still uses the real RNG/generator.
        const stops = [[50, 426, 353], [77, 953, 831], [679, 328, 747], [586, 431, 736], [48, 731, 778], [864, 290, 900], [853, 790, 823], [979, 670, 650], [35, 177, 183]];
        blueprint.reelStrips = Array.from({length: 3}, (_, reel) => {
            const strip = Array<string>(1024).fill("A");
            screens.forEach((screen, step) => {
                strip[stops[step][reel]] = screen[reel];
            });
            return strip;
        });
        if (row.progression === "freeGames") {
            expect(blueprint.mechanics!.freeGames!.awardsByCount).toEqual({2: 0, 3: 2});
            for (const count of [1, 2]) {
                const noGrantGame = generatedMechanicsGame({...blueprint, reelStrips: Array.from({length: 3}, (_, reel) => [reel < count ? "S" : "A"])});
                const noGrant = mechanicsSession(noGrantGame);
                noGrant.play();
                expect(noGrantGame.getSessionSerializer!().getRoundData(noGrant)).toMatchObject({freeGamesNum: 0, freeGamesSum: 0});
                expect((noGrant as unknown as {getWonFreeGamesNumber(): number}).getWonFreeGamesNumber()).toBe(0);
                expect(noGrant.hasPendingLogicalRound()).toBe(false);
            }
        }
        const game = generatedMechanicsGame(blueprint),
            session = mechanicsSession(game);
        let contribution = 0;
        for (let step = 0; step < screens.length; step++) {
            if (row.modes && step === 8) session.setBetMode!("ante");
            const free = row.progression === "freeGames" ? step >= 2 && step <= 5 : row.progression === "holdAndWin" && step >= 1 && step <= 4;
            const paidStake = step === 8 && row.modes ? 0.075 : 0.05;
            const stake = free ? 0 : paidStake;
            expect(session.getStakeAmount()).toBeCloseTo(stake, 12);
            contribution += stake * 0.1;
            session.play();
            const data = game.getSessionSerializer!().getRoundData(session) as unknown as api.VideoSlotRoundNetworkData & {freeGamesNum?: number; freeGamesSum?: number; freeGamesBank?: number; wonFreeGamesNumber?: number};
            if (row.progression === "freeGames") {
                if (step === 0) expect(data).toMatchObject({freeGamesNum: 0, freeGamesSum: 0});
                if (step === 1) expect(data).toMatchObject({freeGamesNum: 0, freeGamesSum: 2});
                if (step === 2) expect(data).toMatchObject({freeGamesNum: 1, freeGamesSum: 4});
                if (step <= 2) expect((session as unknown as {getWonFreeGamesNumber(): number}).getWonFreeGamesNumber()).toBe(step === 0 ? 0 : 2);
                if (step === 5) {
                    expect(data).toMatchObject({freeGamesNum: 4, freeGamesSum: 4});
                    expect(data.freeGamesBank).toBeCloseTo(0.3, 12);
                    expect(session.hasPendingLogicalRound()).toBe(false);
                }
            }
            if (row.progression === "holdAndWin") {
                if (step <= 4) expect(data.holdAndWin).toMatchObject({active: step !== 4, respinsRemaining: [2, 1, 2, 1, 0][step]});
                if (step === 2) expect(data.holdAndWin!.locks.map(lock => lock.position)).toEqual([[0, 0], [1, 0]]);
                if (step === 4) {
                    const payout = "values" in row && row.values === "bet" ? 0.3 : 6;
                    expect(session.getWinAmount()).toBeCloseTo(payout, 12);
                    expect(data.holdAndWin!.payout).toBeCloseTo(payout, 12);
                }
                if (step === 5) expect(data.holdAndWin).toMatchObject({active: false, locks: [], payout: 0});
            }
            if (row.jackpot) {
                expect(data.jackpot!.statistics.mini.totalContributed).toBeCloseTo(contribution, 12);
                if (step === 6 || step === 7) {
                    expect(data.jackpot!.award!.amount).toBeCloseTo(row.jackpot === "fixed" ? 10 : 10 + (step === 6 ? contribution : 0.005), 12);
                    expect(data.jackpot!.statistics.mini.awardCount).toBe(step - 5);
                    expect(data.jackpot!.pools[0].value).toBe(10);
                }
            }
            if (row.modes) expect(data.chargedBetModeId).toBe(step === 8 ? "ante" : "base");
        }
        if (row.modes && row.progression === "freeGames") {
            blueprint.reelStrips = [["A"], ["A"], ["A"]];
            const purchaseGame = generatedMechanicsGame(blueprint),
                purchase = mechanicsSession(purchaseGame);
            const result = new api.SessionRuntime(purchase).execute({kind: "spin", mode: "buy", roundId: "purchase", delivery: "composite"});
            expect(result).toMatchObject({status: "played", logicalRound: {status: "completed", cursor: 2, totalStake: 0.5, totalWin: 0.2}});
            expect(purchase.getBetModeId!()).toBe("base");
            expect(purchaseGame.getSessionSerializer!().getRoundData(purchase)).toMatchObject({freeGamesNum: 2, freeGamesSum: 2, chargedBetModeId: "buy"});
            purchase.play();
            expect(purchase.hasPendingLogicalRound()).toBe(false);
            expect(purchaseGame.getSessionSerializer!().getRoundData(purchase)).toMatchObject({freeGamesSum: 0, chargedBetModeId: "base"});
        }
    });

    it.each(catalogue)("$id: catalogue surface rejection boundaries", async row => {
        await assertWorkflowRejections(existingMechanicsBlueprint(row), directory);
    });

    it.each(catalogue)("$id: unseeded generated CJS/TS owns restorable RNG state through fresh public Spin handlers", async row => {
        for (const typed of [false, true]) {
            const game = generatedMechanicsGame(existingMechanicsBlueprint(row), typed);
            const session = game.createSession();
            const repository = new api.InMemorySessionRepository();
            const wallet = new api.InMemoryWallet(session.getCreditsAmount());
            const initial = api.captureInitialPokieSessionState(undefined, session, game.getSessionSerializer!(), true, game);
            expect(initial.executionState).toBe("durably-restorable");
            expect(initial.context).toBeUndefined();
            expect(api.validatePersistedSession(initial, game)).toBeUndefined();
            await repository.save("unseeded", initial);
            for (let step = 0; step < 3; step++) {
                const result = await new api.SpinCommandHandler(game, repository, wallet).execute({kind: "spin", sessionId: "unseeded", requestId: `step-${step}`});
                if (result.status !== "played") throw new Error(JSON.stringify(result));
                expect(result.state.executionState).toBe("durably-restorable");
                expect(result.auditUnavailableReason).toBeUndefined();
                expect(new api.AuditRoundReplay().replay(game, result.audit!).verification).toBe("verified");
            }
        }
    });

    it.each(catalogue)("$id: actual Studio runner retains selected/all-mode report presentation and downloads", async row => {
        const game = generatedMechanicsGame(existingMechanicsBlueprint(row));
        const service = new StudioSimulationService(undefined, () => Promise.resolve(game), undefined, 3);
        const selection = row.modes ? "all" : undefined;
        const started = service.start(directory, {rounds: 12, seed: "31", modeName: selection});
        if (started.status !== "created") throw new Error("Simulation not created");
        for (let attempt = 0; attempt < 1000; attempt++) {
            const status = service.getStatus(started.job.id)!.status;
            if (status !== "queued" && status !== "running") break;
            await new Promise<void>(resolve => {
                setImmediate(resolve);
            });
        }
        const job = service.getStatus(started.job.id)!;
        expect(job.status).toBe("completed");
        const result = service.getReport(directory, started.job.id);
        if (result.status !== "ok") throw new Error("Simulation has no report");
        const reports = api.isSimulationReportSet(result.report) ? result.report.modes : {default: result.report};
        expect(Object.keys(reports)).toEqual(row.modes ? game.getBetModes!().map(mode => mode.id) : ["default"]);
        const view = describeSimulationReport(result.report);
        for (const [id, report] of Object.entries(reports)) {
            const presented = "modes" in view ? view.modes[id] : view;
            expect(presented.betMode).toBe(row.modes ? id : undefined);
            expect(presented.totalBet).toBe(report.totalBet);
            expect(presented.jackpot).toEqual(report.jackpot);
            if (row.jackpot) expect(report.jackpot?.pools.mini).toBeDefined();
            if (row.modes) expect(report.reproducibility?.command).toContain(`--mode ${id}`);
        }
        for (const format of ["json", "markdown", "html"] as const) {
            const download = buildSimulationReportDownload(result.report, started.job.id, format);
            if (row.jackpot) expect(download.body).toMatch(/jackpot/i);
            if (row.modes) for (const id of Object.keys(reports)) expect(download.body).toContain(id);
        }
        expect(service.listReports(directory)[0].modeName).toBe(selection);
        await service.cancelAll();
    });

    async function runPublicWorkflow(row: (typeof catalogue)[number], directory: string): Promise<void> {
        const blueprint = existingMechanicsBlueprint(row);
        expect(errors(blueprint)).toEqual([]);
        const built = new api.GamePackageGenerator("1.3.0").generate(blueprint, directory);
        expect(fs.readFileSync(path.join(built.projectRoot, "dist/index.js"), "utf8")).toBe(api.renderBuiltGameModule(blueprint, "1.3.0"));
        const game = generatedMechanicsGame(blueprint);
        const source = path.join(directory, "source.blueprint.json");
        fs.writeFileSync(source, JSON.stringify(blueprint));
        const validationCode = await new ValidateCommand().run([source, "--format", "json"]);
        const validation = JSON.parse(jest.mocked(console.log).mock.calls.slice(-1)[0][0] as string);
        expect(validation).toMatchObject({valid: true, errors: [], advanced: {structuralValid: true}});
        // These authoring fixtures are executable. Their additive free-game path
        // violates all-path termination; the other exhaustive checks remain bounded.
        expect(validationCode).toBe(row.progression === "freeGames" ? 1 : 2);
        expect(validation.advanced.verdict).toBe(row.progression === "freeGames" ? "violated" : "inconclusive");
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
        for (const mode of blueprint.betModes?.map(entry => entry.id) ?? [undefined]) {
            const replayPath = path.join(directory, "replay.json");
            await new ReplayCommand(root => api.loadPokieGame(root, entry => Promise.resolve(require(entry) as Record<string, unknown>))).run([built.projectRoot, "--round", "3", "--seed", "31", ...(mode ? ["--mode", mode] : []), "--out", replayPath]);
            const descriptor = JSON.parse(fs.readFileSync(replayPath, "utf8")) as api.ReplayDescriptor;
            const expected = new api.ReplayRecorder().record({game, seed: "31", round: 3, betModeId: mode});
            expect(descriptor).toMatchObject({round: 3, totalBet: expected.totalBet, totalWin: expected.totalWin, screen: expected.screen});
            expect(descriptor.artifact).toEqual(expected.artifact);
            expect(descriptor.artifact).toBeDefined();
            const view = describeReplayResult({id: "catalogue-replay", status: "completed", round: 3, completedRounds: 3, startedAt: "2026-10-14T00:00:00Z", durationMs: 0, descriptor});
            expect(view?.artifact?.canonicalArtifact).toEqual(descriptor.artifact);
            expect(view?.modeName).toBeUndefined();
            if (mode) {
                expect(descriptor.artifact!.betMode).toBe(mode);
                expect(view?.modePolicy?.betModeId).toBe(mode);
                expect(view?.artifact?.featureEvents).toContainEqual(expect.objectContaining({type: "chargedBetMode", data: {id: mode}}));
            }
            if (mode) {
                expect(descriptor.modePolicy).toEqual({betModeId: mode, selection: "repeat-when-available"});
                expect(descriptor.unit).toBe("step");
                expect(descriptor.commands).toEqual(expected.commands);
                expect(descriptor.commands).toHaveLength(3);
                expect(descriptor.commands!.filter(command => command.mode !== undefined).every(command => command.mode === mode)).toBe(true);
            } else expect(descriptor).not.toHaveProperty("modePolicy");
        }
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
    }

    // One build plus up to four mode-specific Replay commands acquire and release
    // real runtime graphs sequentially. Budget each operation as in extraction tests;
    // keep every catalogue row, workbook, persisted replay and continuation assertion.
    it.each(catalogue)("$id: validation/build/extraction/real XLSX/seeded continuation/replay/simulation/report", row => {
        // Capture this row's directory by value; a timed-out callback cannot use the
        // following row's workbook destination through the mutable fixture variable.
        workflow = runPublicWorkflow(row, directory);
        return workflow;
    }, 5 * PACKAGE_EXTRACTION_TEST_TIMEOUT);

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
    it.each([false, true])("F1 rejects changed entry denomination before mutation (explicit delivery: %s)", async explicit => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "hold-bet")!);
        blueprint.reelStrips = [["C"], ["A"], ["A"]];
        const game = generatedMechanicsGame(blueprint),
            session = mechanicsSession(game);
        const repository = new api.InMemorySessionRepository(),
            wallet = new api.InMemoryWallet(100);
        await repository.save("s", api.captureInitialPokieSessionState({seed: 31}, session, game.getSessionSerializer!(), true, game));
        const handler = () => new api.SpinCommandHandler(game, repository, wallet);
        const first = await handler().execute({kind: "spin", sessionId: "s", requestId: "entry", bet: 0.05, ...(explicit ? {roundId: "entry", delivery: "stepwise" as const} : {})});
        if (first.status !== "played") throw new Error(JSON.stringify(first));
        expect(first.state.chargedEntry).toEqual({bet: 0.05});
        expect(first.state.logicalRound !== undefined).toBe(explicit);
        const continuation = (cursor: number) => explicit ? {delivery: "stepwise" as const, continuation: {roundId: "entry", cursor}} : {};
        const state = JSON.parse(JSON.stringify(first.state)) as api.PokieSessionState;
        (state.featureState as {entryBet: number}).entryBet = 7.5;
        expect(api.validatePersistedSession(state, game)).toMatchObject({status: "corrupt-state", reason: expect.stringContaining("entry denomination")});
        await repository.save("s", state);
        const save = jest.spyOn(repository, "save"),
            create = jest.spyOn(game, "createSession"),
            debit = jest.spyOn(wallet, "debit"),
            credit = jest.spyOn(wallet, "credit");
        const rejected = await handler().execute({kind: "spin", sessionId: "s", requestId: "continue", ...continuation(1)});
        expect(rejected.status).toBe("corrupt-state");
        expect(save).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
        expect(debit).not.toHaveBeenCalled();
        expect(credit).not.toHaveBeenCalled();
        expect(await repository.load("s")).toEqual(state);
        jest.restoreAllMocks();
        await repository.save("s", first.state);
        const second = await handler().execute({kind: "spin", sessionId: "s", requestId: "second", ...continuation(1), ...(!explicit ? {bet: 7.5} : {})});
        if (second.status !== "played") throw new Error(JSON.stringify(second));
        const final = await handler().execute({kind: "spin", sessionId: "s", requestId: "final", ...continuation(2)});
        expect(final).toMatchObject({status: "played", win: 0.1, stake: 0, state: {chargedEntry: {bet: 0.05}}});
    });

    it.each((["fixed", "accumulating"] as const).flatMap(poolType => ["constructor", "__proto__"].map(id => ({id, poolType}))))("F4 preserves $poolType pool $id through both generated formats, restoration, simulation deltas and reporting", ({id, poolType}) => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === `${poolType}-base`)!);
        blueprint.mechanics!.jackpot!.pool.id = id;
        blueprint.reelStrips = [["J"], ["A"], ["A"]];
        expect(errors(blueprint)).toEqual([]);
        for (const typed of [false, true]) {
            const game = generatedMechanicsGame(blueprint, typed),
                session = mechanicsSession(game);
            const runner = new api.AggregateSimulationRunner(session, 2);
            runner.run();
            expect(runner.getJackpotStatistics()!.awardCount).toBe(2);
            expect(runner.getJackpotStatistics()!.totalAwarded).toBeCloseTo(poolType === "fixed" ? 20 : 20.01);
            expect(runner.getJackpotStatistics()!.totalContributed).toBeCloseTo(0.01);
            expect(Object.keys(runner.getJackpotStatistics()!.pools)).toEqual([id]);
            const snapshot = JSON.parse(JSON.stringify(session.toSessionState()));
            expect(Object.keys(snapshot.pools ?? {})).toEqual(poolType === "fixed" ? [] : [id]);
            expect(Object.keys(snapshot.poolStatistics)).toEqual([id]);
            const restored = mechanicsSession(game);
            restored.fromSessionState(snapshot);
            expect(restored.toSessionState()).toEqual(snapshot);
            const nextRunner = new api.AggregateSimulationRunner(restored, 1);
            const result = nextRunner.run();
            const statistics = nextRunner.getJackpotStatistics()!;
            expect(statistics.awardCount).toBe(1);
            expect(statistics.totalAwarded).toBeCloseTo(poolType === "fixed" ? 10 : 10.005);
            expect(statistics.totalContributed).toBeCloseTo(0.005);
            const merged = mergeJackpotStatisticsSnapshots(runner.getJackpotStatistics(), statistics);
            expect(merged.pools[id].awardCount).toBe(3);
            expect(merged.pools[id].totalAwarded).toBeCloseTo(poolType === "fixed" ? 30 : 30.015);
            expect(merged.pools[id].totalContributed).toBeCloseTo(0.015);
            const report = new api.SimulationReportBuilder().build({manifest: game.getManifest(), requestedRounds: 1, statistics: result.getStatistics(), durationMs: 1, jackpot: statistics});
            expect(JSON.parse(JSON.stringify(report)).jackpot.pools[id]).toBeDefined();
        }
    });

    it("F5 preserves canonical lock identity and exact audit replay through reordered effects, extraction and PAR", async () => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "hold-bet")!);
        blueprint.reelStrips = [["C"], ["M"], ["A"]];
        const reordered = JSON.parse(JSON.stringify(blueprint)) as api.GameBlueprint;
        const effects = reordered.mechanics!.holdAndWin!.symbolEffects;
        reordered.mechanics!.holdAndWin!.symbolEffects = {M: effects.M, C: effects.C};
        expect(api.computeGameBlueprintHash(reordered)).toBe(api.computeGameBlueprintHash(blueprint));
        const game = generatedMechanicsGame(blueprint),
            reorderedGame = generatedMechanicsGame(reordered);
        const extracted = await new api.PackageBlueprintExtraction().extract(reorderedGame);
        const workbook = path.join(directory, "reordered.xlsx");
        await new api.ParSheetExporter("1.3.0").exportToFile(reordered, workbook);
        const imported = await new api.ParSheetImporter().importFromFile(workbook);
        const games = [reorderedGame, generatedMechanicsGame(reordered, true), generatedMechanicsGame(extracted.blueprint!), generatedMechanicsGame(imported.blueprint)];
        const recorded = new api.ReplayRecorder().recordAudit(game, mechanicsSession(game), [{kind: "spin", bet: 0.05, delivery: "composite", roundId: "key-order"}], {status: "calculated", sessionId: "s", durability: "detached"}, {seed: 31});
        for (const equivalent of games) {
            expect(equivalent.getConfigHash!()).toBe(game.getConfigHash!());
            expect(new api.AuditRoundReplay().replay(equivalent, JSON.parse(JSON.stringify(recorded.audit))).verification).toBe("verified");
            const session = mechanicsSession(equivalent);
            session.play();
            expect((session.toSessionState() as {lockedSymbols: {position: number[]}[]}).lockedSymbols.map(lock => lock.position)).toEqual([[0, 0], [1, 0]]);
        }
    });

    it.each(["   ", 42, null, {}])("F6 aligns field diagnostics for mode id %p across CLI, Studio, resolver and generation", async id => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "hold-flat-modes")!);
        (blueprint.betModes![0] as unknown as {id: unknown}).id = id;
        expect(errors(blueprint)).toContainEqual(expect.objectContaining({code: "blueprint-betmode-invalid-id", path: "betModes[0].id"}));
        expect(new StudioBlueprintService("1.3.0", directory, new StudioHomeService("1.3.0")).validate(blueprint)).toMatchObject({status: "invalid", errors: expect.arrayContaining([expect.objectContaining({path: "betModes[0].id"})])});
        const source = path.join(directory, "invalid.blueprint.json");
        fs.writeFileSync(source, JSON.stringify(blueprint));
        expect(await new ValidateCommand().run([source])).toBe(1);
        expect(() => api.resolveBetModeCodegenWiring(blueprint)).toThrow(/betModes\[0\].id/);
        expect(() => api.renderBuiltGameModule(blueprint, "1.3.0")).toThrow(/betModes\[0\].id/);
        expect(() => api.renderBuiltGameModuleSource(blueprint, "1.3.0")).toThrow(/betModes\[0\].id/);
        expect(() => new api.GamePackageGenerator("1.3.0").generate(blueprint, directory, "rejected")).toThrow(/betModes\[0\].id/);
        expect(fs.existsSync(path.join(directory, "rejected"))).toBe(false);
    });

    it("F7 rejects HoldAndWin outside modes before play/restore and advances supported zero-credit continuations exactly once", () => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "hold-flat-modes")!);
        blueprint.reelStrips = [["C"], ["A"], ["A"]];
        const game = generatedMechanicsGame(blueprint),
            innerModes = mechanicsSession(game);
        const unsupported = new api.VideoSlotWithHoldAndWinSession(innerModes, 2, new api.SymbolSetHoldAndWinCollector(blueprint.mechanics!.holdAndWin!.symbolEffects), new api.MinimumCountHoldAndWinTrigger(1));
        innerModes.setBetMode!("ante");
        const before = innerModes.toSessionState();
        expect(unsupported.isSessionStateRestorable()).toBe(false);
        expect(() => unsupported.play()).toThrow(/inside bet modes/);
        expect(() => unsupported.fromSessionState(unsupported.toSessionState())).toThrow(/inside bet modes/);
        expect(() => unsupported.validateSessionState(unsupported.toSessionState())).toThrow(/inside bet modes/);
        expect(innerModes.toSessionState()).toEqual(before);
        const session = mechanicsSession(game);
        session.setBetMode!("ante");
        session.play();
        session.setCreditsAmount(0);
        const base = Reflect.get(Reflect.get(session, "baseSession"), "baseSession") as api.VideoSlotSessionHandling;
        const play = jest.spyOn(base, "play");
        const rngBefore = (base as unknown as api.ConvertableToSessionState<{rngState: number}>).toSessionState().rngState;
        session.play();
        expect(play).toHaveBeenCalledTimes(1);
        expect((base as unknown as api.ConvertableToSessionState<{rngState: number}>).toSessionState().rngState).not.toBe(rngBefore);
        expect(session.getCreditsAmount()).toBe(0);
        expect((session.toSessionState() as {base: {respinsRemaining: number}}).base.respinsRemaining).toBe(1);
    });

    it.each(["hold-flat", "modes", "fixed-base"])("F7 rejects free games outside %s before mutation or certification", id => {
        const base = mechanicsSession(generatedMechanicsGame(existingMechanicsBlueprint(catalogue.find(row => row.id === id)!)));
        const free = mechanicsSession(generatedMechanicsGame(existingMechanicsBlueprint(catalogue.find(row => row.id === "free-games")!)));
        const config = Reflect.get(free, "config") as api.VideoSlotWithFreeGamesConfig;
        const wrapped = new api.VideoSlotWithFreeGamesSession(config, undefined, undefined, base);
        const before = JSON.parse(JSON.stringify(base.toSessionState()));
        expect(wrapped.isSessionStateRestorable()).toBe(false);
        expect(() => wrapped.play()).toThrow(/Free games must be inside/);
        expect(() => wrapped.validateSessionState(wrapped.toSessionState())).toThrow(/Free games must be inside/);
        expect(() => wrapped.fromSessionState(wrapped.toSessionState())).toThrow(/Free games must be inside/);
        expect(() => api.validateExecutableState(wrapped.toSessionState(), wrapped.getSessionStateSchema())).toThrow(/Free games must be inside/);
        expect(base.toSessionState()).toEqual(before);
    });

    it("F7 rejects modes outside jackpot and retains actual ante contributions in the supported order", () => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "accumulating-base")!);
        blueprint.reelStrips = [["A"], ["A"], ["A"]];
        const base = mechanicsSession(generatedMechanicsGame(blueprint));
        const wrapped = new api.VideoSlotWithBetModesSession(base, new api.BetModesConfig([new api.BetModeDefinition("base"), new api.BetModeDefinition("ante", {stakeMultiplier: 1.5})]));
        wrapped.setBetMode("ante");
        const before = JSON.parse(JSON.stringify(base.toSessionState()));
        expect(wrapped.isSessionStateRestorable()).toBe(false);
        for (const action of [() => wrapped.play(), () => wrapped.validateEntryAction(), () => wrapped.validateSessionState(wrapped.toSessionState()), () => wrapped.fromSessionState(wrapped.toSessionState()), () => api.validateExecutableState(wrapped.toSessionState(), wrapped.getSessionStateSchema())]) expect(action).toThrow(/Bet modes must be inside jackpot/);
        expect(base.toSessionState()).toEqual(before);
        const supportedBlueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "accumulating-holdAndWin-modes")!);
        supportedBlueprint.reelStrips = [["C"], ["A"], ["A"]];
        const supported = mechanicsSession(generatedMechanicsGame(supportedBlueprint));
        supported.setBetMode!("ante");
        expect(supported.getStakeAmount()).toBeCloseTo(0.075, 12);
        supported.play();
        expect(api.observeVideoSlotFeatures(supported).jackpot?.statistics.mini.totalContributed).toBeCloseTo(0.0075, 12);
        expect(supported.hasPendingLogicalRound()).toBe(true);
        expect(supported.getStakeAmount()).toBe(0);
        const restored = mechanicsSession(generatedMechanicsGame(supportedBlueprint));
        restored.fromSessionState(JSON.parse(JSON.stringify(supported.toSessionState())));
        restored.setCreditsAmount(0);
        const beforeContinuation = JSON.parse(JSON.stringify(restored.toSessionState()));
        restored.play();
        expect(restored.hasPendingLogicalRound()).toBe(true);
        expect(api.observeVideoSlotFeatures(restored).holdAndWin?.respinsRemaining).toBe(1);
        expect(api.observeVideoSlotFeatures(restored).jackpot?.statistics.mini.totalContributed).toBeCloseTo(0.0075, 12);
        expect(restored.toSessionState()).not.toEqual(beforeContinuation);
        expect(restored.isSessionStateRestorable()).toBe(true);
    });

    it.each(["__proto__", "constructor", "prototype", "toJSON"])("F8 rejects reserved own symbol effect %s consistently before publication", async symbol => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "hold-bet")!);
        blueprint.symbols.push(symbol);
        blueprint.reelStrips = [[symbol], ["A"], ["A"]];
        const effects = blueprint.mechanics!.holdAndWin!.symbolEffects;
        Reflect.defineProperty(effects, symbol, {value: {kind: "value", amount: 2}, enumerable: true, configurable: true});
        const diagnostic = {code: "blueprint-mechanics-symbol-key-unsupported", path: `mechanics.holdAndWin.symbolEffects.${symbol}`};
        expect(errors(blueprint)).toContainEqual(expect.objectContaining(diagnostic));
        expect(new StudioBlueprintService("1.3.0", directory, new StudioHomeService("1.3.0")).validate(blueprint)).toMatchObject({status: "invalid", errors: expect.arrayContaining([expect.objectContaining(diagnostic)])});
        for (const render of [api.renderBuiltGameModule, api.renderBuiltGameModuleSource]) expect(() => render(blueprint, "1.3.0")).toThrow(/reserved symbol-effect key.*rename the symbol/);
        expect(() => new api.GamePackageGenerator("1.3.0").generate(blueprint, directory, "rejected")).toThrow(/reserved symbol-effect key/);
        const source = path.join(directory, "invalid.blueprint.json"),
            destination = path.join(directory, "rejected.xlsx");
        fs.writeFileSync(source, JSON.stringify(blueprint));
        expect(await new ValidateCommand().run([source])).toBe(1);
        await expect(new BuildCommand("1.3.0").run([source, "--target", "tsPackage", "--out", path.join(directory, "cli-rejected")])).rejects.toThrow(/reserved symbol-effect key/);
        expect(await new api.ParSheetExporter("1.3.0").exportToFile(blueprint, destination)).toContainEqual(expect.objectContaining(diagnostic));
        expect(fs.existsSync(destination)).toBe(false);
        expect(fs.existsSync(path.join(directory, "rejected"))).toBe(false);
        expect(fs.existsSync(path.join(directory, "cli-rejected"))).toBe(false);
        const withoutEffect = JSON.parse(JSON.stringify(blueprint)) as api.GameBlueprint;
        Reflect.deleteProperty(withoutEffect.mechanics!.holdAndWin!.symbolEffects, symbol);
        expect(api.computeGameBlueprintHash(withoutEffect)).not.toBe(api.computeGameBlueprintHash(blueprint));
        expect(api.computeBlueprintHash(withoutEffect)).not.toBe(api.computeBlueprintHash(blueprint));
        const valid = existingMechanicsBlueprint(catalogue.find(row => row.id === "hold-bet")!);
        const workbookPath = path.join(directory, "import.xlsx");
        await new api.ParSheetExporter("1.3.0").exportToFile(valid, workbookPath);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(workbookPath);
        workbook.getWorksheet("Symbols")!.addRow([symbol]);
        const sheet = workbook.getWorksheet("Mechanics")!;
        sheet.getRow(2).getCell(2).value = JSON.stringify(blueprint.mechanics!.holdAndWin);
        await workbook.xlsx.writeFile(workbookPath);
        const imported = await new api.ParSheetImporter().importFromFile(workbookPath);
        expect(imported.issues).toContainEqual(expect.objectContaining(diagnostic));
        const game = generatedMechanicsGame(valid);
        game.getModelDescriptor = () => ({descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model: blueprint});
        expect((await new api.PackageBlueprintExtraction().extract(game)).status).not.toBe("complete");
    });

    it.each([false, true])("F9 binds changed/deleted charged mode to purchase entry across fresh handlers (explicit: %s)", async explicit => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "accumulating-freeGames-modes")!);
        blueprint.reelStrips = [["A"], ["A"], ["A"]];
        const game = generatedMechanicsGame(blueprint),
            repository = new api.InMemorySessionRepository(),
            wallet = new api.InMemoryWallet(100);
        await repository.save("s", api.captureInitialPokieSessionState({seed: 31}, mechanicsSession(game), game.getSessionSerializer!(), true, game));
        const handler = () => new api.SpinCommandHandler(game, repository, wallet);
        const entry = await handler().execute({kind: "spin", sessionId: "s", requestId: "buy", bet: 0.05, mode: "buy-more", ...(explicit ? {roundId: "buy", delivery: "stepwise" as const} : {})});
        if (entry.status !== "played") throw new Error(JSON.stringify(entry));
        expect(entry.state.chargedEntry).toEqual({bet: 0.05, mode: "buy-more"});
        const continuation = explicit ? {delivery: "stepwise" as const, continuation: {roundId: "buy", cursor: 1}} : {};
        for (const mode of ["base", undefined]) {
            const corrupt = JSON.parse(JSON.stringify(entry.state)) as api.PokieSessionState;
            const state = corrupt.featureState as {base: api.BetModeSessionState};
            if (mode === undefined) Reflect.deleteProperty(state.base, "chargedBetModeId");
            else state.base.chargedBetModeId = mode;
            expect(api.validatePersistedSession(corrupt, game)).toMatchObject({status: "corrupt-state", reason: expect.stringContaining("attribution")});
            await repository.save("s", corrupt);
            const save = jest.spyOn(repository, "save"),
                create = jest.spyOn(game, "createSession"),
                debit = jest.spyOn(wallet, "debit"),
                credit = jest.spyOn(wallet, "credit");
            expect((await handler().execute({kind: "spin", sessionId: "s", requestId: "invalid", ...continuation})).status).toBe("corrupt-state");
            for (const spy of [save, create, debit, credit]) expect(spy).not.toHaveBeenCalled();
            jest.restoreAllMocks();
            expect(await repository.load("s")).toEqual(corrupt);
            if (explicit) {
                const restored = mechanicsSession(game);
                restored.fromSessionState(corrupt.featureState);
                const before = JSON.parse(JSON.stringify(restored.toSessionState()));
                expect(() => new api.SessionRuntime(restored, entry.state.logicalRound)).toThrow(/attribution/);
                expect(restored.toSessionState()).toEqual(before);
            }
        }
        await repository.save("s", entry.state);
        const continued = await handler().execute({kind: "spin", sessionId: "s", requestId: "valid", ...continuation});
        expect(continued).toMatchObject({status: "played", mode: "buy-more", stake: 0, state: {roundPayload: {chargedBetModeId: "buy-more"}, chargedEntry: {bet: 0.05, mode: "buy-more"}}});
        if (continued.status !== "played") throw new Error(JSON.stringify(continued));
        expect(api.validatePersistedSession(continued.state, game)).toBeUndefined();
        if (explicit) expect(continued.state.logicalRound?.mode).toBe("buy-more");
    });

    it("F2 retains generated mechanic observations in public logical delivery", () => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "fixed-holdAndWin-modes")!);
        blueprint.reelStrips = [["C"], ["A"], ["J"]];
        const session = mechanicsSession(generatedMechanicsGame(blueprint));
        const result = new api.SessionRuntime(session).execute({kind: "spin", bet: 0.05, mode: "ante", roundId: "observations", delivery: "composite"});
        if (result.status !== "played" || !result.logicalRound) throw new Error(JSON.stringify(result));
        const visible = api.projectLogicalRound(result.logicalRound);
        expect(visible.subrounds[0].featureEvents).toEqual(expect.arrayContaining([
            expect.objectContaining({type: "holdAndWin", data: expect.objectContaining({active: true, locks: expect.any(Array), respinsRemaining: 2, payout: 0})}),
            expect.objectContaining({type: "jackpot", data: expect.objectContaining({pools: [{id: "mini", value: 10}], award: {poolId: "mini", amount: 10}})}),
            {type: "chargedBetMode", data: {id: "ante"}},
        ]));
        expect(visible.currentStep!.featureEvents).toEqual(expect.arrayContaining([
            expect.objectContaining({type: "holdAndWin", data: expect.objectContaining({active: false, respinsRemaining: 0, payout: 2})}),
        ]));
    });

});
