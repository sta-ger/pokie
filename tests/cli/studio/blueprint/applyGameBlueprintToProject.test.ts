import {computeGameBlueprintHash, GameBlueprint, GameBlueprintValidator, GamePackageGenerator} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {applyGameBlueprintToProject} from "../../../../cli/studio/blueprint/applyGameBlueprintToProject.js";
import {serializeGameBlueprint} from "../../../../cli/studio/blueprint/serializeGameBlueprint.js";

function buildBlueprint(overrides: Partial<GameBlueprint> = {}): GameBlueprint {
    return {
        manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "B"],
        paytable: {A: {3: 5}, B: {3: 2}},
        ...overrides,
    };
}

describe("applyGameBlueprintToProject", () => {
    let cwd: string;
    let projectRoot: string;
    let sourcePath: string;
    let blueprintValidator: GameBlueprintValidator;
    let gamePackageGenerator: GamePackageGenerator;

    beforeEach(() => {
        cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-apply-test-"));
        projectRoot = path.join(cwd, "crazy-fruits");
        sourcePath = path.join(cwd, "blueprint.json");
        blueprintValidator = new GameBlueprintValidator();
        gamePackageGenerator = new GamePackageGenerator("1.3.0");
    });

    afterEach(() => {
        fs.rmSync(cwd, {recursive: true, force: true});
    });

    // Mirrors the real Studio workflow: a blueprint file, and a package already built from it --
    // exactly the state a project is in before its first Apply.
    function seedProject(blueprint: GameBlueprint): void {
        fs.writeFileSync(sourcePath, serializeGameBlueprint(blueprint));
        gamePackageGenerator.generate(blueprint, cwd, "crazy-fruits", sourcePath);
    }

    function tempArtifactsLeftBehind(): string[] {
        return fs.readdirSync(cwd).filter((name) => name.includes(".tmp-") || name.includes(".stale-"));
    }

    it("commits both the generated package and the source blueprint when the hash still matches", async () => {
        const original = buildBlueprint();
        seedProject(original);
        const edited = buildBlueprint({symbols: ["A", "B", "C"], paytable: {A: {3: 5}, B: {3: 2}, C: {3: 1}}});

        const result = await applyGameBlueprintToProject({
            projectRoot,
            sourcePath,
            expectedHash: computeGameBlueprintHash(original),
            blueprint: edited,
            blueprintValidator,
            gamePackageGenerator,
        });

        expect(result.status).toBe("ok");
        if (result.status !== "ok") {
            throw new Error("expected ok");
        }
        expect(result.blueprintHash).toBe(computeGameBlueprintHash(edited));
        expect(JSON.parse(fs.readFileSync(sourcePath, "utf-8"))).toEqual(edited);
        expect(fs.readFileSync(path.join(projectRoot, "src", "generated", "index.js"), "utf-8")).toContain('"C"');
        expect(tempArtifactsLeftBehind()).toEqual([]);
    });

    // A real project directory holds more than just the four files "pokie build" itself writes --
    // typically a real `node_modules` from `npm install`, often other files a user added by hand. This
    // must never be swapped/discarded wholesale; only the exact known generated files are ever touched.
    it("leaves unrelated project content (e.g. a real node_modules, a user's own files) untouched", async () => {
        const original = buildBlueprint();
        seedProject(original);
        fs.mkdirSync(path.join(projectRoot, "node_modules", "pokie"), {recursive: true});
        fs.writeFileSync(path.join(projectRoot, "node_modules", "pokie", "marker.txt"), "installed dependency");
        fs.writeFileSync(path.join(projectRoot, "NOTES.md"), "my own notes");
        const edited = buildBlueprint({symbols: ["A", "B", "C"], paytable: {A: {3: 5}, B: {3: 2}, C: {3: 1}}});

        const result = await applyGameBlueprintToProject({
            projectRoot,
            sourcePath,
            expectedHash: computeGameBlueprintHash(original),
            blueprint: edited,
            blueprintValidator,
            gamePackageGenerator,
        });

        expect(result.status).toBe("ok");
        expect(fs.readFileSync(path.join(projectRoot, "node_modules", "pokie", "marker.txt"), "utf-8")).toBe("installed dependency");
        expect(fs.readFileSync(path.join(projectRoot, "NOTES.md"), "utf-8")).toBe("my own notes");
        expect(fs.readFileSync(path.join(projectRoot, "src", "generated", "index.js"), "utf-8")).toContain('"C"');
    });

    it("returns a conflict and makes no writes when the source blueprint on disk no longer matches expectedHash", async () => {
        const original = buildBlueprint();
        seedProject(original);
        const externallyEdited = buildBlueprint({symbols: ["A", "B", "EXTERNAL"]});
        // Simulate an external edit that already happened before this apply call was even made.
        fs.writeFileSync(sourcePath, serializeGameBlueprint(externallyEdited));
        const indexJsBefore = fs.readFileSync(path.join(projectRoot, "src", "generated", "index.js"), "utf-8");

        const result = await applyGameBlueprintToProject({
            projectRoot,
            sourcePath,
            expectedHash: computeGameBlueprintHash(original), // stale -- no longer what's on disk
            blueprint: buildBlueprint({symbols: ["A", "B", "MINE"]}),
            blueprintValidator,
            gamePackageGenerator,
        });

        expect(result.status).toBe("conflict");
        if (result.status !== "conflict") {
            throw new Error("expected conflict");
        }
        expect(result.currentHash).toBe(computeGameBlueprintHash(externallyEdited));
        expect(fs.readFileSync(sourcePath, "utf-8")).toBe(serializeGameBlueprint(externallyEdited));
        expect(fs.readFileSync(path.join(projectRoot, "src", "generated", "index.js"), "utf-8")).toBe(indexJsBefore);
        expect(tempArtifactsLeftBehind()).toEqual([]);
    });

    // The requirement this covers: an external edit landing *while the (slow) build step is running*
    // -- after the cheap upfront check already passed -- must still be caught before anything commits,
    // not just an edit that already existed before the request started.
    it("returns a conflict and makes no writes when an external edit lands inside the build's own race window", async () => {
        const original = buildBlueprint();
        seedProject(original);
        const externallyEdited = buildBlueprint({symbols: ["A", "B", "EXTERNAL"]});
        const indexJsBefore = fs.readFileSync(path.join(projectRoot, "src", "generated", "index.js"), "utf-8");
        let readCount = 0;

        const result = await applyGameBlueprintToProject({
            projectRoot,
            sourcePath,
            expectedHash: computeGameBlueprintHash(original),
            blueprint: buildBlueprint({symbols: ["A", "B", "MINE"]}),
            blueprintValidator,
            gamePackageGenerator,
            // First call is the cheap upfront check (still the real, unedited content); second is the
            // pre-commit recheck, after "the build" -- standing in for an edit that landed in between.
            readFile: (filePath) => {
                readCount += 1;
                return readCount === 1 ? fs.readFileSync(filePath, "utf-8") : serializeGameBlueprint(externallyEdited);
            },
        });

        expect(result.status).toBe("conflict");
        expect(readCount).toBe(2);
        expect(fs.readFileSync(path.join(projectRoot, "src", "generated", "index.js"), "utf-8")).toBe(indexJsBefore);
        expect(fs.readFileSync(sourcePath, "utf-8")).toBe(serializeGameBlueprint(original));
        expect(tempArtifactsLeftBehind()).toEqual([]);
    });

    it("makes no writes when the new blueprint is invalid", async () => {
        const original = buildBlueprint();
        seedProject(original);

        const result = await applyGameBlueprintToProject({
            projectRoot,
            sourcePath,
            expectedHash: computeGameBlueprintHash(original),
            blueprint: {...buildBlueprint(), paytable: {}},
            blueprintValidator,
            gamePackageGenerator,
        });

        expect(result.status).toBe("invalid");
        expect(fs.readFileSync(sourcePath, "utf-8")).toBe(serializeGameBlueprint(original));
        expect(tempArtifactsLeftBehind()).toEqual([]);
    });

    // The requirement this covers: a build that succeeds but whose source-blueprint commit
    // subsequently fails must not leave the generated package ahead of the (unwritten) source --
    // both must end up back at exactly what they were before this apply attempt.
    it("rolls the generated package back to its previous state when committing the source blueprint fails after a successful build", async () => {
        const original = buildBlueprint();
        seedProject(original);
        const indexJsBefore = fs.readFileSync(path.join(projectRoot, "src", "generated", "index.js"), "utf-8");
        const edited = buildBlueprint({symbols: ["A", "B", "C"], paytable: {A: {3: 5}, B: {3: 2}, C: {3: 1}}});

        const result = await applyGameBlueprintToProject({
            projectRoot,
            sourcePath,
            expectedHash: computeGameBlueprintHash(original),
            blueprint: edited,
            blueprintValidator,
            gamePackageGenerator,
            // Fails only the *final* commit of the staged source file into place -- not the "move the
            // current content aside" step that happens first, and not that same step's own restore-on-
            // failure rename (both of those target a ".stale-" path, never sourcePath itself).
            rename: (from, to) => {
                if (to === sourcePath && !from.includes(".stale-")) {
                    throw new Error("simulated disk failure committing the source blueprint");
                }
                fs.renameSync(from, to);
            },
        });

        expect(result.status).toBe("error");
        if (result.status !== "error") {
            throw new Error("expected error");
        }
        expect(result.error).toContain("rolled back");
        expect(fs.readFileSync(path.join(projectRoot, "src", "generated", "index.js"), "utf-8")).toBe(indexJsBefore);
        expect(fs.readFileSync(sourcePath, "utf-8")).toBe(serializeGameBlueprint(original));
        expect(tempArtifactsLeftBehind()).toEqual([]);
    });
});
