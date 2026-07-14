import type {ParSheetImportResult} from "./ParSheetImportResult.js";

export interface ParSheetImporting {
    importFromFile(filePath: string): Promise<ParSheetImportResult>;
}
