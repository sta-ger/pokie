// A Game Blueprint is recognized by the resolver through its ".json" suffix. Writing a new or edited
// Blueprint under an extensionless path produced a file POKIE's own inspect/validate/build refused to
// reopen.
import {assertDestinationIsAFile} from "./assertDestinationIsAFile.js";

export function assertBlueprintJsonDestination(file: string, subject: string): void {
    if (!file.toLowerCase().endsWith(".json")) {
        throw new Error(
            `--out for ${subject} must be a file ending in ".json" (for example "game.blueprint.json"); ` +
                `"${file}" does not.`,
        );
    }
    assertDestinationIsAFile(file);
}

export function assertBlueprintImportDestination(file: string): void {
    assertBlueprintJsonDestination(file, "an imported Blueprint");
}
