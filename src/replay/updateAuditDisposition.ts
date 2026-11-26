import {computeAuditRoundHash, validateAuditRoundRecording} from "./AuditRoundReplay.js";
import {deepFreeze} from "../internal/deepFreeze.js";
import type {AuditDisposition, AuditRoundRecording} from "./AuditRoundRecording.js";

/** Owning storage boundary stamps its own disposition/transaction identities; offline replay never calls this. */
export function updateAuditDisposition(recording: AuditRoundRecording, disposition: Partial<AuditDisposition>, options?: {validate?: boolean}): AuditRoundRecording {
    // Internal settlement checkpoints pass validate:false immediately after buildAuditRoundRecording()
    // accepted this same recording. Re-validating the full delivery history at every checkpoint makes
    // long free-game rounds quadratic; the hash and the changed delivery still get rebuilt here.
    if (options?.validate !== false) validateAuditRoundRecording(recording);
    const {hash: _hash, ...body} = recording;
    const deliveries = recording.deliveries.map((delivery, index) => index === recording.deliveries.length - 1
        ? {...delivery, disposition: {...delivery.disposition, ...disposition}} : delivery);
    const updated = {...body, deliveries};
    const result = {...updated, hash: computeAuditRoundHash(updated)};
    if (options?.validate !== false) validateAuditRoundRecording(result);
    return deepFreeze(result);
}
