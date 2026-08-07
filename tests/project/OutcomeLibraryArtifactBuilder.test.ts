import fs from "fs";
import os from "os";
import path from "path";
import {ArtifactBuildConflictError, OutcomeLibraryArtifactBuilder, OutcomeLibraryBundleWriter, PokieProject, PROJECT_TYPE_CAPABILITIES} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

function outcomeLibraryProjectOf(rootPath: string): PokieProject {
    return {
        type: "outcomeLibrary",
        rootPath,
        capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
        provenance: "test fixture",
    } as PokieProject;
}

describe("OutcomeLibraryArtifactBuilder", () => {
    let sourceDir: string;
    let destinationDir: string;

    beforeEach(async () => {
        sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcomelibrary-builder-source-"));
        destinationDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcomelibrary-builder-dest-"));
        fs.rmdirSync(destinationDir);

        const writer = new OutcomeLibraryBundleWriter("1.3.0");
        await writer.writeToDirectory(
            [buildOutcomeLibraryBundleModeInput("base", "base-lib"), buildOutcomeLibraryBundleModeInput("bonus", "bonus-lib")],
            sourceDir,
        );
    });

    afterEach(() => {
        fs.rmSync(sourceDir, {recursive: true, force: true});
        fs.rmSync(destinationDir, {recursive: true, force: true});
    });

    it("republishes every mode of an already-built bundle to a new directory, byte-identically", async () => {
        const builder = new OutcomeLibraryArtifactBuilder("1.3.0");

        const result = await builder.build(outcomeLibraryProjectOf(sourceDir), destinationDir);

        expect(result.outputPath).toBe(destinationDir);
        expect(new Set(fs.readdirSync(destinationDir))).toEqual(new Set(fs.readdirSync(sourceDir)));
        expect(fs.readFileSync(path.join(destinationDir, "outcomes_base.jsonl"), "utf-8")).toBe(
            fs.readFileSync(path.join(sourceDir, "outcomes_base.jsonl"), "utf-8"),
        );
        const sourceManifest = JSON.parse(fs.readFileSync(path.join(sourceDir, "manifest.json"), "utf-8")) as {modes: unknown[]};
        const destinationManifest = JSON.parse(fs.readFileSync(path.join(destinationDir, "manifest.json"), "utf-8")) as {modes: unknown[]};
        expect(destinationManifest.modes).toEqual(sourceManifest.modes);
    });

    it("throws ArtifactBuildConflictError rather than overwriting an existing, non-empty destination", async () => {
        fs.mkdirSync(destinationDir);
        fs.writeFileSync(path.join(destinationDir, "unrelated.txt"), "not ours");
        const builder = new OutcomeLibraryArtifactBuilder("1.3.0");

        await expect(builder.build(outcomeLibraryProjectOf(sourceDir), destinationDir)).rejects.toThrow(ArtifactBuildConflictError);
        expect(fs.readdirSync(destinationDir)).toEqual(["unrelated.txt"]);
    });
});
