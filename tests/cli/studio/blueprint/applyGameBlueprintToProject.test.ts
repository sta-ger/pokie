import {computeGameBlueprintHash, GameBlueprint, GameBlueprintValidator, GamePackageGenerator} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {applyGameBlueprintToProject} from "../../../../cli/studio/blueprint/applyGameBlueprintToProject.js";
import {serializeGameBlueprint} from "../../../../cli/studio/blueprint/serializeGameBlueprint.js";
import type {StudioBlueprintApplyView} from "../../../../cli/studio/blueprint/StudioBlueprintApplyView.js";

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
    // subsequently fails must leave both source and the generated package at exactly what they were
    // before this apply attempt. Source is committed first (see applyGameBlueprintToProject's own doc
    // comment), so this failure happens before any GENERATED_PACKAGE_FILES entry is even attempted --
    // the "rollback" here is really commitStagedPath's own single-resource restore-on-failure, exercised
    // through the outer function's generic commit-error handling.
    it("leaves source and the generated package untouched when committing the source blueprint itself fails", async () => {
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

    // The requirement this covers: source is committed *first*, so a later failure committing a
    // GENERATED_PACKAGE_FILES entry must roll the already-committed source back too -- proving the
    // "commit source first" reordering didn't quietly turn multi-resource rollback into a source-only
    // concern. If this ever regressed to leaving source updated while the package it belongs to failed
    // to update, a caller would see an internally inconsistent project with no way to tell from the
    // response alone.
    it("rolls the already-committed source blueprint back when a later generated-package-file commit fails", async () => {
        const original = buildBlueprint();
        seedProject(original);
        const indexJsBefore = fs.readFileSync(path.join(projectRoot, "src", "generated", "index.js"), "utf-8");
        const edited = buildBlueprint({symbols: ["A", "B", "C"], paytable: {A: {3: 5}, B: {3: 2}, C: {3: 1}}});
        const indexJsPath = path.join(projectRoot, "src", "generated", "index.js");

        const result = await applyGameBlueprintToProject({
            projectRoot,
            sourcePath,
            expectedHash: computeGameBlueprintHash(original),
            blueprint: edited,
            blueprintValidator,
            gamePackageGenerator,
            // Source commits cleanly; the first GENERATED_PACKAGE_FILES entry to reach index.js's own
            // commit fails -- by then source is already committed and must be rolled back too.
            rename: (from, to) => {
                if (to === indexJsPath && !from.includes(".stale-")) {
                    throw new Error("simulated disk failure committing a generated package file");
                }
                fs.renameSync(from, to);
            },
        });

        expect(result.status).toBe("error");
        if (result.status !== "error") {
            throw new Error("expected error");
        }
        expect(result.error).toContain("rolled back");
        expect(fs.readFileSync(sourcePath, "utf-8")).toBe(serializeGameBlueprint(original));
        expect(fs.readFileSync(indexJsPath, "utf-8")).toBe(indexJsBefore);
        expect(tempArtifactsLeftBehind()).toEqual([]);
    });

    // The requirement this covers: source is committed as the very next statement after the pre-commit
    // hash re-check (see applyGameBlueprintToProject's own doc comment, step 5) -- nothing else runs in
    // between, so an external edit landing exactly as that check reads the file is either still caught
    // by it (conflict, nothing written) or lands too late to matter (source already durably committed).
    // Unlike the "build's own race window" test above -- which fakes the read's *return value* -- this
    // one has the fake actually mutate the real file on disk, standing in for a genuine external process
    // winning the race, and asserts the external edit's own content survives untouched (not reverted to
    // the original, not overwritten by this apply), with zero renames attempted anywhere.
    it("preserves a real external edit that lands exactly as the source commit's own hash check reads the file, with zero renames attempted", async () => {
        const original = buildBlueprint();
        seedProject(original);
        const indexJsBefore = fs.readFileSync(path.join(projectRoot, "src", "generated", "index.js"), "utf-8");
        const externallyEdited = buildBlueprint({symbols: ["A", "B", "EXTERNAL"]});
        let readCount = 0;
        let renameCount = 0;

        const result = await applyGameBlueprintToProject({
            projectRoot,
            sourcePath,
            expectedHash: computeGameBlueprintHash(original),
            blueprint: buildBlueprint({symbols: ["A", "B", "MINE"]}),
            blueprintValidator,
            gamePackageGenerator,
            // The 2nd read is the pre-commit check that immediately gates the source's own rename (see
            // step 5) -- write real content to the real file right as that read happens, then return
            // what's actually now on disk, rather than a canned string.
            readFile: (filePath) => {
                readCount += 1;
                if (readCount === 2) {
                    fs.writeFileSync(sourcePath, serializeGameBlueprint(externallyEdited));
                }
                return fs.readFileSync(filePath, "utf-8");
            },
            rename: (from, to) => {
                renameCount += 1;
                fs.renameSync(from, to);
            },
        });

        expect(result.status).toBe("conflict");
        expect(renameCount).toBe(0);
        expect(fs.readFileSync(sourcePath, "utf-8")).toBe(serializeGameBlueprint(externallyEdited));
        expect(fs.readFileSync(path.join(projectRoot, "src", "generated", "index.js"), "utf-8")).toBe(indexJsBefore);
        expect(tempArtifactsLeftBehind()).toEqual([]);
    });

    // Race 1: a hash check that has already returned successfully must never let a second, independent
    // apply commit "in between" it and the commit it gates. A separate read-then-write can't guarantee
    // this by construction -- there's always a gap between the two calls for another cooperating caller
    // to land in. This proves the *real* guarantee: applyGameBlueprintToProject holds a filesystem-level
    // exclusive lock (see withExclusiveLock) across its own check-then-commit sequence, so a second call
    // racing in during that exact window -- after the first's own hash check already passed, before it
    // has written anything -- is refused outright rather than allowed to interleave.
    it("refuses a second concurrent apply that races in right after the first's hash check already passed, so their commits can never interleave", async () => {
        const original = buildBlueprint();
        seedProject(original);
        const firstEdit = buildBlueprint({symbols: ["A", "B", "FIRST"]});
        const secondEdit = buildBlueprint({symbols: ["A", "B", "SECOND"]});
        let readCount = 0;
        let secondResult: StudioBlueprintApplyView | undefined;

        const firstResult = await applyGameBlueprintToProject({
            projectRoot,
            sourcePath,
            expectedHash: computeGameBlueprintHash(original),
            blueprint: firstEdit,
            blueprintValidator,
            gamePackageGenerator,
            // The 2nd read is the check made right after acquiring the lock, immediately before
            // committing source -- fire a second, fully independent apply attempt exactly there, while
            // the source blueprint is still untouched on disk and this first apply already holds the
            // lock, standing in for a second Studio tab (or another API call) racing in at that moment.
            readFile: (filePath) => {
                readCount += 1;
                if (readCount === 2 && secondResult === undefined) {
                    secondResult = applyGameBlueprintToProject({
                        projectRoot,
                        sourcePath,
                        expectedHash: computeGameBlueprintHash(original),
                        blueprint: secondEdit,
                        blueprintValidator,
                        gamePackageGenerator,
                    });
                }
                return fs.readFileSync(filePath, "utf-8");
            },
        });

        expect(firstResult.status).toBe("ok");
        expect(secondResult?.status).toBe("error");
        if (secondResult?.status !== "error") {
            throw new Error("expected the second, overlapping apply to be refused");
        }
        expect(secondResult.error).toContain("already in progress");
        // Only the first apply's edit ever reached the source blueprint -- nothing from the refused,
        // overlapping second attempt touched it, silently or otherwise.
        expect(JSON.parse(fs.readFileSync(sourcePath, "utf-8"))).toEqual(firstEdit);
        expect(tempArtifactsLeftBehind()).toEqual([]);
    });

    // Race 2: even with the lock above, it only coordinates *cooperating* callers -- anything going
    // through applyGameBlueprintToProject. It can't stop an uncooperative writer (a hand edit saved from
    // a text editor, say) that never asks for the lock at all. This proves the rollback path is still
    // safe against that: source commits successfully, an external edit lands on the real source blueprint
    // afterward, and *then* a generated-package-file commit fails, triggering a rollback of the
    // already-committed source -- which must leave the external edit exactly as found rather than
    // silently discarding it to restore the pre-apply original.
    it("preserves an external edit that lands after source was committed but before a later generated-package-file failure rolls it back", async () => {
        const original = buildBlueprint();
        seedProject(original);
        const edited = buildBlueprint({symbols: ["A", "B", "C"], paytable: {A: {3: 5}, B: {3: 2}, C: {3: 1}}});
        const externallyEdited = buildBlueprint({symbols: ["A", "B", "EXTERNAL"]});
        const indexJsPath = path.join(projectRoot, "src", "generated", "index.js");

        const result = await applyGameBlueprintToProject({
            projectRoot,
            sourcePath,
            expectedHash: computeGameBlueprintHash(original),
            blueprint: edited,
            blueprintValidator,
            gamePackageGenerator,
            // Source's own commit (2 renames: move current aside, move staged in) succeeds normally
            // above this. The first attempt to commit a GENERATED_PACKAGE_FILES entry (index.js) is
            // where an uncooperative external process -- one that never asked for this module's own
            // lock -- writes directly to the now-already-committed source blueprint, and where this
            // apply's own package-file commit then fails for an unrelated reason (simulated disk error).
            rename: (from, to) => {
                if (to === indexJsPath && !from.includes(".stale-")) {
                    fs.writeFileSync(sourcePath, serializeGameBlueprint(externallyEdited));
                    throw new Error("simulated disk failure committing a generated package file");
                }
                fs.renameSync(from, to);
            },
        });

        expect(result.status).toBe("error");
        if (result.status !== "error") {
            throw new Error("expected error");
        }
        expect(result.error).toContain("changed externally");
        expect(result.error).toContain("preserved");
        // The external edit itself -- not the pre-apply original, and not this apply's own edit -- is
        // what's on disk afterward: rolling back never silently overwrote it.
        expect(fs.readFileSync(sourcePath, "utf-8")).toBe(serializeGameBlueprint(externallyEdited));
        // The generated package itself, meanwhile, still rolled back to its pre-apply state, since
        // nothing external touched *it*.
        expect(fs.readFileSync(indexJsPath, "utf-8")).not.toContain('"C"');
        // Exactly one artifact survives, deliberately: the pre-apply original, left at its stale-backup
        // path instead of being deleted or blindly renamed back over the external edit, exactly as the
        // error message above points to for manual recovery.
        const leftover = tempArtifactsLeftBehind();
        expect(leftover.length).toBe(1);
        expect(leftover[0]).toContain(".stale-");
        expect(fs.readFileSync(path.join(cwd, leftover[0]), "utf-8")).toBe(serializeGameBlueprint(original));
    });
});
