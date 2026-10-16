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
    const after = {base: {}, value: 0, remaining: 1, executed: 0, entryBet: 0.05};
    const model: DeclaredTransitionModel = {kind: "declared-transitions", initial: "a", states: [{id: "a", state: {base: {}, value: 0, remaining: 0, executed: 0, entryBet: 0}}, {id: "done", terminal: true, state: after}], transitions: [{from: "a", to: "done", before: {entryBet: 0, executed: 0, remaining: 0, value: 0, base: {}}, after}], schema: {kind: "bounded-mechanics", bets: [0.05], rules: {respins: {trigger: {symbolId: "A", minimumCount: 1}, grant: 1, maxRespins: 1, retrigger: "none"}}, base: {kind: "base"}}};
    const report = await new AdvancedModelValidator().validate(model);
    expect(report.checks).toContainEqual(expect.objectContaining({id: "invariants.terminal-state", status: "violation", path: "states.1.state", evidence: expect.objectContaining({actual: expect.objectContaining({remaining: 1, entryBet: 0.05})})}));
    expect(report.checks.some(check => check.id === "invariants.transition-state")).toBe(false);
});

it("rejects malformed budget containers without acquisition", async () => {
    const validator = new AdvancedModelValidator();
    for (const limits of [null, [], "100", {states: NaN}, {unexpected: 1}]) await expect(validator.validate({kind: "blueprint", model: blueprint()}, {limits: limits as never})).rejects.toThrow(/Invalid analysis limit/);
});

it.each(["denomination", "counter"])("reports cross-transition %s violations even when both snapshots are independently valid", async field => {
    const before = {base: {}, value: 0, remaining: 3, executed: 0, entryBet: 0.05};
    const after = {...before, remaining: 1, executed: 2, entryBet: field === "denomination" ? 7.5 : 0.05};
    const model: DeclaredTransitionModel = {kind: "declared-transitions", initial: "a", states: [{id: "a", state: before}, {id: "b", state: after}, {id: "done", terminal: true, state: {...after, remaining: 0, executed: 3}}], transitions: [{from: "a", to: "b"}, {from: "b", to: "done"}], schema: {kind: "bounded-mechanics", bets: [0.05, 7.5], rules: {respins: {trigger: {symbolId: "A", minimumCount: 1}, grant: 3, maxRespins: 3, retrigger: "none"}}, base: {kind: "base"}}};
    const report = await new AdvancedModelValidator().validate(model);
    expect(report.checks).toContainEqual(expect.objectContaining({id: "invariants.transition-state", path: "transitions.0", status: "violation", message: expect.stringContaining(field === "denomination" ? "expected 0.05, actual 7.5" : "expected 1, actual 2"), evidence: expect.objectContaining({before, after})}));
});

it.each(["identity", "context", "duration", "completion"])("retains a concrete weighted-selection %s counterexample from a real runtime snapshot", async field => {
    const {weightedBonusBlueprint} = await import("./fixtures/WeightedBonusGame.js");
    const {generatedMechanicsGame} = await import("./fixtures/ExistingMechanicsGame.js");
    const game = generatedMechanicsGame(weightedBonusBlueprint());
    let state: import("../../src/session/videoslot/authored/BoundedVideoSlotSession.js").BoundedSessionState | undefined;
    let schema: DeclaredTransitionModel["schema"];
    for (let seed = 0; seed < 20; seed++) {
        const session = game.createSession({seed}) as import("../../src/session/videoslot/authored/BoundedVideoSlotSession.js").BoundedVideoSlotSession;
        session.setBet(0.05);
        session.setCreditsAmount(100);
        session.play();
        if (session.toSessionState().remaining > 0) {
            state = session.toSessionState();
            schema = session.getSessionStateSchema();
            break;
        }
    }
    expect(state?.remaining).toBeGreaterThan(0);
    const corrupt = JSON.parse(JSON.stringify(state)) as NonNullable<typeof state>;
    if (field === "identity") corrupt.bonus!.selection!.outcomeId = "absent";
    if (field === "context") corrupt.bonus!.selection!.context = "logical:foreign";
    if (field === "duration") corrupt.remaining--;
    if (field === "completion") corrupt.bonus!.completed++;
    const model: DeclaredTransitionModel = {kind: "declared-transitions", initial: "bad", states: [{id: "bad", state: corrupt}], transitions: [{from: "bad", to: "bad"}], schema};
    const report = await new AdvancedModelValidator().validate(model);
    expect(report.checks).toContainEqual(expect.objectContaining({id: "invariants.executable-state", status: "violation", path: "states.0.state", message: expect.stringMatching(/identity|context|duration|completion/), evidence: expect.objectContaining({actual: expect.objectContaining({bonus: corrupt.bonus})})}));
});

it("bounds retained circular-window cells before allocating the whole outcome product", async () => {
    const model = blueprint();
    model.rows = 50;
    model.reelStrips = [Array.from({length: 100}, (_, index) => index % 2 ? "A" : "S")];
    const report = await new AdvancedModelValidator().validate({kind: "blueprint", model}, {limits: {outcomeCells: 2000, outcomes: 1000}});
    expect(report).toMatchObject({status: "budget-exhausted", verdict: "inconclusive"});
    expect(report.work.outcomes).toBeLessThan(100);
    expect(report.work.outcomeCells).toBeLessThanOrEqual(2000);
});

it("retains an established violation when a tiny witness budget cannot hold its full path", async () => {
    const report = await new AdvancedModelValidator().validate({kind: "declared-transitions", initial: "a", states: [{id: "a"}], transitions: [{from: "a", to: "missing"}]}, {limits: {evidenceNodes: 1}});
    expect(report).toMatchObject({status: "budget-exhausted", verdict: "violated"});
    expect(report.checks).toContainEqual(expect.objectContaining({id: "transitions.target", status: "violation", evidence: {retained: false, reason: expect.any(String)}}));
    expect(report.checks).toContainEqual(expect.objectContaining({id: "invariants.unresolved", status: "unknown"}));
});

it("completes the lifetime respin cap boundary without branching on singleton entropy", async () => {
    const model = blueprint();
    model.reelStrips = [["S"]];
    model.mechanics = {respins: {trigger: {symbolId: "S", minimumCount: 1}, grant: 90, maxRespins: 90, retrigger: "reset"}};
    expect(await validate(model)).toMatchObject({status: "complete", verdict: "proved-within-assumptions"});
});

it("bounds generated overscan storage even when the visible and evaluated windows are tiny", async () => {
    const model = blueprint();
    model.screenGeometry = {generated: {reels: 1, rows: 1000000}, visible: {rowOffset: 1, rows: 1}, evaluated: {rowOffset: 2, rows: 1}, paylineSpace: "evaluated"};
    const report = await new AdvancedModelValidator().validate({kind: "blueprint", model}, {limits: {outcomeCells: 2000}});
    expect(report).toMatchObject({status: "budget-exhausted", verdict: "inconclusive", work: {outcomes: 0}});
});

it("keeps nested custom state unknown without interpreting opaque field names as feature progress", async () => {
    for (const schema of [undefined, {kind: "free-games" as const, base: {kind: "custom" as const}}]) {
        const model: DeclaredTransitionModel = {kind: "declared-transitions", initial: "done", states: [{id: "done", terminal: true, state: {remaining: 7, base: {arbitrary: true}}}], transitions: [], schema};
        const report = await new AdvancedModelValidator().validate(model);
        expect(report).toMatchObject({status: "unsupported", verdict: "inconclusive"});
        expect(report.checks.some(check => check.status === "violation")).toBe(false);
        expect(report.checks).toContainEqual(expect.objectContaining({id: "invariants.state-support", status: "unknown"}));
    }
});

it.each([0.5, 2])("records an actual funded repeating prefix for a default ante multiplier %s", async costMultiplier => {
    const model = blueprint();
    model.reelStrips = [["S"]];
    model.mechanics = {freeGames: {scatterSymbol: "S", awardsByCount: {1: 2}}};
    model.betModes = [{id: "ante", runtimeType: "ante", isDefault: true, costMultiplier}];
    const report = await validate(model);
    expect(report.checks).toContainEqual(expect.objectContaining({id: "termination.free-games", status: "violation", evidence: expect.objectContaining({entryPrefix: [expect.objectContaining({mode: "ante", chargedStake: 0.05 * costMultiplier, creditsBefore: Math.max(0.05, 0.05 * costMultiplier)})], repeat: expect.objectContaining({before: expect.objectContaining({base: expect.objectContaining({freeGamesSum: 2})}), after: expect.objectContaining({base: expect.objectContaining({freeGamesSum: 4})})})})}));
});

it("requires snapshots for every reachable state before certifying state invariants", async () => {
    for (const terminal of [true, false]) {
        const model: DeclaredTransitionModel = {kind: "declared-transitions", initial: "missing", schema: {kind: "seeded-video-slot"}, states: [{id: "missing", terminal}, {id: "done", terminal: true, state: {rngState: 1, reelStrips: [["A"]]}}], transitions: terminal ? [] : [{from: "missing", to: "done"}]};
        const report = await new AdvancedModelValidator().validate(model);
        expect(report).toMatchObject({status: "unsupported", verdict: "inconclusive"});
        expect(report.checks.filter(check => check.id.startsWith("invariants.") && check.status === "pass")).toEqual([]);
        expect(report.checks).toContainEqual(expect.objectContaining({id: "invariants.state-support", status: "unknown"}));
    }
});

it.each(["bet", "owner", "balance"])("binds accounting to state and connected wallet evidence: %s", async fault => {
    const snapshot = (remaining: number, executed: number) => ({base: {}, value: 0, remaining, executed, entryBet: 1});
    const model: DeclaredTransitionModel = {kind: "declared-transitions", initial: "a", schema: {kind: "bounded-mechanics", bets: [1, 7.5], rules: {respins: {trigger: {symbolId: "A", minimumCount: 1}, grant: 2, maxRespins: 2, retrigger: "none"}}, base: {kind: "base"}},
        states: [{id: "a", state: snapshot(2, 0)}, {id: "b", state: snapshot(1, 1)}, {id: "done", terminal: true, state: snapshot(0, 2)}],
        transitions: [{from: "a", to: "b", accounting: {creditsBefore: 10, creditsAfter: 10, bet: 1, stake: 0, payout: 0, continuation: true}}, {from: "b", to: "done", accounting: {creditsBefore: 10, creditsAfter: 10, bet: 1, stake: 0, payout: 0, continuation: true}}]};
    const validator = new AdvancedModelValidator();
    const valid = await validator.validate(model);
    expect(valid).toMatchObject({status: "unsupported", verdict: "inconclusive"});
    expect(valid.checks).toContainEqual(expect.objectContaining({id: "invariants.state-support", status: "pass"}));
    expect(valid.checks).toContainEqual(expect.objectContaining({id: "invariants.money", status: "unknown"}));
    const money = model.transitions[1].accounting!;
    if (fault === "bet") money.bet = 7.5;
    if (fault === "owner") Object.assign(money, {continuation: false, stake: 1, creditsAfter: 9});
    if (fault === "balance") Object.assign(money, {creditsBefore: 100, creditsAfter: 100});
    const report = await validator.validate(model);
    expect(report.verdict).toBe("violated");
    expect(report.checks).toContainEqual(expect.objectContaining({id: "invariants.money", path: "transitions.1.accounting", status: "violation", evidence: expect.objectContaining({path: ["a", "b", "done"], actual: money, expected: expect.objectContaining({ownership: {continuation: true, bet: 1, multiplier: 1, complete: false, payout: {minimum: 0}}, connectedBalances: {before: 10}})})}));
});

it("keeps locally consistent accounting unknown without a state denomination", async () => {
    const report = await new AdvancedModelValidator().validate({kind: "declared-transitions", initial: "a", schema: {kind: "base"}, states: [{id: "a", state: {}}, {id: "b", terminal: true, state: {}}], transitions: [{from: "a", to: "b", accounting: {creditsBefore: 10, creditsAfter: 9, bet: 1, stake: 1, payout: 0}}]});
    expect(report).toMatchObject({status: "unsupported", verdict: "inconclusive"});
    expect(report.checks).toContainEqual(expect.objectContaining({id: "invariants.money", status: "unknown"}));
});

it("retains supported-reader diagnostics and handles effective-only snapshots and cancellation", async () => {
    const {validateMathDefinitionSnapshot} = await import("../../src/validation/validateMathDefinitionSnapshot.js");
    const {MathDefinitionSourceReader} = await import("../../src/diff/MathDefinitionSourceReader.js");
    const snapshot = await new MathDefinitionSourceReader().read({kind: "blueprint", model: blueprint()}, {analysisOnly: true});
    const diagnostic = {code: "reader-warning", path: "/authored~1field", severity: "warning" as const, message: "Retained source authority"};
    snapshot.diagnostics.push(diagnostic);
    snapshot.limits.push("Reader-specific limitation");
    const report = await validateMathDefinitionSnapshot(snapshot);
    expect(report.issues).toContainEqual(diagnostic);
    expect(report.limitations).toContain("Reader-specific limitation");
    Reflect.deleteProperty(snapshot, "authored");
    expect(await validateMathDefinitionSnapshot(snapshot)).toMatchObject({status: "unsupported", verdict: "inconclusive"});
    const controller = new AbortController();
    controller.abort();
    expect(await validateMathDefinitionSnapshot(snapshot, {signal: controller.signal})).toMatchObject({status: "cancelled", verdict: "inconclusive"});
    snapshot.support = "failed";
    snapshot.diagnostics.push({code: "snapshot-release-failed", path: "", severity: "error", message: "Cleanup failed"});
    expect(await validateMathDefinitionSnapshot(snapshot, {signal: controller.signal})).toMatchObject({status: "failed", issues: expect.arrayContaining([expect.objectContaining({code: "snapshot-release-failed"})])});
});

/** Retain actual handler snapshots and public wallet observations at every accepted play. */
function declaredTrace(session: import("../../src/session/videoslot/VideoSlotSessionHandling.js").VideoSlotSessionHandling<string> & import("../../src/session/SessionStateRestoring.js").SessionStateRestoring & {toSessionState(): unknown; getStakeAmount(): number; hasPendingLogicalRound(): boolean}): DeclaredTransitionModel {
    const snapshot = () => JSON.parse(JSON.stringify(session.toSessionState())) as Record<string, unknown>;
    const states: DeclaredTransitionModel["states"] = [{id: "s0", state: snapshot()}];
    const transitions: DeclaredTransitionModel["transitions"] = [];
    do {
        const creditsBefore = session.getCreditsAmount();
        const stake = session.getStakeAmount();
        const bet = session.getBet();
        const continuation = session.hasPendingLogicalRound();
        session.play();
        const index = states.length;
        states.push({id: `s${index}`, state: snapshot(), terminal: !session.hasPendingLogicalRound()});
        transitions.push({from: `s${index - 1}`, to: `s${index}`, accounting: {creditsBefore, creditsAfter: session.getCreditsAmount(), stake, payout: session.getWinAmount(), bet, continuation}});
        if (index > 10) throw new Error("Fixture did not complete its bounded feature.");
    } while (session.hasPendingLogicalRound());
    return {kind: "declared-transitions", initial: "s0", schema: session.getSessionStateSchema!(), states, transitions};
}

it.each(["zero", "subtract-threshold"] as const)("rejects zero-contribution collection growth and preserves %s resets through the shared boundary", async reset => {
    const {validateDeclaredContinuation} = await import("../../src/validation/internal/validateDeclaredContinuation.js");
    const before = {base: {}, value: 0, remaining: 1, executed: 0, entryBet: 1};
    const after = {...before, remaining: 0, executed: 1};
    const schema: NonNullable<DeclaredTransitionModel["schema"]> = {kind: "bounded-mechanics", bets: [1], rules: {collection: {symbolId: "C", contribution: 0, threshold: 10, cap: 20, payout: 3, reset}, respins: {trigger: {symbolId: "C", minimumCount: 1}, grant: 1, maxRespins: 1, retrigger: "none"}}, base: {kind: "base"}};
    const model: DeclaredTransitionModel = {kind: "declared-transitions", initial: "a", schema, states: [{id: "a", state: before}, {id: "done", terminal: true, state: after}], transitions: [{from: "a", to: "done", accounting: {creditsBefore: 10, creditsAfter: 10, stake: 0, payout: 0, bet: 1, continuation: true}}]};
    const validator = new AdvancedModelValidator();
    expect(validateDeclaredContinuation(before, after, schema)).toEqual([]);
    expect((await validator.validate(model)).checks).toContainEqual(expect.objectContaining({id: "invariants.state-support", status: "pass"}));
    Object.assign(after, {value: 9});
    expect(() => validateDeclaredContinuation(before, after, schema)).toThrow("state.value");
    const report = await validator.validate(model);
    expect(report.verdict).toBe("violated");
    expect(report.checks).toContainEqual(expect.objectContaining({id: "invariants.transition-state", path: "transitions.0", status: "violation", evidence: {path: ["a", "done"], transition: model.transitions[0], before, after, expected: {property: "state.value", relationship: {value: 0, contribution: 0, reset}}, actual: 9}}));
    Object.assign(after, {value: 0});
    for (let i = 0; i < 2; i++) expect((await validator.validate(model)).checks).toContainEqual(expect.objectContaining({id: "invariants.state-support", status: "pass"}));
    // A subtract reset may leave another threshold in the bank; one play resets once.
    before.value = reset === "zero" ? 0 : 10;
    Object.assign(after, {value: 0});
    model.transitions[0].accounting!.payout = reset === "zero" ? 0 : 3;
    model.transitions[0].accounting!.creditsAfter = reset === "zero" ? 10 : 13;
    expect(validateDeclaredContinuation(before, after, schema)).toEqual([]);
    expect((await validator.validate(model)).checks.filter(check => check.status === "violation")).toEqual([]);
});

async function holdAndWinTrace(): Promise<DeclaredTransitionModel> {
    const {generatedMechanicsGame} = await import("./fixtures/ExistingMechanicsGame.js");
    const model: GameBlueprint = {...blueprint(), reels: 2, symbols: ["A", "C"], scatters: [], availableBets: [1], reelStrips: [["C"], ["A"]], mechanics: {holdAndWin: {minimumCount: 1, initialRespins: 2, retriggerPolicy: "reset-on-new-lock", symbolEffects: {C: {kind: "value", amount: 2}}, payout: {type: "sum-with-multiplier", amountsAreBetMultiples: false}}}};
    const session = generatedMechanicsGame(model).createSession({seed: 1}) as import("../../src/session/videoslot/holdandwin/VideoSlotWithHoldAndWinSession.js").VideoSlotWithHoldAndWinSession<string>;
    session.setBet(1);
    session.setCreditsAmount(10);
    return declaredTrace(session);
}

it("binds a retained HoldAndWin settlement to credited payout, including nested modes", async () => {
    const model = await holdAndWinTrace();
    const validator = new AdvancedModelValidator();
    const original = JSON.stringify(model);
    expect((await validator.validate(model)).checks).toContainEqual(expect.objectContaining({id: "invariants.money", status: "unknown"})); // Paid-entry base win is absent.
    const settlement = model.transitions[2].accounting!;
    expect(settlement).toMatchObject({payout: 2, creditsBefore: 9, creditsAfter: 11});
    Object.assign(settlement, {payout: 0, creditsAfter: 9});
    for (const nested of [false, true]) {
        const declaration = JSON.parse(JSON.stringify(model)) as DeclaredTransitionModel;
        if (nested) {
            declaration.schema = {kind: "bet-modes", base: declaration.schema!};
            declaration.states = declaration.states.map(state => ({...state, state: {betModeId: "base", base: state.state}}));
        }
        const report = await validator.validate(declaration);
        expect(report.checks).toContainEqual(expect.objectContaining({id: "invariants.money", path: "transitions.2.accounting", status: "violation", evidence: expect.objectContaining({path: ["s0", "s1", "s2", "s3"], before: declaration.states[2].state, after: declaration.states[3].state, expected: expect.objectContaining({ownership: expect.objectContaining({payout: {exact: 2}})}), actual: settlement})}));
    }
    const repaired = JSON.parse(original) as DeclaredTransitionModel;
    // Starting at the retained continuation removes only the unsupported entry, not its constraints.
    repaired.initial = "s1";
    for (let i = 0; i < 2; i++) expect((await validator.validate(repaired)).checks).toContainEqual(expect.objectContaining({id: "invariants.money", status: "pass"}));
});

it("rejects premature HoldAndWin completion and checks decrement, new-lock reset and full-board completion", async () => {
    const {validateDeclaredContinuation} = await import("../../src/validation/internal/validateDeclaredContinuation.js");
    const model = await holdAndWinTrace();
    const schema = model.schema!;
    const before = model.states[1].state!;
    const after = model.states[3].state!;
    expect(before).toMatchObject({respinsRemaining: 2, active: true});
    expect(() => validateDeclaredContinuation(before, after, schema)).toThrow("state.progress");
    model.transitions = [{from: "s1", to: "s3", accounting: {creditsBefore: 9, creditsAfter: 11, bet: 1, stake: 0, payout: 2, continuation: true}}];
    model.initial = "s1";
    const validator = new AdvancedModelValidator();
    expect((await validator.validate(model)).checks).toContainEqual(expect.objectContaining({id: "invariants.transition-state", path: "transitions.0", status: "violation", evidence: expect.objectContaining({path: ["s1", "s3"], before, after, expected: {property: "state.progress", relationship: {active: true, respinsRemaining: 1, outcome: "suppressed"}}, actual: {active: false, respinsRemaining: 0, outcome: "completed"}})}));
    const locks = before.lockedSymbols as {position: number[]; symbolId: string; effect: unknown}[];
    const grown = {...before, lockedSymbols: [...locks, {...locks[0], position: [1, 0]}], respinsRemaining: 2, lastOutcome: {kind: "suppressed"}};
    // A larger board gains one lock and resets; a full board completes even with time remaining.
    expect(() => validateDeclaredContinuation(before, grown, {...schema, reels: 3} as typeof schema)).not.toThrow();
    const full = {...after, lockedSymbols: grown.lockedSymbols};
    expect(validateDeclaredContinuation(before, full, schema)).toEqual(expect.arrayContaining([expect.stringContaining("aggregator")]));
    grown.respinsRemaining = 1;
    expect(() => validateDeclaredContinuation(before, grown, {...schema, reels: 3} as typeof schema)).toThrow("state.progress");
    const repaired = await holdAndWinTrace();
    for (let i = 0; i < 2; i++) expect((await validator.validate(repaired)).checks.filter(check => check.status === "violation")).toEqual([]);
});

it.each([0, 2])("binds production weighted currency awards to entry accounting (duration %s)", async duration => {
    const {weightedBonusBlueprint} = await import("./fixtures/WeightedBonusGame.js");
    const {generatedMechanicsGame} = await import("./fixtures/ExistingMechanicsGame.js");
    const blueprintModel = weightedBonusBlueprint();
    blueprintModel.availableBets = [1];
    blueprintModel.paytable = {};
    const outcomes = blueprintModel.mechanics!.weightedBonus!.outcomes;
    outcomes[0].weight = 0;
    Object.assign(outcomes[1], {weight: 1, payoutUnits: "currency", duration});
    const session = generatedMechanicsGame(blueprintModel).createSession({seed: 1}) as import("../../src/session/videoslot/authored/BoundedVideoSlotSession.js").BoundedVideoSlotSession;
    session.setBet(1);
    session.setCreditsAmount(10);
    const model = declaredTrace(session);
    const validator = new AdvancedModelValidator();
    const valid = JSON.stringify(model);
    expect(model.transitions[0].accounting).toMatchObject({payout: 5, creditsAfter: 14});
    expect((await validator.validate(model)).checks.filter(check => check.status === "violation")).toEqual([]);
    // Keep the entire wallet chain connected while omitting exactly the selected entry award.
    model.transitions.forEach((edge, index) => {
        edge.accounting!.creditsAfter -= 5;
        if (index === 0) edge.accounting!.payout = 0;
        else edge.accounting!.creditsBefore -= 5;
    });
    expect((await validator.validate(model)).checks).toContainEqual(expect.objectContaining({id: "invariants.money", path: "transitions.0.accounting", status: "violation", evidence: expect.objectContaining({path: ["s0", "s1"], before: model.states[0].state, after: model.states[1].state, expected: expect.objectContaining({ownership: expect.objectContaining({bet: 1, payout: {minimum: 5}, complete: false})}), actual: expect.objectContaining({creditsBefore: 10, creditsAfter: 9, payout: 0})})}));
    const repaired = JSON.parse(valid) as DeclaredTransitionModel;
    for (let i = 0; i < 2; i++) {
        const report = await validator.validate(repaired);
        expect(report.checks.filter(check => check.status === "violation")).toEqual([]);
        expect(report.checks).toContainEqual(expect.objectContaining({id: "invariants.money", status: "unknown"})); // Ordinary evaluated wins are not retained.
    }
});

it.each(["zero", "subtract-threshold"] as const)("retains real collection %s accumulation/reset and currency payout as partially supported", async reset => {
    const {generatedMechanicsGame} = await import("./fixtures/ExistingMechanicsGame.js");
    const model: GameBlueprint = {...blueprint(), reels: 3, symbols: ["A", "C"], scatters: [], availableBets: [1], reelStrips: [["C"], ["C"], ["C"]], mechanics: {collection: {symbolId: "C", contribution: 1, threshold: 2, cap: 5, reset, payout: 3}}};
    const session = generatedMechanicsGame(model).createSession({seed: 1}) as import("../../src/session/videoslot/authored/BoundedVideoSlotSession.js").BoundedVideoSlotSession;
    session.setBet(1);
    session.setCreditsAmount(10);
    const trace = declaredTrace(session);
    expect(trace.states[1].state!.value).toBe(reset === "zero" ? 0 : 1);
    expect(trace.transitions[0].accounting).toMatchObject({payout: 3, creditsAfter: 12});
    const report = await new AdvancedModelValidator().validate(trace);
    expect(report).toMatchObject({status: "unsupported", verdict: "inconclusive"});
    expect(report.checks.filter(check => check.status === "violation")).toEqual([]);
    expect(report.checks).toContainEqual(expect.objectContaining({id: "invariants.transition-support", path: "transitions.0", evidence: expect.objectContaining({unsupported: expect.arrayContaining([expect.stringContaining("final screen count")])})}));
});

it("retains per-check unknowns for sibling respin resets, cascades, free-game grants and nested jackpot policies", async () => {
    const {validateDeclaredContinuation, declaredAccountingOwnership} = await import("../../src/validation/internal/validateDeclaredContinuation.js");
    const before = {base: {}, value: 0, remaining: 2, executed: 0, entryBet: 1};
    const after = {...before, executed: 1};
    const schema: NonNullable<DeclaredTransitionModel["schema"]> = {kind: "bounded-mechanics", bets: [1], rules: {cascade: {maxCascades: 2}, respins: {trigger: {symbolId: "C", minimumCount: 1}, grant: 2, maxRespins: 3, retrigger: "reset"}}, base: {kind: "base"}};
    expect(validateDeclaredContinuation(before, after, schema)).toEqual([expect.stringContaining("trigger screen"), expect.stringContaining("cascade stages")]);
    expect(declaredAccountingOwnership(before, after, schema)).toMatchObject({complete: false});
    const free = {base: {}, freeGamesNum: 0, freeGamesSum: 1, freeGamesBank: 2};
    const settled = {...free, freeGamesNum: 1, freeGamesBank: 5};
    const freeSchema = {kind: "free-games" as const, base: {kind: "base" as const}};
    expect(validateDeclaredContinuation(free, settled, freeSchema)).toEqual([expect.stringContaining("grant and win evaluation")]);
    expect(declaredAccountingOwnership(free, settled, freeSchema)).toEqual({continuation: true, multiplier: 1, complete: false, payout: {exact: 5}});
    const trace = await holdAndWinTrace();
    const holdBefore = trace.states[2].state!;
    const holdAfter = trace.states[3].state!;
    const wrap = (base: Record<string, unknown>, awarded: boolean) => ({base, poolStatistics: {mini: {awardCount: awarded ? 1 : 0, totalAwarded: awarded ? 3 : 0, totalContributed: 0}}, lastOutcome: awarded ? {kind: "awarded", poolId: "mini", amount: 3, baseWinAmount: 2, baseEvaluation: (holdAfter.lastOutcome as Record<string, unknown>).baseEvaluation} : {kind: "ordinary"}});
    // The outer base evaluation must itself retain the inner settlement's amount.
    const {captureWinEvaluation} = await import("../../src/session/videoslot/winevaluation/WinEvaluationSnapshot.js");
    const {WinEvaluationResult} = await import("../../src/session/videoslot/winevaluation/WinEvaluationResult.js");
    const {ValueWinComponent} = await import("../../src/session/videoslot/winevaluation/ValueWinComponent.js");
    const {WinningValue} = await import("../../src/session/videoslot/WinningValue.js");
    const nestedBefore = wrap(holdBefore, false);
    const nestedAfter = wrap(holdAfter, true);
    Object.assign(nestedAfter.lastOutcome, {baseEvaluation: captureWinEvaluation(new WinEvaluationResult({winComponents: [new ValueWinComponent(new WinningValue("C", [], 2))]}))});
    const nestedSchema = {kind: "jackpot" as const, pools: [{id: "mini", type: "fixed" as const, amount: 3}], base: trace.schema!};
    const declaration: DeclaredTransitionModel = {kind: "declared-transitions", initial: "a", schema: nestedSchema, states: [{id: "a", state: nestedBefore}, {id: "done", state: nestedAfter, terminal: true}], transitions: [{from: "a", to: "done", accounting: {creditsBefore: 9, creditsAfter: 14, bet: 1, stake: 0, payout: 5, continuation: true}}]};
    const validator = new AdvancedModelValidator();
    expect((await validator.validate(declaration)).checks.filter(check => check.status === "violation")).toEqual([]);
    Object.assign(nestedAfter.lastOutcome, {baseWinAmount: 0, baseEvaluation: {components: [], metadata: {}}});
    Object.assign(declaration.transitions[0].accounting!, {payout: 3, creditsAfter: 12});
    const broken = await validator.validate(declaration);
    expect(broken.checks).toContainEqual(expect.objectContaining({id: "invariants.transition-state", path: "transitions.0", status: "violation", evidence: expect.objectContaining({before: nestedBefore, after: nestedAfter, expected: {property: "state.lastOutcome.baseWinAmount", relationship: {exact: 2}}, actual: 0})}));
});

it("does not turn interrupted unsupported-witness retention into a feature violation", async () => {
    const state = {rngState: 1, reelStrips: [["A"]]};
    const model: DeclaredTransitionModel = {kind: "declared-transitions", initial: "a", schema: {kind: "seeded-video-slot"}, states: [{id: "a", state}, {id: "done", terminal: true, state}], transitions: [{from: "a", to: "done"}]};
    const validator = new AdvancedModelValidator();
    const interrupted = await validator.validate(model, {limits: {evidenceNodes: 1}});
    expect(interrupted).toMatchObject({status: "budget-exhausted", verdict: "inconclusive"});
    expect(interrupted.checks.filter(check => check.status === "violation")).toEqual([]);
    const retried = await validator.validate(model);
    expect(retried).toMatchObject({status: "unsupported", verdict: "inconclusive"});
    expect(retried.checks).toContainEqual(expect.objectContaining({id: "invariants.transition-support", path: "transitions.0", status: "unknown"}));
});
