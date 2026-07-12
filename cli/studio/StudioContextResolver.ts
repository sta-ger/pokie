import path from "path";
import type {StudioContext} from "./StudioContext.js";
import type {StudioContextResolving} from "./StudioContextResolving.js";

// Deliberately dumb: no existence/pokie-package validation happens here. `projectRoot` given at
// startup (`pokie .`/`pokie <path>`) or via the Home nav's Open Project action is only ever validated
// where it actually matters — StudioHomeService.openProject(), via loadPokieGame — so there is exactly
// one place that decides "is this really a pokie game package", not two.
export class StudioContextResolver implements StudioContextResolving {
    public resolve(projectRoot?: string): StudioContext {
        if (projectRoot === undefined) {
            return {mode: "home"};
        }
        return {mode: "project", projectRoot: path.resolve(projectRoot)};
    }
}
