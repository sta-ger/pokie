// Thrown only when `vocabulary`/`exclusions`/a `generateUnique` count are combined tightly enough
// that no unused, non-excluded title exists within the generator's maxAttempts -- e.g. a custom
// vocabulary of one adjective and one noun asked for a unique batch of two.
export class SlotGameNameExhaustedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SlotGameNameExhaustedError";
    }
}
