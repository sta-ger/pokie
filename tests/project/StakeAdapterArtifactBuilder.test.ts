import fs from "fs";
import os from "os";
import path from "path";
import {ArtifactBuildConflictError, PokieProject, PROJECT_TYPE_CAPABILITIES, StakeAdapterArtifactBuilder, StakeEngineExporter} from "pokie";
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

    it("throws ArtifactBuildConflictError rather than overwriting an existing, non-empty destination", async () => {
        fs.mkdirSync(destinationDir);
        fs.writeFileSync(path.join(destinationDir, "unrelated.txt"), "not ours");
        const builder = new StakeAdapterArtifactBuilder("1.3.0");

        await expect(builder.build(stakeAdapterProjectOf(sourceDir), destinationDir)).rejects.toThrow(ArtifactBuildConflictError);
        expect(fs.readdirSync(destinationDir)).toEqual(["unrelated.txt"]);
    });
});
