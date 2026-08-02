export type BlueprintMaterializationPhase = "validate" | "generate" | "dependencies" | "verify";

// Thrown by BlueprintProjectMaterializer when any lifecycle phase fails to turn a "blueprint" PokieProject
// into a real, loadable runtime -- always carries which phase failed (`phase`) and a message that already
// states the concrete problem (validation errors, a failed "npm install", a failed post-install verify),
// never a raw underlying error surfaced as the primary message. Same "a dedicated Error subclass per specific
// failure" naming convention as GamePackagePreparationError (cli/prepare/GamePackagePreparationError.ts), for
// the analogous lifecycle one layer up: that one turns a name into a hand-editable scaffold, this one turns an
// already-resolved "blueprint" PokieProject into a cached, verified runtime.
export class BlueprintMaterializationError extends Error {
    public readonly phase: BlueprintMaterializationPhase;

    constructor(phase: BlueprintMaterializationPhase, message: string) {
        super(message);
        this.name = "BlueprintMaterializationError";
        this.phase = phase;
    }
}
