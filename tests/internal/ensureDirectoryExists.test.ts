import fs from "fs";
import os from "os";
import path from "path";
import {ensureDirectoryExists} from "../../src/internal/ensureDirectoryExists.js";

describe("ensureDirectoryExists", () => {
    let directory: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-ensure-directory-"));
    });

    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("creates every missing level without touching an existing directory", () => {
        const nested = path.join(directory, "a", "b", "c");
        ensureDirectoryExists(nested);
        expect(fs.statSync(nested).isDirectory()).toBe(true);

        ensureDirectoryExists(nested);
        expect(fs.readdirSync(nested)).toEqual([]);
    });

    it("fails clearly when an ancestor is a regular file", () => {
        const file = path.join(directory, "not-a-directory");
        fs.writeFileSync(file, "occupied");

        expect(() => ensureDirectoryExists(path.join(file, "child"))).toThrow(/already exists and is not a directory/);
        expect(fs.readFileSync(file, "utf8")).toBe("occupied");
    });

    it("fails fast on a filesystem that rejects a missing child", () => {
        if (process.platform !== "linux" || !fs.existsSync("/proc")) return;
        const target = path.join("/proc", `pokie-ensure-${process.pid}`, "child");
        expect(() => ensureDirectoryExists(target)).toThrow();
        expect(fs.existsSync(target)).toBe(false);
    });
});
