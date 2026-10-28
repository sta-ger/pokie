import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactBuildCancelledError,
    type ArtifactBuildProgress,
    ArtifactBuildConflictError,
    OutcomeLibraryBundleWriter,
    PokieProject,
    PROJECT_TYPE_CAPABILITIES,
    StakeAdapterArtifactBuilder,
    StakeEngineExporter,
} from "@fromstan/pokie";
import {buildOutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";
import {buildStakeEngineTestLibrary} from "../stakeengine/StakeEngineTestFixtures.js";

function stakeAdapterProjectOf(rootPath: string): PokieProject {
    return {
        type: "stakeAdapter",
        rootPath,
        capabilities: PROJECT_TYPE_CAPABILITIES.stakeAdapter,
        provenance: "test fixture",
    } as PokieProject;
}

describe("StakeAdapterArtifactBuilder", () => {
    let sourceDir: string;
    let destinationDir: string;

    beforeEach(async () => {
        sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeadapter-builder-source-"));
        fs.rmdirSync(sourceDir);
        destinationDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeadapter-builder-dest-"));
        fs.rmdirSync(destinationDir);

        const exporter = new StakeEngineExporter("1.3.0");
        const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
        await exporter.exportToDirectory([{modeName: "base", cost: 1, library}], sourceDir);
    });

    afterEach(() => {
        fs.rmSync(sourceDir, {recursive: true, force: true});
        fs.rmSync(destinationDir, {recursive: true, force: true});
    });

    it("republishes a numeric Stake directory with file progress and unchanged exchange files", async () => {
        const builder = new StakeAdapterArtifactBuilder("1.3.0");

        const progress: ArtifactBuildProgress[] = [];
        const result = await builder.build(stakeAdapterProjectOf(sourceDir), destinationDir, {onProgress: event => progress.push(event)});
        const files = progress.filter(event => event.phase === "Publishing Stake files");
        expect(files.length).toBe(fs.readdirSync(destinationDir).length);
        expect(files.map(event => event.completed)).toEqual(files.map((_, index) => BigInt(index + 1)));
        expect(files.every(event => event.unit === "files" && event.total === BigInt(files.length))).toBe(true);

        expect(result.outputPath).toBe(destinationDir);
        expect(new Set(fs.readdirSync(destinationDir))).toEqual(new Set(fs.readdirSync(sourceDir)));
        for (const name of fs.readdirSync(sourceDir).filter(file => file !== "pokie-manifest.json")) {
            expect(fs.readFileSync(path.join(destinationDir, name))).toEqual(fs.readFileSync(path.join(sourceDir, name)));
        }
    });

    it("preserves exact UInt64 Stake bytes and file-local progress", async () => {
        const index = JSON.parse(fs.readFileSync(path.join(sourceDir, "index.json"), "utf8")) as {modes: {weights: string}[]};
        for (const mode of index.modes) {
            const weights = path.join(sourceDir, mode.weights);
            fs.writeFileSync(weights, fs.readFileSync(weights, "utf8").replace(/^(\d+),\d+/gm, "$1,9007199254740992"));
        }
        const progress: ArtifactBuildProgress[] = [];
        const result = await new StakeAdapterArtifactBuilder("1.3.0").build(stakeAdapterProjectOf(sourceDir), destinationDir, {onProgress: event => progress.push(event)});
        const files = fs.readdirSync(sourceDir);
        expect(result.outputPath).toBe(destinationDir);
        expect(fs.readdirSync(destinationDir)).toEqual(files);
        for (const file of files) expect(fs.readFileSync(path.join(destinationDir, file))).toEqual(fs.readFileSync(path.join(sourceDir, file)));
        const samples = progress.filter(event => event.phase === "Publishing exact Stake files");
        expect(samples.map(event => event.completed)).toEqual(files.map((_, index) => BigInt(index + 1)));
        expect(samples.every(event => event.unit === "files" && event.total === BigInt(files.length))).toBe(true);
    });

    it("validates a readable Stake source without creating a destination", async () => {
        const builder = new StakeAdapterArtifactBuilder("1.3.0");

        await expect(builder.validate(stakeAdapterProjectOf(sourceDir))).resolves.toBeUndefined();
        expect(fs.existsSync(destinationDir)).toBe(false);
    });

    it("builds Stake output with record and file progress from the canonical Outcome Library prerequisite", async () => {
        const outcomeDir = `${sourceDir}-outcome-library`;
        const stakeDir = `${sourceDir}-stake-output`;
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], outcomeDir);

        const progress: ArtifactBuildProgress[] = [];
        const result = await new StakeAdapterArtifactBuilder("1.3.0").build(
            {
                type: "outcomeLibrary",
                rootPath: outcomeDir,
                capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
                provenance: "canonical prerequisite",
            },
            stakeDir,
            {onProgress: event => progress.push(event)},
        );
        expect(progress).toContainEqual(expect.objectContaining({phase: "Building Stake books", unit: "outcome records", total: expect.any(BigInt)}));
        expect(progress).toContainEqual(expect.objectContaining({phase: "Publishing Stake files", unit: "files", total: BigInt(4), completed: BigInt(4)}));
        expect(progress.find(event => event.phase === "Preparing Stake publication")?.completed).toBeUndefined();

        expect(result.outputPath).toBe(stakeDir);
        expect(fs.existsSync(path.join(stakeDir, "index.json"))).toBe(true);
        expect(fs.existsSync(path.join(stakeDir, "pokie-manifest.json"))).toBe(true);
        fs.rmSync(outcomeDir, {recursive: true, force: true});
        fs.rmSync(stakeDir, {recursive: true, force: true});
    });

    it("throws ArtifactBuildConflictError rather than overwriting an existing, non-empty destination", async () => {
        fs.mkdirSync(destinationDir);
        fs.writeFileSync(path.join(destinationDir, "unrelated.txt"), "not ours");
        const builder = new StakeAdapterArtifactBuilder("1.3.0");

        await expect(builder.build(stakeAdapterProjectOf(sourceDir), destinationDir)).rejects.toThrow(ArtifactBuildConflictError);
        expect(fs.readdirSync(destinationDir)).toEqual(["unrelated.txt"]);
    });

    it("refuses a destination inside the source without publishing a partial Stake export", async () => {
        const nestedDestination = path.join(sourceDir, "republished");

        await expect(new StakeAdapterArtifactBuilder("1.3.0").build(stakeAdapterProjectOf(sourceDir), nestedDestination)).rejects.toThrow(
            ArtifactBuildConflictError,
        );
        expect(fs.existsSync(nestedDestination)).toBe(false);
        expect(fs.existsSync(path.join(sourceDir, "index.json"))).toBe(true);
    });

    it("refuses the source and a symlinked source ancestor without changing the Stake export", async () => {
        const linkedParent = `${sourceDir}-link`;
        fs.symlinkSync(sourceDir, linkedParent, "dir");

        try {
            await expect(new StakeAdapterArtifactBuilder("1.3.0").build(stakeAdapterProjectOf(sourceDir), sourceDir)).rejects.toThrow(
                ArtifactBuildConflictError,
            );
            await expect(
                new StakeAdapterArtifactBuilder("1.3.0").build(stakeAdapterProjectOf(sourceDir), path.join(linkedParent, "republished")),
            ).rejects.toThrow(ArtifactBuildConflictError);
            expect(fs.existsSync(path.join(sourceDir, "index.json"))).toBe(true);
        } finally {
            fs.unlinkSync(linkedParent);
        }
    });

    it("reports preflight/cancellation before publishing and leaves no Stake directory", async () => {
        const controller = new AbortController();
        const statuses: string[] = [];

        await expect(
            new StakeAdapterArtifactBuilder("1.3.0").build(stakeAdapterProjectOf(sourceDir), destinationDir, {
                signal: controller.signal,
                onProgress: (event) => {
                    statuses.push(event.status);
                    if (event.status === "preflight") controller.abort();
                },
            }),
        ).rejects.toBeInstanceOf(ArtifactBuildCancelledError);
        expect(statuses).toEqual(["preflight", "cancelled"]);
        expect(fs.existsSync(destinationDir)).toBe(false);
    });

    it("cancels from the final Unicode-path Stake publish callback, leaving neither output nor temporary export", async () => {
        const controller = new AbortController();
        const unicodeDestination = path.join(path.dirname(destinationDir), "ставка с пробелом");
        const progress: string[] = [];

        await expect(
            new StakeAdapterArtifactBuilder("1.3.0").build(stakeAdapterProjectOf(sourceDir), unicodeDestination, {
                signal: controller.signal,
                onProgress: (event) => {
                    progress.push(event.message ?? event.status);
                    if (event.message === "Publishing Stake file pokie-manifest.json") controller.abort();
                },
            }),
        ).rejects.toBeInstanceOf(ArtifactBuildCancelledError);

        expect(progress).toContain("Publishing Stake file pokie-manifest.json");
        expect(fs.existsSync(unicodeDestination)).toBe(false);
        expect(fs.readdirSync(path.dirname(unicodeDestination)).filter((entry) => entry.startsWith(`${path.basename(unicodeDestination)}.`))).toEqual([]);
    });

    it("cleans temporary export output when the underlying Stake writer fails", async () => {
        const failingExporter = new StakeEngineExporter(
            "1.3.0",
            undefined,
            undefined,
            undefined,
            () => {
                throw new Error("injected Stake write failure");
            },
        );

        await expect(new StakeAdapterArtifactBuilder("1.3.0", undefined, failingExporter).build(stakeAdapterProjectOf(sourceDir), destinationDir)).rejects.toThrow(
            "injected Stake write failure",
        );
        expect(fs.existsSync(destinationDir)).toBe(false);
        expect(fs.readdirSync(path.dirname(destinationDir)).filter((entry) => entry.startsWith(`${path.basename(destinationDir)}.`))).toEqual([]);
    });

    it("does not clean up a late caller claim from the real Stake publication window and allows retry", async () => {
        let claimOnCommit = true;
        const exporter = new StakeEngineExporter(
            "1.3.0",
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            () => {
                if (!claimOnCommit) return;
                fs.mkdirSync(destinationDir);
                fs.writeFileSync(path.join(destinationDir, "caller-owned.txt"), "untouched");
            },
        );
        const builder = new StakeAdapterArtifactBuilder("1.3.0", undefined, exporter);

        await expect(builder.build(stakeAdapterProjectOf(sourceDir), destinationDir)).rejects.toThrow(/claimed/i);
        expect(fs.readFileSync(path.join(destinationDir, "caller-owned.txt"), "utf-8")).toBe("untouched");
        expect(fs.readdirSync(path.dirname(destinationDir)).filter((entry) => entry.startsWith(`${path.basename(destinationDir)}.`))).toEqual([]);

        fs.rmSync(destinationDir, {recursive: true, force: true});
        claimOnCommit = false;
        await expect(builder.build(stakeAdapterProjectOf(sourceDir), destinationDir)).resolves.toMatchObject({outputPath: destinationDir});
        expect(fs.existsSync(path.join(destinationDir, "pokie-manifest.json"))).toBe(true);
    });
});
