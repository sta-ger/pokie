import {writeDescriptorPackage} from "./fixtures/PackageExtractionFixture.js";
import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactBuilderRegistry,
    BlueprintArtifactBuilder,
    GameBlueprintValidator,
    GamePackageGenerator,
    PackageBlueprintExtraction,
    PROJECT_TYPE_CAPABILITIES,
    computeGameBlueprintHash,
    loadPokieGameRuntime,
    type GameBlueprint,
    type PackageModelDescriptor,
    type PokieGame,
    type PokieProject,
    type VideoSlotSession,
} from "@fromstan/pokie";
import {weightedBlueprint} from "./fixtures/WeightedWholeSequenceGame.js";
import {fractionalBetBlueprint} from "../fixtures/math/FractionalBetFixture.js";
import {authoritativePaytableBlueprint} from "../fixtures/math/AuthoritativePaytableFixture.js";

const base = (): GameBlueprint => ({
    ...fractionalBetBlueprint([0.05, 7.5, 1e-7], true),
    paytable: {A: {3: 5}, B: {3: 0}},
});
function custom(model: unknown, overrides: Partial<PokieGame> = {}): PokieGame {
    return {
        getManifest: () => base().manifest,
        createSession: () => {
            throw new Error("Extraction must not construct a session");
        },
        getModelDescriptor: () =>
            ({descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model} as PackageModelDescriptor),
        ...overrides,
    };
}
function packageProject(rootPath: string): PokieProject {
    return {
        type: "tsPackage",
        rootPath,
        provenance: "package manifest",
        capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage,
    };
}

describe("PackageBlueprintExtraction", () => {
    let directory: string;
    const extractor = new PackageBlueprintExtraction();
    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-extraction-"));
    });
    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    async function roundTrip(blueprint: GameBlueprint, seed: string | number): Promise<void> {
        const first = new GamePackageGenerator("1.3.0").generate(blueprint, directory, path.join(directory, "first"));
        const originalBytes = fs.readFileSync(path.join(first.projectRoot, "dist/index.js"));
        const extraction = await extractor.extract(first.projectRoot);
        expect({status: extraction.status, diagnostics: extraction.diagnostics}).toMatchObject({status: "complete"});
        expect(extraction.source).toMatchObject({
            kind: "generated",
            gameId: blueprint.manifest.id,
            descriptorVersion: 1,
        });
        expect(extraction.blueprint?.paytable).toEqual(blueprint.paytable);
        expect(extraction.blueprint?.mechanics).toEqual(blueprint.mechanics);
        expect(extraction.blueprint?.betModes).toEqual(blueprint.betModes);
        expect(extraction.blueprint?.screenGeometry).toEqual(blueprint.screenGeometry);
        expect(
            new GameBlueprintValidator().validate(extraction.blueprint).filter((issue) => issue.severity === "error"),
        ).toEqual([]);
        const second = new GamePackageGenerator("1.3.0").generate(
            extraction.blueprint!,
            directory,
            path.join(directory, "second"),
        );
        const loaded = await Promise.all([
            loadPokieGameRuntime(first.projectRoot),
            loadPokieGameRuntime(second.projectRoot),
        ]);
        const sessions: VideoSlotSession[] = [];
        try {
            expect(await loaded[0].game.getModelDescriptor!()).toEqual(await loaded[1].game.getModelDescriptor!());
            expect(loaded[0].game.getConfigHash!()).toBe(loaded[1].game.getConfigHash!());
            sessions.push(...loaded.map(({game}) => game.createSession({seed}) as VideoSlotSession));
            expect(sessions[0].toSessionState()).toEqual(sessions[1].toSessionState());
            for (let round = 0; round < 12; round++) {
                for (const session of sessions) {
                    session.setCreditsAmount(10000);
                    const bets = blueprint.availableBets ?? [1, 2, 3];
                    session.setBet(bets[round % bets.length]);
                    if (blueprint.betModes?.some((mode) => mode.runtimeType)) {
                        (session as unknown as {setBetMode(id: string): void}).setBetMode(
                            blueprint.betModes[round % blueprint.betModes.length].id,
                        );
                    }
                    session.play();
                }
                expect(sessions[0].getSymbolsCombination().toMatrix()).toEqual(
                    sessions[1].getSymbolsCombination().toMatrix(),
                );
                expect(sessions[0].getWinAmount()).toBe(sessions[1].getWinAmount());
                expect(sessions[0].getWinEvaluationResult().getWinComponents()).toEqual(
                    sessions[1].getWinEvaluationResult().getWinComponents(),
                );
                expect(sessions[0].getSequenceStatistics()).toEqual(sessions[1].getSequenceStatistics());
                expect(sessions[0].toSessionState()).toEqual(sessions[1].toSessionState());
                const restored = loaded[1].game.createSession({seed}) as VideoSlotSession;
                try {
                    restored.fromSessionState(sessions[0].toSessionState());
                    sessions[0].play();
                    restored.play();
                    expect(restored.toSessionState()).toEqual(sessions[0].toSessionState());
                    sessions[1].play();
                    expect(sessions[1].toSessionState()).toEqual(restored.toSessionState());
                } finally {
                    (restored as unknown as {destroy?: () => void}).destroy?.();
                }
            }
        } finally {
            for (const session of sessions) (session as unknown as {destroy?: () => void}).destroy?.();
            await Promise.all(loaded.map((runtime) => runtime.release()));
        }
        expect(fs.readFileSync(path.join(first.projectRoot, "dist/index.js"))).toEqual(originalBytes);
        expect(fs.readdirSync(directory).sort()).toEqual(["first", "second"]);
    }

    it.each([0, "0"])(
        "preserves fractional stakes, sparse/zero awards, seeded initialization and continuation for seed %p",
        async (seed) => {
            await roundTrip(base(), seed);
        },
    );
    it("preserves weighted variants including zero weights, stable IDs/order and exact mixtures", async () => {
        const blueprint = {
            ...weightedBlueprint,
            availableBets: [0.05, 7.5, 1e-7],
            reelSequences: [
                {
                    type: "weighted" as const,
                    variants: [
                        ...(
                            weightedBlueprint.reelSequences![0] as {
                                variants: import("@fromstan/pokie").WeightedSequenceVariant[];
                            }
                        ).variants,
                        {id: "disabled", symbols: ["S", "S"], weight: 0},
                    ],
                },
                weightedBlueprint.reelSequences![1],
            ],
        };
        await roundTrip(blueprint, "weighted");
    });
    it.each(["missing-symbol", "missing-count", "zero", "positive"] as const)(
        "preserves authored paytable %s",
        async (kind) => {
            await roundTrip(authoritativePaytableBlueprint(kind, 0.05), "awards");
        },
    );
    it.each(["ways", "clusters"] as const)("preserves %s runtime model", async (type) => {
        await roundTrip({...base(), rows: 2, winModel: {type}}, 17);
    });
    it("preserves free-game missing versus zero grants and base/ante/buy-feature modes", async () => {
        await roundTrip(
            {
                ...base(),
                symbols: ["A", "B", "S"],
                scatters: ["S"],
                reelStrips: [
                    ["A", "B", "S"],
                    ["A", "B", "S"],
                    ["A", "B", "S"],
                ],
                mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {2: 0, 3: 2}}},
                betModes: [
                    {id: "base", runtimeType: "base", isDefault: true},
                    {id: "ante", runtimeType: "ante", costMultiplier: 1.25},
                    {id: "buy", runtimeType: "buyFeature", costMultiplier: 10, forcedFreeGames: 2},
                ],
            },
            "features",
        );
    });
    it("preserves an explicitly empty paytable without inventing runtime defaults", async () => {
        await roundTrip({...base(), paytable: {}}, "empty-table");
    });

    it("preserves generated/visible/evaluated geometry and evaluation-local paylines", async () => {
        await roundTrip({...base(), rows: 5, screenGeometry: {
            generated: {reels: 3, rows: 5}, visible: {rowOffset: 0.5, rows: 3},
            evaluated: {rowOffset: 1, rows: 3}, paylineSpace: "evaluated",
        }}, "geometry");
    });

    it.each(["default", "weights"])("regenerates the effective %s reels and labelled default bets without new authoring instructions", async source => {
        const blueprint = {...base()};
        Reflect.deleteProperty(blueprint, "reelStrips");
        Reflect.deleteProperty(blueprint, "availableBets");
        if (source === "weights") blueprint.symbolWeights = {A: 3, B: 2};
        await roundTrip(blueprint, "materialized");
    });

    it("extracts materialized default/weight reels without rerunning authoring instructions", async () => {
        const blueprint = {...base(), reelStrips: undefined, symbolWeights: {A: 3, B: 2}};
        const first = new GamePackageGenerator("1.3.0").generate(blueprint, directory);
        const extracted = await extractor.extract(first.projectRoot);
        expect(extracted.status).toBe("complete");
        expect(extracted.blueprint?.symbolWeights).toBeUndefined();
        expect(extracted.blueprint?.reelStrips).toHaveLength(3);
        expect(extracted.comparisonLimits.join(" ")).toMatch(/instructions are not recovered/);
    });
    it("keeps legacy capabilities partial without sessions or invented math", async () => {
        const game = custom(base());
        Reflect.deleteProperty(game, "getModelDescriptor");
        game.getSessionCommandCapabilities = () => ({bets: [0.05, 7.5, 1e-7]});
        const release = jest.fn();
        game.release = release;
        const extracted = await extractor.extract(game);
        expect(extracted.status).toBe("partial");
        expect(extracted.model).toEqual({manifest: base().manifest, availableBets: [0.05, 7.5, 1e-7]});
        expect(extracted.blueprint).toBeUndefined();
        expect(extracted.diagnostics[0].code).toBe("legacy-model-unavailable");
        expect(release).not.toHaveBeenCalled();
    });
    it("retains exact custom declarations and field-level omissions without mutating objects", async () => {
        const model = {...base(), paytable: {A: {}, B: {3: 0}}};
        const before = JSON.stringify(model);
        const extracted = await extractor.extract(custom(model));
        expect(extracted.status).toBe("complete");
        expect(extracted.blueprint?.paytable).toEqual(model.paytable);
        expect(extracted.fields).toEqual(
            expect.arrayContaining([
                {path: "paytable.B.3", status: "exact", authority: "public model descriptor"},
                {
                    path: "paytable.A.3",
                    status: "exact",
                    authority: "descriptor: authored payout absent; effective zero",
                },
                {path: "winModel", status: "defaulted", authority: "generated runtime: lines"},
            ]),
        );
        expect(JSON.stringify(model)).toBe(before);
        expect(extracted.blueprint).not.toBe(model);
    });
    it("makes mixed custom mechanics and non-linear payout declarations explicit boundaries", async () => {
        const model = {...base(), mechanics: {customFeature: true}, payoutsByBet: {"0.05": 1, "7.5": 99}};
        const extracted = await extractor.extract(custom(model));
        expect(extracted.status).toBe("unsupported");
        expect(extracted.blueprint).toBeUndefined();
        expect(extracted.diagnostics.map((issue) => issue.path)).toEqual(
            expect.arrayContaining(["mechanics.customFeature", "payoutsByBet"]),
        );
    });
    it("keeps declared unsupported boundaries authoritative and rejects malformed model shape", async () => {
        const game = custom(base(), {
            getModelDescriptor: () => ({
                descriptorVersion: 1,
                blueprintSchemaVersion: 1,
                sourceKind: "custom",
                model: base(),
                unsupported: [
                    {path: "mechanics", code: "custom-calculator", message: "Runtime payout behavior is custom"},
                ],
            }),
        });
        const result = await extractor.extract(game);
        expect(result.status).toBe("unsupported");
        expect(result.blueprint).toBeUndefined();
        for (const model of [
            {...base(), reels: -1},
            {...base(), availableBets: [0.05, 0]},
            {...base(), paytable: {A: {3: "bad"}}},
            {...base(), winModel: {type: "clusters"}},
        ]) {
            expect((await extractor.extract(custom(model))).status).toBe("malformed");
        }
    });

    it("exposes independently available sections for partial descriptor data", async () => {
        const model = {manifest: base().manifest, reels: 3, rows: 1, symbols: ["A", "B"]};
        const result = await extractor.extract(custom(model));
        expect(result.status).toBe("partial");
        const projection = (await import("@fromstan/pokie")).buildPackageGameModelProjection(result);
        expect(projection.layout.status).toBe("available");
        expect(projection.symbols.status).toBe("available");
        expect(projection.paytable.status).toBe("unavailable");
    });

    it.each([
        NaN,
        Infinity,
        BigInt(1),
        () => 1,
        Symbol("x"),
        new Date(),
        Object.create({inherited: true}),
        sparseCollection(),
    ])("rejects unserializable metadata %p", async (metadata) => {
        const model = {...base(), metadata};
        const extracted = await extractor.extract(custom(model));
        expect(extracted.status).toBe("malformed");
        expect(extracted.blueprint).toBeUndefined();
        expect(model.metadata).toBe(metadata);
    });
    it("rejects cycles, unsafe names, accessors and toJSON without invoking them", async () => {
        const accessor = jest.fn(() => 1);
        const hook = jest.fn(() => ({}));
        const cycle: Record<string, unknown> = {};
        cycle.self = cycle;
        const getter = {};
        Reflect.defineProperty(getter, "value", {enumerable: true, get: accessor});
        for (const metadata of [cycle, getter, {toJSON: hook}, JSON.parse('{"__proto__":{}}')]) {
            expect((await extractor.extract(custom({...base(), metadata}))).status).toBe("malformed");
        }
        expect(accessor).not.toHaveBeenCalled();
        expect(hook).not.toHaveBeenCalled();
    });
    it.each(["descriptorVersion", "blueprintSchemaVersion"])(
        "rejects incompatible %s independently of manifest version",
        async (field) => {
            const game = custom(base());
            game.getModelDescriptor = () =>
                ({
                    descriptorVersion: 1,
                    blueprintSchemaVersion: 1,
                    sourceKind: "custom",
                    model: base(),
                    [field]: 2,
                } as unknown as PackageModelDescriptor);
            const extracted = await extractor.extract(game);
            expect(extracted.status).toBe("malformed");
            expect(extracted.diagnostics[0].code).toBe("incompatible-model-version");
        },
    );
    it("returns bounded errors for getters/descriptor calls and checks cancellation before loading", async () => {
        for (const game of [
            custom(base(), {
                getManifest: () => {
                    throw new Error("manifest failed");
                },
            }),
            custom(base(), {
                getModelDescriptor: () => {
                    throw new Error("descriptor failed");
                },
            }),
        ]) {
            expect((await extractor.extract(game)).diagnostics[0].code).toBe("package-model-read-failed");
        }
        const controller = new AbortController();
        controller.abort();
        expect((await extractor.extract("missing-package", {signal: controller.signal})).status).toBe("cancelled");
        const game = custom(base(), {
            getModelDescriptor: () => {
                controller.abort();
                return Promise.resolve({
                    descriptorVersion: 1,
                    blueprintSchemaVersion: 1,
                    sourceKind: "custom",
                    model: base(),
                });
            },
        });
        const second = new AbortController();
        game.getModelDescriptor = () => {
            second.abort();
            return Promise.resolve({
                descriptorVersion: 1,
                blueprintSchemaVersion: 1,
                sourceKind: "custom",
                model: base(),
            });
        };
        expect((await extractor.extract(game, {signal: second.signal})).status).toBe("cancelled");
    });
    it("publishes a separate Blueprint with bound extraction evidence, and rejects stale plans/companions", async () => {
        const source = new GamePackageGenerator("1.3.0").generate(base(), directory).projectRoot;
        const project = packageProject(source);
        const registry = new ArtifactBuilderRegistry("1.3.0");
        const destination = path.join(directory, "extracted.json");
        const plan = await registry.preparePlan(project, "blueprint", {destinationPath: destination});
        expect(plan.status).toBe("planned");
        expect(plan.steps[0].kind).toBe("extractPackageModel");
        const result = await registry.executePlan(plan, project, destination);
        const evidence = JSON.parse(fs.readFileSync(result.conversionEvidencePath!, "utf8"));
        expect(evidence.kind).toBe("package-extraction");
        expect(evidence.sourceWorkbook).toBeUndefined();
        expect(evidence.extractedBlueprintHash).toBe(
            computeGameBlueprintHash(JSON.parse(fs.readFileSync(destination, "utf8"))),
        );
        expect(evidence.sourceBindingHash).toBe(plan.source.configurationProvenance?.inputBindingHash);
        const conflict = path.join(directory, "conflict.json");
        fs.writeFileSync(`${conflict}.conversion-evidence.json`, "keep");
        expect((await registry.preparePlan(project, "blueprint", {destinationPath: conflict})).status).toBe("conflict");
        const staleDestination = path.join(directory, "stale.json");
        const stale = await registry.preparePlan(project, "blueprint", {destinationPath: staleDestination});
        fs.appendFileSync(path.join(source, "dist/index.js"), "\n// source changed");
        await expect(registry.executePlan(stale, project, staleDestination)).rejects.toThrow(/changed/);
        expect(fs.existsSync(staleDestination)).toBe(false);
    });
    it("releases real runtime snapshots on success, malformed descriptors and opaque legacy reads", async () => {
        const snapshots = (): string[] =>
            fs
                .readdirSync(os.tmpdir())
                .filter((name) => name.startsWith("pokie-runtime-"))
                .sort();
        const before = snapshots();
        for (const options of [
            {name: "custom"},
            {name: "legacy", legacy: true},
            {name: "malformed", descriptorBody: 'throw new Error("descriptor failed");'},
        ]) {
            const source = writeDescriptorPackage(directory, options);
            const input = fs.readFileSync(path.join(source, "index.js"));
            const result = await extractor.extract(source);
            expect(result.status).toBe(
                ({custom: "complete", legacy: "partial", malformed: "malformed"} as Record<string, string>)[
                    options.name
                ],
            );
            expect(fs.readFileSync(path.join(source, "index.js"))).toEqual(input);
            expect(snapshots()).toEqual(before);
        }
    });

    it("rejects source overlap and filesystem aliases without writing package data", async () => {
        const source = writeDescriptorPackage(directory);
        const alias = path.join(directory, "alias");
        fs.symlinkSync(source, alias, "dir");
        await expect(
            new BlueprintArtifactBuilder().build(packageProject(source), path.join(alias, "blueprint.json")),
        ).rejects.toThrow(/inside source/);
        expect(fs.existsSync(path.join(source, "blueprint.json"))).toBe(false);
        const destination = path.join(directory, "dangling.json");
        fs.symlinkSync(path.join(directory, "missing"), `${destination}.conversion-evidence.json`);
        await expect(new BlueprintArtifactBuilder().build(packageProject(source), destination)).rejects.toThrow(
            /already exists/,
        );
        expect(fs.lstatSync(`${destination}.conversion-evidence.json`).isSymbolicLink()).toBe(true);
    });

    it("rolls back Blueprint/evidence and staging on publication cancellation", async () => {
        const source = new GamePackageGenerator("1.3.0").generate(base(), directory).projectRoot;
        const destination = path.join(directory, "cancel.json");
        const controller = new AbortController();
        const rename = fs.promises.rename.bind(fs.promises);
        const spy = jest.spyOn(fs.promises, "rename").mockImplementation(async (from, to) => {
            await rename(from, to);
            if (String(to) === destination) controller.abort();
        });
        try {
            await expect(
                new BlueprintArtifactBuilder().build(packageProject(source), destination, {signal: controller.signal}),
            ).rejects.toThrow(/cancelled/);
        } finally {
            spy.mockRestore();
        }
        expect(fs.readdirSync(directory)).toEqual([base().manifest.id]);
    });
});

function sparseCollection(): number[] {
    const sparse = [1, 2, 3];
    Reflect.deleteProperty(sparse, "1");
    return sparse;
}
