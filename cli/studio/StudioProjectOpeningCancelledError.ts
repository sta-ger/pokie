/** An intentional project-opening guard, distinct from failed resource cleanup. */
export class StudioProjectOpeningCancelledError extends Error {
    public constructor() {
        super("Runtime preparation was cancelled before a runnable game was available.");
        this.name = "StudioProjectOpeningCancelledError";
    }
}
