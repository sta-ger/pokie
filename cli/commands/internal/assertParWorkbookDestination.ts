// A PAR workbook is recognized by the resolver through its ".xlsx" suffix. Refuse a custom --out that
// would produce a valid workbook POKIE itself cannot inspect/import later.
export function assertParWorkbookDestination(file: string): void {
    if (file.toLowerCase().endsWith(".xlsx")) return;
    throw new Error(
        `--out for a PAR workbook must be a file ending in ".xlsx" (for example "game.par.xlsx"); ` +
            `"${file}" does not.`,
    );
}
