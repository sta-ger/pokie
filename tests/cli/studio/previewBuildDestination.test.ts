import fs from "fs";
import os from "os";
import path from "path";
import {BUILT_PACKAGE_FILES} from "pokie";
import {previewBuildDestination} from "../../../cli/studio/previewBuildDestination.js";

const BUILT_FILES = [...BUILT_PACKAGE_FILES].sort();

describe("previewBuildDestination", () => {
    let cwd: string;

    beforeEach(() => {
        cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-preview-destination-test-"));
    });

    afterEach(() => {
        fs.rmSync(cwd, {recursive: true, force: true});
    });

    it("resolves the destination the same way GamePackageGenerator does: manifest.id under cwd when outDir is omitted", () => {
        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.projectRoot).toBe(path.join(cwd, "sample-slot"));
    });

    it.each(["../escape", "nested/slot", "nested\\slot", ".", "..", "/absolute-slot"])("rejects path-shaped default %s without planning publication, but permits explicit output", (id) => {
        const manifestId = id.startsWith("/") ? path.join(cwd, "absolute-slot") : id;
        expect(previewBuildDestination(manifestId, cwd, undefined)).toMatchObject({
            destinationHasContent: true, destinationState: "unsafe",
            destinationError: expect.stringMatching(/not a valid directory name.*plain name.*--out/),
            createFiles: [], updateFiles: [], deleteFiles: [],
        });
        expect(fs.readdirSync(cwd)).toEqual([]);
        expect(previewBuildDestination(manifestId, cwd, "chosen")).toMatchObject({
            projectRoot: path.join(cwd, "chosen"), destinationHasContent: false, destinationState: "missing",
        });
        fs.mkdirSync(path.join(cwd, "chosen"));
        expect(previewBuildDestination(manifestId, cwd, "chosen").destinationState).toBe("empty");
    });

    it("resolves outDir (relative to cwd) instead of manifest.id when given", () => {
        const preview = previewBuildDestination("sample-slot", cwd, "./out");

        expect(preview.projectRoot).toBe(path.join(cwd, "out"));
    });

    it("reports a destination that doesn't exist yet as having no content and every built file to create", () => {
        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.destinationHasContent).toBe(false);
        expect(preview.createFiles.sort()).toEqual(BUILT_FILES);
        expect(preview.updateFiles).toEqual([]);
        expect(preview.deleteFiles).toEqual([]);
    });

    it("reports an existing but empty destination directory as having no content", () => {
        const projectRoot = path.join(cwd, "sample-slot");
        fs.mkdirSync(projectRoot, {recursive: true});

        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.destinationHasContent).toBe(false);
        expect(preview.createFiles.sort()).toEqual(BUILT_FILES);
    });

    it("reports a destination holding unrelated content as having content, with no publication planned -- a build there will refuse to run rather than merge", () => {
        const projectRoot = path.join(cwd, "sample-slot");
        fs.mkdirSync(projectRoot, {recursive: true});
        fs.writeFileSync(path.join(projectRoot, "notes.txt"), "hello");

        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.destinationHasContent).toBe(true);
        expect(preview.createFiles).toEqual([]);
        expect(preview.updateFiles).toEqual([]);
    });

    it.each(["", "user content"])("rejects an existing file, including a zero-byte file (%s)", (content) => {
        const output = path.join(cwd, "out");
        fs.writeFileSync(output, content);
        expect(previewBuildDestination("sample", cwd, output)).toMatchObject({destinationHasContent: true, destinationState: "file", destinationError: expect.stringContaining("not a directory"), createFiles: []});
        expect(fs.readFileSync(output, "utf8")).toBe(content);
    });

    it("distinguishes a missing path from an existing empty directory", () => {
        expect(previewBuildDestination("sample", cwd, undefined).destinationState).toBe("missing");
        fs.mkdirSync(path.join(cwd, "sample"));
        expect(previewBuildDestination("sample", cwd, undefined).destinationState).toBe("empty");
    });

    it("rejects source/self/descendant, symlink aliases, and protected-root destinations", () => {
        const source = path.join(cwd, "source");
        const alias = path.join(cwd, "alias");
        fs.mkdirSync(source);
        fs.symlinkSync(source, alias, "dir");
        for (const destination of [source, path.join(source, "out"), path.join(alias, "out")]) {
            expect(previewBuildDestination("sample", cwd, destination, source)).toMatchObject({destinationHasContent: true, destinationState: "unsafe", createFiles: []});
            expect(previewBuildDestination("sample", cwd, destination, undefined, source).destinationState).toBe("unsafe");
        }
        expect(fs.readdirSync(source)).toEqual([]);
    });

    it("reports unreadable destinations without authorizing a build", () => {
        const output = path.join(cwd, "empty");
        fs.mkdirSync(output);
        const read = jest.spyOn(fs, "readdirSync").mockImplementation(() => {
            throw new Error("EACCES: permission denied"); 
        });
        try {
            expect(previewBuildDestination("sample", cwd, output)).toMatchObject({destinationHasContent: true, destinationState: "unreadable", destinationError: "EACCES: permission denied", createFiles: []});
        } finally {
            read.mockRestore();
        }
    });

    it("always reports deleteFiles as empty -- GamePackageGenerator never removes anything at the destination", () => {
        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.deleteFiles).toEqual([]);
    });
});
