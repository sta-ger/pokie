import fs from "fs";
import os from "os";
import path from "path";
import {
    OutcomeLibraryFolderOutcomeSource,
    OutcomeLibraryFolderReader,
    OutcomeLibraryFolderWriter,
    SeededWeightedOutcomeRandomSource,
} from "@fromstan/pokie";
import {buildOutcomeLibraryFolderModeInput} from "./OutcomeLibraryFolderTestFixtures.js";

class CountingReader extends OutcomeLibraryFolderReader {
    public reads = 0;

    public override readModeIndex(libraryDir: string, modeName: string) {
        this.reads += 1;
        return super.readModeIndex(libraryDir, modeName);
    }
}

describe("OutcomeLibraryFolderOutcomeSource", () => {
    let outDir: string;

    beforeEach(async () => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcome-source-cache-test-"));
        fs.rmdirSync(outDir);
        await new OutcomeLibraryFolderWriter("1.3.0").writeToDirectory(
            [buildOutcomeLibraryFolderModeInput("base", "base-lib")],
            outDir,
        );
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
    });

    it("reuses a parsed mode index across draws and observes an atomic index replacement", async () => {
        const reader = new CountingReader();
        const source = new OutcomeLibraryFolderOutcomeSource(outDir, "base", reader);

        for (let index = 0; index < 4; index += 1) {
            const drawn = await source.drawOutcome(new SeededWeightedOutcomeRandomSource(`draw-${index}`));
            expect(drawn.libraryId).toBe("base-lib");
            expect(drawn.outcome.id).toBeDefined();
        }
        expect(reader.reads).toBe(1);

        // An atomic rewrite changes inode and/or mtime; the next draw must re-read the index.
        const indexPath = path.join(outDir, "index_base.json");
        const replacement = `${indexPath}.replacement`;
        fs.writeFileSync(replacement, fs.readFileSync(indexPath));
        fs.renameSync(replacement, indexPath);

        await source.drawOutcome(new SeededWeightedOutcomeRandomSource("after-rebuild"));
        expect(reader.reads).toBe(2);
    });
});
