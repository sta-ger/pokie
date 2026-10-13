import {ScreenProjection} from "../session/videoslot/coordinates/ScreenProjection.js";
import {projectPublicRoundStep, projectPublicFeatureEvent} from "../artifact/PublicRoundArtifactProjector.js";
import type {LogicalRound} from "./LogicalRound.js";
import {cloneSessionData} from "./internal/cloneSessionData.js";

/** Public progress deliberately excludes executable state, RNG, debug and generated coordinates. */
export function projectLogicalRound(round: LogicalRound) {
    const last = round.subrounds[round.cursor - 1];
    const step = last.artifacts?.[Math.max(0, round.stageCursor - 1)];
    return cloneSessionData({...(step ? {currentStep: projectPublicRoundStep(step)} : {}), roundId: round.id, cursor: round.deliveryCursor, mathematicalCursor: round.cursor, mathematicalStatus: round.mathematicalStatus, stageCursor: round.stageCursor, status: round.status,
        entry: {bet: round.bet, ...(round.mode ? {mode: round.mode} : {})},
        totalStake: round.totalStake, totalWin: round.totalWin, totalPayout: round.totalPayout,
        subrounds: round.subrounds.map(s => ({id: s.id, index: s.index, stake: s.stake, win: s.win, payout: s.payout,
            credits: s.credits, ...(s.screen ? {screen: s.screen} : {}), ...(s.finalScreen ? {finalScreen: s.artifacts?.[0]?.geometry ? new ScreenProjection(s.artifacts[0].geometry).project(s.finalScreen, "visible") : s.finalScreen} : {}),
            featureEvents: s.artifacts?.flatMap(a => (a.featureEvents ?? []).map(projectPublicFeatureEvent)) ?? []}))});
}
export type LogicalRoundDelivery = ReturnType<typeof projectLogicalRound>;
