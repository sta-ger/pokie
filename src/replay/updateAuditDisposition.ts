import {computeAuditRoundHash} from "./AuditRoundReplay.js";
import {deepFreeze} from "../internal/deepFreeze.js";
import type {AuditDisposition, AuditRoundRecording} from "./AuditRoundRecording.js";

/** Owning storage boundary stamps its own disposition/transaction identities; offline replay never calls this. */
export function updateAuditDisposition(recording: AuditRoundRecording, disposition: Partial<AuditDisposition>): AuditRoundRecording {
    const {hash: _hash, ...body} = recording;
    const deliveries = recording.deliveries.map((delivery, index) => index === recording.deliveries.length - 1
        ? {...delivery, disposition: {...delivery.disposition, ...disposition}} : delivery);
    const updated = {...body, deliveries};
    return deepFreeze({...updated, hash: computeAuditRoundHash(updated)});
}
