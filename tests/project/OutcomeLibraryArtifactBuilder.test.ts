import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactBuildCancelledError,
    ArtifactBuildConflictError,
    OutcomeLibraryArtifactBuilder,
    OutcomeLibraryBundleWriter,
    PokieProject,
    PROJECT_TYPE_CAPABILITIES,
} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

function outcomeLibraryProjectOf(rootPath: string): PokieProject {
    return {
        type: "outcomeLibrary",
        rootPath,
        capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
        provenance: "test fixture",
    } as PokieProject;
}

function blueprintProjectOf(rootPath: string): PokieProject {
    return {
        type: "blueprint",
        rootPath,
        capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
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

    it("refuses a destination inside the source, including through a symlink, without altering the bundle", async () => {
        const nestedDestination = path.join(sourceDir, "republished");
        const linkedParent = `${sourceDir}-link`;
        fs.symlinkSync(sourceDir, linkedParent, "dir");
        const builder = new OutcomeLibraryArtifactBuilder("1.3.0");

        await expect(builder.build(outcomeLibraryProjectOf(sourceDir), nestedDestination)).rejects.toThrow(ArtifactBuildConflictError);
        await expect(builder.build(outcomeLibraryProjectOf(sourceDir), path.join(linkedParent, "republished"))).rejects.toThrow(ArtifactBuildConflictError);
        expect(fs.existsSync(nestedDestination)).toBe(false);
        expect(fs.existsSync(path.join(sourceDir, "manifest.json"))).toBe(true);
        fs.unlinkSync(linkedParent);
    });

    it("refuses the source bundle itself without changing its valid-looking manifest", async () => {
        const manifestBefore = fs.readFileSync(path.join(sourceDir, "manifest.json"), "utf-8");

        await expect(new OutcomeLibraryArtifactBuilder("1.3.0").build(outcomeLibraryProjectOf(sourceDir), sourceDir)).rejects.toThrow(
            ArtifactBuildConflictError,
        );
        expect(fs.readFileSync(path.join(sourceDir, "manifest.json"), "utf-8")).toBe(manifestBefore);
    });

    it("reports preflight/cancellation before publishing and leaves no Outcome bundle", async () => {
        const controller = new AbortController();
        const statuses: string[] = [];

        await expect(
            new OutcomeLibraryArtifactBuilder("1.3.0").build(outcomeLibraryProjectOf(sourceDir), destinationDir, {
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

    it("rejects a Blueprint instead of writing an unregistered Outcome bundle", async () => {
        const builder = new OutcomeLibraryArtifactBuilder("1.3.0");

        await expect(builder.build(blueprintProjectOf(path.join(sourceDir, "game.blueprint.json")), destinationDir)).rejects.toThrow(
            /Blueprint conversion must use ArtifactBuilderRegistry\.build\("outcomeLibrary"/,
        );
        expect(fs.existsSync(destinationDir)).toBe(false);
    });
});
