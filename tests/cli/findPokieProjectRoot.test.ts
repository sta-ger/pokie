import fs from "fs";
import os from "os";
import path from "path";
import {findPokieProjectRoot} from "../../cli/findPokieProjectRoot.js";

// Stands in for readPokiePackageConfig: throws for every directory that isn't one of `roots`, exactly
// the way the real one throws for a directory with no package.json / no "pokie.entry".
function readConfigFor(roots: string[]): (packageRoot: string) => unknown {
    const normalized = roots.map((root) => path.resolve(root));
    return (packageRoot: string) => {
        if (!normalized.includes(path.resolve(packageRoot))) {
            throw new Error(`not a pokie package: ${packageRoot}`);
        }
        return {entry: "./src/generated/index.js"};
    };
}

describe("findPokieProjectRoot", () => {
    const project = path.resolve("/games/my-slot");

    it("returns the directory itself when it is the package root", () => {
        expect(findPokieProjectRoot(project, readConfigFor([project]))).toBe(project);
    });

    it("walks up from a nested subdirectory to the project root", () => {
        const nested = path.join(project, "src", "generated");

        expect(findPokieProjectRoot(nested, readConfigFor([project]))).toBe(project);
    });

    it("returns undefined when no ancestor is a pokie package", () => {
        expect(findPokieProjectRoot(path.resolve("/somewhere/else"), readConfigFor([]))).toBeUndefined();
    });

    it("stops at the filesystem root instead of looping forever", () => {
        expect(findPokieProjectRoot(path.parse(process.cwd()).root, readConfigFor([]))).toBeUndefined();
    });

    it("returns the nearest package root, not the outermost one", () => {
        const inner = path.join(project, "packages", "inner");
        const nested = path.join(inner, "src");

        expect(findPokieProjectRoot(nested, readConfigFor([project, inner]))).toBe(inner);
    });

    it("resolves a relative start directory before walking", () => {
        expect(findPokieProjectRoot(".", readConfigFor([process.cwd()]))).toBe(process.cwd());
    });

    describe("against the real filesystem (default readPokiePackageConfig)", () => {
        let workDir: string;

        beforeEach(() => {
            workDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pokie-find-root-test-")));
        });

        afterEach(() => {
            fs.rmSync(workDir, {recursive: true, force: true});
        });

        it("finds a real package root from a nested directory via its \"pokie.entry\"", () => {
            const projectRoot = path.join(workDir, "game");
            fs.mkdirSync(path.join(projectRoot, "src", "generated"), {recursive: true});
            fs.writeFileSync(
                path.join(projectRoot, "package.json"),
                JSON.stringify({name: "game", pokie: {entry: "./src/generated/index.js"}}),
            );

            expect(findPokieProjectRoot(path.join(projectRoot, "src", "generated"))).toBe(projectRoot);
        });

        it("ignores a package.json that has no \"pokie.entry\"", () => {
            const plainNpmProject = path.join(workDir, "plain");
            fs.mkdirSync(plainNpmProject, {recursive: true});
            fs.writeFileSync(path.join(plainNpmProject, "package.json"), JSON.stringify({name: "plain", version: "1.0.0"}));

            // Walks past it — and finds nothing, since the temp dir has no pokie package above it either.
            expect(findPokieProjectRoot(plainNpmProject)).toBeUndefined();
        });

        it("ignores a package.json that doesn't parse", () => {
            const broken = path.join(workDir, "broken");
            fs.mkdirSync(broken, {recursive: true});
            fs.writeFileSync(path.join(broken, "package.json"), "{ not json");

            expect(findPokieProjectRoot(broken)).toBeUndefined();
        });

        // The "missing/invalid project" and "nested project directory" cases combined: a broken
        // package.json between the start directory and a real project root must not stop the walk —
        // it's just another "not a package" ancestor to keep climbing past, same as one with no
        // "pokie.entry" at all.
        it("walks past an invalid package.json partway up to find the valid project root above it", () => {
            const projectRoot = path.join(workDir, "game");
            const brokenIntermediate = path.join(projectRoot, "packages", "broken-tool");
            const nested = path.join(brokenIntermediate, "src");
            fs.mkdirSync(nested, {recursive: true});
            fs.writeFileSync(
                path.join(projectRoot, "package.json"),
                JSON.stringify({name: "game", pokie: {entry: "./src/generated/index.js"}}),
            );
            fs.writeFileSync(path.join(brokenIntermediate, "package.json"), "{ not json");

            expect(findPokieProjectRoot(nested)).toBe(projectRoot);
        });
    });
});
