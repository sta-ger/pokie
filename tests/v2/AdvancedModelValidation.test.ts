import {AdvancedModelValidator} from "../../src/validation/AdvancedModelValidator.js";
import type {GameBlueprint} from "../../src/generated/GameBlueprint.js";
import type {DeclaredTransitionModel} from "../../src/validation/AdvancedModelValidation.js";

const blueprint = (): GameBlueprint => ({manifest: {id: "analysis", name: "Analysis", version: "1"}, reels: 1, rows: 1, symbols: ["A", "S"], scatters: ["S"], paytable: {}, reelStrips: [["A", "S"]], availableBets: [0.05, 7.5, 1e-7]});
const validate = (model: GameBlueprint) => new AdvancedModelValidator().validate({kind: "blueprint", model});

describe("bounded advanced model validation", () => {
    it("passes finite no-feature models and preserves fractional authored omission/zero payouts", async () => {
        for (const paytable of [{}, {A: {}}, {S: {1: 0}}, {S: {1: 2}}] as GameBlueprint["paytable"][]) {
            const model = {...blueprint(), paytable};
            const before = JSON.stringify(model);
            const result = await validate(model);
            expect(result).toMatchObject({status: "complete", verdict: "proved-within-assumptions", structuralValid: true});
            expect(JSON.stringify(model)).toBe(before);
        }
    });
    it("proves unreachable scatter counts from complete circular windows, not symbol membership", async () => {
        const model = blueprint();
        model.rows = 2;
        model.reelStrips = [["S", "A", "A"]];
        model.mechanics = {freeGames: {scatterSymbol: "S", awardsByCount: {2: 1}}};
        const result = await validate(model);
        expect(result.checks).toContainEqual(expect.objectContaining({id: "reachability.feature", status: "violation", path: "mechanics.freeGames", evidence: expect.objectContaining({completeScreenSupport: true, target: "mechanics.freeGames", attainableTriggerCounts: [0, 1], declaration: expect.objectContaining({awardsByCount: {2: 1}})})}));
    });
    it("reports additive retrigger entry and unbounded-progress witness without claiming counters repeat", async () => {
        const model = blueprint();
        model.reelStrips = [["S"]];
        model.mechanics = {freeGames: {scatterSymbol: "S", awardsByCount: {1: 2}}};
        const result = await validate(model);
        expect(result.checks).toContainEqual(expect.objectContaining({id: "termination.free-games", status: "violation", evidence: expect.objectContaining({entryPrefix: [expect.objectContaining({stops: [0], grant: 2})], repeat: expect.objectContaining({remainingDelta: 1, before: expect.any(Object), after: expect.any(Object)})})}));
    });
    it("distinguishes lifetime capped respins from a nonterminating declared reset cycle", async () => {
        const model = blueprint();
        model.reelStrips = [["S"]];
        model.mechanics = {respins: {trigger: {symbolId: "S", minimumCount: 1}, grant: 2, maxRespins: 3, retrigger: "reset"}};
        expect(await validate(model)).toMatchObject({status: "complete", verdict: "proved-within-assumptions"});
        const graph: DeclaredTransitionModel = {kind: "declared-transitions", initial: "paid", targets: ["bonus", "missing"], states: [{id: "paid"}, {id: "bonus"}], transitions: [{from: "paid", to: "bonus"}, {from: "bonus", to: "bonus"}]};
        const report = await new AdvancedModelValidator().validate(graph);
        expect(report.checks).toContainEqual(expect.objectContaining({id: "termination.all-path", evidence: {entryPrefix: ["paid", "bonus"], cycle: ["bonus", "bonus"]}}));
        expect(report.checks).toContainEqual(expect.objectContaining({id: "reachability.target", path: "targets.1", status: "violation", evidence: {target: "missing", exploredRegion: ["paid", "bonus"], complete: true}}));
    });
    it("retains illegal-target and exact money transition witnesses", async () => {
        const graph: DeclaredTransitionModel = {kind: "declared-transitions", initial: "a", states: [{id: "a"}, {id: "b", terminal: true}], transitions: [{from: "a", to: "absent", before: {remaining: 1}, after: {remaining: -1}}, {from: "a", to: "b", accounting: {creditsBefore: 1, creditsAfter: 2, bet: 0.05, stake: 0.05, payout: 0}}]};
        const report = await new AdvancedModelValidator().validate(graph);
        expect(report.checks).toContainEqual(expect.objectContaining({id: "transitions.target", evidence: expect.objectContaining({before: {remaining: 1}, after: {remaining: -1}, actual: "absent"})}));
        expect(report.checks).toContainEqual(expect.objectContaining({id: "invariants.money", evidence: expect.objectContaining({expected: {stake: 0.05, creditsAfter: 0.95}, actual: expect.objectContaining({creditsAfter: 2})})}));
    });
    it("budget exhaustion and cancellation never become safe and subsequent independent reuse completes", async () => {
        const validator = new AdvancedModelValidator();
        expect(await validator.validate({kind: "blueprint", model: blueprint()}, {limits: {outcomes: 1}})).toMatchObject({status: "budget-exhausted", verdict: "inconclusive"});
        const controller = new AbortController();
        controller.abort();
        expect(await validator.validate({kind: "blueprint", model: blueprint()}, {signal: controller.signal})).toMatchObject({status: "cancelled", verdict: "inconclusive"});
        await expect(validator.validate({kind: "blueprint", model: blueprint()}, {limits: {states: 0}})).rejects.toThrow("Invalid analysis limit");
        expect(await validator.validate({kind: "blueprint", model: blueprint()})).toEqual(await validator.validate({kind: "blueprint", model: blueprint()}));
    });
});

it("closes finite collection accumulation/reset values without rounding currency to a later bet", async () => {
    for (const reset of ["zero", "subtract-threshold"] as const) {
        const model = blueprint();
        model.reelStrips = [["A"]];
        model.mechanics = {collection: {symbolId: "A", contribution: 0.25, threshold: 0.5, cap: 1, payout: 7.5, reset}};
        const report = await validate(model);
        expect(report).toMatchObject({status: "complete", verdict: "proved-within-assumptions"});
        expect(report.checks).toContainEqual(expect.objectContaining({id: "reachability.feature", path: "mechanics.collection", status: "pass"}));
    }
});

it("keeps zero grants finite, and evaluates reachable counts in the configured evaluation window", async () => {
    const model = blueprint();
    model.mechanics = {freeGames: {scatterSymbol: "S", awardsByCount: {1: 0}}};
    expect(await validate(model)).toMatchObject({status: "complete"});
    model.rows = 3;
    model.reelStrips = [["S", "A", "A"]];
    model.screenGeometry = {generated: {reels: 1, rows: 3}, visible: {rowOffset: 0.5, rows: 2}, evaluated: {rowOffset: 1, rows: 1}, paylineSpace: "evaluated"};
    model.mechanics.freeGames!.awardsByCount = {2: 1};
    expect((await validate(model)).checks).toContainEqual(expect.objectContaining({path: "mechanics.freeGames", status: "violation"}));
});

it("does not round tiny positive variant support to zero", async () => {
    const model = blueprint();
    model.symbols.push("C");
    Reflect.deleteProperty(model, "reelStrips");
    model.reelSequences = [{type: "weighted", variants: [{id: "ordinary", weight: 1, symbols: ["A"]}, {id: "tiny", weight: 1e-300, symbols: ["S"]}, {id: "zero", weight: 0, symbols: ["C"]}]}];
    model.mechanics = {freeGames: {scatterSymbol: "S", awardsByCount: {1: 1}}};
    const report = await validate(model);
    expect(report.checks).toContainEqual(expect.objectContaining({id: "termination.free-games", evidence: expect.objectContaining({entryPrefix: [expect.objectContaining({variants: ["tiny"]})]})}));
});

it("matches exact consumed budget boundaries and supports traversal cancellation and a repaired retry", async () => {
    const validator = new AdvancedModelValidator();
    const complete = await validate(blueprint());
    const limits = {outcomes: complete.work.outcomes, states: complete.work.states, transitions: complete.work.transitions};
    expect(await validator.validate({kind: "blueprint", model: blueprint()}, {limits})).toMatchObject({status: "complete"});
    const controller = new AbortController();
    const running = validator.validate({kind: "blueprint", model: blueprint()}, {signal: controller.signal, limits: {yieldEvery: 1}});
    await new Promise<void>(resolve => {
        setImmediate(resolve);
    });
    controller.abort();
    expect(await running).toMatchObject({status: "cancelled", verdict: "inconclusive"});
    expect(await validator.validate({kind: "blueprint", model: {...blueprint(), reels: 0}})).toMatchObject({status: "invalid"});
    expect(await validator.validate({kind: "blueprint", model: blueprint()})).toMatchObject({status: "complete"});
});

it("validates weighted selection, zero mass, zero duration and completion accounting with the production handler", async () => {
    const {weightedBonusBlueprint} = await import("./fixtures/WeightedBonusGame.js");
    const model = weightedBonusBlueprint();
    expect(await validate(model)).toMatchObject({status: "complete", verdict: "proved-within-assumptions"});
    model.mechanics!.weightedBonus!.outcomes[0].targetId = "absent";
    const report = await validate(model);
    expect(report).toMatchObject({status: "invalid"});
    expect(report.checks).toContainEqual(expect.objectContaining({path: "mechanics.weightedBonus.outcomes.0.targetId", status: "violation"}));
});

it("keeps lock-progressing HoldAndWin finite and reports configured cascade exhaustion as a transition failure", async () => {
    const model = blueprint();
    model.reelStrips = [["A"]];
    model.mechanics = {holdAndWin: {minimumCount: 1, initialRespins: 2, retriggerPolicy: "reset-on-new-lock", symbolEffects: {A: {kind: "value", amount: 2}}, payout: {type: "sum-with-multiplier", amountsAreBetMultiples: false}}};
    expect(await validate(model)).toMatchObject({status: "complete"});
    model.paytable = {S: {1: 2}};
    model.reelStrips = [["S"]];
    model.mechanics = {cascade: {maxCascades: 1}};
    const report = await validate(model);
    expect(report.checks).toContainEqual(expect.objectContaining({id: "invariants.runtime-transition", status: "violation", evidence: expect.objectContaining({before: expect.any(Object), after: expect.any(Object), actual: expect.stringContaining("cascade exhaustion")})}));
});

it("compares max-win currency/bet-multiple declarations by their paid-entry/logical-round scope without capping", async () => {
    const model = blueprint();
    model.paytable = {S: {1: 2}};
    const report = await new AdvancedModelValidator().validate({kind: "blueprint", model, maxWinPolicy: {type: "declared", value: 1, unit: "bet-multiple", scope: "logical-round", authority: "author"}});
    expect(report.checks).toContainEqual(expect.objectContaining({id: "invariants.max-win", status: "violation", evidence: expect.objectContaining({bet: 7.5, actual: 15, expected: {maximum: 7.5, unit: "bet-multiple", scope: "logical-round"}})}));
    expect(model.paytable.S[1]).toBe(2);
});

it("never certifies complete custom declarations or lying generated labels, and never advances borrowed games", async () => {
    const {AdvancedModelSourceValidator} = await import("../../src/validation/AdvancedModelSourceValidator.js");
    for (const sourceKind of ["generated", "custom"] as const) {
        const model = blueprint();
        const createSession = jest.fn(() => {
            throw new Error("Caller-owned session must never be acquired");
        });
        const game = {getManifest: () => model.manifest, createSession, getModelDescriptor: () => ({descriptorVersion: 1 as const, blueprintSchemaVersion: 1 as const, sourceKind, model, maxWinPolicy: {type: "none" as const, scope: "logical-round" as const, authority: "declared"}})};
        const report = await new AdvancedModelSourceValidator().validate(game);
        expect(report).toMatchObject({executableFidelity: "unverified", verdict: "inconclusive", status: "unsupported"});
        expect(report.checks).toContainEqual(expect.objectContaining({id: "termination.all-path", status: "pass"}));
        expect(report.checks).toContainEqual(expect.objectContaining({id: "source.executable-fidelity", status: "unknown"}));
        expect(createSession).not.toHaveBeenCalled();
        const missingPolicy = {...game, getModelDescriptor: () => ({descriptorVersion: 1 as const, blueprintSchemaVersion: 1 as const, sourceKind, model})};
        expect((await new AdvancedModelSourceValidator().validate(missingPolicy)).checks).toContainEqual(expect.objectContaining({id: "invariants.max-win", status: "unknown"}));
    }
});

it("does not invoke data getters and rejects cycles without poisoning later validations", async () => {
    const getter = jest.fn(() => blueprint());
    const validator = new AdvancedModelValidator();
    const input = {kind: "blueprint" as const, get model() {
        return getter();
    }};
    expect(await validator.validate(input)).toMatchObject({status: "failed", verdict: "inconclusive"});
    expect(getter).not.toHaveBeenCalled();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(await validator.validate({kind: "blueprint", model: cycle})).toMatchObject({status: "failed"});
    expect(await validate(blueprint())).toMatchObject({status: "complete"});
});

it("passes finite purchased free games at fractional denomination and cost multipliers", async () => {
    const {fractionalBetBlueprint} = await import("../fixtures/math/FractionalBetFixture.js");
    const model = fractionalBetBlueprint([0.05, 7.5, 1e-7], true);
    model.symbols.push("S");
    model.scatters = ["S"];
    model.mechanics = {freeGames: {scatterSymbol: "S", awardsByCount: {3: 2}}};
    model.betModes = [{id: "base", runtimeType: "base", isDefault: true}, {id: "ante", runtimeType: "ante", costMultiplier: 1.5}, {id: "buy", runtimeType: "buyFeature", costMultiplier: 7.5, forcedFreeGames: 2}];
    const result = await validate(model);
    expect(result.checks.filter(check => check.status === "violation")).toEqual([]);
    expect(result).toMatchObject({status: "complete"});
});

it("reports invalid feature counters and entry denomination using the production executable schema", async () => {
    const validator = new AdvancedModelValidator();
    const counter: DeclaredTransitionModel = {kind: "declared-transitions", initial: "bad", states: [{id: "bad", terminal: true, state: {base: {}, freeGamesNum: 2, freeGamesSum: 1, freeGamesBank: 0}}], transitions: [], schema: {kind: "free-games", base: {kind: "base"}}};
    expect((await validator.validate(counter)).checks).toContainEqual(expect.objectContaining({id: "invariants.executable-state", status: "violation", evidence: expect.objectContaining({actual: expect.objectContaining({freeGamesNum: 2, freeGamesSum: 1})})}));
    const denomination: DeclaredTransitionModel = {kind: "declared-transitions", initial: "bad", states: [{id: "bad", terminal: true, state: {base: {}, value: 0, remaining: 1, executed: 0, entryBet: 7.5}}], transitions: [], schema: {kind: "bounded-mechanics", bets: [0.05], rules: {respins: {trigger: {symbolId: "A", minimumCount: 1}, grant: 1, maxRespins: 1, retrigger: "none"}}, base: {kind: "base"}}};
    expect((await validator.validate(denomination)).checks).toContainEqual(expect.objectContaining({id: "invariants.executable-state", status: "violation", message: expect.stringContaining("entry denomination"), evidence: expect.objectContaining({actual: expect.objectContaining({entryBet: 7.5})})}));
});

it.each([false, true])("releases owned snapshots on cancellation (cleanup fails: %s)", async failure => {
    const {default: fs} = await import("fs");
    const {default: os} = await import("os");
    const {default: path} = await import("path");
    const {writePausedDescriptorPackage, runtimeSnapshotNames} = await import("./fixtures/PackageExtractionFixture.js");
    const {AdvancedModelSourceValidator} = await import("../../src/validation/AdvancedModelSourceValidator.js");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "advanced-owned-"));
    const fixture = writePausedDescriptorPackage(root);
    const controller = new AbortController();
    const before = runtimeSnapshotNames(fixture.source);
    const remove = fs.rmSync.bind(fs);
    const cleanup = failure ? jest.spyOn(fs, "rmSync").mockImplementation((target, options) => {
        remove(target, options);
        if (path.basename(String(target)).startsWith("pokie-runtime-")) throw new Error("cleanup failed");
    }) : undefined;
    fixture.arm();
    try {
        const run = new AdvancedModelSourceValidator().validate(fixture.source, {signal: controller.signal});
        await fixture.readStarted;
        controller.abort();
        fixture.settle();
        const report = await run;
        expect(report).toMatchObject({status: failure ? "failed" : "cancelled", verdict: "inconclusive"});
        if (failure) expect(report.issues).toContainEqual(expect.objectContaining({code: "snapshot-release-failed"}));
        expect(runtimeSnapshotNames(fixture.source)).toEqual(before);
    } finally {
        cleanup?.mockRestore();
        fixture.restore();
        fs.rmSync(root, {recursive: true, force: true});
    }
});

it("bounds Blueprint acquisition before parsing and supports a later sufficiently budgeted retry", async () => {
    const {default: fs} = await import("fs");
    const {default: os} = await import("os");
    const {default: path} = await import("path");
    const {AdvancedModelSourceValidator} = await import("../../src/validation/AdvancedModelSourceValidator.js");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "advanced-file-budget-"));
    const file = path.join(root, "source.blueprint.json");
    fs.writeFileSync(file, JSON.stringify(blueprint()));
    try {
        const validator = new AdvancedModelSourceValidator();
        expect(await validator.validate(file, {limits: {inputNodes: 10}})).toMatchObject({status: "budget-exhausted", verdict: "inconclusive", structuralValid: null});
        expect(await validator.validate(file)).toMatchObject({status: "complete"});
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
});

it("rejects false completion and compares owned snapshots independently of object key order", async () => {
    const model: DeclaredTransitionModel = {kind: "declared-transitions", initial: "a", states: [{id: "a", state: {remaining: 1, entryBet: 0.05}}, {id: "done", terminal: true, state: {remaining: 1, entryBet: 0.05}}], transitions: [{from: "a", to: "done", before: {entryBet: 0.05, remaining: 1}, after: {entryBet: 0.05, remaining: 1}}]};
    const report = await new AdvancedModelValidator().validate(model);
    expect(report.checks).toContainEqual(expect.objectContaining({id: "invariants.terminal-state", status: "violation", path: "states.1.state", evidence: expect.objectContaining({actual: {remaining: 1, entryBet: 0.05}})}));
    expect(report.checks.some(check => check.id === "invariants.transition-state")).toBe(false);
});
