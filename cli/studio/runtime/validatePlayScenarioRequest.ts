export type PlayScenarioRequestInput = {bet?: unknown; mode?: unknown};

export type ValidatedPlayScenarioRequest = {bet?: number; mode?: string};

// Shared wire validation for PlayTab's scenario-search routes (find-any-win/find-free-games, and the
// bet/mode half of find-symbol-win). A scenario search repeats the same authoritative spin() path a
// manual Spin click uses, so it must carry the same bet/mode choice the Play tab is currently showing;
// otherwise the displayed "Bet" and the settled round's own stake can disagree.
export function validatePlayScenarioRequest(input: PlayScenarioRequestInput): ValidatedPlayScenarioRequest {
    const {bet, mode} = input;
    if (bet !== undefined && (typeof bet !== "number" || !Number.isFinite(bet))) {
        throw new Error('"bet" must be a finite number when given.');
    }
    if (mode !== undefined && (typeof mode !== "string" || mode.trim().length === 0)) {
        throw new Error('"mode" must be a non-empty string when given.');
    }
    return {
        ...(bet === undefined ? {} : {bet}),
        ...(mode === undefined ? {} : {mode}),
    };
}
