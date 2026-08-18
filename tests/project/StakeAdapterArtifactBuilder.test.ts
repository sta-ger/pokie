import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactBuildCancelledError,
    ArtifactBuildConflictError,
    OutcomeLibraryBundleWriter,
    PokieProject,
    PROJECT_TYPE_CAPABILITIES,
    StakeAdapterArtifactBuilder,
    StakeEngineExporter,
} from "pokie";
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

    it("republishes an already-exported Stake Engine directory to a new location, byte-identically", async () => {
        const builder = new StakeAdapterArtifactBuilder("1.3.0");

        const result = await builder.build(stakeAdapterProjectOf(sourceDir), destinationDir);

        expect(result.outputPath).toBe(destinationDir);
        expect(new Set(fs.readdirSync(destinationDir))).toEqual(new Set(fs.readdirSync(sourceDir)));
        expect(fs.readFileSync(path.join(destinationDir, "index.json"), "utf-8")).toBe(fs.readFileSync(path.join(sourceDir, "index.json"), "utf-8"));
    });

    it("builds Stake output from the registered canonical Outcome Library prerequisite", async () => {
        const outcomeDir = `${sourceDir}-outcome-library`;
        const stakeDir = `${sourceDir}-stake-output`;
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], outcomeDir);

        const result = await new StakeAdapterArtifactBuilder("1.3.0").build(
            {
                type: "outcomeLibrary",
                rootPath: outcomeDir,
                capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
                provenance: "canonical prerequisite",
            },
            stakeDir,
        );

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
});
