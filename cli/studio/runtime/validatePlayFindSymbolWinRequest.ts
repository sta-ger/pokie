export type PlayFindSymbolWinRequestInput = {symbolId?: unknown};

export type ValidatedPlayFindSymbolWinRequest = {symbolId: string};

// The one place a POST /api/project/play/sessions/:id/find-symbol-win body is turned into a trusted
// request — throws a plain, client-safe Error (StudioServer catches this and maps it to 400) for
// anything malformed. Unlike "seed"/"requestId" elsewhere, `symbolId` is required: there is no
// sensible default symbol to search for, and PlayTab's own chooser never submits this route without
// one already selected.
export function validatePlayFindSymbolWinRequest(input: PlayFindSymbolWinRequestInput): ValidatedPlayFindSymbolWinRequest {
    const {symbolId} = input;
    if (typeof symbolId !== "string" || symbolId.length === 0) {
        throw new Error('"symbolId" is required and must be a non-empty string.');
    }
    return {symbolId};
}
