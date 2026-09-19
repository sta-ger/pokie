/** Rendered-browser evidence rules shared by the P8-05 persona campaign. */
import {P805_PERSONAS} from "./p8-05-product-readiness-campaign.mjs";

const fail = (message) => { throw new Error(`P8-05 Valera browser audit is invalid: ${message}`); };

/**
 * The browser runner records this small, machine-checkable summary alongside
 * screenshots and CDP/API logs. Component fixtures cannot satisfy it: every
 * audited route has to declare the public launcher and rendered input path.
 */
export function validateP805RenderedPersonaAudit(audit) {
    const rendered = audit?.rendered;
    if (!P805_PERSONAS.includes(audit?.persona) || !rendered || rendered.execution !== "public-launcher-rendered-controls" || !Array.isArray(rendered.viewports) || !rendered.viewports.includes("wide") || !rendered.viewports.includes("narrow") || rendered.consoleExceptions !== 0 || rendered.unhandledRequestFailures !== 0 || rendered.documentOverflow !== false || rendered.inaccessiblePrimaryActions !== 0 || rendered.unexplainedDisabledControls !== 0) fail(`rendered ${audit?.persona ?? "persona"} audit lacks clean public-browser observations`);
    if (!rendered.recovery || rendered.recovery.reloadReconnect !== true || rendered.recovery.projectSwitch !== true || rendered.recovery.staleResponseIsolation !== true || rendered.recovery.unsavedWorkProtection !== true || rendered.recovery.serverRestart !== true) fail(`rendered ${audit.persona} audit lacks recovery observations`);
    if (!rendered.jobs || rendered.jobs.success !== true || rendered.jobs.actionableFailure !== true || rendered.jobs.cooperativeCancellation !== true || rendered.jobs.retryWithoutPartialArtifacts !== true) fail(`rendered ${audit.persona} audit lacks success/failure/cancellation/retry observations`);
}
