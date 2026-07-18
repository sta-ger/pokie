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
        return fs.readdirSync(cwd).filter((name) => name.includes(".tmp-") || name.includes(".stale-") || name.includes(".captured-"));
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
    // -- after the cheap upfront check already passed -- must still be caught before anything commits
    // for good, not just an edit that already existed before the request started. The read this catches
    // it with is publishSourceBlueprint's own read of what it just atomically captured (see step 6),
    // not a separate pre-commit check -- restoring that captured content back is what makes this end in
    // "conflict" rather than "error": nothing raced the restore itself, so it's an ordinary, clean
    // rollback, not the doubly-raced scenario the "rollback compare-restore window" test below covers.
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
            // First call is the cheap upfront check (still the real, unedited content); second is
            // publishSourceBlueprint reading back what it just captured -- standing in for an edit that
            // landed sometime before that capture happened.
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

    // The requirement this covers: source is published *last*, only once every generated file has
    // already committed -- so a failure publishing source itself must roll those already-committed
    // generated files back, while source (never left in a half-written state by publishSourceBlueprint
    // itself -- see its own doc comment) ends up back at its pre-apply original.
    it("rolls the already-committed generated package back and restores source when publishing source itself fails", async () => {
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
            // Fails only publishSourceBlueprint's own final publish (linking the new content into place)
            // -- not its capture (moving the current content aside) and not the restore-on-failure link
            // that capture enables (both target a ".captured-" path, never sourcePath itself as the
            // *source* of the link).
            link: (existingPath, newPath) => {
                if (newPath === sourcePath && !existingPath.includes(".captured-")) {
                    throw new Error("simulated disk failure publishing the source blueprint");
                }
                fs.linkSync(existingPath, newPath);
            },
        });

        expect(result.status).toBe("error");
        if (result.status !== "error") {
            throw new Error("expected error");
        }
        expect(result.error).toContain("pre-apply original was restored");
        expect(result.error).toContain("rolled back");
        expect(fs.readFileSync(path.join(projectRoot, "src", "generated", "index.js"), "utf-8")).toBe(indexJsBefore);
        expect(fs.readFileSync(sourcePath, "utf-8")).toBe(serializeGameBlueprint(original));
        expect(tempArtifactsLeftBehind()).toEqual([]);
    });

    // The requirement this covers: since source is only ever published *after* every generated file has
    // already committed, a generated-file failure never needs to roll an already-published source back
    // -- source is simply never touched at all when this happens, which this proves directly (not just
    // "ends up back at the original", which committed-then-rolled-back would also produce).
    it("never touches source when a generated-package-file commit fails", async () => {
        const original = buildBlueprint();
        seedProject(original);
        const indexJsBefore = fs.readFileSync(path.join(projectRoot, "src", "generated", "index.js"), "utf-8");
        const edited = buildBlueprint({symbols: ["A", "B", "C"], paytable: {A: {3: 5}, B: {3: 2}, C: {3: 1}}});
        const indexJsPath = path.join(projectRoot, "src", "generated", "index.js");
        let linkCalled = false;

        const result = await applyGameBlueprintToProject({
            projectRoot,
            sourcePath,
            expectedHash: computeGameBlueprintHash(original),
            blueprint: edited,
            blueprintValidator,
            gamePackageGenerator,
            rename: (from, to) => {
                if (to === indexJsPath && !from.includes(".stale-")) {
                    throw new Error("simulated disk failure committing a generated package file");
                }
                fs.renameSync(from, to);
            },
            link: (existingPath, newPath) => {
                linkCalled = true;
                fs.linkSync(existingPath, newPath);
            },
        });

        expect(result.status).toBe("error");
        if (result.status !== "error") {
            throw new Error("expected error");
        }
        expect(result.error).toContain("rolled back");
        // publishSourceBlueprint is never even reached -- source is never captured, never published.
        expect(linkCalled).toBe(false);
        expect(fs.readFileSync(sourcePath, "utf-8")).toBe(serializeGameBlueprint(original));
        expect(fs.readFileSync(indexJsPath, "utf-8")).toBe(indexJsBefore);
        expect(tempArtifactsLeftBehind()).toEqual([]);
    });

    // Race 1 (as requested): an external write landing after the last hash check but before source is
    // actually published. publishSourceBlueprint captures the current source (an atomic rename, not a
    // read) before ever checking or publishing anything, so "the last hash check" here is the read of
    // what was just captured -- and by the time this fake's side effect runs, capture has *already*
    // emptied sourcePath. Recreating sourcePath at that point is exactly what an external writer saving
    // over a file that's mid-replacement would do; publishing then uses no-replace semantics (fs.linkSync,
    // which fails with EEXIST rather than silently overwriting), so this can never be silently clobbered
    // -- it ends in an explicit error instead, and the external write itself is left exactly as it landed.
    it("never overwrites an external write that recreates the source blueprint between capture and publish", async () => {
        const original = buildBlueprint();
        seedProject(original);
        const indexJsBefore = fs.readFileSync(path.join(projectRoot, "src", "generated", "index.js"), "utf-8");
        const externallyEdited = buildBlueprint({symbols: ["A", "B", "EXTERNAL"]});
        let readCount = 0;
        let linkCount = 0;

        const result = await applyGameBlueprintToProject({
            projectRoot,
            sourcePath,
            expectedHash: computeGameBlueprintHash(original),
            blueprint: buildBlueprint({symbols: ["A", "B", "MINE"]}),
            blueprintValidator,
            gamePackageGenerator,
            // The 2nd read is publishSourceBlueprint reading back what it just captured (real content,
            // still matching expectedHash -- this apply's own edit is about to be legitimately
            // published). Recreate sourcePath right there, standing in for an external writer saving a
            // new file over what looks to them like a file that just disappeared.
            readFile: (filePath) => {
                readCount += 1;
                if (readCount === 2) {
                    fs.writeFileSync(sourcePath, serializeGameBlueprint(externallyEdited));
                }
                return fs.readFileSync(filePath, "utf-8");
            },
            link: (existingPath, newPath) => {
                linkCount += 1;
                fs.linkSync(existingPath, newPath);
            },
        });

        expect(result.status).toBe("error");
        if (result.status !== "error") {
            throw new Error("expected error");
        }
        expect(result.error).toContain("external write landed");
        expect(result.error).toContain("was left untouched");
        // publishSourceBlueprint's own publish attempt is the only link() call -- it fails with EEXIST
        // (sourcePath already has the external write at it) and this apply never retries or falls back
        // to overwriting it.
        expect(linkCount).toBe(1);
        expect(fs.readFileSync(sourcePath, "utf-8")).toBe(serializeGameBlueprint(externallyEdited));
        expect(fs.readFileSync(path.join(projectRoot, "src", "generated", "index.js"), "utf-8")).toBe(indexJsBefore);
        // The pre-apply original this apply captured survives at its own ".captured-" path -- the only
        // leftover artifact, and the exact recovery point the error message names.
        const leftover = tempArtifactsLeftBehind();
        expect(leftover.length).toBe(1);
        expect(leftover[0]).toContain(".captured-");
        expect(fs.readFileSync(path.join(cwd, leftover[0]), "utf-8")).toBe(serializeGameBlueprint(original));
    });

    // Race 2 (as requested): a *second*, independent external write landing exactly as publishSourceBlueprint
    // tries to restore a captured original back to sourcePath -- the compare-(read)-then-restore window a
    // plain rename-based restore would silently clobber. Here, a first external edit lands while generated
    // package files are still being committed (this apply's own lock only coordinates *cooperating*
    // callers -- see withExclusiveLock -- so an uncooperative writer can still land there); by the time
    // publishSourceBlueprint captures and reads it, it no longer matches expectedHash, so it tries to put
    // it straight back -- and a *second* external write races in right at that restore. No-replace
    // semantics catch this too: the restore's own fs.linkSync fails with EEXIST instead of overwriting the
    // second write, so *neither* external edit is ever destroyed, and the operation ends in an explicit
    // error naming exactly where the first edit is still recoverable.
    it("never overwrites a second external write that lands while restoring a captured original that no longer matched", async () => {
        const original = buildBlueprint();
        seedProject(original);
        const indexJsBefore = fs.readFileSync(path.join(projectRoot, "src", "generated", "index.js"), "utf-8");
        const edited = buildBlueprint({symbols: ["A", "B", "C"], paytable: {A: {3: 5}, B: {3: 2}, C: {3: 1}}});
        const firstExternalEdit = buildBlueprint({symbols: ["A", "B", "FIRST-EXTERNAL"]});
        const secondExternalEdit = buildBlueprint({symbols: ["A", "B", "SECOND-EXTERNAL"]});
        const indexJsPath = path.join(projectRoot, "src", "generated", "index.js");

        const result = await applyGameBlueprintToProject({
            projectRoot,
            sourcePath,
            expectedHash: computeGameBlueprintHash(original),
            blueprint: edited,
            blueprintValidator,
            gamePackageGenerator,
            // An uncooperative external process writes new content directly to the source blueprint
            // while this apply is still committing generated package files -- before source is ever
            // captured.
            rename: (from, to) => {
                if (to === indexJsPath && !from.includes(".stale-")) {
                    fs.writeFileSync(sourcePath, serializeGameBlueprint(firstExternalEdit));
                }
                fs.renameSync(from, to);
            },
            // The only link() call in this scenario is publishSourceBlueprint's restore-on-mismatch
            // attempt (the first external edit above means the captured content no longer matches
            // expectedHash, so publish itself is never reached) -- a second, independent external write
            // races in exactly as that restore is attempted.
            link: (existingPath, newPath) => {
                fs.writeFileSync(sourcePath, serializeGameBlueprint(secondExternalEdit));
                fs.linkSync(existingPath, newPath);
            },
        });

        expect(result.status).toBe("error");
        if (result.status !== "error") {
            throw new Error("expected error");
        }
        expect(result.error).toContain("changed externally");
        expect(result.error).toContain("second external write landed");
        expect(result.error).toContain("was left untouched");
        // The second external write -- the most recent thing genuinely written to sourcePath -- is what
        // survives; neither the pre-apply original nor the first external edit silently clobbers it.
        expect(fs.readFileSync(sourcePath, "utf-8")).toBe(serializeGameBlueprint(secondExternalEdit));
        // Generated package files still roll back to their pre-apply state -- nothing external touched
        // *them*, and this apply's own attempt to update them failed overall.
        expect(fs.readFileSync(indexJsPath, "utf-8")).toBe(indexJsBefore);
        // The first external edit -- what this apply actually captured -- survives at its own
        // ".captured-" path, the exact recovery point the error message names, since restoring it back
        // over the second write was correctly refused rather than forced through.
        const leftover = tempArtifactsLeftBehind();
        expect(leftover.length).toBe(1);
        expect(leftover[0]).toContain(".captured-");
        expect(fs.readFileSync(path.join(cwd, leftover[0]), "utf-8")).toBe(serializeGameBlueprint(firstExternalEdit));
    });

    // A hash check that has already returned successfully must never let a second, independent apply
    // commit "in between" it and the commit it gates. A separate read-then-write can't guarantee this by
    // construction -- there's always a gap between the two calls for another cooperating caller to land
    // in. This proves the mutual-exclusion guarantee applyGameBlueprintToProject's own lock provides for
    // *cooperating* callers: a second call racing in anytime after the first has acquired the lock -- here,
    // right as it starts committing generated package files -- is refused outright rather than allowed to
    // interleave, regardless of how far into its own commit sequence the first call has gotten.
    it("refuses a second concurrent apply that races in while the first still holds the lock, so their commits can never interleave", async () => {
        const original = buildBlueprint();
        seedProject(original);
        const firstEdit = buildBlueprint({symbols: ["A", "B", "FIRST"]});
        const secondEdit = buildBlueprint({symbols: ["A", "B", "SECOND"]});
        let renameCount = 0;
        let secondResult: StudioBlueprintApplyView | undefined;

        const firstResult = await applyGameBlueprintToProject({
            projectRoot,
            sourcePath,
            expectedHash: computeGameBlueprintHash(original),
            blueprint: firstEdit,
            blueprintValidator,
            gamePackageGenerator,
            // The 1st rename is committing the first GENERATED_PACKAGE_FILES entry -- the first apply
            // already holds the lock by this point, and source is still fully untouched. Fire a second,
            // fully independent apply attempt exactly there, standing in for a second Studio tab (or
            // another API call) racing in while the first is mid-commit.
            rename: (from, to) => {
                renameCount += 1;
                if (renameCount === 1 && secondResult === undefined) {
                    secondResult = applyGameBlueprintToProject({
                        projectRoot,
                        sourcePath,
                        expectedHash: computeGameBlueprintHash(original),
                        blueprint: secondEdit,
                        blueprintValidator,
                        gamePackageGenerator,
                    });
                }
                fs.renameSync(from, to);
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
});
