import fs from "fs";
import os from "os";
import path from "path";
import {
    capturePublishDirectoryOwnership,
    preflightAtomicDirectoryPublication,
    publishDirectoryAtomically,
    removePublishedDirectoryIfOwned,
} from "../../src/stakeengine/internal/publishDirectoryAtomically.js";

const failingMove = () => ({status: 1, stderr: "mv: unrecognized option '--exchange'"});

describe("publishDirectoryAtomically portable fallback", () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-publish-"));
    });

    afterEach(() => {
        fs.rmSync(root, {recursive: true, force: true});
    });

    it("replaces an existing directory when mv --exchange is unavailable", () => {
        const outDir = path.join(root, "out");
        fs.mkdirSync(outDir);
        fs.writeFileSync(path.join(outDir, "old.txt"), "old");
        const ownership = capturePublishDirectoryOwnership(outDir);
        preflightAtomicDirectoryPublication(outDir, false, failingMove);

        const {publication} = publishDirectoryAtomically({
            outDir,
            ownership,
            runMove: failingMove,
            writeFilesIntoTempDir: (tempDir) => fs.writeFileSync(path.join(tempDir, "new.txt"), "new"),
        });

        expect(fs.readFileSync(path.join(outDir, "new.txt"), "utf8")).toBe("new");
        expect(fs.existsSync(path.join(outDir, "old.txt"))).toBe(false);
        expect(fs.readdirSync(root).filter((name) => name.startsWith(".out."))).toEqual([]);
        expect(publication.outDir).toBe(outDir);
    });

    it("installs a new directory when mv --no-clobber is unavailable", () => {
        const outDir = path.join(root, "out");
        preflightAtomicDirectoryPublication(outDir, true, failingMove);

        publishDirectoryAtomically({
            outDir,
            expectedDestinationWasAbsent: true,
            runMove: failingMove,
            writeFilesIntoTempDir: (tempDir) => fs.writeFileSync(path.join(tempDir, "new.txt"), "new"),
        });

        expect(fs.readFileSync(path.join(outDir, "new.txt"), "utf8")).toBe("new");
    });

    it("removes a publication when mv --exchange is unavailable", () => {
        const outDir = path.join(root, "out");
        fs.mkdirSync(outDir);
        fs.writeFileSync(path.join(outDir, "old.txt"), "old");
        const {publication} = publishDirectoryAtomically({
            outDir,
            ownership: capturePublishDirectoryOwnership(outDir),
            runMove: failingMove,
            writeFilesIntoTempDir: (tempDir) => fs.writeFileSync(path.join(tempDir, "new.txt"), "new"),
        });

        expect(removePublishedDirectoryIfOwned(publication, failingMove)).toBe(true);
        expect(fs.existsSync(outDir)).toBe(false);
    });
});
