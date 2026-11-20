import fs from "fs";
import os from "os";
import path from "path";
import {
    BuildCancelledError,
    type BuildProgress,
    BuildConflictError,
    OutcomeLibraryOutputBuilder,
    OutcomeLibraryFolderWriter,
    PokieProject,
    PROJECT_TYPE_CAPABILITIES,
} from "@fromstan/pokie";
import {buildOutcomeLibraryFolderModeInput} from "../weightedoutcome/folder/OutcomeLibraryFolderTestFixtures.js";

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

describe("OutcomeLibraryOutputBuilder", () => {
    let sourceRoot: string;
    let sourceDir: string;
    let destinationDir: string;

    beforeEach(async () => {
        sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcomelibrary-builder-source-"));
        sourceDir = path.join(sourceRoot, "folder");
        destinationDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcomelibrary-builder-dest-"));
        fs.rmdirSync(destinationDir);

        const writer = new OutcomeLibraryFolderWriter("1.3.0");
        await writer.writeToDirectory(
            [buildOutcomeLibraryFolderModeInput("base", "base-lib"), buildOutcomeLibraryFolderModeInput("bonus", "bonus-lib")],
            sourceDir,
        );
    });

    afterEach(() => {
        fs.rmSync(sourceRoot, {recursive: true, force: true});
        fs.rmSync(destinationDir, {recursive: true, force: true});
    });

    it("republishes every mode with phase-local progress and byte-identical output", async () => {
        const builder = new OutcomeLibraryOutputBuilder("1.3.0");

        const progress: BuildProgress[] = [];
        const result = await builder.build(outcomeLibraryProjectOf(sourceDir), destinationDir, {onProgress: event => progress.push(event)});
        expect(progress).toContainEqual(expect.objectContaining({unit: "outcome records", message: "Writing Outcome mode base", total: undefined}));
        expect(progress).toContainEqual(expect.objectContaining({unit: "outcome records", message: "Analyzing Outcome mode base (pass 1 of 2)", total: expect.any(BigInt)}));
        expect(progress).toContainEqual(expect.objectContaining({unit: "bytes", phase: "Building Outcome Library index base", total: expect.any(BigInt)}));
        expect(progress).toContainEqual(expect.objectContaining({unit: "bundle files", phase: "Publishing Outcome files", total: expect.any(BigInt)}));
        expect(progress.find(event => event.phase === "Preparing outcome-library publication")?.completed).toBeUndefined();
        expect(progress.find(event => event.phase === "validation")?.total).toBeUndefined();

        expect(result.outputPath).toBe(destinationDir);
        expect(new Set(fs.readdirSync(destinationDir))).toEqual(new Set(fs.readdirSync(sourceDir)));
        expect(fs.readFileSync(path.join(destinationDir, "outcomes_base.jsonl"), "utf-8")).toBe(
            fs.readFileSync(path.join(sourceDir, "outcomes_base.jsonl"), "utf-8"),
        );
        const sourceManifest = JSON.parse(fs.readFileSync(path.join(sourceDir, "manifest.json"), "utf-8")) as {modes: unknown[]};
        const destinationManifest = JSON.parse(fs.readFileSync(path.join(destinationDir, "manifest.json"), "utf-8")) as {modes: unknown[]};
        expect(destinationManifest.modes).toEqual(sourceManifest.modes);
    });

    it("validates every source mode without creating a destination", async () => {
        const builder = new OutcomeLibraryOutputBuilder("1.3.0");

        await expect(builder.validate(outcomeLibraryProjectOf(sourceDir))).resolves.toBeUndefined();
        expect(fs.existsSync(destinationDir)).toBe(false);
    });

    it("throws BuildConflictError rather than overwriting an existing, non-empty destination", async () => {
        fs.mkdirSync(destinationDir);
        fs.writeFileSync(path.join(destinationDir, "unrelated.txt"), "not ours");
        const builder = new OutcomeLibraryOutputBuilder("1.3.0");

        await expect(builder.build(outcomeLibraryProjectOf(sourceDir), destinationDir)).rejects.toThrow(BuildConflictError);
        expect(fs.readdirSync(destinationDir)).toEqual(["unrelated.txt"]);
    });

    it("refuses a destination inside the source, including through a symlink, without altering the bundle", async () => {
        const nestedDestination = path.join(sourceDir, "republished");
        const linkedParent = `${sourceDir}-link`;
        fs.symlinkSync(sourceDir, linkedParent, "dir");
        const builder = new OutcomeLibraryOutputBuilder("1.3.0");

        await expect(builder.build(outcomeLibraryProjectOf(sourceDir), nestedDestination)).rejects.toThrow(BuildConflictError);
        await expect(builder.build(outcomeLibraryProjectOf(sourceDir), path.join(linkedParent, "republished"))).rejects.toThrow(BuildConflictError);
        expect(fs.existsSync(nestedDestination)).toBe(false);
        expect(fs.existsSync(path.join(sourceDir, "manifest.json"))).toBe(true);
        fs.unlinkSync(linkedParent);
    });

    it("refuses the source bundle itself without changing its valid-looking manifest", async () => {
        const manifestBefore = fs.readFileSync(path.join(sourceDir, "manifest.json"), "utf-8");

        await expect(new OutcomeLibraryOutputBuilder("1.3.0").build(outcomeLibraryProjectOf(sourceDir), sourceDir)).rejects.toThrow(
            BuildConflictError,
        );
        expect(fs.readFileSync(path.join(sourceDir, "manifest.json"), "utf-8")).toBe(manifestBefore);
    });

    it("reports preflight/cancellation before publishing and leaves no Outcome bundle", async () => {
        const controller = new AbortController();
        const statuses: string[] = [];

        await expect(
            new OutcomeLibraryOutputBuilder("1.3.0").build(outcomeLibraryProjectOf(sourceDir), destinationDir, {
                signal: controller.signal,
                onProgress: (event) => {
                    statuses.push(event.status);
                    if (event.status === "preflight") controller.abort();
                },
            }),
        ).rejects.toBeInstanceOf(BuildCancelledError);
        expect(statuses).toEqual(["preflight", "cancelled"]);
        expect(fs.existsSync(destinationDir)).toBe(false);
    });

    it("cancels from the final Unicode-path bundle publish callback, leaving neither output nor writer scratch directories", async () => {
        const controller = new AbortController();
        const unicodeDestination = path.join(path.dirname(destinationDir), "результат с пробелом");
        const progress: string[] = [];

        await expect(
            new OutcomeLibraryOutputBuilder("1.3.0").build(outcomeLibraryProjectOf(sourceDir), unicodeDestination, {
                signal: controller.signal,
                onProgress: (event) => {
                    progress.push(event.message ?? event.status);
                    if (event.message === "Publishing Outcome file manifest.json") controller.abort();
                },
            }),
        ).rejects.toBeInstanceOf(BuildCancelledError);

        expect(progress).toContain("Publishing Outcome file manifest.json");
        expect(fs.existsSync(unicodeDestination)).toBe(false);
        expect(fs.readdirSync(path.dirname(unicodeDestination)).filter((entry) => entry.startsWith(`${path.basename(unicodeDestination)}.`))).toEqual([]);
    });

    it("cleans staging output when the underlying Outcome writer fails", async () => {
        const failingWriter = new OutcomeLibraryFolderWriter(
            "1.3.0",
            undefined,
            undefined,
            (filePath, contents) => {
                if (path.basename(filePath).startsWith("index_")) throw new Error("injected Outcome write failure");
                fs.writeFileSync(filePath, contents, "utf-8");
            },
        );

        await expect(new OutcomeLibraryOutputBuilder("1.3.0", undefined, failingWriter).build(outcomeLibraryProjectOf(sourceDir), destinationDir)).rejects.toThrow(
            "injected Outcome write failure",
        );
        expect(fs.existsSync(destinationDir)).toBe(false);
        expect(fs.readdirSync(path.dirname(destinationDir)).filter((entry) => entry.startsWith(`${path.basename(destinationDir)}.`))).toEqual([]);
    });

    it("preserves a late caller-owned destination at the writer's final publication check and succeeds on retry", async () => {
        const nativeWriter = new OutcomeLibraryFolderWriter("1.3.0");
        let claimDestination = true;
        const writer = {
            writeToDirectory: (modes: Parameters<OutcomeLibraryFolderWriter["writeToDirectory"]>[0], destination: string, options?: Parameters<OutcomeLibraryFolderWriter["writeToDirectory"]>[2]) => {
                return nativeWriter.writeToDirectory(modes, destination, {
                    ...options,
                    onProgress: (progress) => {
                        options?.onProgress?.(progress);
                        if (claimDestination && progress.message.startsWith("Publishing Outcome file")) {
                            // This runs after the adapter's final policy and
                            // while the shared publisher is building tempDir.
                            fs.rmSync(destination, {recursive: true, force: true});
                            fs.mkdirSync(destination);
                            fs.writeFileSync(path.join(destination, "caller-owned.txt"), "untouched");
                            claimDestination = false;
                        }
                    },
                });
            },
        } as OutcomeLibraryFolderWriter;
        const builder = new OutcomeLibraryOutputBuilder("1.3.0", undefined, writer);

        await expect(builder.build(outcomeLibraryProjectOf(sourceDir), destinationDir)).rejects.toThrow(/claimed while publication was being prepared/i);
        expect(fs.readFileSync(path.join(destinationDir, "caller-owned.txt"), "utf-8")).toBe("untouched");
        expect(fs.readdirSync(path.dirname(destinationDir)).filter((entry) => entry.startsWith(`${path.basename(destinationDir)}.`))).toEqual([]);

        fs.rmSync(destinationDir, {recursive: true, force: true});
        claimDestination = false;
        await expect(builder.build(outcomeLibraryProjectOf(sourceDir), destinationDir)).resolves.toMatchObject({outputPath: destinationDir});
    });

    it("rejects a Blueprint instead of writing an unregistered Outcome bundle", async () => {
        const builder = new OutcomeLibraryOutputBuilder("1.3.0");

        await expect(builder.build(blueprintProjectOf(path.join(sourceDir, "game.blueprint.json")), destinationDir)).rejects.toThrow(
            /Blueprint conversion must use BuildOutputBuilderRegistry\.build\("outcomeLibrary"/,
        );
        expect(fs.existsSync(destinationDir)).toBe(false);
    });
});
