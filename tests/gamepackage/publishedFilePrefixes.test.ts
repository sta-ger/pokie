import fs from "fs";
import os from "os";
import path from "path";
import {publishedFilePrefixes} from "@fromstan/pokie";

function packageWith(files: unknown): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-published-files-"));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({name: "fixture", files}));
    return root;
}

describe("publishedFilePrefixes", () => {
    const roots: string[] = [];
    afterEach(() => {
        for (const root of roots.splice(0)) fs.rmSync(root, {recursive: true, force: true});
    });

    it("returns normalized prefixes and always keeps package.json", () => {
        const root = packageWith(["./dist/", "src", "README.md"]);
        roots.push(root);

        expect(publishedFilePrefixes(root)).toEqual(["package.json", "dist", "src", "README.md"]);
    });

    it("falls back to a full copy for globs, negations and malformed entries", () => {
        for (const files of [["dist/*.js"], ["dist", "!dist/test"], [42], []]) {
            const root = packageWith(files);
            roots.push(root);
            expect(publishedFilePrefixes(root)).toBeUndefined();
        }
    });

    it("falls back to a full copy when package.json is missing", () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-published-files-"));
        roots.push(root);
        expect(publishedFilePrefixes(root)).toBeUndefined();
    });
});
