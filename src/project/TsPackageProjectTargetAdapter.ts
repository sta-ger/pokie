import {isPokieTsPackageDirectory} from "./internal/isPokieTsPackageDirectory.js";
import type {ProjectTargetTypeAdapter} from "./ProjectTargetTypeAdapter.js";

// Recognizes an already-loadable PokieGame package directory — see ProjectType.ts's own "tsPackage" doc
// comment.
export class TsPackageProjectTargetAdapter implements ProjectTargetTypeAdapter {
    public readonly type = "tsPackage";
    public readonly targetKind = "directory";

    public recognize(resolvedPath: string): Promise<string | undefined> {
        if (!isPokieTsPackageDirectory(resolvedPath)) {
            return Promise.resolve(undefined);
        }
        return Promise.resolve('"package.json" declares a "pokie.entry" field');
    }
}
