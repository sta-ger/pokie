import {runtimeSnapshotNames, writePausedDescriptorPackage, writeDescriptorPackage, writeRunnableCodeFirstPackage} from "./fixtures/PackageExtractionFixture.js";
import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactBuildCancelledError,
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

    it("extracts an independently assembled runnable code-first source without embedded Blueprint artifacts", async () => {
        const source = writeRunnableCodeFirstPackage(directory);
        const before = fs.readFileSync(path.join(source, "index.js"));
        const extracted = await extractor.extract(source);
        expect(extracted).toMatchObject({status: "complete", source: {kind: "custom", gameId: "code-first-probe"}});
        expect(extracted.blueprint?.paytable).toEqual({A: {3: 5}, B: {3: 0}, S: {2: 0}});
        expect(extracted.blueprint?.mechanics?.freeGames?.awardsByCount).toEqual({2: 0, 3: 2});
        const runtime = await loadPokieGameRuntime(source);
        const session = runtime.game.createSession({seed: 37}) as VideoSlotSession;
        try {
            session.setCreditsAmount(10000);
            for (const bet of [0.05, 7.5, 1e-7]) {
                session.setBet(bet);
                session.play();
            }
            expect(session.getWinAmount()).toBeGreaterThanOrEqual(0);
            expect(session.toSessionState()).toBeDefined();
        } finally {
            (session as unknown as {destroy?: () => void}).destroy?.();
            await runtime.release();
        }
        expect(fs.readdirSync(source).sort()).toEqual(["index.js", "package.json"]);
        expect(fs.readFileSync(path.join(source, "index.js"))).toEqual(before);
    });

    it.each(["blueprint", "tsPackage", "parWorkbook", "wasm"] as const)("binds final %s publication to the complete reviewed extraction even when the Blueprint hash stays equal", async target => {
        const control = path.join(directory, "kind.txt");
        fs.writeFileSync(control, "custom");
        const source = writeDescriptorPackage(directory, {descriptorBody: `return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: require("fs").readFileSync(${JSON.stringify(control)}, "utf8"), model};`});
        const input = fs.readFileSync(path.join(source, "index.js"));
        const registry = new ArtifactBuilderRegistry("1.3.0");
        const destination = path.join(directory, "output");
        const project = packageProject(source);
        const plan = await registry.preparePlan(project, target, {destinationPath: destination});
        expect(plan.packageExtraction?.status).toBe("complete");
        await expect(registry.executePlan(plan, project, destination, {onProgress: progress => {
            if (progress.message === "Extracting public package model into Blueprint") fs.writeFileSync(control, "generated");
        }})).rejects.toThrow(/Package model changed after preview/);
        expect(fs.readFileSync(path.join(source, "index.js"))).toEqual(input);
        expect(fs.readdirSync(directory).sort()).toEqual(["descriptor-package", "kind.txt"]);
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
        await roundTrip({...base(), rows: 4, screenGeometry: {
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
    it("rejects malformed legacy getter data and invalid fields in otherwise partial descriptors", async () => {
        for (const bad of ["modes", "bets"]) {
            const game = custom(base());
            Reflect.deleteProperty(game, "getModelDescriptor");
            game.getSessionCommandCapabilities = () => ({bets: [0.05]});
            if (bad === "modes") game.getBetModes = () => ({id: "bad"} as unknown as import("@fromstan/pokie").BetMode[]);
            else game.getSessionCommandCapabilities = () => ({bets: ["bad"]} as unknown as {bets: number[]});
            const result = await extractor.extract(game);
            expect(result.status).toBe("malformed");
            expect(result.model).toBeUndefined();
            expect(result.blueprint).toBeUndefined();
        }
        const partial = {manifest: base().manifest, availableBets: ["bad"]};
        expect((await extractor.extract(custom(partial))).status).toBe("malformed");
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
    it.each([null, false, "manifest", [], {}, {id: "math-probe"}])(
        "rejects a malformed present descriptor manifest %p without replacing it",
        async manifest => {
            const model = {...base(), manifest};
            const before = JSON.stringify(model);
            const result = await extractor.extract(custom(model));
            expect(result.status).toBe("malformed");
            expect(result.blueprint).toBeUndefined();
            expect(result.diagnostics).toEqual(expect.arrayContaining([
                expect.objectContaining({message: expect.stringContaining("manifest")}),
            ]));
            expect(JSON.stringify(model)).toBe(before);
        },
    );

    it("uses getManifest only when the descriptor manifest is absent", async () => {
        const model: Partial<GameBlueprint> = base();
        Reflect.deleteProperty(model, "manifest");
        const result = await extractor.extract(custom(model));
        expect(result.status).toBe("complete");
        expect(result.blueprint?.manifest).toEqual(base().manifest);
        expect(model.manifest).toBeUndefined();
    });

    it.each(["yes", 1, null, {}, []])("rejects metadata-only isDefault %p in descriptors and legacy getters", async isDefault => {
        const betModes = [{id: "metadata", isDefault}];
        const result = await extractor.extract(custom({...base(), betModes}));
        expect(result.status).toBe("malformed");
        expect(result.blueprint).toBeUndefined();
        expect(result.diagnostics).toContainEqual(expect.objectContaining({
            code: "blueprint-betmode-invalid-isdefault", path: "betModes[0].isDefault",
        }));
        const legacy = custom(base(), {getModelDescriptor: undefined, getBetModes: () => betModes as never});
        expect((await extractor.extract(legacy)).status).toBe("malformed");
    });

    it("validates synchronous descriptor data before touching then and accepts native asynchronous descriptors", async () => {
        const descriptor = {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model: base()};
        const then = jest.fn(() => undefined);
        const unsafe = {...descriptor};
        Reflect.defineProperty(unsafe, "then", {enumerable: true, get: then});
        const result = await extractor.extract(custom(base(), {getModelDescriptor: () => unsafe as PackageModelDescriptor}));
        expect(result.status).toBe("malformed");
        expect(result.diagnostics[0].message).toContain("$.then: accessor");
        expect(then).not.toHaveBeenCalled();
        const callableThen = jest.fn(() => undefined);
        expect((await extractor.extract(custom(base(), {
            getModelDescriptor: () => ({...descriptor, then: callableThen}) as PackageModelDescriptor,
        }))).status).toBe("malformed");
        expect(callableThen).not.toHaveBeenCalled();
        for (const asynchronous of [false, true]) {
            const game = custom(base(), {getModelDescriptor: () => asynchronous
                ? Promise.resolve(descriptor as PackageModelDescriptor)
                : descriptor as PackageModelDescriptor});
            const valid = await extractor.extract(game);
            expect(valid.status).toBe("complete");
            expect(valid.blueprint).toEqual(base());
        }
    });

    it("rejects a real package's synchronous then accessor without calling it and releases the snapshot", async () => {
        const marker = path.join(directory, "then-called.txt");
        const source = writeDescriptorPackage(directory, {descriptorBody:
            `const descriptor = {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model};
            Object.defineProperty(descriptor, "then", {enumerable: true, get() {
                require("fs").writeFileSync(${JSON.stringify(marker)}, "called");
                return undefined;
            }});
            return descriptor;`,});
        const input = fs.readFileSync(path.join(source, "index.js"));
        const destination = path.join(directory, "unsafe.json");
        const before = runtimeSnapshotNames(source);
        const result = await extractor.extract(source);
        expect(result.status).toBe("malformed");
        expect(result.diagnostics[0].message).toContain("$.then: accessor");
        await expect(new BlueprintArtifactBuilder().build(packageProject(source), destination)).rejects.toThrow(/then: accessor/);
        expect(fs.existsSync(marker)).toBe(false);
        expect(fs.readFileSync(path.join(source, "index.js"))).toEqual(input);
        expect(fs.readdirSync(directory)).toEqual(["descriptor-package"]);
        expect(runtimeSnapshotNames(source)).toEqual(before);
    });

    it("extracts and publishes a real asynchronous package descriptor", async () => {
        const source = writeDescriptorPackage(directory, {descriptorBody:
            'return Promise.resolve({descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model});',});
        const result = await extractor.extract(source);
        expect(result.status).toBe("complete");
        const destination = path.join(directory, "async.json");
        const published = await new BlueprintArtifactBuilder().build(packageProject(source), destination);
        expect(JSON.parse(fs.readFileSync(destination, "utf8"))).toEqual(result.blueprint);
        expect(JSON.parse(fs.readFileSync(published.conversionEvidencePath!, "utf8")).extractedBlueprintHash).toBe(result.blueprintHash);
    });

    it.each([false, true])("settles a paused direct asynchronous build truthfully (cancelled: %s)", async cancelled => {
        const fixture = writePausedDescriptorPackage(directory);
        const snapshots = runtimeSnapshotNames(fixture.source);
        const input = fs.readFileSync(path.join(fixture.source, "index.js"));
        const destination = path.join(directory, "async.json");
        const controller = new AbortController();
        const progress: string[] = [];
        fixture.arm();
        try {
            const build = new BlueprintArtifactBuilder().build(packageProject(fixture.source), destination, {
                signal: controller.signal, onProgress: value => {
                    progress.push(value.status);
                },
            });
            const checked = cancelled ? expect(build).rejects.toBeInstanceOf(ArtifactBuildCancelledError) : build;
            await fixture.readStarted;
            expect(runtimeSnapshotNames(fixture.source).length).toBe(snapshots.length + 1);
            expect(fs.existsSync(destination)).toBe(false);
            if (cancelled) controller.abort();
            fixture.settle();
            const result = await checked;
            expect(runtimeSnapshotNames(fixture.source)).toEqual(snapshots);
            expect(fs.readFileSync(path.join(fixture.source, "index.js"))).toEqual(input);
            expect(fs.readFileSync(fixture.control, "utf8")).toBe("existing descriptor input");
            if (cancelled) {
                expect(progress).toContain("cancelled");
                expect(progress).not.toContain("completed");
                expect(fs.readdirSync(directory).sort()).toEqual(["descriptor-package", "descriptor-read.txt"]);
            } else {
                expect(result).toMatchObject({outputPath: destination, packageExtraction: {status: "complete"}});
                expect(JSON.parse(fs.readFileSync(`${destination}.conversion-evidence.json`, "utf8")).kind).toBe("package-extraction");
                expect(fs.readdirSync(directory).some(name => name.endsWith(".tmp"))).toBe(false);
            }
        } finally {
            fixture.restore();
        }
    });

    it("keeps a malformed asynchronous model as a failure without publication", async () => {
        const fixture = writePausedDescriptorPackage(directory, '{descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model: {...model, manifest: null}}');
        const snapshots = runtimeSnapshotNames(fixture.source);
        fixture.arm();
        try {
            const checked = expect(new BlueprintArtifactBuilder().build(packageProject(fixture.source), path.join(directory, "bad.json")))
                .rejects.toThrow(/Package extraction malformed/);
            await fixture.readStarted;
            fixture.settle();
            await checked;
            expect(runtimeSnapshotNames(fixture.source)).toEqual(snapshots);
            expect(fs.readdirSync(directory).sort()).toEqual(["descriptor-package", "descriptor-read.txt"]);
        } finally {
            fixture.restore();
        }
    });

    it("keeps snapshot cleanup failure authoritative when the descriptor read was cancelled", async () => {
        const fixture = writePausedDescriptorPackage(directory);
        const controller = new AbortController();
        const snapshots = runtimeSnapshotNames(fixture.source);
        const rm = fs.promises.rm.bind(fs.promises);
        const cleanup = jest.spyOn(fs.promises, "rm").mockImplementation(async (target, options) => {
            await rm(target, options);
            if (path.basename(String(target)).startsWith("pokie-runtime-")) throw new Error("snapshot cleanup failed");
        });
        fixture.arm();
        try {
            const checked = expect(new BlueprintArtifactBuilder().build(packageProject(fixture.source), path.join(directory, "bad.json"), {signal: controller.signal}))
                .rejects.toThrow(/Package extraction malformed:.*snapshot-release-failed/);
            await fixture.readStarted;
            controller.abort();
            fixture.settle();
            await checked;
            expect(cleanup).toHaveBeenCalledWith(expect.stringContaining("pokie-runtime-"), {recursive: true, force: true});
            expect(runtimeSnapshotNames(fixture.source)).toEqual(snapshots);
            expect(fs.readdirSync(directory).sort()).toEqual(["descriptor-package", "descriptor-read.txt"]);
        } finally {
            cleanup.mockRestore();
            fixture.restore();
        }
    });

    it("records every omitted bet-mode field without inserting declarations, including legacy metadata", async () => {
        const betModes = [{id: "metadata"}];
        const model = {...base(), betModes};
        const before = JSON.stringify(model);
        for (const game of [custom(model), custom(model, {getModelDescriptor: undefined, getBetModes: () => betModes})]) {
            const result = await extractor.extract(game);
            const omitted = result.fields.filter(field => field.path.startsWith("betModes.0.") && field.status === "defaulted");
            expect(omitted.map(field => field.path).sort()).toEqual([
                "label", "costMultiplier", "runtimeType", "isDefault", "forcedFreeGames", "targetRtp",
            ].map(field => `betModes.0.${field}`).sort());
            expect(omitted.every(field => field.authority.length > 0)).toBe(true);
            expect(result.model?.betModes).toEqual(betModes);
        }
        expect(JSON.stringify(model)).toBe(before);
        const explicit = {...base(), betModes: [{id: "metadata", isDefault: false, targetRtp: 96}]};
        const result = await extractor.extract(custom(explicit));
        expect(result.fields).toEqual(expect.arrayContaining([
            expect.objectContaining({path: "betModes.0.isDefault", status: "exact"}),
            expect.objectContaining({path: "betModes.0.targetRtp", status: "exact"}),
        ]));
        expect(result.fields.some(field => ["betModes.0.isDefault", "betModes.0.targetRtp"].includes(field.path) && field.status === "defaulted")).toBe(false);
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
    it("rejects package manifest accessors before the loader reads them and releases its snapshot", async () => {
        const source = writeDescriptorPackage(directory);
        const marker = path.join(directory, "accessor-invoked");
        const entry = path.join(source, "index.js");
        fs.writeFileSync(entry, `const manifest = {name: "Unsafe", version: "1"};
Object.defineProperty(manifest, "id", {enumerable: true, get() { require("fs").writeFileSync(${JSON.stringify(marker)}, "invoked"); return "unsafe"; }});
module.exports = {getManifest() { return manifest; }, createSession() { throw new Error("no session"); }};`);
        const before = runtimeSnapshotNames(source);
        const bytes = fs.readFileSync(entry);
        expect((await extractor.extract(source)).status).toBe("malformed");
        expect(fs.existsSync(marker)).toBe(false);
        expect(fs.readFileSync(entry)).toEqual(bytes);
        expect(runtimeSnapshotNames(source)).toEqual(before);
    });

    it("releases real runtime snapshots on success, malformed descriptors and opaque legacy reads", async () => {
        for (const options of [
            {name: "custom"},
            {name: "legacy", legacy: true},
            {name: "malformed", descriptorBody: 'throw new Error("descriptor failed");'},
        ]) {
            const source = writeDescriptorPackage(directory, options);
            const input = fs.readFileSync(path.join(source, "index.js"));
            const before = runtimeSnapshotNames(source);
            const result = await extractor.extract(source);
            expect(result.status).toBe(
                ({custom: "complete", legacy: "partial", malformed: "malformed"} as Record<string, string>)[
                    options.name
                ],
            );
            expect(fs.readFileSync(path.join(source, "index.js"))).toEqual(input);
            expect(runtimeSnapshotNames(source)).toEqual(before);
        }
    });

    it("releases its extraction snapshot when another caller acquires a runtime lease during the read", async () => {
        const fixture = writePausedDescriptorPackage(directory);
        const otherSource = writeDescriptorPackage(directory, {name: "retained-package"});
        const before = runtimeSnapshotNames(fixture.source);
        let otherRuntime: Awaited<ReturnType<typeof loadPokieGameRuntime>> | undefined;
        fixture.arm();
        const extraction = extractor.extract(fixture.source);
        try {
            await fixture.readStarted;
            expect(runtimeSnapshotNames(fixture.source)).toHaveLength(before.length + 1);
            otherRuntime = await loadPokieGameRuntime(otherSource);
            const retained = runtimeSnapshotNames(otherSource);
            expect(retained).toHaveLength(1);
            fixture.settle();
            expect((await extraction).status).toBe("complete");
            expect(runtimeSnapshotNames(fixture.source)).toEqual(before);
            expect(runtimeSnapshotNames(otherSource)).toEqual(retained);
            expect(otherRuntime.game.getManifest()).toEqual(base().manifest);
            await otherRuntime.release();
            expect(runtimeSnapshotNames(otherSource)).toEqual([]);
        } finally {
            fixture.restore();
            await extraction;
            await otherRuntime?.release();
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

    it.each(["blueprint", "evidence"])("rolls back Blueprint/evidence and staging on cancellation after %s publication", async member => {
        const source = new GamePackageGenerator("1.3.0").generate(base(), directory).projectRoot;
        const destination = path.join(directory, "cancel.json");
        const controller = new AbortController();
        const link = fs.promises.link.bind(fs.promises);
        const boundary = member === "blueprint" ? destination : `${destination}.conversion-evidence.json`;
        const spy = jest.spyOn(fs.promises, "link").mockImplementation(async (from, to) => {
            await link(from, to);
            if (String(to) === boundary) controller.abort();
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

describe("comparison-only max-win declarations", () => {
    it("retains declared policy with its units, scope and authority without changing model data", async () => {
        const model = fractionalBetBlueprint([0.05, 7.5, 1e-7], true);
        const game = {
            getManifest: () => model.manifest,
            getModelDescriptor: () => ({
                descriptorVersion: 1 as const,
                blueprintSchemaVersion: 1 as const,
                sourceKind: "custom" as const,
                model,
                maxWinPolicy: {
                    type: "declared" as const,
                    value: 7.5,
                    unit: "bet-multiple" as const,
                    scope: "logical-round" as const,
                    authority: "declared external collaborator",
                },
            }),
            createSession: () => {
                throw new Error("must not create sessions");
            },
        };
        const result = await new PackageBlueprintExtraction().extract(game);
        expect(result.status).toBe("complete");
        expect(result.blueprint).toBeUndefined();
        expect(result.blueprintHash).toBeUndefined();
        expect(result.conversionDiagnostics).toEqual([expect.objectContaining({code: "max-win-policy-not-representable"})]);
        expect(result.maxWinPolicy).toEqual(game.getModelDescriptor().maxWinPolicy);
        expect(result.model).toEqual(model);
        const uncapped = await new PackageBlueprintExtraction().extract({...game, getModelDescriptor: () => ({
            ...game.getModelDescriptor(), maxWinPolicy: {type: "none", scope: "logical-round", authority: "no custom cap"},
        })});
        expect(uncapped.status).toBe("complete");
        expect(uncapped.blueprint).toEqual(model);
        expect(uncapped.conversionDiagnostics).toBeUndefined();
    });
});

it("preserves simple extraction paths and quotes literal symbol identities through object and loader boundaries", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "extraction-field-paths-"));
    const symbols = ["A", "B", "A.B", "A/B~C", 'A[0]"\\', "$"];
    const model = {...base(), symbols, paytable: {A: {3: 5}, "A.B": {3: 7.5}}};
    const extractor = new PackageBlueprintExtraction();
    try {
        const loaded = writeDescriptorPackage(directory, {model});
        for (const input of [custom(model), loaded]) {
            const result = await extractor.extract(input);
            expect(result.status).toBe("complete");
            expect(result.blueprint).toEqual(model);
            expect(result.fields).toEqual(expect.arrayContaining([
                expect.objectContaining({path: "paytable.A.3", status: "exact"}),
                expect.objectContaining({path: 'paytable["A.B"].3', status: "exact"}),
                expect.objectContaining({path: 'paytable["A.B"].2', authority: "descriptor: authored payout absent; effective zero"}),
                ...symbols.slice(3).map(symbol => expect.objectContaining({
                    path: `paytable[${JSON.stringify(symbol)}]`, authority: "descriptor: authored symbol table absent; no payouts",
                })),
            ]));
            expect(result.fields.some(field => field.path.startsWith("paytable.A.B"))).toBe(false);
            expect(result.fields).toContainEqual(expect.objectContaining({path: "betModes", status: "defaulted"}));
        }
        expect(model.paytable).toEqual({A: {3: 5}, "A.B": {3: 7.5}});
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

it("retains unsupported literal custom feature extensions through object and loader extraction", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "extraction-literal-extension-"));
    const model = {...base(), mechanics: {"freeGames.awardsByCount": {custom: true}}};
    const extractor = new PackageBlueprintExtraction();
    try {
        const loaded = writeDescriptorPackage(directory, {model: model as GameBlueprint});
        for (const input of [custom(model), loaded]) {
            const result = await extractor.extract(input);
            expect(result.status).toBe("unsupported");
            expect(result.model).toEqual(model);
            expect(result.blueprint).toBeUndefined();
            expect(result.fields).toContainEqual(expect.objectContaining({
                path: 'mechanics["freeGames.awardsByCount"]', status: "unsupported",
            }));
            expect(result.fields.some(field => field.status === "unsupported" && field.path === "mechanics.freeGames.awardsByCount")).toBe(false);
        }
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});
