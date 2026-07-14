// Informational metadata read from (or written to) a PAR sheet's "Meta" sheet — never fed back into
// GameBlueprint fields, purely for a human (or a later import) to see where a .par.xlsx came from.
export type ParSheetProvenance = {
    schemaVersion?: number;
    pokieVersion?: string;
    exportedAt?: string;
    source?: string;
    blueprintHash?: string;
};
