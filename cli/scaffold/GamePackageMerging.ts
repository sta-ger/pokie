import {ScaffoldResult} from "./ScaffoldResult.js";

// Distinct from GamePackageCreateOverrides (GamePackageCreating's own overrides type): this one adds
// `packageName` because GamePackageMerging writes in place, with no "<name>" positional of its own to
// double as both the target directory and the default package.json "name" the way
// GamePackageCreating's `name` parameter does -- a merge needs its own explicit way to pin
// package.json's "name" independently of the (pre-existing, arbitrary) directory it's merging into.
export type GamePackageMergeOverrides = {
    packageName?: string;
    id?: string;
    name?: string;
    version?: string;
};

// The in-place counterpart to GamePackageCreating: merges POKIE's package files into `projectRoot`
// rather than creating a fresh subdirectory under a parent -- `projectRoot` may be empty, already
// contain an unrelated npm project, or already be a POKIE package from an earlier (possibly failed)
// merge() call. Never fails because something already exists there; a pre-existing package.json is
// patched in place (see buildPackageJsonPatch), and every other file is written only if absent.
export interface GamePackageMerging {
    merge(projectRoot: string, overrides?: GamePackageMergeOverrides): ScaffoldResult;
}
