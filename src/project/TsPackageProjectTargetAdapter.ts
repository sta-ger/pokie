import {recognizePokieTsPackageDirectory} from "./internal/isPokieTsPackageDirectory.js";
import {ProjectTargetMalformedError} from "./ProjectTargetMalformedError.js";
import type {ProjectTargetTypeAdapter} from "./ProjectTargetTypeAdapter.js";

// Recognizes an already-loadable PokieGame package directory — see ProjectType.ts's own "tsPackage" doc
// comment. A package.json that declares a "pokie" field but fails validation (invalid JSON, missing/blank
// "pokie.entry") throws ProjectTargetMalformedError rather than reporting undefined — see that class's own
// doc comment.
export class TsPackageProjectTargetAdapter implements ProjectTargetTypeAdapter {
    public readonly type = "tsPackage";
    public readonly targetKind = "directory";

    public recognize(resolvedPath: string): Promise<string | undefined> {
        const recognition = recognizePokieTsPackageDirectory(resolvedPath);
        if (recognition.kind === "malformed") {
            throw new ProjectTargetMalformedError(recognition.reason);
        }
        if (recognition.kind === "unrelated") {
            return Promise.resolve(undefined);
        }
        return Promise.resolve('"package.json" declares a "pokie.entry" field');
    }
}
