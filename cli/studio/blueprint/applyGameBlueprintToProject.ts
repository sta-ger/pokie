import crypto from "crypto";
import fs from "fs";
import path from "path";
import {computeGameBlueprintHash, GENERATED_PACKAGE_FILES, type GameBlueprint, type GameBlueprintValidating, type GamePackageGenerating} from "pokie";
import {commitStagedPath, finalizeStagedPathBackup, restoreStagedPath, type StagedPathRemover, type StagedPathRenamer} from "./commitStagedPath.js";
import {serializeGameBlueprint} from "./serializeGameBlueprint.js";
import type {StudioBlueprintApplyView} from "./StudioBlueprintApplyView.js";

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
};

type StagedResource = {readonly realPath: string; readonly stagedPath: string};
type CommittedResource = {readonly realPath: string; readonly stalePath: string | undefined};

// Applies an edited GameBlueprint to a live project as a single conditional-commit "transaction": the
// project's own generated files (see GENERATED_PACKAGE_FILES) and its source blueprint file either all
// end up reflecting the new blueprint, or none of them do — a caller (Studio's Mechanics Editor) never
// sees a state where some were updated and others weren't, whatever fails and whenever it fails.
//
//   1. Read the *current* source blueprint fresh and hash it — "expectedHash" is the hash the caller's
//      own draft was started from (see StudioBlueprintLoadView.blueprintHash); a mismatch means
//      something else (a hand edit, another "pokie build", another Studio tab) changed the file since,
//      and this request refuses to silently overwrite it. This is a real compare-and-swap on the
//      server, not a client-side load-then-separately-write round trip: the only window left is this
//      function's own synchronous-ish work below, not a network+render round trip to the browser.
//   2. Validate the new blueprint. Neither check so far has written anything.
//   3. Stage the new generated package into a temp directory via the real GamePackageGenerator
//      (unmodified: it's simply pointed at an empty temp directory instead of projectRoot), and the
//      new source blueprint into a temp file via the same formatter save() uses. This is the slow
//      part (real file generation), and still touches nothing real.
//   4. Re-check the source blueprint's hash *again*, right before committing — closing the window step
//      3's own duration would otherwise leave open for an external edit to land in unnoticed. A
//      mismatch here discards the staged work and reports a conflict, same as step 1's check, with
//      still zero real writes.
//   5. Commit each of GENERATED_PACKAGE_FILES individually, then the source blueprint — one rename
//      each (see commitStagedPath), never a whole-directory swap of projectRoot: a project directory
//      can (and typically does, once `npm install`ed) hold real content this apply has no business
//      touching, like node_modules or a user's own files, so only the exact files "pokie build" itself
//      would ever write are ever replaced. If any commit in the sequence fails, every resource already
//      committed is rolled back (in reverse order) before returning, so the set as a whole is always
//      all-or-nothing. The one case this can't paper over — a rollback rename itself failing — is
//      reported with the exact stale path to restore by hand, the same residual risk
//      publishDirectoryAtomically's own single-resource version already documents and accepts.
//   6. Best-effort removal of the now-superseded stale backups and the (by then empty) staging
//      directory (logged, never a reason to report the apply itself as failed).
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
    try {
        fs.mkdirSync(packageTempDir, {recursive: true});
        gamePackageGenerator.generate(blueprint as GameBlueprint, path.dirname(packageTempDir), path.basename(packageTempDir), sourcePath);
        fs.writeFileSync(sourceTempFile, serializeGameBlueprint(blueprint));
    } catch (error) {
        removeBestEffort(packageTempDir, remove);
        removeBestEffort(sourceTempFile, remove);
        return {status: "error", error: error instanceof Error ? error.message : String(error)};
    }

    const staleConflict = checkHash();
    if (staleConflict !== undefined) {
        removeBestEffort(packageTempDir, remove);
        removeBestEffort(sourceTempFile, remove);
        return staleConflict;
    }

    const resources: StagedResource[] = [
        ...GENERATED_PACKAGE_FILES.map((relativeFile) => {
            const segments = relativeFile.split("/");
            return {realPath: path.join(projectRoot, ...segments), stagedPath: path.join(packageTempDir, ...segments)};
        }),
        {realPath: sourcePath, stagedPath: sourceTempFile},
    ];

    const committed: CommittedResource[] = [];
    let commitError: unknown;
    for (const resource of resources) {
        try {
            const {stalePath} = commitStagedPath(resource.realPath, resource.stagedPath, rename);
            committed.push({realPath: resource.realPath, stalePath});
        } catch (error) {
            commitError = error;
            break;
        }
    }

    if (commitError !== undefined) {
        const rollbackFailures: string[] = [];
        for (const done of [...committed].reverse()) {
            try {
                restoreStagedPath(done.realPath, done.stalePath, rename, remove);
            } catch (rollbackError) {
                rollbackFailures.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
            }
        }
        // Whatever wasn't committed yet (including the one that just failed) may still be sitting
        // un-renamed at its staged path -- commitStagedPath never touches `stagedPath` on failure, and
        // every not-yet-attempted resource's staged file was never touched at all.
        removeBestEffort(packageTempDir, remove);
        removeBestEffort(sourceTempFile, remove);

        const commitMessage = commitError instanceof Error ? commitError.message : String(commitError);
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

function removeBestEffort(targetPath: string, remove: StagedPathRemover): void {
    try {
        remove(targetPath);
    } catch {
        // best-effort only.
    }
}
