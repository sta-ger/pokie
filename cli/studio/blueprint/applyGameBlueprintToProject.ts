import crypto from "crypto";
import fs from "fs";
import path from "path";
import {computeGameBlueprintHash, GENERATED_PACKAGE_FILES, type GameBlueprint, type GameBlueprintValidating, type GamePackageGenerating} from "pokie";
import {
    commitStagedPath,
    finalizeStagedPathBackup,
    restoreSourceIfUnchanged,
    restoreStagedPath,
    type StagedPathRemover,
    type StagedPathRenamer,
} from "./commitStagedPath.js";
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
    readonly readFile?: (filePath: string) => string;
    readonly rename?: StagedPathRenamer;
    readonly remove?: StagedPathRemover;
    readonly openLock?: LockOpener;
    readonly releaseLock?: LockReleaser;
};

type StagedResource = {readonly realPath: string; readonly stagedPath: string; readonly isSource: boolean};
type CommittedResource = {readonly realPath: string; readonly stalePath: string | undefined; readonly isSource: boolean};

// Applies an edited GameBlueprint to a live project as a single conditional-commit "transaction": the
// project's own generated files (see GENERATED_PACKAGE_FILES) and its source blueprint file either all
// end up reflecting the new blueprint, or none of them do — a caller (Studio's Mechanics Editor) never
// sees a state where some were updated and others weren't, whatever fails and whenever it fails, and an
// edit landing outside this transaction entirely (a hand edit, another tool) is never silently discarded
// by it either.
//
//   1. Read the *current* source blueprint fresh and hash it — "expectedHash" is the hash the caller's
//      own draft was started from (see StudioBlueprintLoadView.blueprintHash); a mismatch means
//      something else changed the file since, and this request refuses to silently overwrite it. This is
//      just the cheap upfront fast-fail, not the check the actual commit is conditioned on — see step 4.
//   2. Validate the new blueprint. Neither check so far has written anything.
//   3. Stage the new generated package into a temp directory via the real GamePackageGenerator
//      (unmodified: it's simply pointed at an empty temp directory instead of projectRoot), and the new
//      source blueprint into a temp file via the same formatter save() uses. This is the slow part (real
//      file generation), and still touches nothing real — deliberately done *before* acquiring the lock
//      below, so the lock's held duration is as short as possible.
//   4. Acquire an exclusive, filesystem-level lock scoped to this source path (see withExclusiveLock) —
//      a real ownership handoff via O_CREAT|O_EXCL, not a separate read used to decide whether a later,
//      unrelated write should happen. Everything from here through step 6 runs while holding it, so two
//      overlapping applies against the same source can never interleave their commits: the second one's
//      own lock attempt fails outright rather than racing the first. If the lock can't be acquired, this
//      reports an error and touches nothing.
//   5. Re-check the source blueprint's hash *again*, now inside the lock, then commit the source
//      blueprint as the very next statement — before any GENERATED_PACKAGE_FILES entry, and before
//      anything else this function does. A mismatch here discards the staged work and reports a
//      conflict, same as step 1's check, with still zero real writes.
//   6. Commit each of GENERATED_PACKAGE_FILES individually — one rename each (see commitStagedPath),
//      never a whole-directory swap of projectRoot: a project directory can (and typically does, once
//      `npm install`ed) hold real content this apply has no business touching, like node_modules or a
//      user's own files, so only the exact files "pokie build" itself would ever write are ever
//      replaced. If any commit in the sequence fails (source's own commit included), every resource
//      already committed is rolled back (in reverse order) before returning. Source's own rollback is
//      *conditional* (see restoreSourceIfUnchanged): it only restores the pre-apply content if the
//      source blueprint's current content still equals what this transaction itself just wrote there. A
//      lock only coordinates *cooperating* callers — anything going through this same function — so an
//      uncooperative writer (a hand edit saved from a text editor, say) can in principle still land
//      between this transaction's own source commit and a later rollback triggered by some other
//      resource's failure; when that happens, the rollback leaves the source blueprint exactly as found
//      instead of destroying it, and reports the situation as an explicit error rather than papering over
//      it. The one case none of this can fix — a rollback rename itself failing on a resource that
//      *wasn't* externally touched — is reported with the exact stale path to restore by hand, the same
//      residual risk publishDirectoryAtomically's own single-resource version already documents.
//   7. Best-effort removal of the now-superseded stale backups and the (by then empty) staging
//      directory (logged, never a reason to report the apply itself as failed), then release the lock.
export function applyGameBlueprintToProject(options: ApplyGameBlueprintToProjectOptions): StudioBlueprintApplyView {
    const {projectRoot, sourcePath, expectedHash, blueprint, blueprintValidator, gamePackageGenerator} = options;
    const readFile = options.readFile ?? ((filePath: string) => fs.readFileSync(filePath, "utf-8"));
    const rename = options.rename ?? fs.renameSync;
    const remove = options.remove ?? ((targetPath: string) => fs.rmSync(targetPath, {recursive: true, force: true}));

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
    const sourceContentToCommit = serializeGameBlueprint(blueprint);
    try {
        fs.mkdirSync(packageTempDir, {recursive: true});
        gamePackageGenerator.generate(blueprint as GameBlueprint, path.dirname(packageTempDir), path.basename(packageTempDir), sourcePath);
        fs.writeFileSync(sourceTempFile, sourceContentToCommit);
    } catch (error) {
        removeBestEffort(packageTempDir, remove);
        removeBestEffort(sourceTempFile, remove);
        return {status: "error", error: error instanceof Error ? error.message : String(error)};
    }

    const lockPath = `${sourcePath}.lock`;
    let result: StudioBlueprintApplyView;
    try {
        result = withExclusiveLock(
            lockPath,
            () => commitUnderLock(),
            options.openLock,
            options.releaseLock,
        );
    } catch (error) {
        removeBestEffort(packageTempDir, remove);
        removeBestEffort(sourceTempFile, remove);
        return {status: "error", error: error instanceof Error ? error.message : String(error)};
    }
    return result;

    function commitUnderLock(): StudioBlueprintApplyView {
        const staleConflict = checkHash();
        if (staleConflict !== undefined) {
            removeBestEffort(packageTempDir, remove);
            removeBestEffort(sourceTempFile, remove);
            return staleConflict;
        }

        // Source is listed *first* deliberately (see step 5 above): it's committed as the very next
        // statement after the check immediately above, before any GENERATED_PACKAGE_FILES entry.
        const resources: StagedResource[] = [
            {realPath: sourcePath, stagedPath: sourceTempFile, isSource: true},
            ...GENERATED_PACKAGE_FILES.map((relativeFile) => {
                const segments = relativeFile.split("/");
                return {realPath: path.join(projectRoot, ...segments), stagedPath: path.join(packageTempDir, ...segments), isSource: false};
            }),
        ];

        const committed: CommittedResource[] = [];
        let commitError: unknown;
        for (const resource of resources) {
            try {
                const {stalePath} = commitStagedPath(resource.realPath, resource.stagedPath, rename);
                committed.push({realPath: resource.realPath, stalePath, isSource: resource.isSource});
            } catch (error) {
                commitError = error;
                break;
            }
        }

        if (commitError !== undefined) {
            const rollbackFailures: string[] = [];
            let externalEditPreservedAt: string | undefined;
            for (const done of [...committed].reverse()) {
                try {
                    if (done.isSource) {
                        const restoreResult = restoreSourceIfUnchanged(done.realPath, done.stalePath, sourceContentToCommit, readFile, rename, remove);
                        if (restoreResult.status === "external-edit-preserved") {
                            externalEditPreservedAt = restoreResult.stalePath;
                        }
                    } else {
                        restoreStagedPath(done.realPath, done.stalePath, rename, remove);
                    }
                } catch (rollbackError) {
                    rollbackFailures.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
                }
            }
            // Whatever wasn't committed yet (including the one that just failed) may still be sitting
            // un-renamed at its staged path -- commitStagedPath never touches `stagedPath` on failure, and
            // every not-yet-attempted resource's staged file was never touched at all.
            removeBestEffort(packageTempDir, remove);
            if (externalEditPreservedAt === undefined) {
                removeBestEffort(sourceTempFile, remove);
            }

            const commitMessage = commitError instanceof Error ? commitError.message : String(commitError);
            if (externalEditPreservedAt !== undefined) {
                const rollbackNote = rollbackFailures.length > 0 ? ` Other rollback failures: ${rollbackFailures.join("; ")}.` : "";
                return {
                    status: "error",
                    error:
                        `Failed to apply the blueprint (${commitMessage}). The source blueprint was changed externally ` +
                        `after this apply had already committed it, so it was left exactly as found instead of being ` +
                        `rolled back — nothing of that external edit was touched. The pre-apply original is preserved ` +
                        `at "${externalEditPreservedAt}" if you need to recover it.${rollbackNote}`,
                };
            }
            if (rollbackFailures.length > 0) {
                return {
                    status: "error",
                    error: `Failed to apply the blueprint (${commitMessage}), and failed to fully roll back what had already been committed: ${rollbackFailures.join("; ")}`,
                };
            }
            return {
                status: "error",
                error: `Failed to apply the blueprint: ${commitMessage}. Everything already committed was rolled back to its previous state.`,
            };
        }

        committed
            .map((done) => finalizeStagedPathBackup(done.stalePath, remove))
            .filter((warning): warning is string => warning !== undefined)
            .forEach((warning) => console.warn(`[StudioBlueprintService.applyToProject] ${warning}`));
        removeBestEffort(packageTempDir, remove);

        return {status: "ok", blueprintHash: computeGameBlueprintHash(blueprint), warnings};
    }
}

function removeBestEffort(targetPath: string, remove: StagedPathRemover): void {
    try {
        remove(targetPath);
    } catch {
        // best-effort only.
    }
}
