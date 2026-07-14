// Thrown by toCanonicalJson when a value can't be represented as canonical JSON — a non-finite number
// (NaN/Infinity), a bigint, a symbol, a function, an undefined present where a value is required, or a
// circular reference. "path" pinpoints where in the source value the offending entry was found (e.g.
// `wins[2].metadata.rngSeed`, or "" for the root value itself), so a caller building a large artifact isn't
// left guessing which of many nested fields was the problem.
export class InvalidJsonValueError extends Error {
    private readonly path: string;
    private readonly reason: string;

    constructor(path: string, reason: string) {
        super(`Value at "${path.length > 0 ? path : "<root>"}" is not valid canonical JSON: ${reason}.`);
        this.name = "InvalidJsonValueError";
        this.path = path;
        this.reason = reason;
    }

    public getPath(): string {
        return this.path;
    }

    public getReason(): string {
        return this.reason;
    }
}
