// An imported PAR workbook always materializes as a Game Blueprint JSON file. The resolver (and so
// `pokie inspect`/`validate`/`build`) recognizes that file by its ".json" suffix; writing it under an
// extensionless path produced an import POKIE itself could not reopen.
export function assertBlueprintImportDestination(file: string): void {
    if (file.toLowerCase().endsWith(".json")) return;
    throw new Error(
        `--out for an imported Blueprint must be a file ending in ".json" (for example "game.blueprint.json"); ` +
            `"${file}" does not.`,
    );
}
