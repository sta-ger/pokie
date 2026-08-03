export type CheckBlueprintSourceRequestInput = {path?: unknown; blueprintHash?: unknown};
export type ValidatedCheckBlueprintSourceRequest = {path: string; blueprintHash: string};

// The one place a POST /api/home/blueprints/check-source body is turned into a trusted request —
// throws a plain, client-safe Error (StudioServer catches this and maps it to 400) for anything
// malformed. `blueprintHash` is the caller's own snapshot of what it believes is currently persisted at
// `path` (see StudioBlueprintLoadView.blueprintHash) — required, since without it this endpoint would
// have nothing to compare the current on-disk content against.
export function validateCheckBlueprintSourceRequest(input: CheckBlueprintSourceRequestInput): ValidatedCheckBlueprintSourceRequest {
    const {path, blueprintHash} = input;
    if (typeof path !== "string" || path.trim().length === 0) {
        throw new Error('"path" is required.');
    }
    if (typeof blueprintHash !== "string" || blueprintHash.trim().length === 0) {
        throw new Error('"blueprintHash" is required and must be a non-empty string.');
    }
    return {path, blueprintHash};
}
