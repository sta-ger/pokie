export type GamePackagePreparationPhase = "create" | "dependencies" | "build" | "verify";

// Thrown by GamePackagePreparer and InitCommand when any lifecycle phase fails. Always carries which
// phase failed (`phase`) and a message that already states a concrete recovery step -- never a raw
// underlying error (a bare non-zero npm exit, a raw "Cannot find module") surfaced as the primary
// message -- so a caller can show both without re-deriving recovery guidance of its own.
//
// `details` -- only ever populated for a "dependencies" phase failure -- carries the raw, technical
// output a failed "npm install" produced (its own stderr), same convention and same purpose as
// BlueprintMaterializationError's own "details" (cli/materialize/BlueprintMaterializationError.ts):
// kept out of `message` so a human reading the top-level error gets a plain-English summary first,
// with dispatch.ts printing this as a secondary "npm output:" block for whichever error type it is.
export class GamePackagePreparationError extends Error {
    public readonly phase: GamePackagePreparationPhase;
    public readonly details?: string;

    constructor(phase: GamePackagePreparationPhase, message: string, details?: string) {
        super(message);
        this.name = "GamePackagePreparationError";
        this.phase = phase;
        this.details = details;
    }
}
