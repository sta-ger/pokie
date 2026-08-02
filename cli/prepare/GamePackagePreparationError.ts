export type GamePackagePreparationPhase = "create" | "dependencies" | "build" | "verify";

// Thrown by GamePackagePreparer when any lifecycle phase fails. Always carries which phase failed
// (`phase`) and a message that already states a concrete recovery step -- never a raw underlying
// error (a bare non-zero npm exit, a raw "Cannot find module") surfaced as the primary message -- so
// a caller can show both without re-deriving recovery guidance of its own.
export class GamePackagePreparationError extends Error {
    public readonly phase: GamePackagePreparationPhase;

    constructor(phase: GamePackagePreparationPhase, message: string) {
        super(message);
        this.name = "GamePackagePreparationError";
        this.phase = phase;
    }
}
