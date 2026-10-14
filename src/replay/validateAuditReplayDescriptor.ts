import {ReplayRecorder} from "./ReplayRecorder.js";
import {validateAuditRoundRecording} from "./AuditRoundReplay.js";
import {AuditReplayError} from "./AuditReplayError.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import type {ReplayDescriptor} from "./ReplayDescriptor.js";

export function validateAuditReplayDescriptor(value: unknown, game?: PokieGame): asserts value is ReplayDescriptor & {audit: NonNullable<ReplayDescriptor["audit"]>} {
    const descriptor = value as ReplayDescriptor;
    validateAuditRoundRecording(descriptor?.audit, game);
    // Previously exported v1 descriptors used a logical aggregate. Validate that original
    // projection as well; new step exports must bind their mode policy to the recorded result.
    const legacyAggregate = descriptor.unit === "logical-round" || (descriptor.unit === undefined && descriptor.modePolicy === undefined);
    const expected = new ReplayRecorder().describeAudit(descriptor.audit, legacyAggregate ? "logical-round" : "step");
    for (const key of ["game", "seed", "round", "commands", "unit", "modePolicy", "logicalRound", "totalBet", "totalWin", "credits", "screen", "artifact", "auditCompletion"] as const) {
        const actual = descriptor[key],
            recorded = expected[key];
        if ((actual === undefined) !== (recorded === undefined) || (actual !== undefined && JSON.stringify(toCanonicalJson(actual)) !== JSON.stringify(toCanonicalJson(recorded)))) {
            throw new AuditReplayError("audit-structure", key, "Outer descriptor contradicts canonical operation evidence.");
        }
    }
    const original = descriptor.originalSessionId ?? descriptor.sessionId;
    if (original !== expected.sessionId) throw new AuditReplayError("audit-identity", "sessionId", "Original session differs from recorded operation.");
}
