import type {GamePackageCreateOverrides} from "../scaffold/GamePackageCreating.js";
import type {PreparationResult} from "./PreparationResult.js";

// The application-level counterpart to GamePackageCreating: where that contract only ever writes a
// hand-editable TypeScript source skeleton, this one carries a target directory all the way to a
// verified, loadable package -- create, install dependencies, build, then verify -- so a caller never
// has to chain "create" with its own npm install/build/loadPokieGame calls to get something
// `loadPokieGame`/`pokie validate`/`pokie sim` can actually run.
export interface GamePackagePreparing {
    prepare(parentDir: string, name: string, overrides?: GamePackageCreateOverrides): Promise<PreparationResult>;
}
