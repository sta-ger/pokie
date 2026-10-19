import fs from "node:fs";
import path from "node:path";
import {runInNewContext} from "node:vm";
import * as api from "@fromstan/pokie";
import {renderBuiltGameModule} from "../../src/generated/renderBuiltGameModule.js";

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
        for (const paytable of [{}, {S: {}}, {S: {2: 0}}]) {
            const blueprint: api.GameBlueprint = {...example(), availableBets: [bet], paytable,
                scatters: ["S"], reelSequences: [{type: "exact", symbols: ["S", "S"]}, {type: "exact", symbols: ["S", "S"]}],
                mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {2: 2}}}};
            const session = generated(blueprint).createSession({seed: 0}) as api.VideoSlotWithFreeGamesSession;
            session.setBet(bet);
            session.play();
            expect(session.getWinAmount()).toBe(0);
            expect(session.getFreeGamesSum()).toBe(2);
        }
        for (const awardsByCount of [{}, {2: 0}]) {
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
        if (kind === "duplicate ID") reel.variants[1].id = reel.variants[0].id;
        if (kind === "negative weight") reel.variants[0].weight = -1;
        if (kind === "unequal length") reel.variants[0].symbols.pop();
        if (kind === "unknown symbol") reel.variants[0].symbols[0] = "unknown";
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
