import {ScaffoldResult} from "./ScaffoldResult.js";

// `overrides` lets a caller (e.g. Studio's Create Project form) pin the generated manifest's id/name/
// version explicitly instead of accepting what deriveManifestDefaults() would compute from `name` —
// optional, so every existing 2-arg caller (CreateCommand) is unaffected.
export type GamePackageCreateOverrides = {
    id?: string;
    name?: string;
    version?: string;
};

export interface GamePackageCreating {
    create(parentDir: string, name: string, overrides?: GamePackageCreateOverrides): ScaffoldResult;
}
