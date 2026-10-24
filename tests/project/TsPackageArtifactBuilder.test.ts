import {authoritativePaytableBlueprint, type AuthoredAwardCase} from "../fixtures/math/AuthoritativePaytableFixture.js";
import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactBuildConflictError,
    ArtifactBuildCancelledError,
    type ArtifactBuildProgress,
    GameBlueprint,
    loadPokieGame,
    loadPokieGameRuntime,
    releasePokieGame,
    SymbolsCombination,
    type VideoSlotSessionHandling,
    PokieProject,
    PROJECT_TYPE_CAPABILITIES,
    TsPackageArtifactBuilder,
    type GamePackageGenerating,
} from "@fromstan/pokie";

function blueprintProjectOf(rootPath: string): PokieProject {
    return {
        type: "blueprint",
        rootPath,
        capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
        provenance: "test fixture",
    } as PokieProject;
}

const blueprint: GameBlueprint = {
    manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
    reels: 2,
    rows: 2,
    symbols: ["A", "W"],
    wilds: ["W"],
    paytable: {A: {"2": 5}},
    paylines: [
        [0, 0],
        [1, 1],
    ],
    reelStrips: [
        ["A", "W"],
        ["W", "A"],
    ],
    availableBets: [1, 2],
};

describe("TsPackageArtifactBuilder", () => {
    let dir: string;
    let blueprintPath: string;
    let destinationDir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-tspackage-builder-test-"));
        blueprintPath = path.join(dir, "config.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));
        destinationDir = path.join(dir, "built-package");
    });

    afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
    });

    it.each(["missing-symbol", "missing-count", "zero", "positive"] as AuthoredAwardCase[])("validates and builds an authoritative %s package", async kind => {
        const model = authoritativePaytableBlueprint(kind, 0.01, true);
        fs.writeFileSync(blueprintPath, JSON.stringify(model));
        await new TsPackageArtifactBuilder("1.3.0").withRuntimePackageRoot(process.cwd()).build(blueprintProjectOf(blueprintPath), destinationDir);
        const loaded = await loadPokieGameRuntime(destinationDir, entry => require(entry));
        try {
            const screen = authoritativePaytableBlueprint(kind).reelStrips!.map(strip => [strip[0]]);
            const session = loaded.game.createExactEnumerationSession!({generateSymbolsCombination: () => new SymbolsCombination<string>().fromMatrix(screen)}) as VideoSlotSessionHandling;
            session.setBet(0.01);
            session.play();
            expect(session.getSymbolsCombination().toMatrix()).toEqual(screen);
            expect(session.getWinAmount()).toBe(kind === "positive" ? 0.02 : 0);
            expect(session.getPaytable().toMap()[0.01]).toEqual(Object.fromEntries(Object.entries(model.paytable).map(([symbol, payouts]) => [symbol, Object.fromEntries(Object.entries(payouts).map(([count, payout]) => [count, payout * 0.01]))])));
        } finally {
            await loaded.release();
        }
    });

    it("rejects negative authored payouts before publication and preserves destination files", async () => {
        fs.writeFileSync(blueprintPath, JSON.stringify({...authoritativePaytableBlueprint("zero", 1, true), paytable: {A: {3: -1}}}));
        fs.mkdirSync(destinationDir);
        fs.writeFileSync(path.join(destinationDir, "keep.txt"), "keep");
        await expect(new TsPackageArtifactBuilder("1.3.0").build(blueprintProjectOf(blueprintPath), destinationDir)).rejects.toThrow();
        expect(fs.readFileSync(path.join(destinationDir, "keep.txt"), "utf8")).toBe("keep");
        expect(fs.readdirSync(dir).some(entry => entry.startsWith("built-package.tmp-"))).toBe(false);
    });

    it("builds a real, loadable tsPackage with file progress from a blueprint", async () => {
        const builder = new TsPackageArtifactBuilder("1.3.0").withRuntimePackageRoot(process.cwd());

        const progress: ArtifactBuildProgress[] = [];
        const result = await builder.build(blueprintProjectOf(blueprintPath), destinationDir, {onProgress: event => progress.push(event)});
        const files = progress.filter(event => event.unit === "files");
        expect(files.length).toBeGreaterThan(1);
        expect(files.every(event => event.phase === "Writing TypeScript package files" && event.total === BigInt(files.length))).toBe(true);
        expect(progress.find(event => event.message === "Publishing TypeScript package")?.total).toBeUndefined();

        expect(result.outputPath).toBe(destinationDir);
        expect(fs.existsSync(path.join(destinationDir, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(destinationDir, "dist", "index.js"))).toBe(true);
        expect(fs.lstatSync(path.join(destinationDir, "node_modules", "@fromstan", "pokie")).isSymbolicLink()).toBe(true);
        const game = await loadPokieGame(destinationDir);
        try {
            expect(game).toMatchObject({getManifest: expect.any(Function)});
        } finally {
            await releasePokieGame(game);
        }
    });

    it("keeps the supplied current runtime link", async () => {
        const runtimeRoot = path.join(dir, "current-runtime");
        fs.mkdirSync(runtimeRoot);

        await new TsPackageArtifactBuilder("1.3.0").withRuntimePackageRoot(runtimeRoot).build(blueprintProjectOf(blueprintPath), destinationDir);

        expect(fs.readlinkSync(path.join(destinationDir, "node_modules", "@fromstan", "pokie"))).toBe(runtimeRoot);
        const pkg = JSON.parse(fs.readFileSync(path.join(destinationDir, "package.json"), "utf8"));
        const lock = JSON.parse(fs.readFileSync(path.join(destinationDir, "package-lock.json"), "utf8"));
        expect(pkg.dependencies["@fromstan/pokie"]).toBe(`file:${runtimeRoot}`);
        expect(lock.packages[""].dependencies["@fromstan/pokie"]).toBe(`file:${runtimeRoot}`);
    });

    it.each([false, true])("cleans a failed scoped runtime link while preserving the original empty destination (%s)", async existed => {
        if (existed) fs.mkdirSync(destinationDir);
        const builder = new TsPackageArtifactBuilder("2.0.0").withRuntimePackageRoot(dir);
        await builder.build(blueprintProjectOf(blueprintPath), path.join(dir, "first-success"));
        const link = jest.spyOn(fs, "symlinkSync").mockImplementationOnce(() => {
            throw new Error("scoped link failed");
        });
        try {
            await expect(builder.build(blueprintProjectOf(blueprintPath), destinationDir)).rejects.toThrow("scoped link failed");
            expect(fs.existsSync(destinationDir)).toBe(existed);
            if (existed) expect(fs.readdirSync(destinationDir)).toEqual([]);
            expect(fs.readdirSync(dir).some(entry => entry.startsWith("built-package.tmp-"))).toBe(false);
            for (const output of [destinationDir, path.join(dir, "second-success")]) {
                await expect(builder.build(blueprintProjectOf(blueprintPath), output)).resolves.toMatchObject({outputPath: output});
                expect(JSON.parse(fs.readFileSync(path.join(output, "package.json"), "utf8")).dependencies["@fromstan/pokie"]).toBe(`file:${dir}`);
            }
        } finally {
            link.mockRestore(); 
        }
    });

    it("throws ArtifactBuildConflictError rather than overwriting an existing, non-empty destination", async () => {
        fs.mkdirSync(destinationDir);
        fs.writeFileSync(path.join(destinationDir, "unrelated.txt"), "not ours");
        const builder = new TsPackageArtifactBuilder("1.3.0");

        await expect(builder.build(blueprintProjectOf(blueprintPath), destinationDir)).rejects.toThrow(ArtifactBuildConflictError);
        expect(fs.readdirSync(destinationDir)).toEqual(["unrelated.txt"]);
    });

    it("refuses the Blueprint source itself as destination without changing it", async () => {
        const before = fs.readFileSync(blueprintPath, "utf-8");

        await expect(new TsPackageArtifactBuilder("1.3.0").build(blueprintProjectOf(blueprintPath), blueprintPath)).rejects.toThrow(
            ArtifactBuildConflictError,
        );
        expect(fs.readFileSync(blueprintPath, "utf-8")).toBe(before);
    });

    it("refuses a symlink-ancestor alias of the Blueprint source", async () => {
        const linkedDir = `${dir}-link`;
        fs.symlinkSync(dir, linkedDir, "dir");
        try {
            await expect(new TsPackageArtifactBuilder("1.3.0").build(blueprintProjectOf(blueprintPath), path.join(linkedDir, "config.json"))).rejects.toThrow(
                ArtifactBuildConflictError,
            );
            expect(fs.readFileSync(blueprintPath, "utf-8")).toBe(JSON.stringify(blueprint));
        } finally {
            fs.unlinkSync(linkedDir);
        }
    });

    it("throws when the blueprint fails validation, without touching the destination", async () => {
        fs.writeFileSync(blueprintPath, JSON.stringify({...blueprint, reels: -1}));
        const builder = new TsPackageArtifactBuilder("1.3.0");

        await expect(builder.build(blueprintProjectOf(blueprintPath), destinationDir)).rejects.toThrow(/error/i);
        expect(fs.existsSync(destinationDir)).toBe(false);
    });

    it("reports the exact failed generated reel through the registry-owned package builder", async () => {
        const unsatisfiable: GameBlueprint = {
            ...blueprint,
            reelStrips: undefined,
            reelStripGeneration: [
                {type: "literal", strip: ["A", "W"]},
                {
                    type: "generated",
                    length: 4,
                    symbolCounts: {A: 2, W: 2},
                    seed: 5,
                    maxAttempts: 2,
                    constraints: [{type: "maximumCircularDistance", maximumDistance: 1, symbolIds: ["A"]}],
                },
            ],
        };
        fs.writeFileSync(blueprintPath, JSON.stringify(unsatisfiable));
        const builder = new TsPackageArtifactBuilder("1.3.0");

        await expect(builder.build(blueprintProjectOf(blueprintPath), destinationDir)).rejects.toThrow(
            /reel 1 .*maximum-circular-distance/,
        );
        expect(fs.existsSync(destinationDir)).toBe(false);
    });

    it("removes a partial Unicode-path package when its generator fails", async () => {
        const unicodeDestination = path.join(dir, "пакет с пробелом");
        const failingGenerator: GamePackageGenerating = {
            generate: (_blueprint, _cwd, outputPath) => {
                fs.mkdirSync(outputPath as string, {recursive: true});
                fs.writeFileSync(path.join(outputPath as string, "package.json"), "partial");
                throw new Error("injected TypeScript package write failure");
            },
        };

        await expect(new TsPackageArtifactBuilder("1.3.0", undefined, undefined, failingGenerator).build(blueprintProjectOf(blueprintPath), unicodeDestination)).rejects.toThrow(
            "injected TypeScript package write failure",
        );
        expect(fs.existsSync(unicodeDestination)).toBe(false);
    });

    it("cancels at the final TypeScript package publish callback without committing a package", async () => {
        const controller = new AbortController();
        const messages: string[] = [];

        await expect(
            new TsPackageArtifactBuilder("1.3.0").withRuntimePackageRoot(dir).build(blueprintProjectOf(blueprintPath), destinationDir, {
                signal: controller.signal,
                onProgress: (progress) => {
                    messages.push(progress.message ?? progress.status);
                    if (progress.message === "Publishing TypeScript package file dist/index.js") controller.abort();
                },
            }),
        ).rejects.toBeInstanceOf(ArtifactBuildCancelledError);

        expect(messages).toContain("Publishing TypeScript package file dist/index.js");
        expect(fs.existsSync(destinationDir)).toBe(false);
        expect(fs.readdirSync(dir).filter((entry) => entry.startsWith(`${path.basename(destinationDir)}.tmp-`))).toEqual([]);
    });
});
