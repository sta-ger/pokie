import path from "path";
import {looksLikeGameBlueprintFile} from "./internal/looksLikeGameBlueprintFile.js";
import type {ProjectTargetTypeAdapter} from "./ProjectTargetTypeAdapter.js";

// Recognizes a GameBlueprint JSON source file — see ProjectType.ts's own "blueprint" doc comment.
export class BlueprintProjectTargetAdapter implements ProjectTargetTypeAdapter {
    public readonly type = "blueprint";
    public readonly targetKind = "file";

    public recognize(resolvedPath: string): Promise<string | undefined> {
        if (path.extname(resolvedPath).toLowerCase() !== ".json") {
            return Promise.resolve(undefined);
        }
        if (!looksLikeGameBlueprintFile(resolvedPath)) {
            return Promise.resolve(undefined);
        }
        return Promise.resolve('required blueprint fields present ("manifest", "reels", "rows", "symbols", "paytable")');
    }
}
