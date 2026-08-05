import fs from "fs";
import os from "os";
import path from "path";
import {GamePackageMerger} from "../../../cli/scaffold/GamePackageMerger.js";

describe("GamePackageMerger", () => {
    let projectRoot: string;

    beforeEach(() => {
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-merge-test-"));
    });

    afterEach(() => {
        fs.rmSync(projectRoot, {recursive: true, force: true});
    });

    it("creates a full package skeleton in an empty directory, deriving name/id from the directory basename", () => {
        const merger = new GamePackageMerger("1.2.1");

        const result = merger.merge(projectRoot);

        expect(result.projectRoot).toBe(projectRoot);
        expect(result.createdFiles.sort()).toEqual(["README.md", "package.json", "src/index.ts", "tsconfig.json"].sort());
        expect(result.updatedFiles).toEqual([]);
        expect(result.skippedFiles).toEqual([]);
        for (const relativeFile of ["package.json", "tsconfig.json", "README.md", path.join("src", "index.ts")]) {
            expect(fs.existsSync(path.join(projectRoot, relativeFile))).toBe(true);
        }

        const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"));
        expect(pkg.name).toBe(path.basename(projectRoot).toLowerCase());
        expect(pkg.dependencies).toEqual({pokie: "^1.2.1"});
        expect(pkg.pokie).toEqual({entry: "./dist/index.js"});
    });

    it("slugifies a directory basename containing spaces/uppercase into a valid npm package name", () => {
        const spacedDir = path.join(projectRoot, "My Game Project");
        fs.mkdirSync(spacedDir);
        const merger = new GamePackageMerger("1.2.1");

        const result = merger.merge(spacedDir);

        const pkg = JSON.parse(fs.readFileSync(path.join(spacedDir, "package.json"), "utf-8"));
        expect(pkg.name).toBe("my-game-project");
        expect(pkg.name).not.toMatch(/[A-Z ]/);
        expect(result.manifest.id.length).toBeGreaterThan(0);
    });

    it("patches an existing package.json in place, preserving unrelated fields", () => {
        fs.writeFileSync(
            path.join(projectRoot, "package.json"),
            JSON.stringify({name: "already-here", version: "9.9.9", description: "keep me", scripts: {lint: "eslint ."}}),
        );
        const merger = new GamePackageMerger("1.2.1");

        const result = merger.merge(projectRoot);

        expect(result.updatedFiles).toEqual(["package.json"]);
        expect(result.createdFiles.sort()).toEqual(["README.md", "src/index.ts", "tsconfig.json"].sort());

        const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"));
        expect(pkg.name).toBe("already-here");
        expect(pkg.version).toBe("9.9.9");
        expect(pkg.description).toBe("keep me");
        expect(pkg.scripts.lint).toBe("eslint .");
        expect(pkg.scripts.build).toBe("tsc");
        expect(pkg.dependencies).toEqual({pokie: "^1.2.1"});
    });

    it("never overwrites an existing tsconfig.json/README.md/src/index.ts -- reports them as skipped", () => {
        fs.writeFileSync(path.join(projectRoot, "tsconfig.json"), "{\"custom\": true}");
        fs.writeFileSync(path.join(projectRoot, "README.md"), "# hand-written\n");
        fs.mkdirSync(path.join(projectRoot, "src"), {recursive: true});
        fs.writeFileSync(path.join(projectRoot, "src", "index.ts"), "export default 42;\n");
        const merger = new GamePackageMerger("1.2.1");

        const result = merger.merge(projectRoot);

        expect(result.skippedFiles.sort()).toEqual(["README.md", "src/index.ts", "tsconfig.json"].sort());
        expect(result.createdFiles).toEqual(["package.json"]);
        expect(fs.readFileSync(path.join(projectRoot, "tsconfig.json"), "utf-8")).toBe("{\"custom\": true}");
        expect(fs.readFileSync(path.join(projectRoot, "README.md"), "utf-8")).toBe("# hand-written\n");
        expect(fs.readFileSync(path.join(projectRoot, "src", "index.ts"), "utf-8")).toBe("export default 42;\n");
    });

    it("is idempotent: merging twice in a row produces the same manifest and no extra created files", () => {
        const merger = new GamePackageMerger("1.2.1");

        const first = merger.merge(projectRoot);
        const second = merger.merge(projectRoot);

        expect(second.manifest).toEqual(first.manifest);
        expect(second.createdFiles).toEqual([]);
        expect(second.skippedFiles.sort()).toEqual(["README.md", "src/index.ts", "tsconfig.json"].sort());
        expect(second.updatedFiles).toEqual(["package.json"]);
    });

    describe("overrides", () => {
        it("uses --package-name for package.json's own name, independently of the directory", () => {
            const merger = new GamePackageMerger("1.2.1");

            const result = merger.merge(projectRoot, {packageName: "totally-different-name"});

            const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"));
            expect(pkg.name).toBe("totally-different-name");
            expect(result.manifest.id).toBe("totally-different-name");
        });

        it("uses --game-id/--game-name/--version for the manifest, independently of package.json's own name", () => {
            const merger = new GamePackageMerger("1.2.1");

            const result = merger.merge(projectRoot, {id: "lucky-sevens", name: "Lucky Sevens Deluxe", version: "3.1.4"});

            expect(result.manifest).toEqual({id: "lucky-sevens", name: "Lucky Sevens Deluxe", version: "3.1.4"});
            const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"));
            expect(pkg.version).toBe("3.1.4");
        });

        it("falls back to the derived defaults when an override is empty/whitespace", () => {
            const merger = new GamePackageMerger("1.2.1");

            const result = merger.merge(projectRoot, {packageName: "  ", id: "", name: undefined, version: "   "});

            expect(result.manifest.id).toBe(path.basename(projectRoot).toLowerCase());
        });
    });
});
