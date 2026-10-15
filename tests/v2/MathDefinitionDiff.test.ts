import fs from "fs";
import os from "os";
import path from "path";
import * as api from "@fromstan/pokie";
import {fractionalBetBlueprint} from "../fixtures/math/FractionalBetFixture.js";
import {weightedBlueprint, weightedConfig} from "./fixtures/WeightedWholeSequenceGame.js";
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
        expect(diff.status).toBe("different");
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
        expect(diff.changes).toEqual([
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
        expect((await api.compareMathDefinitions(game, game)).status).toBe("identical");
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
