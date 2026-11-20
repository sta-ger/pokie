/** Propagated only before acquisition or after the owner's resources have drained. */
export class RuntimePreparationCancelledError extends Error {
    public constructor(message = "Runtime preparation was cancelled before a runnable game was available.") {
        super(message);
        this.name = "RuntimePreparationCancelledError";
    }
}
