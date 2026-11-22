// Advisory analysis sheets written by ParSheetExporter's optional math section. They are not part of
// the authored GameBlueprint, so the importer recognizes and ignores them without treating the workbook
// as lossy: the model-defining sheets are still the only ones that round-trip.
export const PAR_SHEET_MATH_SHEET_NAMES = [
    "MathSummary",
    "PayoutDistribution",
    "WinEvents",
    "LineContributions",
    "SymbolContributions",
] as const;
