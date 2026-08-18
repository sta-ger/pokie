import fs from "fs";
import os from "os";
import path from "path";
import {ArtifactBuildConflictError, GameBlueprint, ParSheetExporter, ParWorkbookArtifactBuilder, PokieProject, PROJECT_TYPE_CAPABILITIES} from "pokie";

function parWorkbookProjectOf(rootPath: string): PokieProject {
    return {
        type: "parWorkbook",
        rootPath,
        capabilities: PROJECT_TYPE_CAPABILITIES.parWorkbook,
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
    let destinationFile: string;

    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-parworkbook-builder-test-"));
        sourceFile = path.join(dir, "source.par.xlsx");
        destinationFile = path.join(dir, "republished.par.xlsx");

        const exporter = new ParSheetExporter("1.3.0");
        await exporter.exportToFile(blueprint, sourceFile);
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
});
