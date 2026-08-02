import ExcelJS from "exceljs";
import {REQUIRED_SHEETS} from "../../parsheet/ParSheetImporter.js";

// A lightweight, non-throwing recognition check for ProjectTargetResolver's parWorkbook adapter —
// deliberately not the structural validation ParSheetImporter.importFromFile itself performs against an
// already-recognized workbook: just enough of it (every one of REQUIRED_SHEETS present by name) to tell
// "this .xlsx is a PAR sheet workbook" apart from an unrelated spreadsheet someone happens to point the
// resolver at, the same "recognize, don't validate" split isOutcomeLibraryBundleDirectory/
// isPokieTsPackageDirectory draw for their own project types. Returns false for a file ExcelJS can't read at
// all (not a real workbook — e.g. a corrupt or non-xlsx file wearing a ".xlsx" extension) just as readily as
// for a workbook missing one of the required sheets; either way this is a graceful non-match, not an error.
export async function looksLikeParWorkbookFile(filePath: string): Promise<boolean> {
    let workbook: ExcelJS.Workbook;
    try {
        workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
    } catch {
        return false;
    }

    const sheetNames = new Set(workbook.worksheets.map((worksheet) => worksheet.name));
    return REQUIRED_SHEETS.every((name) => sheetNames.has(name));
}
