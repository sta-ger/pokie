// Thrown by resolveBetModeCodegenWiring() when a blueprint's betModes array has attempted to opt into
// the explicit runtime-semantics contract (at least one mode sets "runtimeType") but the array doesn't
// fully validate under it. GameBlueprintValidator already reports the same underlying problems as
// ValidationIssues for a caller who validates first (e.g. "pokie build"), but GamePackageGenerator.generate()
// can also be called directly, skipping that validation pass entirely -- without this, an incomplete or
// invalid attempt would silently degrade to the old metadata-only wiring instead of failing, which
// would ship a generated package whose runtime quietly ignores semantics its blueprint clearly meant
// to have. The legacy case -- no mode sets "runtimeType" at all -- is never an "attempt" and never
// throws this; it stays the plain, pre-runtimeType metadata-only behavior.
export class BetModeRuntimeSemanticsInvalidError extends Error {
    constructor(reason: string) {
        super(`Invalid explicit bet mode runtime semantics: ${reason}`);
        this.name = "BetModeRuntimeSemanticsInvalidError";
    }
}
