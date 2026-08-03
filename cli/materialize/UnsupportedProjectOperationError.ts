import type {UnsupportedProjectOperationDiagnostic} from "pokie";

// Thrown by createMaterializingRuntimePackageResolver when a resolved PokieProject can't perform the
// operation it was resolved for (e.g. "pokie sim" pointed at a parWorkbook or outcomeLibrary path) --
// carries the full UnsupportedProjectOperationDiagnostic (see describeUnsupportedProjectOperation) so a
// caller that wants the structured facts (detectedType/missingCapability/alternatives) doesn't have to
// re-parse `message`, while dispatch.ts's own catch-and-print-message handling still reports the same
// ready-to-read diagnostic text a raw loadPokieGame/ENOENT error never could. Same "a dedicated Error
// subclass per specific failure" convention as BlueprintMaterializationError.
export class UnsupportedProjectOperationError extends Error {
    public readonly diagnostic: UnsupportedProjectOperationDiagnostic;

    constructor(diagnostic: UnsupportedProjectOperationDiagnostic) {
        super(diagnostic.message);
        this.name = "UnsupportedProjectOperationError";
        this.diagnostic = diagnostic;
    }
}
