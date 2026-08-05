export type BlueprintMaterializationPhase = "validate" | "generate" | "dependencies" | "verify" | "lock";

// Thrown by BlueprintProjectMaterializer when any lifecycle phase fails to turn a "blueprint" PokieProject
// into a real, loadable runtime -- always carries which phase failed (`phase`) and a message that already
// states the concrete problem (validation errors, a failed "npm install", a failed post-install verify, an
// abandoned per-cache-key lock that could not be reclaimed), never a raw underlying error surfaced as the
// primary message. Same "a dedicated Error subclass per specific
// failure" naming convention as GamePackagePreparationError (cli/prepare/GamePackagePreparationError.ts), for
// the analogous lifecycle one layer up: that one turns a name into a hand-editable scaffold, this one turns an
// already-resolved "blueprint" PokieProject into a cached, verified runtime.
//
// `details` -- only ever populated for a "dependencies" phase failure -- carries the raw, technical output
// a failed "npm install" produced (its own stderr). It's deliberately kept out of `message`: a human reading
// the top-level error should get a plain-English summary first, never a wall of npm's own diagnostic text;
// a caller that wants that text too (the CLI prints it as a secondary block, see cli/dispatch.ts) reads it
// from here instead of re-parsing `message`.
export class BlueprintMaterializationError extends Error {
    public readonly phase: BlueprintMaterializationPhase;
    public readonly details?: string;

    constructor(phase: BlueprintMaterializationPhase, message: string, details?: string) {
        super(message);
        this.name = "BlueprintMaterializationError";
        this.phase = phase;
        this.details = details;
    }
}
