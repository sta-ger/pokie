import {ReplayRecorder} from "./ReplayRecorder.js";
import {validateAuditRoundRecording} from "./AuditRoundReplay.js";
import {AuditReplayError} from "./AuditReplayError.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import type {ReplayDescriptor} from "./ReplayDescriptor.js";

export function validateAuditReplayDescriptor(value: unknown, game?: PokieGame): asserts value is ReplayDescriptor & {audit: NonNullable<ReplayDescriptor["audit"]>} {
    const descriptor = value as ReplayDescriptor;
    validateAuditRoundRecording(descriptor?.audit, game);
    const expected = new ReplayRecorder().describeAudit(descriptor.audit);
    for (const key of ["game", "seed", "round", "commands", "unit", "logicalRound", "totalBet", "totalWin", "credits", "screen", "artifact", "auditCompletion"] as const) {
        const actual = descriptor[key],
            recorded = expected[key];
        if ((actual === undefined) !== (recorded === undefined) || (actual !== undefined && JSON.stringify(toCanonicalJson(actual)) !== JSON.stringify(toCanonicalJson(recorded)))) {
            throw new AuditReplayError("audit-structure", key, "Outer descriptor contradicts canonical operation evidence.");
        }
    }
    const original = descriptor.originalSessionId ?? descriptor.sessionId;
    if (original !== expected.sessionId) throw new AuditReplayError("audit-identity", "sessionId", "Original session differs from recorded operation.");
}
