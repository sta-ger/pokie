import {isPokieGame} from "./isPokieGame.js";
import type {PokieGameInfo} from "./PokieGameInfo.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ValidationRule} from "../validation/ValidationRule.js";

export class PokieGameContractValidationRule implements ValidationRule<unknown> {
    public validate(target: unknown, detachInfoData?: (info: unknown) => unknown): ValidationIssue[] {
        if (!isPokieGame(target)) {
            return [
                {
                    code: "pokie-game-missing-contract-methods",
                    severity: "error",
                    message:
                        "The loaded export does not implement the PokieGame contract (missing getInfo()/createSession()).",
                    suggestion: "Export an object implementing PokieGame as the entry module's default export.",
                },
            ];
        }

        let info: PokieGameInfo;
        try {
            const rawInfo = target.getInfo();
            // Extraction can require detached JSON before this ordinary contract reads metadata fields.
            info = (detachInfoData ? detachInfoData(rawInfo) : rawInfo) as PokieGameInfo;
        } catch (error) {
            return [
                {
                    code: "pokie-game-info-threw",
                    severity: "error",
                    message: `PokieGame.getInfo() threw: ${error instanceof Error ? error.message : String(error)}`,
                },
            ];
        }

        if (typeof info !== "object" || info === null) {
            return [
                {
                    code: "pokie-game-info-missing",
                    severity: "error",
                    message: "PokieGame.getInfo() must return a game info object.",
                },
            ];
        }

        return (["id", "name", "version"] as const)
            .filter((field) => typeof info[field] !== "string" || info[field].trim().length === 0)
            .map((field) => ({
                code: `pokie-game-info-invalid-${field}`,
                severity: "error" as const,
                message: `PokieGameInfo.${field} must be a non-empty string.`,
            }));
    }
}
