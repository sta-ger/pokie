import {createHash} from "node:crypto";
const digest = (value) => createHash("sha256").update(value).digest("hex");

export const P805_OPERATION_BUDGETS = {startupMs:60_000, projectCreationMs:60_000, validationMs:60_000, buildMs:300_000, simulationMs:300_000, replayMs:300_000, cancellationMs:120_000, restartRecoveryMs:120_000, retryMs:180_000, replayArtifactMs:60_000, screenshotMs:60_000, recursiveHelpMs:300_000};

export function p805OperationPerformance(timings, budgets = P805_OPERATION_BUDGETS) {
    return Object.fromEntries(Object.entries(budgets).map(([name, budgetMs]) => [name, {elapsedMs:timings[name], budgetMs, classification:timings[name] === null ? "not-executed" : timings[name] <= budgetMs ? "within-budget" : "regression"}]));
}

/** A persona summary is only a deterministic view of unchanged child receipts. */
export function projectP805PersonaAudit(audits, tupleReceipts, phase, persona) {
    // Projection cannot mint another leaf or hide repeated evidence. The
    // filesystem consumer authenticates these references before calling us.
    if (!Array.isArray(audits) || audits.length === 0 || audits.length !== tupleReceipts?.length || audits.some((audit, index) => audit.phase !== phase || audit.persona !== persona || audit.auditId !== tupleReceipts[index].auditId || JSON.stringify(audit.tuple) !== JSON.stringify(tupleReceipts[index].tuple))) throw new Error("persona projection requires matching immutable child audits and receipts");
    const evidence = audits.flatMap((audit) => audit.evidence);
    if (new Set(evidence.map((item) => item.evidenceId)).size !== evidence.length || new Set(evidence.map((item) => item.path)).size !== evidence.length) throw new Error("persona projection repeats immutable child evidence");
    const first = audits[0], timings = Object.fromEntries(Object.keys(first.timings).map((name) => [name, audits.every((audit) => audit.timings[name] === null) ? null : Math.max(...audits.map((audit) => audit.timings[name]).filter((value) => value !== null))]));
    return {
        ...first,
        auditId:`${phase}-${persona}-persona-aggregate-${digest(tupleReceipts.map((receipt) => receipt.auditSha256).join("\0")).slice(0, 16)}`,
        tuple:undefined,
        workflowScope:undefined,
        observations:[...new Set(audits.flatMap((audit) => audit.observations))],
        cleanContexts:audits.map((audit) => audit.cleanContext),
        evidence,
        observationEvidence:Object.assign({}, ...audits.map((audit) => audit.observationEvidence)),
        checkpointReceipts:audits.flatMap((audit) => audit.checkpointReceipts),
        tupleReceipts,
        startedAt:audits.map((audit) => audit.startedAt).sort()[0],
        endedAt:audits.map((audit) => audit.endedAt).sort().at(-1),
        timings,
        performance:Object.fromEntries(Object.entries(first.performance).map(([name, value]) => [name, {...value, elapsedMs:timings[name], classification:timings[name] === null ? "not-executed" : timings[name] <= value.budgetMs ? "within-budget" : "regression"}])),
        finalResult:{status:"passed", aggregation:"verified-checkpoint-receipts-only", chunks:audits.reduce((count, audit) => count + audit.checkpointReceipts.length, 0), checkpointReceiptSha256s:audits.flatMap((audit) => audit.checkpointReceipts.map((receipt) => receipt.sha256)), cleanupEvidenceId:first.cleanup.evidenceId},
        rendered:{...first.rendered, viewports:["wide", "compact", "narrow"], responsive:["wide", "compact", "narrow"].map((viewport) => audits.find((audit) => audit.tuple.viewport === viewport)?.rendered.responsive[0]).filter(Boolean), measurements:{consoleExceptions:Math.max(...audits.map((audit) => audit.rendered.measurements.consoleExceptions)), unhandledRequestFailures:Math.max(...audits.map((audit) => audit.rendered.measurements.unhandledRequestFailures)), documentOverflow:audits.some((audit) => audit.rendered.measurements.documentOverflow), inaccessiblePrimaryActions:Math.max(...audits.map((audit) => audit.rendered.measurements.inaccessiblePrimaryActions)), unexplainedDisabledControls:Math.max(...audits.map((audit) => audit.rendered.measurements.unexplainedDisabledControls)), namedRegions:Math.min(...audits.map((audit) => audit.rendered.measurements.namedRegions)), visibleFocus:audits.every((audit) => audit.rendered.measurements.visibleFocus)}, defects:audits.flatMap((audit) => audit.rendered.defects), actions:audits.flatMap((audit) => audit.rendered.actions), recovery:Object.assign({}, ...audits.map((audit) => audit.rendered.recovery)), jobs:Object.assign({}, ...audits.map((audit) => audit.rendered.jobs))},
    };
}
