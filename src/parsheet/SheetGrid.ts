// A worksheet reduced to plain cell values: rows[0] is the header row, rows[1..] are data rows,
// every row padded to the same width. Keeps every mapping/*.ts file free of any dependency on
// exceljs's own Worksheet/Cell types — ParSheetImporter/ParSheetExporter own the only two places
// that convert to/from a real exceljs workbook (see sheetToGrid/gridToSheet there).
export type SheetGrid = unknown[][];
