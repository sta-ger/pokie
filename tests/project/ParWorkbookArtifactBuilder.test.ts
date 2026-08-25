import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactBuildConflictError,
    ArtifactBuildCancelledError,
    GameBlueprint,
    ParSheetExporter,
    ParSheetImporter,
    ParWorkbookArtifactBuilder,
    PokieProject,
    PROJECT_TYPE_CAPABILITIES,
    type ParSheetExporting,
} from "pokie";

function parWorkbookProjectOf(rootPath: string): PokieProject {
    return {
        type: "parWorkbook",
        rootPath,
        capabilities: PROJECT_TYPE_CAPABILITIES.parWorkbook,
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

describe("ParWorkbookArtifactBuilder", () => {
    let dir: string;
    let sourceFile: string;
    let blueprintFile: string;
    let destinationFile: string;

    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-parworkbook-builder-test-"));
        sourceFile = path.join(dir, "source.par.xlsx");
        blueprintFile = path.join(dir, "source.blueprint.json");
        destinationFile = path.join(dir, "republished.par.xlsx");

        const exporter = new ParSheetExporter("1.3.0");
        await exporter.exportToFile(blueprint, sourceFile);
        fs.writeFileSync(blueprintFile, JSON.stringify(blueprint));
    });

    afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
    });

    it("republishes an already-exported PAR sheet workbook to a new file", async () => {
        const builder = new ParWorkbookArtifactBuilder("1.3.0");

        const result = await builder.build(parWorkbookProjectOf(sourceFile), destinationFile);

        expect(result.outputPath).toBe(destinationFile);
        expect(fs.existsSync(destinationFile)).toBe(true);
    });

    it("validates a readable workbook without creating a destination file", async () => {
        const builder = new ParWorkbookArtifactBuilder("1.3.0");

        await expect(builder.validate(parWorkbookProjectOf(sourceFile))).resolves.toBeUndefined();
        expect(fs.existsSync(destinationFile)).toBe(false);
    });

    it("validates and builds a canonical Blueprint as a readable PAR workbook snapshot", async () => {
        const builder = new ParWorkbookArtifactBuilder("1.3.0");

        await expect(builder.validate(blueprintProjectOf(blueprintFile))).resolves.toBeUndefined();
        await expect(builder.build(blueprintProjectOf(blueprintFile), destinationFile)).resolves.toEqual({outputPath: destinationFile});

        const imported = await new ParSheetImporter().importFromFile(destinationFile);
        expect(imported.issues.filter((issue) => issue.severity === "error")).toEqual([]);
        expect(imported.blueprint).toMatchObject({manifest: blueprint.manifest, reelStrips: blueprint.reelStrips, paytable: blueprint.paytable});
    });

    it("reports Blueprint validation diagnostics without creating a PAR workbook", async () => {
        fs.writeFileSync(blueprintFile, JSON.stringify({manifest: blueprint.manifest}));
        const builder = new ParWorkbookArtifactBuilder("1.3.0");

        await expect(builder.validate(blueprintProjectOf(blueprintFile))).rejects.toThrow(
            `Blueprint "${blueprintFile}" cannot build a PAR workbook:`,
        );
        expect(fs.existsSync(destinationFile)).toBe(false);
    });

    it("rejects an unseeded generated Blueprint through the shared PAR preflight without replacing its destination", async () => {
        const unseeded = {
            ...blueprint,
            reelStripGeneration: [
                {type: "generated", length: 2, symbolCounts: {A: 1, W: 1}},
                {type: "literal", strip: ["W", "A"]},
            ],
        };
        fs.writeFileSync(blueprintFile, JSON.stringify(unseeded));
        const sentinel = "existing workbook stays untouched";
        fs.writeFileSync(destinationFile, sentinel);
        const builder = new ParWorkbookArtifactBuilder("1.3.0");
        const unseededDestination = path.join(dir, "unseeded.par.xlsx");

        await expect(builder.validate(blueprintProjectOf(blueprintFile))).rejects.toThrow(/parsheet-reel-generation-seed-required.*reelStripGeneration\[0\]\.seed/);
        await expect(builder.build(blueprintProjectOf(blueprintFile), unseededDestination)).rejects.toThrow(/reelStripGeneration\[0\]\.seed/);
        expect(fs.readFileSync(destinationFile, "utf-8")).toBe(sentinel);
        expect(fs.existsSync(unseededDestination)).toBe(false);
    });

    it("throws ArtifactBuildConflictError rather than overwriting an existing file", async () => {
        fs.writeFileSync(destinationFile, "not ours");
        const builder = new ParWorkbookArtifactBuilder("1.3.0");

        await expect(builder.build(parWorkbookProjectOf(sourceFile), destinationFile)).rejects.toThrow(ArtifactBuildConflictError);
        expect(fs.readFileSync(destinationFile, "utf-8")).toBe("not ours");
    });

    it("refuses the source workbook itself as destination without changing it", async () => {
        const before = fs.readFileSync(sourceFile);

        await expect(new ParWorkbookArtifactBuilder("1.3.0").build(parWorkbookProjectOf(sourceFile), sourceFile)).rejects.toThrow(
            ArtifactBuildConflictError,
        );
        expect(fs.readFileSync(sourceFile)).toEqual(before);
    });

    it("refuses a symlink-ancestor alias of the source workbook without creating an output", async () => {
        const linkedDir = `${dir}-link`;
        fs.symlinkSync(dir, linkedDir, "dir");
        try {
            await expect(new ParWorkbookArtifactBuilder("1.3.0").build(parWorkbookProjectOf(sourceFile), path.join(linkedDir, "source.par.xlsx"))).rejects.toThrow(
                ArtifactBuildConflictError,
            );
            expect(fs.readFileSync(sourceFile)).toEqual(fs.readFileSync(path.join(linkedDir, "source.par.xlsx")));
        } finally {
            fs.unlinkSync(linkedDir);
        }
    });

    it("removes a partial Unicode-path workbook when its exporter fails", async () => {
        const unicodeDestination = path.join(dir, "отчёт с пробелом.par.xlsx");
        const failingExporter: ParSheetExporting = {
            exportToFile: (_blueprint, outputPath) => {
                fs.writeFileSync(outputPath, "partial workbook");
                return Promise.reject(new Error("injected PAR write failure"));
            },
        };

        await expect(new ParWorkbookArtifactBuilder("1.3.0", undefined, failingExporter).build(parWorkbookProjectOf(sourceFile), unicodeDestination)).rejects.toThrow(
            "injected PAR write failure",
        );
        expect(fs.existsSync(unicodeDestination)).toBe(false);
    });

    it("removes a partial Blueprint workbook when its exporter fails", async () => {
        const failingExporter: ParSheetExporting = {
            exportToFile: (_blueprint, outputPath) => {
                fs.writeFileSync(outputPath, "partial workbook");
                return Promise.reject(new Error("injected Blueprint PAR write failure"));
            },
        };

        await expect(new ParWorkbookArtifactBuilder("1.3.0", undefined, failingExporter).build(blueprintProjectOf(blueprintFile), destinationFile)).rejects.toThrow(
            "injected Blueprint PAR write failure",
        );
        expect(fs.existsSync(destinationFile)).toBe(false);
    });

    it("cancels at the PAR publish commit callback without leaving a temporary workbook", async () => {
        const controller = new AbortController();
        const messages: string[] = [];

        await expect(
            new ParWorkbookArtifactBuilder("1.3.0").build(parWorkbookProjectOf(sourceFile), destinationFile, {
                signal: controller.signal,
                onProgress: (progress) => {
                    messages.push(progress.message ?? progress.status);
                    if (progress.message === "Committing PAR workbook") controller.abort();
                },
            }),
        ).rejects.toBeInstanceOf(ArtifactBuildCancelledError);

        expect(messages).toContain("Committing PAR workbook");
        expect(fs.existsSync(destinationFile)).toBe(false);
        expect(fs.readdirSync(dir).filter((entry) => entry.startsWith(`.${path.basename(destinationFile)}.tmp-`))).toEqual([]);
    });
});
