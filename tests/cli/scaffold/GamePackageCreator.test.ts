import fs from "fs";
import os from "os";
import path from "path";
import {GamePackageCreator} from "../../../cli/scaffold/GamePackageCreator.js";

describe("GamePackageCreator", () => {
    let parentDir: string;

    beforeEach(() => {
        parentDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-create-test-"));
    });

    afterEach(() => {
        fs.rmSync(parentDir, {recursive: true, force: true});
    });

    it("creates a new directory containing a POKIE-compatible game package skeleton", () => {
        const creator = new GamePackageCreator("1.2.1");

        const result = creator.create(parentDir, "crazy-fruits");

        const projectRoot = path.join(parentDir, "crazy-fruits");
        expect(result.projectRoot).toBe(projectRoot);
        expect(fs.existsSync(path.join(projectRoot, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "tsconfig.json"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "src", "index.ts"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "src", "CrazyFruitsGame.ts"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "src", "CrazyFruitsSession.ts"))).toBe(true);
        expect(result.createdFiles.sort()).toEqual(
            ["package.json", "src/CrazyFruitsGame.ts", "src/CrazyFruitsSession.ts", "src/index.ts", "tsconfig.json"].sort(),
        );
        expect(result.updatedFiles).toEqual([]);
        expect(result.skippedFiles).toEqual([]);
    });

    it("writes a package.json with a name, a pokie dependency, and pokie.entry pointing at the compiled entry", () => {
        const creator = new GamePackageCreator("1.2.1");

        const result = creator.create(parentDir, "crazy-fruits");

        const pkg = JSON.parse(fs.readFileSync(path.join(result.projectRoot, "package.json"), "utf-8"));
        expect(pkg.name).toBe("crazy-fruits");
        expect(pkg.dependencies).toEqual({pokie: "^1.2.1"});
        expect(pkg.scripts).toEqual({
            build: "tsc",
            start: "pokie dev .",
            server: "pokie serve .",
            client: "pokie client .",
        });
        expect(pkg.pokie).toEqual({entry: "./dist/index.js"});
    });

    it("derives the game id/name/class name from the given project name", () => {
        const creator = new GamePackageCreator("1.2.1");

        const result = creator.create(parentDir, "crazy-fruits");

        expect(result.manifest).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});
    });

    it("throws a descriptive error when the target directory already exists", () => {
        const creator = new GamePackageCreator("1.2.1");
        creator.create(parentDir, "crazy-fruits");

        expect(() => creator.create(parentDir, "crazy-fruits")).toThrow(/already exists/);
    });

    it("throws when no name is given", () => {
        const creator = new GamePackageCreator("1.2.1");

        expect(() => creator.create(parentDir, "   ")).toThrow(/name is required/);
    });

    it("rejects a name that looks like a path", () => {
        const creator = new GamePackageCreator("1.2.1");

        expect(() => creator.create(parentDir, "../escape")).toThrow(/not a valid project name/);
    });

    describe("overrides", () => {
        it("uses the given id/name/version instead of deriving them from the directory name", () => {
            const creator = new GamePackageCreator("1.2.1");

            const result = creator.create(parentDir, "crazy-fruits", {id: "cf", name: "Crazy Fruits Deluxe", version: "2.0.0"});

            expect(result.manifest).toEqual({id: "cf", name: "Crazy Fruits Deluxe", version: "2.0.0"});
        });

        it("derives the class name from the overridden id, not the directory name", () => {
            const creator = new GamePackageCreator("1.2.1");

            const result = creator.create(parentDir, "crazy-fruits", {id: "lucky-sevens"});

            expect(fs.existsSync(path.join(result.projectRoot, "src", "LuckySevensGame.ts"))).toBe(true);
            expect(fs.existsSync(path.join(result.projectRoot, "src", "LuckySevensSession.ts"))).toBe(true);
            expect(result.createdFiles).toEqual(
                expect.arrayContaining(["src/LuckySevensGame.ts", "src/LuckySevensSession.ts"]),
            );
        });

        it("writes the overridden version into package.json too", () => {
            const creator = new GamePackageCreator("1.2.1");

            const result = creator.create(parentDir, "crazy-fruits", {version: "3.1.4"});

            const pkg = JSON.parse(fs.readFileSync(path.join(result.projectRoot, "package.json"), "utf-8"));
            expect(pkg.version).toBe("3.1.4");
        });

        it("falls back to the derived defaults when an override is empty/whitespace", () => {
            const creator = new GamePackageCreator("1.2.1");

            const result = creator.create(parentDir, "crazy-fruits", {id: "  ", name: "", version: undefined});

            expect(result.manifest).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});
        });

        it("still works with no overrides object at all (existing 2-arg callers)", () => {
            const creator = new GamePackageCreator("1.2.1");

            const result = creator.create(parentDir, "crazy-fruits");

            expect(result.manifest).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});
        });
    });
});
