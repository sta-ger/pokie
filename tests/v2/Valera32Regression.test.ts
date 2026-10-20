import fs from "node:fs";
import path from "node:path";
import {runInNewContext} from "node:vm";
import * as api from "@fromstan/pokie";
import {renderBuiltGameModule} from "../../src/generated/renderBuiltGameModule.js";
import {CreateCommand} from "../../cli/commands/CreateCommand.js";
import {EditCommand} from "../../cli/commands/EditCommand.js";
import {PromptAdapting} from "../../cli/wizard/PromptAdapting.js";

// Source-aware prerequisite checks, never independent first-contact evidence.
const example = (): api.GameBlueprint => JSON.parse(fs.readFileSync(path.resolve("site/examples/weighted.blueprint.json"), "utf8"));
const policy = (): api.OptimizationRequest => JSON.parse(fs.readFileSync(path.resolve("site/examples/policy.json"), "utf8"));
const errors = (issues: readonly api.ValidationIssue[]) => issues.filter(issue => issue.severity === "error");
function generated(blueprint: api.GameBlueprint): api.PokieGame {
    const module: {exports: unknown} = {exports: {}};
    runInNewContext(renderBuiltGameModule(blueprint, "2.0.0"), {require: () => api, module});
    return module.exports as api.PokieGame;
}

describe("V2C-32 public math prerequisites", () => {
    let directory: string;
    beforeEach(() => {
        directory = fs.mkdtempSync(path.resolve("node_modules/.cache/pokie-tmp/valera32-"));
    });
    afterEach(() => fs.rmSync(directory, {recursive: true, force: true}));

    describe.each(["create", "edit"] as const)("%s authored paytable", surface => {
        let log: jest.SpyInstance;
        beforeEach(() => {
            log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        });
        afterEach(() => log.mockRestore());

        function command(answers: (string | null)[], authored?: api.GameBlueprint) {
            const source = path.join(directory, "source.blueprint.json");
            const destination = path.join(directory, "saved.blueprint.json");
            const blueprint: api.GameBlueprint = authored ?? {...example(), paytable: {A: {2: 4}},
                reelSequences: [{type: "exact", symbols: ["A", "A"]}, {type: "exact", symbols: ["A", "A"]}]};
            fs.writeFileSync(source, JSON.stringify(blueprint));
            const before = fs.readFileSync(source);
            const questions: string[] = [];
            const prompt: PromptAdapting = {
                ask: question => {
                    questions.push(question);
                    if (answers.length === 0) throw new Error(`Unexpected question: ${question}`);
                    return Promise.resolve(answers.shift()!);
                },
                close: jest.fn(),
            };
            const run = () => surface === "create"
                ? new CreateCommand("2.0.0", undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, () => prompt, () => true)
                    .run(["--out", destination])
                : new EditCommand(undefined, undefined, undefined, undefined, undefined, () => prompt, () => true)
                    .run([source, "--out", destination]);
            return {source, destination, before, questions, prompt, run};
        }

        function authoringAnswers(bet: number, payouts: (string | null)[], confirm: string | null = "y"): (string | null)[] {
            return ["valera32", "Valera 32", "1.0.0", "2", "1", "A,B,S", "", "", String(bet), "",
                ...payouts, "-", "-", ...(surface === "create" ? ["s", "A,A", "A,A"] : []), "", confirm];
        }

        it.each([0.05, 7.5, 1e-7])("saves explicit zero and omitted payouts and executes the saved model at stake %s", async bet => {
            const state = command(authoringAnswers(bet, ["2:0"]));
            expect(await state.run()).toBe(0);
            const saved = api.loadGameBlueprint(state.destination);
            expect(saved.paytable).toEqual({A: {2: 0}});
            expect(saved.availableBets).toEqual([bet]);
            const session = generated(saved).createSession({seed: 0}) as api.VideoSlotSession;
            session.setBet(bet);
            session.play();
            expect(session.getWinAmount()).toBe(0);
            expect(fs.readFileSync(state.source)).toEqual(state.before);
            expect(state.prompt.close).toHaveBeenCalledTimes(1);
        });

        it("rejects malformed and negative payouts before accepting a fractional retry", async () => {
            const invalid = ["2:-1", "2:", "2:0:4", "2:Infinity"];
            const state = command(authoringAnswers(0.05, [...invalid, "2:0.5"]));
            expect(await state.run()).toBe(0);
            expect(api.loadGameBlueprint(state.destination).paytable).toEqual({A: {2: 0.5}});
            for (const pair of invalid) expect(log).toHaveBeenCalledWith(expect.stringContaining(`Invalid pair "${pair}"`));
            expect(state.questions.filter(question => question.startsWith('  "A"'))).toHaveLength(5);
        });

        it.each(["n", null])("keeps the source and destination untouched when Save is declined or cancelled: %s", async confirm => {
            const state = command(authoringAnswers(0.05, ["2:0"], confirm));
            expect(await state.run()).toBe(1);
            expect(fs.existsSync(state.destination)).toBe(false);
            expect(fs.readFileSync(state.source)).toEqual(state.before);
            expect(state.prompt.close).toHaveBeenCalledTimes(1);
        });

        it("cancels after a rejected payout without publishing", async () => {
            const state = command(authoringAnswers(0.05, ["2:-1", null]));
            expect(await state.run()).toBe(1);
            expect(log).toHaveBeenCalledWith(expect.stringContaining('Invalid pair "2:-1"'));
            expect(fs.existsSync(state.destination)).toBe(false);
            expect(fs.readFileSync(state.source)).toEqual(state.before);
            expect(state.prompt.close).toHaveBeenCalledTimes(1);
        });

        const scatterFixture = (): api.GameBlueprint => ({
            manifest: {id: "scatter32", name: "Scatter 32", version: "1.0.0"},
            reels: 3, rows: 3, symbols: ["A", "S"], scatters: ["S"], availableBets: [0.05],
            paytable: {A: {3: 0}, S: {6: 0}},
            reelSequences: Array.from({length: 3}, () => ({type: "exact", symbols: ["S", "S", "A", "A", "A"]})),
        });

        function scatterAnswers(
            payouts: (string | null)[] = ["3:0", "6:0"],
            grants: (string | null)[] | undefined = undefined,
            confirm: string | null = "y",
        ): (string | null)[] {
            return ["scatter32", "", "", "3", "3", "A,S", "", "S", "0.05", "", ...payouts,
                ...(surface === "create" ? ["s", "S,S,A,A,A", "S,S,A,A,A", "S,S,A,A,A"] : []),
                ...(grants === undefined ? ["-"] : ["S", ...grants]), "", confirm];
        }

        it("preserves the reproduced 3x3 zero scatter awards and seed-2 execution", async () => {
            const original = scatterFixture();
            const invented = {...original, paytable: {A: {3: 0}, S: {3: 1}}};
            for (const [blueprint, expectedWin] of [[original, 0], [invented, 0.05]] as const) {
                expect(errors(new api.GameBlueprintValidator().validate(blueprint))).toEqual([]);
                const session = generated(blueprint).createSession({seed: 2}) as api.VideoSlotSession;
                session.setBet(0.05);
                session.play();
                expect(session.getWinAmount()).toBe(expectedWin);
            }
            const state = command(scatterAnswers(surface === "edit" ? ["", ""] : undefined), original);
            expect(await state.run()).toBe(0);
            const saved = api.loadGameBlueprint(state.destination);
            expect(saved.paytable).toEqual({A: {3: 0}, S: {6: 0}});
            const session = generated(saved).createSession({seed: 2}) as api.VideoSlotSession;
            session.setBet(0.05);
            session.play();
            expect(session.getWinAmount()).toBe(0);
            expect(fs.readFileSync(state.source)).toEqual(state.before);
        });

        it("authors scatter counts across all evaluation cells after rejecting invalid pairs", async () => {
            const invalid = ["0:0", "10:0", "1.5:0", ":0", "1:", "1:Infinity", "1:0:2", ",1:0", "1:0,"];
            const state = command(scatterAnswers(["1:0", "4:0", "3:0", ...invalid, "1:0,6:0,9:0"]), scatterFixture());
            expect(await state.run()).toBe(0);
            expect(api.loadGameBlueprint(state.destination).paytable).toEqual({A: {3: 0}, S: {1: 0, 6: 0, 9: 0}});
            expect(state.questions.filter(question => question.startsWith('  "S"'))).toHaveLength(invalid.length + 1);
            expect(log).toHaveBeenCalledWith(expect.stringContaining("matchCount between 1 and 9"));
            expect(log).toHaveBeenCalledWith(expect.stringContaining("matchCount between 2 and 3"));
        });

        it.each(["2:0", "1:1"])("saves and executes independently authored free-game grants %s", async grant => {
            const fixture = scatterFixture();
            fixture.reelSequences = [
                {type: "exact", symbols: ["S", "A", "A"]},
                {type: "exact", symbols: ["A", "A", "A"]},
                {type: "exact", symbols: ["A", "A", "A"]},
            ];
            const answers = scatterAnswers(undefined, [grant]);
            if (surface === "create") {
                const start = answers.indexOf("s");
                answers.splice(start + 1, 3, "S,A,A", "A,A,A", "A,A,A");
            }
            const state = command(answers, fixture);
            expect(await state.run()).toBe(0);
            const saved = api.loadGameBlueprint(state.destination);
            expect(saved.mechanics?.freeGames?.awardsByCount).toEqual(grant === "2:0" ? {2: 0} : {1: 1});
            const session = generated(saved).createSession({seed: 2}) as api.VideoSlotWithFreeGamesSession;
            session.setBet(0.05);
            session.play();
            expect(session.getWinAmount()).toBe(0);
            expect(session.getFreeGamesSum()).toBe(grant === "2:0" ? 0 : 1);
        });

        it("rejects empty, negative, fractional, nonfinite and extra-field grant pairs with retry", async () => {
            const invalid = ["", ",", "2:", ":0", "0:1", "-1:0", "1.5:0", "2:-1", "2:1.5",
                "2:Infinity", "Infinity:1", "2:NaN", "2:0:9", "2:0,", "2:0,,1:1"];
            const state = command(scatterAnswers(undefined, [...invalid, "1:1,2:0,99:0"]), scatterFixture());
            expect(await state.run()).toBe(0);
            expect(api.loadGameBlueprint(state.destination).mechanics?.freeGames?.awardsByCount).toEqual({1: 1, 2: 0, 99: 0});
            expect(state.questions.filter(question => question.startsWith("Free games awards"))).toHaveLength(invalid.length + 1);
            expect(log).toHaveBeenCalledWith(expect.stringContaining("nonnegative integer"));
        });

        it.each(["n", null])("preserves files when declining or cancelling Save after grant authoring: %s", async confirm => {
            const state = command(scatterAnswers(undefined, ["1:1,2:0"], confirm), scatterFixture());
            if (surface === "edit") fs.writeFileSync(state.destination, "existing destination");
            expect(await state.run()).toBe(1);
            expect(fs.readFileSync(state.source)).toEqual(state.before);
            if (surface === "edit") expect(fs.readFileSync(state.destination, "utf8")).toBe("existing destination");
            else expect(fs.existsSync(state.destination)).toBe(false);
        });

        it("cancels a malformed grant retry without publishing", async () => {
            const state = command(scatterAnswers(undefined, ["2:0:9", null]), scatterFixture());
            expect(await state.run()).toBe(1);
            expect(fs.readFileSync(state.source)).toEqual(state.before);
            expect(fs.existsSync(state.destination)).toBe(false);
        });

        if (surface === "edit") {
            it("validates incompatible layout changes without inventing replacement awards", async () => {
                const answers = scatterAnswers(["", ""]);
                answers[4] = "1";
                const state = command(answers, scatterFixture());
                const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
                try {
                    expect(await state.run()).toBe(1);
                    expect(error).toHaveBeenCalledWith(expect.stringContaining('blueprint-paytable-invalid-times: "paytable.S"'));
                    expect(error).toHaveBeenCalledWith(expect.stringContaining("between 1 and 3"));
                } finally {
                    error.mockRestore();
                }
                expect(fs.readFileSync(state.source)).toEqual(state.before);
                expect(fs.existsSync(state.destination)).toBe(false);
                expect(state.questions.some(question => question.startsWith("Save this blueprint?"))).toBe(false);
            });

            it("preserves authored empty wild payouts and omitted regular payouts", async () => {
                const fixture = scatterFixture();
                fixture.symbols = ["A", "W", "S"];
                fixture.wilds = ["W"];
                fixture.paytable = {W: {}, S: {6: 0}};
                fixture.reelSequences = Array.from({length: 3}, () => ({type: "exact", symbols: ["S", "S", "W", "A", "A"]}));
                const answers = scatterAnswers(["", "", ""]);
                answers[5] = "A,W,S";
                answers[6] = "W";
                const state = command(answers, fixture);
                expect(await state.run()).toBe(0);
                expect(api.loadGameBlueprint(state.destination).paytable).toEqual(fixture.paytable);
                expect(fs.readFileSync(state.source)).toEqual(state.before);
            });

            it("preserves zero and count-one grant defaults", async () => {
                const fixture = scatterFixture();
                fixture.mechanics = {freeGames: {scatterSymbol: "S", awardsByCount: {1: 1, 2: 0}}};
                const state = command(scatterAnswers(["", ""], [""]), fixture);
                expect(await state.run()).toBe(0);
                expect(api.loadGameBlueprint(state.destination).mechanics).toEqual(fixture.mechanics);
                expect(fs.readFileSync(state.source)).toEqual(state.before);
            });

            it("retains cluster evaluation bounds without whole-sequence reels", async () => {
                const fixture = scatterFixture();
                fixture.winModel = {type: "clusters"};
                fixture.paytable.A = {6: 0};
                fixture.reelStrips = fixture.reelSequences!.map(reel => {
                    if (reel.type !== "exact") throw new Error("Expected exact sequence");
                    return reel.symbols;
                });
                Reflect.deleteProperty(fixture, "reelSequences");
                const answers = scatterAnswers(["1:0", "10:0", "6:0", "6:0"]);
                answers.splice(14, 0, ""); // preserve the existing literal strips
                const state = command(answers, fixture);
                expect(await state.run()).toBe(0);
                const saved = api.loadGameBlueprint(state.destination);
                expect(saved.winModel).toEqual(fixture.winModel);
                expect(saved.paytable).toEqual(fixture.paytable);
                expect(errors(new api.GameBlueprintValidator().validate(saved))).toEqual([]);
            });

            it.each([1, 3])("uses %s evaluation rows rather than visible rows for scatter bounds", async evaluatedRows => {
                const fixture = scatterFixture();
                fixture.rows = evaluatedRows === 1 ? 3 : 1;
                fixture.screenGeometry = {
                    generated: {reels: 3, rows: 3}, visible: {rowOffset: 0, rows: fixture.rows},
                    evaluated: {rowOffset: 0, rows: evaluatedRows}, paylineSpace: "evaluated",
                };
                fixture.reelStrips = Array.from({length: 3}, () => ["S", "S", "A", "A", "A"]);
                Reflect.deleteProperty(fixture, "reelSequences");
                const maximum = 3 * evaluatedRows;
                fixture.paytable.S = {[maximum]: 0};
                const answers = scatterAnswers(["1:0", "4:0", "3:0", `${maximum + 1}:0`, `1:0,${maximum}:0`]);
                answers[4] = String(fixture.rows);
                answers.splice(15, 0, ""); // preserve the existing literal strips
                const state = command(answers, fixture);
                expect(await state.run()).toBe(0);
                const saved = api.loadGameBlueprint(state.destination);
                expect(saved.screenGeometry).toEqual(fixture.screenGeometry);
                expect(saved.paytable).toEqual({A: {3: 0}, S: {1: 0, [maximum]: 0}});
                expect(log).toHaveBeenCalledWith(expect.stringContaining(`matchCount between 1 and ${maximum}`));
                expect(errors(new api.GameBlueprintValidator().validate(saved))).toEqual([]);
            });

            it("preserves omitted payouts when accepting the existing model's defaults", async () => {
                const state = command([...Array<string>(14).fill(""), "y"]);
                expect(await state.run()).toBe(0);
                const saved = api.loadGameBlueprint(state.destination);
                expect(saved.paytable).toEqual({A: {2: 4}});
                expect(saved.reelSequences).toEqual(JSON.parse(state.before.toString()).reelSequences);
                expect(fs.readFileSync(state.source)).toEqual(state.before);
            });
        }
    });

    it.each([0.05, 7.5, 1e-7])("retains the public weighted model, zero alternative and payout units through PAR and recorded replay at stake %s", async bet => {
        const original = example();
        // Canonical PAR represents empty optional symbol lists as absence.
        Reflect.deleteProperty(original, "wilds");
        Reflect.deleteProperty(original, "scatters");
        original.availableBets = [bet];
        original.paytable.B = {2: 0};
        const reel = original.reelSequences![0];
        if (reel.type !== "weighted") throw new Error("Expected public weighted reel");
        reel.variants.push({id: "disabled", weight: 0, symbols: ["S", "S"]});
        expect(errors(new api.GameBlueprintValidator().validate(original))).toEqual([]);
        const workbook = path.join(directory, "weighted.xlsx");
        expect(errors(await new api.ParSheetExporter("2.0.0").exportToFile(original, workbook))).toEqual([]);
        const imported = await new api.ParSheetImporter().importFromFile(workbook);
        expect(errors(imported.issues)).toEqual([]);
        expect(imported.conversionEvidence?.losslessEligible).toBe(true);
        expect(imported.blueprint.reelSequences).toEqual(original.reelSequences);
        expect(imported.blueprint.availableBets).toEqual([bet]);
        expect(imported.blueprint.paytable).toEqual({A: {2: 4}, B: {2: 0}});
        expect(api.computeGameBlueprintHash(imported.blueprint)).toBe(api.computeGameBlueprintHash(original));
        const game = generated(imported.blueprint);
        const {library} = await api.generateExactWeightedOutcomeLibrary({libraryId: "public-weighted", game, pokieVersion: "2.0.0", stake: bet});
        expect(new api.WeightedOutcomeLibraryAnalyzer().analyze(library)).toMatchObject({rtp: 1, hitFrequency: 0.25, maxWin: 4 * bet});
        const session = game.createSession({seed: "valera32"}) as api.VideoSlotSession;
        session.setBet(bet);
        session.setCreditsAmount(100);
        const recorder = new api.ReplayRecorder();
        try {
            const recorded = recorder.recordAudit(game, session, Array.from({length: 4}, (_, round) => ({kind: "spin" as const, bet, roundId: `round-${round}`, delivery: "composite" as const})), {status: "calculated", sessionId: "weighted", durability: "detached"}, {seed: "valera32"});
            const file = path.join(directory, "replay.json");
            fs.writeFileSync(file, JSON.stringify(recorded.audit));
            const retained = JSON.parse(fs.readFileSync(file, "utf8")) as api.AuditRoundRecording;
            expect(new api.AuditRoundReplay().replay(game, retained).verification).toBe("verified");
            for (const delivery of retained.deliveries) {
                expect(delivery.result.stake).toBe(bet);
                expect([0, 4 * bet]).toContain(delivery.artifact!.totalWin);
                expect(delivery.artifact!.sequenceSelections![0].variantId).not.toBe("disabled");
            }
        } finally {
            recorder.releaseAuditSession(session);
        }
    });

    it.each([0.05, 7.5, 1e-7])("keeps missing/zero scatter money independent of an authored free-game grant at stake %s", bet => {
        const paytables: api.GameBlueprint["paytable"][] = [{}, {S: {}}, {S: {2: 0}}];
        for (const paytable of paytables) {
            const blueprint: api.GameBlueprint = {...example(), availableBets: [bet], paytable,
                scatters: ["S"], reelSequences: [{type: "exact", symbols: ["S", "S"]}, {type: "exact", symbols: ["S", "S"]}],
                mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {2: 2}}}};
            const session = generated(blueprint).createSession({seed: 0}) as api.VideoSlotWithFreeGamesSession;
            session.setBet(bet);
            session.play();
            expect(session.getWinAmount()).toBe(0);
            expect(session.getFreeGamesSum()).toBe(2);
        }
        const grants: Record<string, number>[] = [{1: 1}, {2: 0}];
        for (const awardsByCount of grants) {
            const blueprint: api.GameBlueprint = {...example(), availableBets: [bet], paytable: {S: {2: 4}},
                scatters: ["S"], reelSequences: [{type: "exact", symbols: ["S", "S"]}, {type: "exact", symbols: ["S", "S"]}],
                mechanics: {freeGames: {scatterSymbol: "S", awardsByCount}}};
            const session = generated(blueprint).createSession({seed: 0}) as api.VideoSlotWithFreeGamesSession;
            session.setBet(bet);
            session.play();
            expect(session.getWinAmount()).toBe(4 * bet);
            expect(session.getFreeGamesSum()).toBe(0);
        }
    });

    it.each(["duplicate ID", "negative weight", "unequal length", "unknown symbol"])("rejects public model edits with an actionable sequence diagnostic: %s", kind => {
        const blueprint = example();
        const reel = blueprint.reelSequences![0];
        if (reel.type !== "weighted") throw new Error("Expected public weighted reel");
        if (kind === "duplicate ID") reel.variants[1] = {...reel.variants[1], id: reel.variants[0].id};
        if (kind === "negative weight") reel.variants[0] = {...reel.variants[0], weight: -1};
        if (kind === "unequal length") reel.variants[0] = {...reel.variants[0], symbols: reel.variants[0].symbols.slice(1)};
        if (kind === "unknown symbol") reel.variants[0] = {...reel.variants[0], symbols: ["unknown", ...reel.variants[0].symbols.slice(1)]};
        expect(errors(new api.GameBlueprintValidator().validate(blueprint))).toEqual(expect.arrayContaining([
            expect.objectContaining({code: "blueprint-reel-sequences-invalid", message: expect.stringContaining("reelSequences[0]")}),
        ]));
        expect(() => generated(blueprint).createSession({seed: 0})).toThrow();
    });

    it.each(["success", "infeasible", "exhausted", "invalid"] as const)("keeps the downloaded exact policy verdict truthful: %s", async expected => {
        const source = path.join(directory, "weighted.blueprint.json");
        fs.writeFileSync(source, JSON.stringify(example()));
        const before = fs.readFileSync(source);
        const request = policy();
        if (expected === "infeasible") request.targets[0].value = 1.5;
        if (expected === "exhausted") request.policy.budget = 1;
        if (expected === "invalid") request.policy.budget = 0;
        const service = new api.ProjectOptimizationService(path.join(directory, "scratch"));
        const project = (await new api.ProjectTargetResolver().resolve(source))!;
        const result = await service.optimize(project, request);
        try {
            expect(result.status).toBe(expected);
            if (expected === "success") {
                expect(result.evidence!.selected).toEqual({"/paytable/A/2": 3});
                expect(JSON.parse(fs.readFileSync(result.candidate!.path, "utf8")).paytable.A[2]).toBe(3);
            } else {
                expect(result.candidate).toBeUndefined();
                if (expected === "exhausted") expect(result.evidence).toMatchObject({consumedWork: 1});
                if (expected === "invalid") expect(result.diagnostics.length).toBeGreaterThan(0);
            }
        } finally {
            if (result.candidate) await service.discard(result.candidate);
        }
        expect(fs.readFileSync(source)).toEqual(before);
        expect(fs.existsSync(path.join(directory, "scratch")) ? fs.readdirSync(path.join(directory, "scratch")) : []).toEqual([]);
    });
});
