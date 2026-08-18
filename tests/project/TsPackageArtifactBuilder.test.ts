import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactBuildConflictError,
    GameBlueprint,
    PokieProject,
    PROJECT_TYPE_CAPABILITIES,
    TsPackageArtifactBuilder,
    type GamePackageGenerating,
} from "pokie";

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

    it("builds a real, loadable tsPackage from a blueprint file", async () => {
        const builder = new TsPackageArtifactBuilder("1.3.0");

        const result = await builder.build(blueprintProjectOf(blueprintPath), destinationDir);

        expect(result.outputPath).toBe(destinationDir);
        expect(fs.existsSync(path.join(destinationDir, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(destinationDir, "dist", "index.js"))).toBe(true);
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
});
