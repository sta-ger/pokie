import fs from "fs";
import os from "os";
import path from "path";
import {previewBuildDestination} from "../../../cli/studio/previewBuildDestination.js";

const BUILT_FILES = ["README.md", "package.json", "dist/index.js"].sort();

function writeLegacyBuildInfo(projectRoot: string, overrides: Record<string, unknown> = {}): void {
    fs.mkdirSync(path.join(projectRoot, "src", "generated"), {recursive: true});
    fs.writeFileSync(
        path.join(projectRoot, "src", "generated", "build-info.json"),
        JSON.stringify({
            generatedBy: "pokie build",
            game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
            blueprintHash: "abc123",
            generatedAt: "2020-01-01T00:00:00.000Z",
            ...overrides,
        }),
    );
}

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

    it("reports a destination that doesn't exist yet as having no content, every built file to create, and no prior build", () => {
        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.destinationHasContent).toBe(false);
        expect(preview.createFiles.sort()).toEqual(BUILT_FILES);
        expect(preview.updateFiles).toEqual([]);
        expect(preview.deleteFiles).toEqual([]);
        expect(preview.priorBuild).toBeUndefined();
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
        expect(preview.priorBuild).toBeUndefined();
    });

    it("recognizes a package an older, pre-migration \"pokie build\" produced via its own legacy src/generated/build-info.json", () => {
        const projectRoot = path.join(cwd, "sample-slot");
        writeLegacyBuildInfo(projectRoot);

        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.destinationHasContent).toBe(true);
        expect(preview.createFiles.sort()).toEqual(BUILT_FILES);
        expect(preview.updateFiles).toEqual([]);
        expect(preview.deleteFiles).toEqual([]);
        expect(preview.priorBuild).toEqual({version: "0.1.0", blueprintHash: "abc123", generatedAt: "2020-01-01T00:00:00.000Z"});
    });

    it("never recognizes a prior build from a corrupt build-info.json", () => {
        const projectRoot = path.join(cwd, "sample-slot");
        fs.mkdirSync(path.join(projectRoot, "src", "generated"), {recursive: true});
        fs.writeFileSync(path.join(projectRoot, "src", "generated", "build-info.json"), "not json");

        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.priorBuild).toBeUndefined();
    });

    it("never recognizes a prior build from a build-info.json not written by \"pokie build\"", () => {
        const projectRoot = path.join(cwd, "sample-slot");
        writeLegacyBuildInfo(projectRoot, {generatedBy: "something-else"});

        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.priorBuild).toBeUndefined();
    });

    it("always reports deleteFiles as empty -- GamePackageGenerator never removes anything at the destination", () => {
        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.deleteFiles).toEqual([]);
    });
});
