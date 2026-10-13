export type RuntimeFailureCode = "storage-error" | "settlement-error" | "execution-error";

/** Operational failure retaining the primary exception and its message after compensation. */
export class RuntimeCommandError extends Error {
    public readonly code: RuntimeFailureCode;
    public readonly cause: unknown;

    constructor(code: RuntimeFailureCode, cause: unknown, public readonly retryDisposition?: "safe-to-retry") {
        super(cause instanceof Error ? cause.message : String(cause));
        this.name = "RuntimeCommandError";
        this.code = code;
        this.cause = cause;
    }
}
