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

    it("reports a destination holding unrelated content as having content, with every built file still listed to create and none to update -- a build there will refuse to run rather than merge", () => {
        const projectRoot = path.join(cwd, "sample-slot");
        fs.mkdirSync(projectRoot, {recursive: true});
        fs.writeFileSync(path.join(projectRoot, "notes.txt"), "hello");

        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.destinationHasContent).toBe(true);
        expect(preview.createFiles.sort()).toEqual(BUILT_FILES);
        expect(preview.updateFiles).toEqual([]);
    });

    it("always reports deleteFiles as empty -- GamePackageGenerator never removes anything at the destination", () => {
        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.deleteFiles).toEqual([]);
    });
});
