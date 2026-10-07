/** A rejected opening lease release requires recovery, with or without cancellation. */
export class StudioProjectOpeningCleanupError extends Error {
    public readonly cause: unknown;

    public constructor(cause: unknown) {
        super(`Project opening cleanup failed: ${cause instanceof Error ? cause.message : String(cause)}. Inspect the runtime resources and restart Studio before reopening the project.`);
        this.name = "StudioProjectOpeningCleanupError";
        this.cause = cause;
    }
}
