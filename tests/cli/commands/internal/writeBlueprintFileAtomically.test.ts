import fs from "fs";
import os from "os";
import path from "path";
import {writeBlueprintFileAtomically} from "../../../../cli/commands/internal/writeBlueprintFileAtomically.js";

describe("writeBlueprintFileAtomically", () => {
    let dir: string;
    let filePath: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-write-blueprint-atomically-test-"));
        filePath = path.join(dir, "out.blueprint.json");
    });

    afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
    });

    function listStagingFiles(): string[] {
        return fs.readdirSync(dir).filter((name) => name.startsWith(".out.blueprint.json.staging-"));
    }

    it("creates the destination with the full contents and leaves no staging file behind", () => {
        const result = writeBlueprintFileAtomically(filePath, "hello");

        expect(result).toEqual({status: "ok"});
        expect(fs.readFileSync(filePath, "utf-8")).toBe("hello");
        expect(listStagingFiles()).toEqual([]);
    });

    it("creates any missing parent directory before writing", () => {
        const nestedPath = path.join(dir, "nested", "sub", "out.blueprint.json");

        const result = writeBlueprintFileAtomically(nestedPath, "hello");

        expect(result).toEqual({status: "ok"});
        expect(fs.readFileSync(nestedPath, "utf-8")).toBe("hello");
    });

    it('reports "conflict" and leaves an existing destination completely untouched instead of overwriting it', () => {
        const sentinelContent = "whatever was already there";
        fs.writeFileSync(filePath, sentinelContent);

        const result = writeBlueprintFileAtomically(filePath, "new content");

        expect(result).toEqual({status: "conflict"});
        expect(fs.readFileSync(filePath, "utf-8")).toBe(sentinelContent);
        expect(listStagingFiles()).toEqual([]);
    });

    // The authoritative conflict check: something else creates the destination in the window between a
    // caller's own earlier fileExists() check and this call -- fs.linkSync (not fs.renameSync, which
    // would silently clobber) is what actually catches this, not an fs.existsSync() this function itself
    // would have no way to run early enough to matter.
    it("detects a destination created after staging already started (a race at final commit time), reports conflict, and cleans up staging", () => {
        const write = (stagingPath: string, contents: string): void => {
            fs.writeFileSync(filePath, "written by a racing writer");
            fs.writeFileSync(stagingPath, contents);
        };

        const result = writeBlueprintFileAtomically(filePath, "this call's own content", write);

        expect(result).toEqual({status: "conflict"});
        expect(fs.readFileSync(filePath, "utf-8")).toBe("written by a racing writer");
        expect(listStagingFiles()).toEqual([]);
    });

    it("creates no destination and leaves no staging file behind when the write itself fails", () => {
        expect(() =>
            writeBlueprintFileAtomically(filePath, "content", () => {
                throw new Error("disk full");
            }),
        ).toThrow("disk full");

        expect(fs.existsSync(filePath)).toBe(false);
        expect(listStagingFiles()).toEqual([]);
    });

    it("leaves no staging file behind when the write fails partway through (a partial staging file already on disk)", () => {
        expect(() =>
            writeBlueprintFileAtomically(filePath, "content", (stagingPath) => {
                fs.writeFileSync(stagingPath, "partial garbage");
                throw new Error("interrupted");
            }),
        ).toThrow("interrupted");

        expect(fs.existsSync(filePath)).toBe(false);
        expect(listStagingFiles()).toEqual([]);
    });

    it("propagates a non-conflict commit failure (distinguished from a conflict by its error code) and still cleans up the staging file", () => {
        const linkFailure = Object.assign(new Error("EACCES: permission denied"), {code: "EACCES"});
        const link = (): void => {
            throw linkFailure;
        };

        expect(() => writeBlueprintFileAtomically(filePath, "content", undefined, link)).toThrow(linkFailure);

        expect(fs.existsSync(filePath)).toBe(false);
        expect(listStagingFiles()).toEqual([]);
    });
});
