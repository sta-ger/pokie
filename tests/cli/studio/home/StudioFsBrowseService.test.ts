import fs from "fs";
import os from "os";
import path from "path";
import {StudioFsBrowseService} from "../../../../cli/studio/home/StudioFsBrowseService.js";

describe("StudioFsBrowseService", () => {
    let root: string;
    let service: StudioFsBrowseService;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-fs-browse-test-"));
        fs.mkdirSync(path.join(root, "games"));
        fs.mkdirSync(path.join(root, "games", "sample-slot"));
        fs.writeFileSync(path.join(root, "readme.txt"), "hi");
        fs.writeFileSync(path.join(root, ".hidden"), "secret");
        service = new StudioFsBrowseService(root);
    });

    afterEach(() => {
        fs.rmSync(root, {recursive: true, force: true});
    });

    it("defaults to the root when no path is given, rendering it as its concrete absolute path", () => {
        const result = service.browse(undefined);

        expect(result).toMatchObject({status: "ok", resolvedPath: root, displayPath: root});
    });

    it("lists directories before files, sorted alphabetically within each group, and hides dotfiles", () => {
        fs.mkdirSync(path.join(root, "zzz-dir"));
        fs.writeFileSync(path.join(root, "aaa.txt"), "");

        const result = service.browse(undefined);

        if (result.status !== "ok") {
            throw new Error("expected an ok result");
        }
        expect(result.entries).toEqual([
            {name: "games", isDirectory: true},
            {name: "zzz-dir", isDirectory: true},
            {name: "aaa.txt", isDirectory: false},
            {name: "readme.txt", isDirectory: false},
        ]);
    });

    it("renders a resolved path inside the root as a relative './...' displayPath", () => {
        const result = service.browse("games");

        if (result.status !== "ok") {
            throw new Error("expected an ok result");
        }
        expect(result.resolvedPath).toBe(path.join(root, "games"));
        expect(result.displayPath).toBe(`.${path.sep}games`);
        expect(result.parentPath).toBe(root);
        expect(result.entries).toEqual([{name: "sample-slot", isDirectory: true}]);
    });

    it("renders a resolved path outside the root as an absolute path", () => {
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-fs-browse-outside-"));
        try {
            const result = service.browse(outside);
            expect(result).toMatchObject({status: "ok", resolvedPath: outside, displayPath: outside});
        } finally {
            fs.rmSync(outside, {recursive: true, force: true});
        }
    });

    it("reports a nonexistent path as a domain-level error, not a thrown exception", () => {
        const result = service.browse("does-not-exist");

        expect(result.status).toBe("error");
        if (result.status !== "error") {
            throw new Error("expected an error result");
        }
        expect(result.error).toContain("does not exist");
        expect(result.resolvedPath).toBe(path.join(root, "does-not-exist"));
    });

    it("reports a path that resolves to a file (not a directory) as an error", () => {
        const result = service.browse("readme.txt");

        expect(result.status).toBe("error");
        if (result.status !== "error") {
            throw new Error("expected an error result");
        }
        expect(result.error).toContain("is not a directory");
    });

    it("reports a permission-denied readdir failure as a friendly error, not a thrown exception", () => {
        const eacces = Object.assign(new Error("EACCES"), {code: "EACCES"});
        const spy = jest.spyOn(fs, "readdirSync").mockImplementation(() => {
            throw eacces;
        });

        try {
            const result = service.browse(undefined);
            expect(result.status).toBe("error");
            if (result.status !== "error") {
                throw new Error("expected an error result");
            }
            expect(result.error).toContain("Permission denied");
        } finally {
            spy.mockRestore();
        }
    });
});
