// SHA-256 (sha256:<hex>, same convention as computeWeightedOutcomeLibraryHash) of each raw file this import
// actually read off disk, exactly as it sat there — before any JSON-parsing/decompression. Lets a caller prove
// which literal bytes an import result came from, independent of (and unaffected by) anything this importer
// itself reconstructed or substituted.
export type StakeEngineImportSourceModeProvenance = {
    readonly modeName: string;
    readonly csvHash: string;
    readonly booksHash: string;
};

export type StakeEngineImportSourceProvenance = {
    readonly indexHash: string;
    readonly manifestHash: string;
    readonly modes: readonly StakeEngineImportSourceModeProvenance[];
};
