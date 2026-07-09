import {isPokieGame, PokieGameManifest, ValidationIssue, ValidationRule} from "pokie";

export class PokieGameContractValidationRule implements ValidationRule<unknown> {
    public validate(target: unknown): ValidationIssue[] {
        if (!isPokieGame(target)) {
            return [
                {
                    code: "pokie-game-missing-contract-methods",
                    severity: "error",
                    message:
                        "The loaded export does not implement the PokieGame contract (missing getManifest()/createSession()).",
                    suggestion: "Export an object implementing PokieGame as the entry module's default export.",
                },
            ];
        }

        let manifest: PokieGameManifest;
        try {
            manifest = target.getManifest();
        } catch (error) {
            return [
                {
                    code: "pokie-game-manifest-threw",
                    severity: "error",
                    message: `PokieGame.getManifest() threw: ${error instanceof Error ? error.message : String(error)}`,
                },
            ];
        }

        if (typeof manifest !== "object" || manifest === null) {
            return [
                {
                    code: "pokie-game-manifest-missing",
                    severity: "error",
                    message: "PokieGame.getManifest() must return a manifest object.",
                },
            ];
        }

        return (["id", "name", "version"] as const)
            .filter((field) => typeof manifest[field] !== "string" || manifest[field].trim().length === 0)
            .map((field) => ({
                code: `pokie-game-manifest-invalid-${field}`,
                severity: "error" as const,
                message: `PokieGameManifest.${field} must be a non-empty string.`,
            }));
    }
}
