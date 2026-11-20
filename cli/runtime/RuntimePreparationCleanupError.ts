/** A preparation owner could not release a resource; cancellation remains unconfirmed. */
export class RuntimePreparationCleanupError extends Error {
    public readonly cause: unknown;

    public constructor(cause: unknown) {
        super(`Runtime preparation cleanup failed: ${cause instanceof Error ? cause.message : String(cause)}`);
        this.name = "RuntimePreparationCleanupError";
        this.cause = cause;
    }
}
