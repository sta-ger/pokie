import type {GameBlueprint} from "pokie";
import {deriveManifestDefaults} from "../scaffold/deriveManifestDefaults.js";

// Shared by CreateCommand and InitCommand: turns a given "<name>" positional into the same
// manifest.id/manifest.name a template blueprint's own default would otherwise carry, via the exact
// name-derivation rules "pokie create"'s old hand-editable scaffold used (deriveManifestDefaults) --
// so a name that becomes a directory (InitCommand) or a default blueprint filename (CreateCommand)
// always agrees with the manifest id it names. Undefined/blank leaves the template's own manifest
// untouched, so both commands' name-less path stays exactly the template's own default.
export function applyBlueprintNameOverride(blueprint: GameBlueprint, name: string | undefined): GameBlueprint {
    if (name === undefined || name.trim().length === 0) {
        return blueprint;
    }
    const trimmed = name.trim();
    if (trimmed.includes("/") || trimmed.includes("\\") || trimmed === "." || trimmed === "..") {
        throw new Error(`"${name}" is not a valid project name. Use a plain name, e.g. "sample-slot".`);
    }

    const derived = deriveManifestDefaults(trimmed);
    return {...blueprint, manifest: {...blueprint.manifest, id: derived.id, name: derived.name}};
}
