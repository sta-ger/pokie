import path from "path";

export type PackageJsonFieldConflict = {
    field: string;
    existingValue: string;
    requiredValue: string;
};

// Thrown by GamePackageMerger.merge() instead of writing package.json when a pre-existing package.json
// already defines one of POKIE's own required fields ("main"/"exports"/"scripts.build"/"pokie.entry")
// with a value that disagrees with what a POKIE package requires there -- an existing npm project's own
// build output, or a package.json hand-edited since a prior merge. Silently forcing POKIE's value in
// that case would clobber something the merge's own "existing files are never overwritten" contract
// promises to leave alone; this error surfaces the conflict instead, and package.json is left completely
// untouched (not even partially patched) so the directory stays safe to inspect and retry by hand.
export class GamePackageMergeConflictError extends Error {
    public readonly projectRoot: string;
    public readonly conflicts: PackageJsonFieldConflict[];

    constructor(projectRoot: string, conflicts: PackageJsonFieldConflict[]) {
        const details = conflicts
            .map((conflict) => `  - ${conflict.field}: found ${conflict.existingValue}, POKIE requires ${conflict.requiredValue}`)
            .join("\n");
        super(
            `"${path.join(projectRoot, "package.json")}" already has POKIE-required field(s) set to a conflicting value:\n${details}\n` +
                `package.json was left untouched. Update or remove the conflicting field(s) above so they match the ` +
                `required value, then re-run "pokie init ${projectRoot}".`,
        );
        this.name = "GamePackageMergeConflictError";
        this.projectRoot = projectRoot;
        this.conflicts = conflicts;
    }
}
