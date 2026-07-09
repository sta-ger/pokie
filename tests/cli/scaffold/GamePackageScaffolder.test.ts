import fs from "fs";
import os from "os";
import path from "path";
import {GamePackageScaffolder} from "../../../cli/scaffold/GamePackageScaffolder";

function createEmptyNpmProject(name = "crazy-fruits", version = "1.0.0"): string {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-init-test-"));
    fs.writeFileSync(
        path.join(projectRoot, "package.json"),
        JSON.stringify({name, version, scripts: {test: 'echo "Error: no test specified" && exit 1'}}, null, 4),
    );
    return projectRoot;
}

describe("GamePackageScaffolder", () => {
    let projectRoot: string;

    afterEach(() => {
        if (projectRoot) {
            fs.rmSync(projectRoot, {recursive: true, force: true});
        }
    });

    it("throws a descriptive error when the target directory has no package.json", () => {
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-init-test-"));
        const scaffolder = new GamePackageScaffolder("1.2.1");

        expect(() => scaffolder.scaffold(projectRoot)).toThrow(/package\.json/);
    });

    it("turns an empty npm project into a POKIE-compatible game package skeleton", () => {
        projectRoot = createEmptyNpmProject();
        const scaffolder = new GamePackageScaffolder("1.2.1");

        const result = scaffolder.scaffold(projectRoot);

        expect(fs.existsSync(path.join(projectRoot, "tsconfig.json"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "src", "index.ts"))).toBe(true);
        expect(result.createdFiles.sort()).toEqual(["src/index.ts", "tsconfig.json"]);
        expect(result.updatedFiles).toEqual(["package.json"]);
        expect(result.skippedFiles).toEqual([]);
    });

    it("writes a package.json containing a pokie.entry field pointing at the compiled entry", () => {
        projectRoot = createEmptyNpmProject();
        new GamePackageScaffolder("1.2.1").scaffold(projectRoot);

        const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"));
        expect(pkg.pokie).toEqual({entry: "./dist/index.js"});
    });

    it("derives the game id/name from the project's package name and version", () => {
        projectRoot = createEmptyNpmProject("crazy-fruits", "2.3.4");
        const result = new GamePackageScaffolder("1.2.1").scaffold(projectRoot);

        expect(result.manifest).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "2.3.4"});
    });

    it("falls back to version 0.0.0 when the project's package.json has no version", () => {
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-init-test-"));
        fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({name: "crazy-fruits"}, null, 4));

        const result = new GamePackageScaffolder("1.2.1").scaffold(projectRoot);

        expect(result.manifest.version).toBe("0.0.0");
    });

    it("does not overwrite an existing tsconfig.json or src/index.ts on a second run", () => {
        projectRoot = createEmptyNpmProject();
        const scaffolder = new GamePackageScaffolder("1.2.1");
        scaffolder.scaffold(projectRoot);

        fs.writeFileSync(path.join(projectRoot, "src", "index.ts"), "// hand-edited by the developer\n");
        fs.writeFileSync(path.join(projectRoot, "tsconfig.json"), "{}\n");

        const result = scaffolder.scaffold(projectRoot);

        expect(result.skippedFiles.sort()).toEqual(["src/index.ts", "tsconfig.json"]);
        expect(fs.readFileSync(path.join(projectRoot, "src", "index.ts"), "utf-8")).toBe("// hand-edited by the developer\n");
        expect(fs.readFileSync(path.join(projectRoot, "tsconfig.json"), "utf-8")).toBe("{}\n");
    });
});
