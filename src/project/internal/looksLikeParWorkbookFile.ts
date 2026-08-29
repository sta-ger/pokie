import ExcelJS from "exceljs";
import {REQUIRED_SHEETS} from "../../parsheet/ParSheetImporter.js";

export type ParWorkbookRecognition =
    | {readonly status: "recognized"}
    | {readonly status: "unrelated"}
    | {readonly status: "unreadable"}
    | {readonly status: "incomplete"; readonly missingSheets: readonly string[]};

// A lightweight, non-throwing recognition check for ProjectTargetResolver's parWorkbook adapter —
// deliberately not the structural validation ParSheetImporter.importFromFile itself performs against an
// already-recognized workbook: just enough of it (every one of REQUIRED_SHEETS present by name) to tell
// "this .xlsx is a PAR sheet workbook" apart from an unrelated spreadsheet someone happens to point the
// resolver at, the same "recognize, don't validate" split isOutcomeLibraryBundleDirectory/
// isPokieTsPackageDirectory draw for their own project types. Returns false for a file ExcelJS can't read at
// all (not a real workbook — e.g. a corrupt or non-xlsx file wearing a ".xlsx" extension) just as readily as
// for a workbook missing one of the required sheets; either way this is a graceful non-match, not an error.
export async function recognizeParWorkbookFile(filePath: string): Promise<ParWorkbookRecognition> {
    let workbook: ExcelJS.Workbook;
    try {
        workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
    } catch {
        return {status: "unreadable"};
    }

    const sheetNames = new Set(workbook.worksheets.map((worksheet) => worksheet.name));
    const missingSheets = REQUIRED_SHEETS.filter((name) => !sheetNames.has(name));
    if (missingSheets.length === 0) return {status: "recognized"};
    // A workbook with no PAR sheet names is an ordinary spreadsheet, not a
    // malformed PAR source. Keep the resolver's established non-PAR behavior.
    if (missingSheets.length === REQUIRED_SHEETS.length) return {status: "unrelated"};
    return {status: "incomplete", missingSheets};
}

export async function looksLikeParWorkbookFile(filePath: string): Promise<boolean> {
    return (await recognizeParWorkbookFile(filePath)).status === "recognized";
}
