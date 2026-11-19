import type {LogicalRound} from "../runtime/LogicalRound.js";
import type {RoundRecord} from "./RoundRecord.js";
import {deepFreeze} from "../internal/deepFreeze.js";
import {cloneSessionData} from "../runtime/internal/cloneSessionData.js";
import {RoundRecordValidator} from "./RoundRecordValidator.js";

/** Fold retained evaluated steps; never call play, a resolver or the win calculator. */
export function buildLogicalRoundRecord(round: LogicalRound, template: RoundRecord): RoundRecord {
    const steps = round.subrounds.flatMap(s => s.artifacts ?? []).map((step, index) => ({...step, index}));
    if (!steps.length || round.subrounds.some(s => s.artifacts === undefined)) throw new Error("Logical round does not retain every evaluated step.");
    const last = steps[steps.length - 1];
    const candidate: RoundRecord = cloneSessionData({...template, roundId: round.id, stake: round.totalStake,
        betMode: round.mode ?? template.betMode, totalWin: round.totalWin, payoutMultiplier: round.totalStake > 0 ? round.totalWin / round.totalStake : 0,
        steps, screen: last.screen, ...(last.sequenceSelections ? {sequenceSelections: last.sequenceSelections} : {}), wins: steps.flatMap(s => s.wins), featureEvents: steps.flatMap(s => s.featureEvents ?? [])});
    const invalid = new RoundRecordValidator().validate(candidate);
    if (invalid.length) throw new Error(`Invalid logical artifact: ${JSON.stringify(invalid)}`);
    return deepFreeze(candidate);
}
