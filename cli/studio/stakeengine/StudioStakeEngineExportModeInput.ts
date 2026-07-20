// One mode row of a POST /api/project/stakeengine/{validate,export} request body — "libraryPath" is a
// path relative to the active project's own root, resolved and read server-side (see
// loadWeightedOutcomeLibraryFromProjectFile), the same "a path, never an inline blob" convention every
// other Project Dashboard feature (Deployment/Certification/Outcome Libraries) already follows. "cost"
// is the Stake "mode" cost StakeEngineExporter needs to convert each outcome's payoutMultiplier into
// Stake's own integer unit convention — never guessed or derived from the library itself.
export type StudioStakeEngineExportModeInput = {
    readonly modeName: string;
    readonly libraryPath: string;
    readonly cost: number;
};
