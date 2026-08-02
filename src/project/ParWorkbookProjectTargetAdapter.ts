import path from "path";
import {REQUIRED_SHEETS} from "../parsheet/ParSheetImporter.js";
import {looksLikeParWorkbookFile} from "./internal/looksLikeParWorkbookFile.js";
import type {ProjectTargetTypeAdapter} from "./ProjectTargetTypeAdapter.js";

// Recognizes a PAR sheet workbook file — see ProjectType.ts's own "parWorkbook" doc comment. Requires every
// one of ParSheetImporter's own REQUIRED_SHEETS to be present by name, not merely a ".xlsx" extension — an
// .xlsx file that ExcelJS can't even read (corrupt, or not really a workbook) is rejected the same as one
// that's readable but missing a required sheet: neither is recognized.
export class ParWorkbookProjectTargetAdapter implements ProjectTargetTypeAdapter {
    public readonly type = "parWorkbook";
    public readonly targetKind = "file";

    public async recognize(resolvedPath: string): Promise<string | undefined> {
        if (path.extname(resolvedPath).toLowerCase() !== ".xlsx") {
            return undefined;
        }
        if (!(await looksLikeParWorkbookFile(resolvedPath))) {
            return undefined;
        }
        return `required PAR sheets present (${REQUIRED_SHEETS.join(", ")})`;
    }
}
