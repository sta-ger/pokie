import {
    deriveAvailableBetModeIds,
    deriveAvailableBets,
    deriveBetModeId,
    deriveFeatureCounters,
    derivePaytableView,
    type FeatureCounter,
    type PaytableView,
} from "../../../../client/player";

// RoundArtifact deliberately contains only the result of one evaluated round.  A captured Studio
// session state additionally retains the serializer's initial payload, which is the authoritative
// static player data (paytable, selectable bets/modes) used to produce that result.  Keep this small
// adapter at the shared inspection boundary so Play, Replay, and a recorded Session Spin never each
// rediscover a different subset of that payload.
export type RoundPresentation = {
    paytable?: PaytableView;
    availableBets?: number[];
    currentBet?: number;
    availableModeIds?: string[];
    currentModeId?: string;
    featureCounters?: FeatureCounter[];
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function initialPayload(state: unknown): Record<string, unknown> | undefined {
    const record = asRecord(state);
    return asRecord(record?.initialPayload);
}

// Prefer the pre-round snapshot: it identifies the exact configured session that evaluated the
// displayed round.  `stateAfter` is the equivalent fallback for Play's live view, whose state capture
// starts after a round has completed but retains the same immutable initial payload.
export function describeRoundPresentation(stateBefore: unknown, stateAfter: unknown, artifactBetMode?: string): RoundPresentation {
    const initial = initialPayload(stateBefore) ?? initialPayload(stateAfter);
    const round = asRecord(stateAfter);
    if (initial === undefined) {
        return {};
    }

    return {
        paytable: derivePaytableView(initial.paytable),
        availableBets: deriveAvailableBets(initial.availableBets),
        currentBet: typeof round?.bet === "number" ? round.bet : typeof initial.bet === "number" ? initial.bet : undefined,
        availableModeIds: deriveAvailableBetModeIds(initial.availableBetModeIds),
        currentModeId:
            deriveBetModeId(round?.roundPayload && asRecord(round.roundPayload)?.betModeId) ??
            deriveBetModeId(initial.betModeId) ??
            artifactBetMode,
        featureCounters: deriveFeatureCounters(asRecord(round?.roundPayload) ?? initial),
    };
}
