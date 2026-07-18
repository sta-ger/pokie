import crypto from "crypto";
import fs from "fs";
import path from "path";
import {computeGameBlueprintHash, GENERATED_PACKAGE_FILES, type GameBlueprint, type GameBlueprintValidating, type GamePackageGenerating} from "pokie";
import {commitStagedPath, finalizeStagedPathBackup, restoreStagedPath, type StagedPathRemover, type StagedPathRenamer} from "./commitStagedPath.js";
import {publishSourceBlueprint, type SourceLinker, type SourceReader, type SourceUnlinker} from "./publishSourceBlueprint.js";
import {serializeGameBlueprint} from "./serializeGameBlueprint.js";
import type {StudioBlueprintApplyView} from "./StudioBlueprintApplyView.js";
import {withExclusiveLock, type LockOpener, type LockReleaser} from "./withExclusiveLock.js";

export type ApplyGameBlueprintToProjectOptions = {
    readonly projectRoot: string;
    readonly sourcePath: string;
    readonly expectedHash: string;
    readonly blueprint: unknown;
    readonly blueprintValidator: GameBlueprintValidating;
    readonly gamePackageGenerator: GamePackageGenerating;
    // Test seams -- default to the real filesystem.
    readonly readFile?: SourceReader;
    readonly rename?: StagedPathRenamer;
    readonly remove?: StagedPathRemover;
    readonly link?: SourceLinker;
    readonly unlink?: SourceUnlinker;
    readonly openLock?: LockOpener;
    readonly releaseLock?: LockReleaser;
};

type StagedResource = {readonly realPath: string; readonly stagedPath: string};
type CommittedResource = {readonly realPath: string; readonly stalePath: string | undefined};

// Applies an edited GameBlueprint to a live project as a single conditional-commit "transaction": the
// project's own generated files (see GENERATED_PACKAGE_FILES) and its source blueprint file either all
// end up reflecting the new blueprint, or none of them do — a caller (Studio's Mechanics Editor) never
// sees a state where some were updated and others weren't, whatever fails and whenever it fails, and an
// edit landing outside this transaction entirely (a hand edit, another tool) is never silently discarded
// by it either.
//
//   1. Read the *current* source blueprint fresh and hash it — "expectedHash" is the hash the caller's
//      own draft was started from (see StudioBlueprintLoadView.blueprintHash). This is only the cheap
//      upfront fast-fail (avoids wasted validate+generate work on an already-stale draft), not the check
//      the actual publish is conditioned on — see step 6.
//   2. Validate the new blueprint. Neither check so far has written anything.
//   3. Stage the new generated package into a temp directory via the real GamePackageGenerator
//      (unmodified: it's simply pointed at an empty temp directory instead of projectRoot), and the new
//      source blueprint into a temp file via the same formatter save() uses. This is the slow part (real
//      file generation), and still touches nothing real — done *before* acquiring the lock below, so the
//      lock's held duration is as short as possible.
//   4. Acquire an exclusive, filesystem-level lock scoped to this source path (see withExclusiveLock) —
//      a real ownership handoff via O_CREAT|O_EXCL. Everything from here on runs while holding it, so
//      two overlapping applies against the same source can never interleave their commits: the second
//      one's own lock attempt fails outright. If the lock can't be acquired, this reports an error and
//      touches nothing.
//   5. Commit each of GENERATED_PACKAGE_FILES individually — one rename each (see commitStagedPath),
//      never a whole-directory swap of projectRoot: a project directory can (and typically does, once
//      `npm install`ed) hold real content this apply has no business touching, like node_modules or a
//      user's own files, so only the exact files "pokie build" itself would ever write are ever
//      replaced. If any of these fail, every one already committed is rolled back (in reverse order) —
//      a blind rename-back is safe here, since nothing but "pokie build" itself ever writes these files.
//   6. Only once every generated file has committed, publish the source blueprint itself — *last*, and
//      as a genuine ownership-based filesystem transaction (see publishSourceBlueprint), not a compare-
//      then-rename: the current content is atomically captured (renamed away, not read-then-trusted),
//      hashed, and only published with no-replace semantics that fail outright — rather than silently
//      overwrite — if anything else wrote to sourcePath in the meantime. Committing source last like
//      this means a generated-file failure never needs to roll back an already-published source, since
//      source is never touched until every other resource has already durably committed; the one thing
//      that can still fail at this final step is publishing source itself, in which case the already-
//      committed generated files are rolled back the same way as step 5's own failure path, and source
//      (never touched beyond being captured-then-restored by publishSourceBlueprint itself) is left
//      exactly as publishSourceBlueprint's own result says it was left.
//   7. Best-effort removal of the now-superseded stale backups and the (by then empty) staging
//      directory (logged, never a reason to report the apply itself as failed), then release the lock.
export function applyGameBlueprintToProject(options: ApplyGameBlueprintToProjectOptions): StudioBlueprintApplyView {
    const {projectRoot, sourcePath, expectedHash, blueprint, blueprintValidator, gamePackageGenerator} = options;
    const readFile = options.readFile ?? ((filePath: string) => fs.readFileSync(filePath, "utf-8"));
    const rename = options.rename ?? fs.renameSync;
    const remove = options.remove ?? ((targetPath: string) => fs.rmSync(targetPath, {recursive: true, force: true}));
    const link = options.link ?? fs.linkSync;
    const unlink = options.unlink ?? fs.unlinkSync;

    const checkHash = (): StudioBlueprintApplyView | undefined => {
        let currentText: string;
        try {
            currentText = readFile(sourcePath);
        } catch (error) {
            return {status: "error", error: `Failed to read "${sourcePath}": ${error instanceof Error ? error.message : String(error)}`};
        }
        let currentBlueprint: unknown;
        try {
            currentBlueprint = JSON.parse(currentText);
        } catch (error) {
            return {status: "error", error: `"${sourcePath}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}`};
        }
        const currentHash = computeGameBlueprintHash(currentBlueprint);
        if (currentHash !== expectedHash) {
            return {status: "conflict", currentHash};
        }
        return undefined;
    };

    const initialConflict = checkHash();
    if (initialConflict !== undefined) {
        return initialConflict;
    }

    const issues = blueprintValidator.validate(blueprint);
    const errors = issues.filter((issue) => issue.severity === "error");
    const warnings = issues.filter((issue) => issue.severity !== "error");
    if (errors.length > 0) {
        return {status: "invalid", errors, warnings};
    }

    const packageTempDir = `${projectRoot}.tmp-${crypto.randomBytes(6).toString("hex")}`;
    const sourceTempFile = path.join(path.dirname(sourcePath), `.${path.basename(sourcePath)}.tmp-${crypto.randomBytes(6).toString("hex")}`);
    try {
        fs.mkdirSync(packageTempDir, {recursive: true});
        gamePackageGenerator.generate(blueprint as GameBlueprint, path.dirname(packageTempDir), path.basename(packageTempDir), sourcePath);
        fs.writeFileSync(sourceTempFile, serializeGameBlueprint(blueprint));
    } catch (error) {
        removeBestEffort(packageTempDir, remove);
        removeBestEffort(sourceTempFile, remove);
        return {status: "error", error: error instanceof Error ? error.message : String(error)};
    }

    const lockPath = `${sourcePath}.lock`;
    try {
        return withExclusiveLock(lockPath, () => commitUnderLock(), options.openLock, options.releaseLock);
    } catch (error) {
        removeBestEffort(packageTempDir, remove);
        removeBestEffort(sourceTempFile, remove);
        return {status: "error", error: error instanceof Error ? error.message : String(error)};
    }

    function commitUnderLock(): StudioBlueprintApplyView {
        const packageFiles: StagedResource[] = GENERATED_PACKAGE_FILES.map((relativeFile) => {
            const segments = relativeFile.split("/");
            return {realPath: path.join(projectRoot, ...segments), stagedPath: path.join(packageTempDir, ...segments)};
        });

        const committed: CommittedResource[] = [];
        let commitError: unknown;
        for (const resource of packageFiles) {
            try {
                const {stalePath} = commitStagedPath(resource.realPath, resource.stagedPath, rename);
                committed.push({realPath: resource.realPath, stalePath});
            } catch (error) {
                commitError = error;
                break;
            }
        }

        if (commitError !== undefined) {
            return rollBackAndReport(committed, commitError, undefined);
        }

        // Every generated file is durably committed. Source is published last, and only now: a failure
        // here never needs to undo it, since it was never touched until this point.
        const publishResult = publishSourceBlueprint(sourcePath, sourceTempFile, expectedHash, rename, link, unlink, readFile);
        if (publishResult.status === "conflict") {
            return rollBackAndReport(committed, undefined, publishResult);
        }
        if (publishResult.status === "error") {
            return rollBackAndReport(committed, new Error(publishResult.error), undefined);
        }

        committed
            .map((done) => finalizeStagedPathBackup(done.stalePath, remove))
            .filter((warning): warning is string => warning !== undefined)
            .forEach((warning) => console.warn(`[StudioBlueprintService.applyToProject] ${warning}`));
        removeBestEffort(publishResult.capturedPath, remove);
        removeBestEffort(packageTempDir, remove);

        return {status: "ok", blueprintHash: computeGameBlueprintHash(blueprint), warnings};
    }

    // Rolls every already-committed generated file back (reverse order) and cleans up staging. Used both
    // when a generated-file commit itself fails, and when source's own publish fails or conflicts *after*
    // every generated file already committed -- source itself never needs rolling back either way, since
    // publishSourceBlueprint never leaves it silently overwritten (see its own doc comment); this only
    // ever undoes the generated files, and reports whichever of the two failure kinds actually happened.
    function rollBackAndReport(
        committed: CommittedResource[],
        commitError: unknown,
        conflict: {readonly status: "conflict"; readonly currentHash: string} | undefined,
    ): StudioBlueprintApplyView {
        const rollbackFailures: string[] = [];
        for (const done of [...committed].reverse()) {
            try {
                restoreStagedPath(done.realPath, done.stalePath, rename, remove);
            } catch (rollbackError) {
                rollbackFailures.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
            }
        }
        removeBestEffort(packageTempDir, remove);
        removeBestEffort(sourceTempFile, remove);

        if (conflict !== undefined) {
            return conflict;
        }

        const commitMessage = commitError instanceof Error ? commitError.message : String(commitError);
        if (rollbackFailures.length > 0) {
            return {
                status: "error",
                error: `Failed to apply the blueprint (${commitMessage}), and failed to fully roll back what had already been committed: ${rollbackFailures.join("; ")}`,
            };
        }
        return {
            status: "error",
            error: `Failed to apply the blueprint: ${commitMessage}. Every generated file already committed was rolled back to its previous state.`,
        };
    }
}

function removeBestEffort(targetPath: string, remove: StagedPathRemover): void {
    try {
        remove(targetPath);
    } catch {
        // best-effort only.
    }
}
