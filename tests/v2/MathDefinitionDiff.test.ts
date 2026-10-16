import fs from "fs";
import os from "os";
import path from "path";
import * as api from "@fromstan/pokie";
import {fractionalBetBlueprint} from "../fixtures/math/FractionalBetFixture.js";
import {weightedBlueprint, weightedConfig, weightedGame} from "./fixtures/WeightedWholeSequenceGame.js";
import {weightedBonusBlueprint} from "./fixtures/WeightedBonusGame.js";
import {
    writeDescriptorPackage,
    writePausedDescriptorPackage,
    runtimeSnapshotNames,
} from "./fixtures/PackageExtractionFixture.js";
const modifierExample = JSON.parse(
    fs.readFileSync("examples/blueprints/wild-expanding.blueprint.json", "utf8"),
) as api.GameBlueprint;
const boundedExample = JSON.parse(
    fs.readFileSync("examples/blueprints/bounded-cascade-respins-collection.blueprint.json", "utf8"),
) as api.GameBlueprint;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const source = (model: unknown): api.MathDefinitionBlueprintInput => ({kind: "blueprint", model});
const base = (): api.GameBlueprint => ({...fractionalBetBlueprint([0.05, 7.5, 1e-7], true), rows: 2});
const free = (): api.GameBlueprint => ({
    ...base(),
    symbols: ["A", "B", "S"],
    scatters: ["S"],
    mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 2}}},
});
const hold = (): api.GameBlueprint => ({
    ...base(),
    mechanics: {
        holdAndWin: {
            minimumCount: 1,
            initialRespins: 2,
            retriggerPolicy: "reset-on-new-lock",
            symbolEffects: {A: {kind: "value", amount: 2}},
            payout: {type: "sum-with-multiplier", amountsAreBetMultiples: true},
        },
    },
});
const jackpot = (): api.GameBlueprint => ({
    ...base(),
    mechanics: {
        jackpot: {
            pool: {id: "mini", type: "fixed", amount: 10},
            contribution: {type: "percentage", percentage: 0.1},
            trigger: {type: "symbol-count", symbolId: "A", minimumCount: 3},
            award: "single-tier",
        },
    },
});
const modes = (): api.GameBlueprint => ({
    ...free(),
    betModes: [
        {id: "base", runtimeType: "base", isDefault: true},
        {id: "buy", runtimeType: "buyFeature", costMultiplier: 7.5, forcedFreeGames: 2},
    ],
});

const cases: [string, () => api.GameBlueprint, string[], unknown][] = [
    ["geometry", base, ["rows"], 1],
    ["strip", base, ["reelStrips", "1", "0"], "B"],
    ["exact sequence", () => clone(weightedBlueprint), ["reelSequences", "1", "symbols", "0"], "B"],
    ["variant symbol", () => clone(weightedBlueprint), ["reelSequences", "0", "variants", "0", "symbols", "0"], "B"],
    ["variant weight", () => clone(weightedBlueprint), ["reelSequences", "0", "variants", "0", "weight"], 1e-300],
    ["variant ID", () => clone(weightedBlueprint), ["reelSequences", "0", "variants", "0", "id"], "renamed"],
    ["payline", base, ["paylines", "0", "1"], 1],
    ["win model", () => ({...base(), winModel: {type: "ways"}}), ["winModel", "type"], "lines"],
    ["paytable", base, ["paytable", "A", "3"], 7.5],
    ["free games", free, ["mechanics", "freeGames", "awardsByCount", "3"], 3],
    ["hold continuation", hold, ["mechanics", "holdAndWin", "initialRespins"], 3],
    ["hold payout units", hold, ["mechanics", "holdAndWin", "payout", "amountsAreBetMultiples"], false],
    ["jackpot", jackpot, ["mechanics", "jackpot", "pool", "amount"], 12.5],
    ["jackpot reference", jackpot, ["mechanics", "jackpot", "pool", "id"], "major"],
    [
        "modifier",
        () => clone(modifierExample) as api.GameBlueprint,
        ["mechanics", "modifiers", "rules", "0", "positions", "0", "0"],
        0,
    ],
    ["cascade", () => clone(boundedExample) as api.GameBlueprint, ["mechanics", "cascade", "maxCascades"], 2],
    ["respin grant", () => clone(boundedExample) as api.GameBlueprint, ["mechanics", "respins", "grant"], 1],
    ["respin reset", () => clone(boundedExample) as api.GameBlueprint, ["mechanics", "respins", "retrigger"], "none"],
    ["collection", () => clone(boundedExample) as api.GameBlueprint, ["mechanics", "collection", "payout"], 0.05],
    ["bonus award", weightedBonusBlueprint, ["mechanics", "weightedBonus", "outcomes", "1", "payout"], 7.5],
    ["bonus continuation", weightedBonusBlueprint, ["mechanics", "weightedBonus", "outcomes", "1", "duration"], 1],
    ["bonus maximum", weightedBonusBlueprint, ["mechanics", "weightedBonus", "feature", "maxDuration"], 3],
    [
        "bonus payout unit",
        weightedBonusBlueprint,
        ["mechanics", "weightedBonus", "outcomes", "1", "payoutUnits"],
        "currency",
    ],
    ["bets", base, ["availableBets", "0"], 0.1],
    ["mode cost", modes, ["betModes", "1", "costMultiplier"], 0.05],
    ["forced free games", modes, ["betModes", "1", "forcedFreeGames"], 3],
];
function setAt(model: unknown, keys: string[], value: unknown): void {
    let parent = model as object;
    for (const key of keys.slice(0, -1)) parent = Reflect.get(parent, key) as object;
    Reflect.set(parent, keys[keys.length - 1], value);
}

describe("canonical math definition diff", () => {
    it("returns an empty unchanged canonical model and ignores object insertion order", async () => {
        const left = base();
        const right = {...left, paytable: {B: {3: 2}, A: {3: 5}}};
        const diff = await api.compareMathDefinitions(source(left), source(right));
        expect(diff.status).toBe("identical");
        expect(diff.changes).toEqual([]);
        expect(diff.left.support).toBe("complete");
    });
    it.each(cases)("identifies %s values and provenance", async (_family, fixture, keys, value) => {
        const left = fixture(),
            right = clone(left);
        setAt(right, keys, value);
        const diff = await api.compareMathDefinitions(source(left), source(right));
        const failingReachability = ["free games", "mode cost"].includes(_family);
        const boundedOrModifier = ["modifier", "cascade", "respin grant", "respin reset", "collection", "hold continuation", "hold payout units"].includes(_family);
        if (failingReachability) expect(diff.status).toBe("invalid");
        else if (boundedOrModifier) {
            expect(["partial", "invalid"]).toContain(diff.status);
            expect([diff.left.advanced?.verdict, diff.right.advanced?.verdict]).not.toEqual(["proved-within-assumptions", "proved-within-assumptions"]);
        } else expect(diff.status).toBe("different");
        const change = diff.changes.find((entry) => entry.path === "/" + keys.join("/"));
        expect(change).toMatchObject({
            classification: "mathematical",
            mathematical: true,
            before: {present: true},
            after: {present: true, value},
        });
        expect(change!.before.provenance.authored.present).toBe(true);
        expect(change!.after.provenance.authority).toBeTruthy();
        expect(
            diff.changes
                .filter((entry) => entry.mathematical && entry.path !== change!.path)
                .every((entry) => entry.path.startsWith("/screenGeometry")),
        ).toBe(true);
    });
    it("compares symbol weights through deterministic materialization and preserves authoring evidence", async () => {
        const left = base();
        Reflect.deleteProperty(left, "reelStrips");
        left.symbolWeights = {A: 5, B: 5};
        const right = {...left, symbolWeights: {A: 4, B: 6}};
        const diff = await api.compareMathDefinitions(source(left), source(right));
        expect(diff.status).toBe("different");
        expect(diff.changes.some((change) => change.path.startsWith("/reelStrips") && change.mathematical)).toBe(true);
        expect(diff.changes.find((change) => change.path === "/symbolWeights/A")).toMatchObject({
            classification: "representation",
            before: {value: 5},
            after: {value: 4},
        });
        expect((await api.compareMathDefinitions(source(left), source(clone(left)))).changes).toEqual([]);
    });
    it("retains escaped missing/zero/empty tables, grants and fractional machine numbers in both directions", async () => {
        const left = free();
        left.symbols.push("A/~.quoted");
        const right = clone(left);
        right.paytable["A/~.quoted"] = {3: 0};
        right.mechanics!.freeGames!.awardsByCount[2] = 0;
        for (const [a, b, added] of [
            [left, right, true],
            [right, left, false],
        ] as const) {
            const diff = JSON.parse(
                JSON.stringify(await api.compareMathDefinitions(source(a), source(b))),
            ) as api.MathDefinitionDiff;
            for (const field of ["/paytable/A~1~0.quoted/3", "/mechanics/freeGames/awardsByCount/2"]) {
                const change = diff.changes.find((entry) => entry.path === field)!;
                expect(change).toBeDefined();
                expect(change.before.present).toBe(!added);
                expect(change.after.present).toBe(added);
                expect(change.mathematical).toBe(false);
            }
            expect((diff.left.effective as Record<string, api.DefinitionJson>).availableBets).toEqual([
                0.05, 7.5, 1e-7,
            ]);
        }
        const empty = {...left, paytable: {}};
        expect((await api.compareMathDefinitions(source(empty), source(empty))).changes).toEqual([]);
        const table = {...empty, paytable: {A: {}}};
        expect((await api.compareMathDefinitions(source(empty), source(table))).changes).toContainEqual(
            expect.objectContaining({
                path: "/paytable/A",
                before: expect.objectContaining({present: false}),
                after: expect.objectContaining({present: true, value: {}}),
            }),
        );
    });
    it("distinguishes authored defaults from effective defaults without calling them math changes", async () => {
        const left = base();
        const right = {...left, winModel: {type: "lines" as const}};
        const diff = await api.compareMathDefinitions(source(left), source(right));
        expect(diff.status).toBe("different");
        expect(diff.changes.filter(change => change.classification !== "validation")).toEqual([
            expect.objectContaining({
                path: "/winModel/type",
                classification: "representation",
                mathematical: false,
                before: expect.objectContaining({present: false}),
                after: expect.objectContaining({present: true, value: "lines"}),
            }),
        ]);
    });
    it("discloses cumulative variant/bonus and reel-position ordering and tiny versus zero weight", async () => {
        for (const left of [clone(weightedBlueprint), weightedBonusBlueprint(), base()]) {
            const right = clone(left);
            if (right.reelSequences) (right.reelSequences[0] as {variants: unknown[]}).variants.reverse();
            else if (right.mechanics?.weightedBonus) right.mechanics.weightedBonus.outcomes.reverse();
            else right.reelStrips![0].reverse();
            const diff = await api.compareMathDefinitions(source(left), source(right));
            expect(diff.changes).toContainEqual(
                expect.objectContaining({classification: "order", mathematical: true, seededTraceImpact: true}),
            );
        }
        const left = clone(weightedBlueprint),
            right = clone(left);
        setAt(left, ["reelSequences", "0", "variants", "0", "weight"], 0);
        setAt(right, ["reelSequences", "0", "variants", "0", "weight"], 1e-300);
        expect((await api.compareMathDefinitions(source(left), source(right))).changes).toContainEqual(
            expect.objectContaining({
                path: "/reelSequences/0/variants/0/weight",
                before: expect.objectContaining({value: 0}),
                after: expect.objectContaining({value: 1e-300}),
            }),
        );
    });
    it("exposes invalid contexts, referenced targets and added/removed/changed validation diagnostics", async () => {
        const left = weightedBonusBlueprint(),
            right = clone(left);
        setAt(right, ["mechanics", "weightedBonus", "context"], "continuation");
        setAt(right, ["mechanics", "weightedBonus", "outcomes", "1", "targetId"], "missing");
        const diff = await api.compareMathDefinitions(source(left), source(right));
        expect(diff.status).toBe("invalid");
        expect(diff.changes.some((change) => change.path === "/mechanics/weightedBonus/context")).toBe(true);
        expect(
            diff.right.diagnostics.some((issue) => issue.path.includes("targetId") && issue.severity === "error"),
        ).toBe(true);
        expect(
            diff.changes.some(
                (change) => change.classification === "validation" && !change.before.present && change.after.present,
            ),
        ).toBe(true);
        const reversed = await api.compareMathDefinitions(source(right), source(left));
        expect(
            reversed.changes.some(
                (change) => change.classification === "validation" && change.before.present && !change.after.present,
            ),
        ).toBe(true);
        const reader = new api.MathDefinitionSourceReader();
        const snapshot = await reader.read(source(base()));
        snapshot.diagnostics = [{code: "stable", path: "/paytable", severity: "warning", message: "before"}];
        const changed = clone(snapshot);
        changed.diagnostics[0].message = "after";
        expect(new api.MathDefinitionDiffer().diff(snapshot, changed).changes).toContainEqual(
            expect.objectContaining({
                path: "/validation/~1paytable/stable",
                classification: "validation",
                before: expect.objectContaining({value: expect.objectContaining({message: "before"})}),
                after: expect.objectContaining({value: expect.objectContaining({message: "after"})}),
            }),
        );
    });
    it.each([NaN, Infinity, -Infinity, undefined, "0.05"])(
        "rejects malformed direct numeric stakes %s explicitly",
        async (value) => {
            const model = base();
            Reflect.set(model, "availableBets", [value]);
            expect((await api.compareMathDefinitions(source(model), source(base()))).status).toBe("invalid");
        },
    );
    it("compares declared max-win policy value/units/scope without installing a payout cap", async () => {
        const left = {
            ...source(base()),
            maxWinPolicy: {
                type: "declared" as const,
                value: 5,
                unit: "bet-multiple" as const,
                scope: "logical-round" as const,
                authority: "custom collaborator declaration",
            },
        };
        const right = {...left, maxWinPolicy: {...left.maxWinPolicy, value: 7.5}};
        const diff = await api.compareMathDefinitions(left, right);
        expect(diff.changes).toContainEqual(
            expect.objectContaining({
                path: "/maxWinPolicy/value",
                classification: "mathematical",
                before: expect.objectContaining({value: 5}),
                after: expect.objectContaining({value: 7.5}),
            }),
        );
        expect(base().paytable.A[3]).toBe(5);
    });
    it("leaves weighted sequence and weighted bonus payouts, continuation state and subsequent RNG unchanged", async () => {
        const config = weightedConfig();
        const rng = new api.SeededRandomNumberGenerator(31);
        const session = new api.VideoSlotSession(config, new api.SymbolsCombinationsGenerator(config, rng));
        session.setCreditsAmount(100);
        session.setBet(1);
        const state = clone(session.toSessionState());
        const before = clone(weightedBlueprint);
        await api.compareMathDefinitions(source(weightedBlueprint), source(clone(weightedBlueprint)));
        expect(weightedBlueprint).toEqual(before);
        expect(session.toSessionState()).toEqual(state);
        const make = () => {
            const blueprint = weightedBonusBlueprint(),
                slot = new api.VideoSlotConfig();
            slot.setReelsNumber(3);
            slot.setReelsSymbolsNumber(1);
            slot.setAvailableSymbols(blueprint.symbols);
            slot.setWildSymbols([]);
            slot.setScatterSymbols([]);
            slot.setAvailableBets(blueprint.availableBets!);
            slot.setSymbolsSequences(blueprint.reelStrips!.map((strip) => new api.SymbolsSequence().fromArray(strip)));
            const payouts = new api.Paytable<string>(blueprint.availableBets!);
            payouts.setPayoutForSymbol("C", 3, 2);
            slot.setPaytable(payouts);
            const random = new api.SeededRandomNumberGenerator(31);
            const game = new api.BoundedVideoSlotSession(
                slot,
                new api.SymbolsCombinationsGenerator(slot, random),
                blueprint.mechanics!,
            );
            game.setCreditsAmount(100);
            game.setBet(0.05);
            return {game, random};
        };
        const a = make(),
            b = make();
        a.game.play();
        b.game.play();
        const saved = clone(a.game.toSessionState());
        await api.compareMathDefinitions(source(weightedBonusBlueprint()), source(weightedBonusBlueprint()));
        expect(a.game.toSessionState()).toEqual(saved);
        expect(a.game.getWinAmount()).toBe(3.1);
        for (let i = 0; i < 4; i++) {
            a.game.play();
            b.game.play();
            expect(a.game.toSessionState()).toEqual(b.game.toSessionState());
            expect(a.game.getWinAmount()).toBe(b.game.getWinAmount());
        }
        expect(a.random.getRandomInt(0, 4294967296)).toBe(b.random.getRandomInt(0, 4294967296));
    });
    it("never certifies opaque, unknown-policy, unsupported or incompatible custom packages as identical", async () => {
        const model = base();
        const game: api.PokieGame = {
            getManifest: () => model.manifest,
            createSession: () => {
                throw new Error("must not run");
            },
        };
        expect((await api.compareMathDefinitions(game, game)).status).toBe("partial");
        game.getModelDescriptor = () => ({
            descriptorVersion: 1,
            blueprintSchemaVersion: 1,
            sourceKind: "custom",
            model,
        });
        expect((await api.compareMathDefinitions(game, game)).status).toBe("partial");
        game.getModelDescriptor = () => ({
            descriptorVersion: 1,
            blueprintSchemaVersion: 1,
            sourceKind: "custom",
            model,
            maxWinPolicy: {type: "none", scope: "logical-round", authority: "declared custom runtime"},
        });
        expect((await api.compareMathDefinitions(game, game)).status).toBe("partial");
        game.getModelDescriptor = () => ({
            descriptorVersion: 1,
            blueprintSchemaVersion: 1,
            sourceKind: "custom",
            model,
            unsupported: [{path: "calculator", code: "opaque", message: "custom collaborator"}],
        });
        expect((await api.compareMathDefinitions(game, game)).status).not.toBe("identical");
        game.getModelDescriptor = () => {
            throw new Error("descriptor failure");
        };
        expect((await api.compareMathDefinitions(game, game)).status).toBe("failed");
    });
    it("cancels before acquisition and drains asynchronous reads and owned snapshots before returning", async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "definition-diff-"));
        try {
            const sourcePath = writeDescriptorPackage(root);
            const aborted = new AbortController();
            aborted.abort();
            const extraction = jest.spyOn(api.PackageBlueprintExtraction.prototype, "extract");
            const diff = await api.compareMathDefinitions(sourcePath, sourcePath, {signal: aborted.signal});
            expect(diff.status).toBe("cancelled");
            expect(extraction).not.toHaveBeenCalled();
            extraction.mockRestore();
            const paused = writePausedDescriptorPackage(root, undefined, {pauseAtRead: 1});
            const controller = new AbortController();
            let finished = false;
            const running = api
                .compareMathDefinitions(paused.source, sourcePath, {signal: controller.signal})
                .then((result) => {
                    finished = true;
                    return result;
                });
            await paused.readStarted;
            controller.abort();
            expect(finished).toBe(false);
            paused.settle();
            expect((await running).status).toBe("cancelled");
            paused.restore();
        } finally {
            fs.rmSync(root, {recursive: true, force: true});
        }
    });
});

describe("definition acquisition and cleanup boundaries", () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "definition-boundaries-"));
    });
    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(root, {recursive: true, force: true});
    });
    it("compares known partial fields while withholding a complete equality claim and caller releases", async () => {
        const model = base();
        const release = jest.fn();
        const make = (bet: number): api.PokieGame => ({
            getManifest: () => model.manifest,
            release,
            getModelDescriptor: () => ({
                descriptorVersion: 1,
                blueprintSchemaVersion: 1,
                sourceKind: "custom",
                model: {manifest: model.manifest, availableBets: [bet]},
            }),
            createSession: () => {
                throw new Error("must not run");
            },
        });
        const diff = await api.compareMathDefinitions(make(0.05), make(1e-7));
        expect(diff.status).toBe("partial");
        expect(diff.changes).toContainEqual(
            expect.objectContaining({
                path: "/availableBets/0",
                before: expect.objectContaining({value: 0.05}),
                after: expect.objectContaining({value: 1e-7}),
            }),
        );
        expect(release).not.toHaveBeenCalled();
    });
    it("does not invoke package config-hash or session getters during definition source recognition", async () => {
        const sourcePath = writeDescriptorPackage(root);
        const marker = path.join(root, "unexpected-hash-read");
        fs.appendFileSync(
            path.join(sourcePath, "index.js"),
            `\nmodule.exports.getConfigHash = () => {require("fs").writeFileSync(${JSON.stringify(
                marker,
            )}, "called"); throw new Error("Not a definition reader");};`,
        );
        expect((await api.compareMathDefinitions(sourcePath, sourcePath)).status).toBe("partial");
        expect(fs.existsSync(marker)).toBe(false);
    });
    it.each([false, true])(
        "drains the other owned read when %s side fails and retains unrelated runtime leases",
        async (reverse) => {
            const broken = writeDescriptorPackage(root, {
                name: "broken",
                descriptorBody: 'return Promise.reject(new Error("descriptor rejected"));',
            });
            const paused = writePausedDescriptorPackage(root, undefined, {pauseAtRead: 1});
            try {
                let settled = false;
                const running = api
                    .compareMathDefinitions(reverse ? broken : paused.source, reverse ? paused.source : broken)
                    .then((diff) => {
                        settled = true;
                        return diff;
                    });
                await paused.readStarted;
                expect(settled).toBe(false);
                paused.settle();
                const result = await running;
                expect(result.status).toBe("failed");
                expect(
                    [result.left, result.right].some((side) =>
                        side.diagnostics.some((issue) => issue.message.includes("descriptor rejected")),
                    ),
                ).toBe(true);
            } finally {
                paused.restore();
            }
            const own = await api.loadPokieGameRuntime(paused.source);
            try {
                const snapshots = runtimeSnapshotNames(paused.source);
                await api.compareMathDefinitions(paused.source, own.game);
                expect(runtimeSnapshotNames(paused.source)).toEqual(snapshots);
                expect(own.game.getManifest().id).toBeTruthy();
            } finally {
                await own.release();
            }
        },
    );
    it("keeps cleanup failure authoritative over equality and cancellation", async () => {
        const sourcePath = writeDescriptorPackage(root);
        const controller = new AbortController();
        const rm = fs.rmSync.bind(fs);
        jest.spyOn(fs, "rmSync").mockImplementation((target, options) => {
            rm(target, options);
            if (path.basename(String(target)).startsWith("pokie-runtime-")) {
                controller.abort();
                throw new Error("owned snapshot cleanup failed");
            }
        });
        const result = await api.compareMathDefinitions(sourcePath, sourcePath, {signal: controller.signal});
        expect(result.status).toBe("failed");
        expect(
            [result.left, result.right].some((side) =>
                side.diagnostics.some((issue) => issue.code === "snapshot-release-failed"),
            ),
        ).toBe(true);
    });
});

describe("authoritative exchange source adapters", () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "definition-exchange-"));
    });
    afterEach(() => {
        fs.rmSync(root, {recursive: true, force: true});
    });
    it("compares PAR through its importer and retains exchange limitations", async () => {
        const file = path.join(root, "model.xlsx");
        const model = base();
        await new api.ParSheetExporter("1.3.0").exportToFile(model, file);
        const result = await api.compareMathDefinitions(file, source(model));
        expect(["identical", "different", "partial"]).toContain(result.status);
        expect(result.left.identity.kind).toBe("parWorkbook");
        expect(result.left.limits.some((limit) => limit.includes("PAR"))).toBe(true);
        expect(result.changes.some((change) => change.mathematical)).toBe(false);
    });
    it("reports authoritative canonical WASM payouts and explicit incomplete inventory rather than guessing equality", async () => {
        const {createCanonicalWasmFixture} = await import("../fixtures/wasm/createCanonicalWasmFixture.js");
        const write = (name: string, payout: number) => {
            const fixture = createCanonicalWasmFixture({
                capabilities: ["runtime.play", "runtime.serialize", "artifact.inspect"],
                paytable: {A: {2: payout}, absent: {2: 7}},
            });
            const file = path.join(root, name + ".wasm");
            fs.writeFileSync(file, fixture.bytes);
            fs.writeFileSync(file + ".pokie-wasm.json", JSON.stringify(fixture.manifest));
            return file;
        };
        const left = write("left", 2),
            right = write("right", 5);
        const diff = await api.compareMathDefinitions(left, right);
        expect(diff.status).toBe("partial");
        expect(diff.changes).toContainEqual(
            expect.objectContaining({
                path: "/paytable/A/2",
                before: expect.objectContaining({value: 2}),
                after: expect.objectContaining({value: 5}),
            }),
        );
        expect((await api.compareMathDefinitions(left, left)).status).toBe("partial");
    });
    it("never reconstructs definitions from outcome-only project artifacts", async () => {
        const input: api.PokieProject = {
            type: "outcomeLibrary",
            rootPath: root,
            capabilities: api.PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
            provenance: "test recognized artifact",
        };
        const diff = await api.compareMathDefinitions(input, input);
        expect(diff.status).toBe("unsupported");
        expect(diff.left.diagnostics[0].code).toBe("outcome-only-definition-unavailable");
    });
});

it("uses the empty JSON Pointer for a root change and classifies equal-value authority changes", async () => {
    const reader = new api.MathDefinitionSourceReader();
    const left = await reader.read(source(base()));
    const right = clone(left);
    const field = right.fields.find((field) => field.path === "paytable.A.3")!;
    field.authority = "replacement declaration authority";
    expect(new api.MathDefinitionDiffer().diff(left, right).changes).toEqual([
        expect.objectContaining({path: "/paytable/A/3", classification: "provenance", mathematical: false}),
    ]);
    const missing = {
        identity: {kind: "unsupported"},
        support: "unsupported" as const,
        fields: [],
        diagnostics: [],
        limits: [],
    };
    expect(new api.MathDefinitionDiffer().diff(missing, {...missing, effective: null}).changes[0]).toMatchObject({
        path: "",
        before: {present: false},
        after: {present: true, value: null},
    });
});

it("does not trust a direct snapshot's complete label when model data or policy is absent", async () => {
    const opaque: api.MathDefinitionSnapshot = {
        identity: {kind: "custom", revision: "equal-hash"},
        support: "complete",
        fields: [],
        diagnostics: [],
        limits: [],
    };
    const differ = new api.MathDefinitionDiffer();
    expect(differ.diff(opaque, opaque).status).toBe("partial");
    expect(opaque.support).toBe("complete");
    const model = await new api.MathDefinitionSourceReader().read(source(base()));
    Reflect.deleteProperty(model.effective as object, "maxWinPolicy");
    expect(differ.diff(model, model).status).toBe("partial");
});


describe("reviewed field semantics", () => {
    it.each(["label", "targetRtp", "ignored paylines", "default factor"])("retains %s as representation with literal reels", async (field) => {
        const left = field === "default factor" ? clone(modifierExample) : modes();
        if (field === "default factor") Reflect.deleteProperty(left.mechanics!.modifiers!.wilds[0], "factor");
        if (field === "ignored paylines") left.winModel = {type: "ways"};
        const right = clone(left);
        if (field === "label") right.betModes![0].label = "Renamed";
        if (field === "targetRtp") right.betModes![0].targetRtp = 0.96;
        if (field === "ignored paylines") right.paylines = [[1, 1, 1]];
        if (field === "default factor") right.mechanics!.modifiers!.wilds[0].factor = 1;
        const diff = await api.compareMathDefinitions(source(left), source(right));
        expect(diff.status).toBe(field === "default factor" ? "partial" : "different");
        expect(diff.changes.length).toBeGreaterThan(0);
        expect(diff.changes.every((change) => !change.mathematical)).toBe(true);
        if (field === "default factor") {
            right.mechanics!.modifiers!.wilds[0].factor = 2;
            expect((await api.compareMathDefinitions(source(left), source(right))).changes).toContainEqual(
                expect.objectContaining({path: "/mechanics/modifiers/wilds/0/factor", mathematical: true}),
            );
        }
    });

    it("does not invent unsupported paylines and propagates unknown ancestor authority before defaults", async () => {
        const model = base();
        Reflect.deleteProperty(model, "paylines");
        const snapshot = await new api.MathDefinitionSourceReader().read({
            getManifest: () => model.manifest,
            getModelDescriptor: () => ({descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model,
                maxWinPolicy: {type: "none", scope: "logical-round", authority: "custom declaration"},
                unsupported: [{path: "paylines", code: "custom-lines", message: "Unknown custom lines"}],}),
            createSession: () => {
                throw new Error("No session");
            },
        });
        expect(snapshot.effective).not.toHaveProperty("paylines");
        const known = clone(snapshot);
        (known.effective as Record<string, api.DefinitionJson>).paylines = [[1, 1, 1]];
        known.fields = known.fields.filter((field) => field.status !== "unsupported");
        const diff = new api.MathDefinitionDiffer().diff(known, snapshot);
        const change = diff.changes.find((change) => change.path.startsWith("/paylines"))!;
        expect(change.after).toMatchObject({present: false, provenance: {status: "unknown", authority: "custom-lines"}});
        expect(change.mathematical).toBe(false);
        const child = clone(known);
        child.fields.push({path: "paytable", status: "unsupported", authority: "opaque calculator"});
        (child.effective as typeof model).paytable.A[3] = 9;
        expect(new api.MathDefinitionDiffer().diff(known, child).changes).toContainEqual(expect.objectContaining({
            path: "/paytable/A/3", mathematical: false,
            after: expect.objectContaining({provenance: expect.objectContaining({status: "unknown", authority: "opaque calculator"})}),
        }));
    });

    it.each([
        [() => clone(modifierExample), "mechanics.modifiers.wilds.0.factor"],
        [() => clone(weightedBlueprint), "reelSequences.0.variants.0.weight"],
        [modes, "betModes.0.runtimeType"],
    ] as const)("traverses equal-value provenance inside arrays (%s, %s)", async (fixture, path) => {
        const left = await new api.MathDefinitionSourceReader().read(source(fixture()));
        const right = clone(left);
        right.fields.find((field) => field.path === path)!.authority = "replacement authority";
        expect(new api.MathDefinitionDiffer().diff(left, right).changes).toEqual([expect.objectContaining({
            path: "/" + path.split(".").join("/"), classification: "provenance", mathematical: false,
            after: expect.objectContaining({provenance: expect.objectContaining({authority: "replacement authority"})}),
        })]);
    });
});


describe("remaining comparison information loss", () => {
    it.each(["exact reels", "symbol inventory", "metadata mode cost", "metadata mode default"])(
        "retains %s edits with equal effective runtime behavior", async field => {
            const left = base();
            left.betModes = [{id: "legacy", costMultiplier: 2}];
            const right = clone(left);
            if (field === "exact reels") {
                right.reelSequences = right.reelStrips!.map(symbols => ({type: "exact", symbols}));
                Reflect.deleteProperty(right, "reelStrips");
            }
            if (field === "symbol inventory") right.symbols.reverse();
            if (field === "metadata mode cost") right.betModes![0].costMultiplier = 7.5;
            if (field === "metadata mode default") right.betModes![0].isDefault = true;
            for (const [a, b] of [[left, right], [right, left]]) {
                const diff = await api.compareMathDefinitions(source(a), source(b));
                expect(diff.status).toBe("different");
                expect(diff.changes.length).toBeGreaterThan(0);
                expect(diff.changes.every(change => !change.mathematical)).toBe(true);
                if (field === "exact reels") {
                    expect(diff.changes.map(change => change.path)).toEqual(expect.arrayContaining([
                        "/reelStrips", "/reelSequences",
                    ]));
                }
                if (field === "symbol inventory") expect(diff.changes).toContainEqual(expect.objectContaining({
                    path: "/symbols", classification: "order", seededTraceImpact: false,
                }));
            }
            const sessions = [left, right].map(model => weightedGame(model).createSession({seed: 19}) as api.VideoSlotSession);
            for (const session of sessions) {
                session.setCreditsAmount(100);
                session.setBet(0.05);
            }
            for (let round = 0; round < 10; round++) {
                sessions.forEach(session => session.play());
                expect(sessions[0].getWinAmount()).toBe(sessions[1].getWinAmount());
                expect(sessions[0].toSessionState()).toEqual(sessions[1].toSessionState());
            }
            if (field === "exact reels") {
                right.reelSequences![0] = {type: "exact", symbols: ["B", "A"]};
                const changed = await api.compareMathDefinitions(source(left), source(right));
                expect(changed.changes).toContainEqual(expect.objectContaining({
                    path: "/reelStrips/0", classification: "order", mathematical: true, seededTraceImpact: true,
                    after: expect.objectContaining({provenance: expect.objectContaining({authored: {present: true, value: ["B", "A"]}})}),
                }));
            }
        },
    );

    it("keeps raw-hash generation effects and executable mode costs mathematical", async () => {
        const left = base();
        Reflect.deleteProperty(left, "reelStrips");
        left.symbolWeights = {A: 10, B: 10};
        const right = {...left, symbols: [...left.symbols].reverse()};
        const generated = await api.compareMathDefinitions(source(left), source(right));
        expect(generated.changes).toContainEqual(expect.objectContaining({path: "/symbols", mathematical: false}));
        expect(generated.changes.some(change => change.path.startsWith("/reelStrips") && change.mathematical)).toBe(true);
        const a = modes(), 
            b = clone(a);
        b.betModes![1].costMultiplier = 9;
        expect((await api.compareMathDefinitions(source(a), source(b))).changes).toContainEqual(expect.objectContaining({
            path: "/betModes/1/costMultiplier", mathematical: true,
        }));
        const custom = await new api.MathDefinitionSourceReader().read(source({...base(), betModes: [{id: "custom", costMultiplier: 2}]}));
        custom.identity = {kind: "package", descriptorKind: "custom"};
        const edited = clone(custom);
        (edited.effective as unknown as api.GameBlueprint).betModes![0].costMultiplier = 7.5;
        expect(new api.MathDefinitionDiffer().diff(custom, edited).changes).toContainEqual(expect.objectContaining({
            path: "/betModes/0/costMultiplier", mathematical: true,
        }));
    });

    it.each(["paytable", "wilds", "mechanics", "reelStrips", "betModes.0"])(
        "compares authority on empty and nonempty containers: %s", async field => {
            const model = modes();
            model.paytable = {};
            model.mechanics = {};
            model.betModes = [{id: "legacy"}];
            const left = await new api.MathDefinitionSourceReader().read(source(model));
            const right = clone(left);
            right.fields.find(entry => entry.path === field)!.authority = "replacement container authority";
            for (const [a, b] of [[left, right], [right, left]]) {
                const diff = new api.MathDefinitionDiffer().diff(a, b);
                expect(diff.status).toBe("different");
                expect(diff.changes).toEqual([expect.objectContaining({
                    path: "/" + field.replace(/\./g, "/"), classification: "provenance", mathematical: false,
                })]);
            }
        },
    );

    it("preserves each missing-payout warning through removal, reverse addition and diagnostic reordering", async () => {
        const model = {...base(), symbols: ["A", "B", "C"], paytable: {}};
        const reader = new api.MathDefinitionSourceReader();
        const left = await reader.read(source(model));
        const right = await reader.read(source({...model, paytable: {A: {3: 0}}}));
        const missing = (snapshot: api.MathDefinitionSnapshot) => snapshot.diagnostics.filter(issue => issue.code === "blueprint-symbol-missing-payout");
        expect(missing(left)).toHaveLength(3);
        expect(missing(right)).toHaveLength(2);
        expect(missing(left).every(issue => issue.path === "")).toBe(true);
        for (const [a, b, added] of [[left, right, false], [right, left, true]] as const) {
            const diff = new api.MathDefinitionDiffer().diff(a, b);
            const changes = diff.changes.filter(change => change.classification === "validation" && change.path.includes("blueprint-symbol-missing-payout"));
            expect(changes).toHaveLength(1);
            expect(changes[0].before.present).toBe(!added);
            expect(changes[0].after.present).toBe(added);
            const value = added ? changes[0].after : changes[0].before;
            expect(value).toMatchObject({value: {message: expect.stringContaining('Symbol "A"')}});
        }
        const shuffled = clone(left);
        shuffled.diagnostics.reverse();
        expect(new api.MathDefinitionDiffer().diff(left, shuffled).changes).toEqual([]);
    });

    it("retains colliding messages and severities and deduplicates only exact normalized copies", async () => {
        const left = await new api.MathDefinitionSourceReader().read(source(base()));
        const issue: api.MathDefinitionDiagnostic = {code: "same", path: "betModes[0].costMultiplier", message: "A", severity: "warning"};
        left.diagnostics = [issue, {...issue, path: "/betModes/0/costMultiplier"}, {...issue, message: "B"}, {...issue, severity: "error"}];
        const right = clone(left);
        right.diagnostics = [{...issue, message: "changed", severity: "info"}, {...issue, message: "B"}, {...issue, severity: "error"}];
        const result = new api.MathDefinitionDiffer().diff(left, right);
        expect(result.left.diagnostics).toHaveLength(3);
        expect(result.left.diagnostics.every(entry => entry.path === "/betModes/0/costMultiplier")).toBe(true);
        expect(result.changes.filter(change => change.classification === "validation")).toHaveLength(2);
        expect(new Set(result.changes.map(change => change.path)).size).toBe(result.changes.length);
        const single = clone(left), 
            changed = clone(left);
        single.diagnostics = [issue];
        changed.diagnostics = [{...issue, message: "changed", severity: "error"}];
        expect(new api.MathDefinitionDiffer().diff(single, changed).changes).toEqual([expect.objectContaining({
            path: "/validation/~1betModes~10~1costMultiplier/same",
            before: expect.objectContaining({value: expect.objectContaining({severity: "warning", message: "A"})}),
            after: expect.objectContaining({value: expect.objectContaining({severity: "error", message: "changed"})}),
        })]);
    });

    it("rejects malformed metadata costs without coercion and supports repeated repaired reuse", async () => {
        const reader = new api.MathDefinitionSourceReader(), 
            differ = new api.MathDefinitionDiffer();
        const good = {...base(), betModes: [{id: "legacy", costMultiplier: 2}]};
        const bad = clone(good);
        Reflect.set(bad.betModes[0], "costMultiplier", "7.5");
        expect(new api.GameBlueprintValidator().validate(bad)).toContainEqual(expect.objectContaining({
            path: "betModes[0].costMultiplier", severity: "error",
        }));
        for (const model of [good, bad, good, good]) {
            const snapshot = await reader.read(source(model));
            const direct = differ.diff(snapshot, snapshot);
            const publicResult = await api.compareMathDefinitions(source(model), source(model), {reader});
            expect(publicResult).toEqual(direct);
            expect(direct.status).toBe(model === bad ? "invalid" : "identical");
            if (model === bad) expect(snapshot.diagnostics).toContainEqual(expect.objectContaining({
                path: "/betModes/0/costMultiplier", severity: "error",
            }));
        }
        expect(bad.betModes[0].costMultiplier).toBe("7.5");
    });
});


describe("segment authority and retained provenance", () => {
    const customSource = (model: api.GameBlueprint, path: string): api.PokieGame => ({
        getManifest: () => model.manifest,
        getModelDescriptor: () => ({descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model,
            maxWinPolicy: {type: "none", scope: "logical-round", authority: "declared policy"},
            unsupported: [{path, code: "custom-field", message: "Unavailable custom collaborator"}],}),
        createSession: () => {
            throw new Error("No session during comparison");
        },
    });

    it.each([
        "betModes.0.costMultiplier", "betModes[0].costMultiplier", '$.betModes[0]["costMultiplier"]',
        "/betModes/0/costMultiplier",
    ])("shares %s authority through extraction, defaults and both direct comparison APIs", async path => {
        const reader = new api.MathDefinitionSourceReader();
        const model = {...base(), betModes: [{id: "custom"}]};
        const changed = clone(model);
        changed.betModes[0] = {...changed.betModes[0], ...{costMultiplier: 7.5}};
        const a = customSource(model, path),
            b = customSource(changed, path);
        const left = await reader.read(a),
            right = await reader.read(b);
        expect((left.effective as unknown as api.GameBlueprint).betModes![0]).not.toHaveProperty("costMultiplier");
        expect(left.diagnostics).toContainEqual(expect.objectContaining({path: "/betModes/0/costMultiplier", code: "custom-field"}));
        for (const [before, after, x, y] of [[left, right, a, b], [right, left, b, a]] as const) {
            const result = new api.MathDefinitionDiffer().diff(before, after);
            expect(await api.compareMathDefinitions(x, y, {reader})).toEqual(result);
            expect(result.status).toBe("unsupported");
            expect(result.changes).toContainEqual(expect.objectContaining({
                path: "/betModes/0/costMultiplier", mathematical: false,
                before: expect.objectContaining({provenance: expect.objectContaining({status: "unknown", authority: "custom-field"})}),
                after: expect.objectContaining({provenance: expect.objectContaining({status: "unknown", authority: "custom-field"})}),
            }));
        }
        const repaired = clone(changed);
        for (let use = 0; use < 2; use++) {
            const known = await reader.read(source(repaired));
            expect(new api.MathDefinitionDiffer().diff(known, known).status).toBe("identical");
        }
    });

    it.each(["winModel.type", 'winModel["type"]', "/winModel/type", "screenGeometry.evaluated.rows", "/screenGeometry/evaluated/rows", "paylines[0][1]"])(
        "does not infer dependent horizontal lines from unsupported %s", async path => {
            const model = base();
            Reflect.deleteProperty(model, "paylines");
            const snapshot = await new api.MathDefinitionSourceReader().read(customSource(model, path));
            expect(snapshot.effective).not.toHaveProperty("paylines");
            if (path.includes("winModel")) expect(snapshot.effective).not.toHaveProperty("winModel.type");
        },
    );

    it.each(["$", "/maxWinPolicy", 'maxWinPolicy["type"]'])("filters synthesized policy evidence under unsupported %s", async path => {
        const model = base();
        const snapshot = await new api.MathDefinitionSourceReader().read({
            ...customSource(model, path),
            getModelDescriptor: () => ({descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "generated", model,
                unsupported: [{path, code: "custom-field", message: "Unavailable collaborator"}],}),
        });
        if (path.endsWith('["type"]')) expect(snapshot.effective).not.toHaveProperty("maxWinPolicy.type");
        else expect(snapshot.effective).not.toHaveProperty("maxWinPolicy");
        expect(snapshot.authored).toEqual(model);
    });

    it.each(["A.B", "A/B~C", 'A[0]"\\', "$"])("keeps literal symbol %s distinct from nested authority", async symbol => {
        const model = base();
        model.symbols.push(symbol);
        model.paytable[symbol] = {3: 2};
        const changed = clone(model);
        changed.paytable[symbol][3] = 9;
        const reader = new api.MathDefinitionSourceReader();
        const left = await reader.read(customSource(model, "paytable.A"));
        const right = await reader.read(customSource(changed, "paytable.A"));
        const path = "/paytable/" + symbol.replace(/~/g, "~0").replace(/\//g, "~1") + "/3";
        expect(new api.MathDefinitionDiffer().diff(left, right).changes).toContainEqual(expect.objectContaining({
            path, mathematical: true,
            after: expect.objectContaining({provenance: expect.objectContaining({status: "authored"})}),
        }));
        for (const authorityPath of [`paytable[${JSON.stringify(symbol)}]`, "/paytable/" + symbol.replace(/~/g, "~0").replace(/\//g, "~1")]) {
            const result = await api.compareMathDefinitions(customSource(model, authorityPath), customSource(changed, authorityPath));
            expect(result.changes).toContainEqual(expect.objectContaining({
                path, mathematical: false,
                after: expect.objectContaining({provenance: expect.objectContaining({status: "unknown"})}),
            }));
        }
    });

    it.each(["reelSequences", "reelSequences.0", "reelSequences.0.type", "reelSequences.0.symbols", "reelSequences.0.symbols.0",
        "paytable.B", "paytable.A.2", "mechanics.freeGames"])(
        "retains authority-only changes at %s in both directions without inventing values", async field => {
            const model = base();
            model.reelSequences = model.reelStrips!.map(symbols => ({type: "exact", symbols}));
            Reflect.deleteProperty(model, "reelStrips");
            Reflect.deleteProperty(model.paytable, "B");
            const left = await new api.MathDefinitionSourceReader().read(source(model));
            expect(left.support).toBe("complete");
            const right = clone(left);
            right.fields.find(entry => entry.path === field)!.authority = "replacement retained authority";
            for (const [a, b] of [[left, right], [right, left]]) {
                const result = new api.MathDefinitionDiffer().diff(a, b);
                expect(result.status).toBe("different");
                const absent = !field.startsWith("reelSequences");
                expect(result.changes).toEqual([expect.objectContaining({
                    path: "/" + field.split(".").join("/"), classification: "provenance", mathematical: false,
                    before: expect.objectContaining({present: !absent}), after: expect.objectContaining({present: !absent}),
                })]);
                if (absent) expect(JSON.stringify(result.changes)).not.toContain('"value":');
            }
            expect(new api.MathDefinitionDiffer().diff(left, clone(left)).changes).toEqual([]);
            const respelled = clone(left);
            respelled.fields.find(entry => entry.path === field)!.path = "/" + field.split(".").join("/");
            expect(new api.MathDefinitionDiffer().diff(left, respelled).changes).toEqual([]);
        },
    );

    it.each(["reelSequences[0].symbols", "/reelSequences/0/type"])("does not normalize unknown exact sequence evidence at %s", async path => {
        const model = base();
        model.reelSequences = model.reelStrips!.map(symbols => ({type: "exact", symbols}));
        Reflect.deleteProperty(model, "reelStrips");
        const left = await new api.MathDefinitionSourceReader().read(customSource(model, path));
        const right = clone(left);
        (right.effective as unknown as api.GameBlueprint).reelSequences![0] = {type: "exact", symbols: ["B", "A"]};
        const result = new api.MathDefinitionDiffer().diff(left, right);
        expect(result.changes.every(change => !change.path.startsWith("/reelStrips"))).toBe(true);
        if (path.includes("symbols")) expect(result.changes.filter(change => change.path.startsWith("/reelSequences/0/symbols"))
            .every(change => !change.mathematical && change.after.provenance.status === "unknown")).toBe(true);
    });
});

it("keeps unsupported literal feature extensions separate from supported nested grant changes", async () => {
    const model = free();
    Reflect.set(model.mechanics!, "freeGames.awardsByCount", {custom: true});
    const changed = clone(model);
    changed.mechanics!.freeGames!.awardsByCount[3] = 9;
    const game = (value: api.GameBlueprint): api.PokieGame => ({
        getManifest: () => value.manifest,
        getModelDescriptor: () => ({descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model: value,
            maxWinPolicy: {type: "none", scope: "logical-round", authority: "declared policy"},}),
        createSession: () => {
            throw new Error("No session");
        },
    });
    const reader = new api.MathDefinitionSourceReader();
    const left = await reader.read(game(model)),
        right = await reader.read(game(changed));
    expect(left.support).toBe("unsupported");
    expect(left.diagnostics.filter(issue => issue.code === "unsupported-model-field" || issue.code === "blueprint-mechanics-unknown-field")
        .every(issue => issue.path === "/mechanics/freeGames.awardsByCount")).toBe(true);
    const direct = new api.MathDefinitionDiffer().diff(left, right);
    expect(await api.compareMathDefinitions(game(model), game(changed))).toEqual(direct);
    expect(direct.changes).toContainEqual(expect.objectContaining({
        path: "/mechanics/freeGames/awardsByCount/3", mathematical: true,
        after: expect.objectContaining({provenance: expect.objectContaining({status: "authored"})}),
    }));
});
