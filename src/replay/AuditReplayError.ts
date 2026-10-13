export type AuditReplayErrorCode = "audit-structure" | "audit-hash" | "audit-version" | "audit-identity" | "audit-codec-unsupported" | "audit-state" | "audit-command" | "audit-order" | "audit-artifact" | "audit-execution-mismatch" | "audit-cancelled" | "audit-capture-unavailable";

export class AuditReplayError extends Error {
    constructor(public readonly code: AuditReplayErrorCode, public readonly path: string, message: string) {
        super(`${code} at ${path}: ${message}`);
        this.name = "AuditReplayError";
    }
}
