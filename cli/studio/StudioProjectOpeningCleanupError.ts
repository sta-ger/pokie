/** A rejected opening lease release cannot attest to a safe cancellation. */
export class StudioProjectOpeningCleanupError extends Error {
    public readonly cause: unknown;

    public constructor(cause: unknown) {
        super(`Project opening cleanup failed: ${cause instanceof Error ? cause.message : String(cause)}`);
        this.name = "StudioProjectOpeningCleanupError";
        this.cause = cause;
    }
}
