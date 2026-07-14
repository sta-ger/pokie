import fs from "fs";
import os from "os";
import path from "path";
import {writeFileAtomically} from "../../src/parsheet/writeFileAtomically.js";

describe("writeFileAtomically", () => {
    let dir: string;
    let filePath: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-write-atomically-test-"));
        filePath = path.join(dir, "out.txt");
    });

    afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
    });

    function listTempFiles(): string[] {
        return fs.readdirSync(dir).filter((name) => name.startsWith(".out.txt.tmp-"));
    }

    it("writes via a temp file in the same directory and renames it into place, leaving no temp file behind", async () => {
        await writeFileAtomically(filePath, (tempPath) => {
            expect(path.dirname(tempPath)).toBe(dir);
            expect(tempPath).not.toBe(filePath);
            fs.writeFileSync(tempPath, "hello");
            return Promise.resolve();
        });

        expect(fs.readFileSync(filePath, "utf-8")).toBe("hello");
        expect(listTempFiles()).toEqual([]);
    });

    it("creates no file and leaves no temp file behind when the write callback throws and the target never existed", async () => {
        await expect(writeFileAtomically(filePath, () => Promise.reject(new Error("disk full")))).rejects.toThrow("disk full");

        expect(fs.existsSync(filePath)).toBe(false);
        expect(listTempFiles()).toEqual([]);
    });

    it("leaves an existing target file's content completely untouched when the write callback throws", async () => {
        const sentinelContent = "whatever was already there";
        fs.writeFileSync(filePath, sentinelContent);

        await expect(
            writeFileAtomically(filePath, (tempPath) => {
                // A real failure can still leave a partial temp file behind (e.g. a write interrupted
                // partway) — the target must stay untouched regardless.
                fs.writeFileSync(tempPath, "partial garbage");
                throw new Error("disk full");
            }),
        ).rejects.toThrow("disk full");

        expect(fs.readFileSync(filePath, "utf-8")).toBe(sentinelContent);
        expect(listTempFiles()).toEqual([]);
    });

    it("leaves an existing target completely untouched when the rename itself fails", async () => {
        // A file can never be renamed onto an existing directory (EISDIR/ENOTEMPTY on every
        // platform, regardless of user privileges) — a reliable way to force the rename step
        // specifically to fail without relying on permission errors that root would bypass.
        fs.mkdirSync(filePath);
        fs.writeFileSync(path.join(filePath, "sentinel.txt"), "still here");

        await expect(writeFileAtomically(filePath, (tempPath) => Promise.resolve(fs.writeFileSync(tempPath, "hello")))).rejects.toThrow();

        expect(fs.statSync(filePath).isDirectory()).toBe(true);
        expect(fs.readFileSync(path.join(filePath, "sentinel.txt"), "utf-8")).toBe("still here");
        expect(listTempFiles()).toEqual([]);
    });
});
