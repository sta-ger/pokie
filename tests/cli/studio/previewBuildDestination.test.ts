import {GamePackageGenerator, type GameBlueprint} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {previewBuildDestination} from "../../../cli/studio/previewBuildDestination.js";

function buildBlueprint(overrides: Partial<GameBlueprint> = {}): GameBlueprint {
    return {
        manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "B"],
        paytable: {A: {3: 5}, B: {3: 2}},
        ...overrides,
    };
}

const GENERATED_FILES = ["README.md", "package.json", "src/generated/build-info.json", "src/generated/index.js"].sort();

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

    it("reports a destination that doesn't exist yet as having no content, every generated file to create, and no prior build", () => {
        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.destinationHasContent).toBe(false);
        expect(preview.createFiles.sort()).toEqual(GENERATED_FILES);
        expect(preview.updateFiles).toEqual([]);
        expect(preview.deleteFiles).toEqual([]);
        expect(preview.priorBuild).toBeUndefined();
    });

    it("reports an existing but empty destination directory as having no content", () => {
        const projectRoot = path.join(cwd, "sample-slot");
        fs.mkdirSync(projectRoot, {recursive: true});

        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.destinationHasContent).toBe(false);
        expect(preview.createFiles.sort()).toEqual(GENERATED_FILES);
    });

    it("reports a destination holding unrelated content as having content, with no prior build recognized", () => {
        const projectRoot = path.join(cwd, "sample-slot");
        fs.mkdirSync(projectRoot, {recursive: true});
        fs.writeFileSync(path.join(projectRoot, "notes.txt"), "hello");

        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.destinationHasContent).toBe(true);
        expect(preview.createFiles.sort()).toEqual(GENERATED_FILES);
        expect(preview.updateFiles).toEqual([]);
        expect(preview.priorBuild).toBeUndefined();
    });

    it("recognizes a real prior \"pokie build\" run: every generated file to update, none to create, and the prior build's version/hash/generatedAt", () => {
        const generator = new GamePackageGenerator("1.3.0");
        generator.generate(buildBlueprint(), cwd);

        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.destinationHasContent).toBe(true);
        expect(preview.createFiles).toEqual([]);
        expect(preview.updateFiles.sort()).toEqual(GENERATED_FILES);
        expect(preview.deleteFiles).toEqual([]);
        expect(preview.priorBuild).toEqual({version: "0.1.0", blueprintHash: expect.any(String), generatedAt: expect.any(String)});
    });

    it("only lists the generated files actually present at the destination as updateFiles, the rest as createFiles", () => {
        const projectRoot = path.join(cwd, "sample-slot");
        fs.mkdirSync(projectRoot, {recursive: true});
        fs.writeFileSync(path.join(projectRoot, "package.json"), "{}");

        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.createFiles.sort()).toEqual(["README.md", "src/generated/build-info.json", "src/generated/index.js"].sort());
        expect(preview.updateFiles).toEqual(["package.json"]);
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
        fs.mkdirSync(path.join(projectRoot, "src", "generated"), {recursive: true});
        fs.writeFileSync(
            path.join(projectRoot, "src", "generated", "build-info.json"),
            JSON.stringify({generatedBy: "something-else", game: {version: "9.9.9"}, blueprintHash: "x", generatedAt: "now"}),
        );

        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.priorBuild).toBeUndefined();
    });

    it("always reports deleteFiles as empty -- GamePackageGenerator never removes anything at the destination", () => {
        const preview = previewBuildDestination("sample-slot", cwd, undefined);

        expect(preview.deleteFiles).toEqual([]);
    });
});
